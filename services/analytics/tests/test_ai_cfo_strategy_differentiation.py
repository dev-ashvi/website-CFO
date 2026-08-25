"""Phase 2C strategic differentiation tests (D1–D20)."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.decision_evidence import build_decision_evidence_pack
from wyz_analytics.ai_cfo.strategy.decision_frame import build_decision_frame
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack
from wyz_analytics.ai_cfo.strategy.eligibility import evaluate_action_eligibility
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme, classify_decision_theme
from wyz_analytics.ai_cfo.strategy.intent import DecisionType
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V1_BOUNDARY, STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.model_decision import parse_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.model_validation import validate_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.partner import run_strategic_partner_judgment
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
from wyz_analytics.ai_cfo.strategy.reasoning_input import build_strategic_model_input
from wyz_analytics.ai_cfo.strategy.strategic_presentation import is_internal_template_key
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown, resolve_theme_unknowns
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")


@pytest.fixture(autouse=True)
def _v2_partner_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V2_PARTNER)


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _company_ctx(tools: AiCfoTools, message: str) -> dict[str, Any]:
    view = tools.get_current_financial_view()
    context = {
        "summary": view.get("summary") or view,
        "signals": (tools.get_cfo_signals().get("highlighted") or []),
        "financial_scope": tools.financial_scope,
        "scope_hash": tools.financial_scope.get("scope_hash"),
        "filters": tools.active_filters,
        "dimension": tools.dimension,
        "forced_evidence": {},
    }
    context["evidence_envelope"] = build_evidence_envelope(message, context)
    return context


def _company_tools(facts) -> AiCfoTools:
    return AiCfoTools(facts, active_filters={}, dataset_id="b", dimension="channel")


def test_d1_marketing_theme_and_unknowns(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should I cut marketing?")
    plane = build_strategic_control_plane(
        "Should I cut marketing?",
        capability_is_strategic=True,
        context=ctx,
        strategy_mode=STRATEGY_MODE_V2_PARTNER,
    )
    pack = plane["diagnosis_pack"]
    assert pack.theme == DecisionTheme.MARKETING
    frame = build_decision_frame("Should I cut marketing?", pack=pack, context=ctx)
    assert frame.decision_theme == DecisionTheme.MARKETING
    assert StrategicUnknown.DEMAND_RESPONSE in frame.relevant_unknowns
    assert "peer_comparison" not in frame.comparison_requirements


def test_d2_channel_exit_no_acquisition_boilerplate(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should we stop selling D2C?")
    pack = build_strategic_control_plane(
        "Should we stop selling D2C?",
        capability_is_strategic=True,
        context=ctx,
    )["diagnosis_pack"]
    unknowns = resolve_theme_unknowns(DecisionTheme.CHANNEL_EXIT, pack=pack)
    assert StrategicUnknown.DEMAND_RESPONSE not in unknowns
    frame = build_decision_frame("Should we stop selling D2C?", pack=pack, context=ctx)
    assert "multi_channel_peer_comparison" in frame.comparison_requirements


def test_d3_channel_exit_ineligible_rejects_exit(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"workspace_id": "t", "dataset_id": "b", "dataset_version": 1, "mapping_version": "m", "job_id": "j", "engine_version": "t"},
        analytical={"filters": {}, "surface": "margin"},
        message="Should we stop selling D2C?",
        guards_enabled=True,
        model=FakeAiCfoModel(),
    )
    rec = response["answer"].get("strategic_recommendation") or {}
    assert rec.get("action_type") != "EXIT"


def test_d4_exit_eligible_fixture_allows_exit():
    pack = DiagnosisPack(
        decision_type=DecisionType.DECIDE,
        theme=DecisionTheme.SKU_EXIT,
        scope_hash="x",
        evidence_flags=set(),
    )
    contract = StrategicReasoningContract(
        allowed_actions=[ActionType.EXIT],
        forbidden_actions=[],
        unknowns=[StrategicUnknown.RETENTION],
        evidence_ids=["e1"],
        recommendations_enabled=True,
    )
    raw = {
        "action": "EXIT",
        "strength": "MODERATE",
        "confidence": "MEDIUM",
        "evidence": ["e1"],
        "unknowns": ["RETENTION"],
    }
    decision = parse_strategic_model_decision(raw)
    result = validate_strategic_model_decision(decision, contract=contract, known_evidence_ids={"e1"})
    assert result.ok


def test_d5_price_theme(beautyco_facts):
    theme = classify_decision_theme("Should I increase prices?", DecisionType.DECIDE)
    assert theme == DecisionTheme.PRICE
    unknowns = resolve_theme_unknowns(DecisionTheme.PRICE)
    assert StrategicUnknown.PRICE_ELASTICITY in unknowns


def test_d6_prioritize_candidates_not_ranked(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "What should I fix first?")
    pack = build_strategic_control_plane(
        "What should I fix first?",
        capability_is_strategic=True,
        context=ctx,
    )["diagnosis_pack"]
    frame = build_decision_frame("What should I fix first?", pack=pack, context=ctx)
    assert frame.decision_theme == DecisionTheme.PRIORITIZE
    assert len(frame.prioritize_candidates) >= 1
    assert not hasattr(frame, "selected_action")


def test_d7_decision_frame_has_no_recommendation():
    pack = DiagnosisPack(decision_type=DecisionType.DECIDE, theme=DecisionTheme.MARKETING)
    frame = build_decision_frame("Should I cut marketing?", pack=pack)
    payload = frame.to_dict()
    assert "selected_action" not in payload
    assert "recommendation" not in payload


def test_d8_product_cost_unknowns():
    unknowns = resolve_theme_unknowns(DecisionTheme.PRODUCT_COST)
    assert StrategicUnknown.OPERATIONAL_FEASIBILITY in unknowns


def test_d9_scenario_in_decision_evidence_only_same_scope(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should I cut marketing?")
    pack = build_strategic_control_plane(
        "Should I cut marketing?",
        capability_is_strategic=True,
        context=ctx,
        scenario_refs=[],
    )["diagnosis_pack"]
    evidence = build_decision_evidence_pack(theme=DecisionTheme.MARKETING, pack=pack, envelope=ctx["evidence_envelope"], context=ctx)
    for eid in evidence.scenario_evidence:
        assert eid.startswith("scenario:")


def test_d10_cross_scope_scenario_excluded_in_pack():
    from wyz_analytics.ai_cfo.strategy.assessment import ScenarioRef
    from wyz_analytics.ai_cfo.strategy.diagnosis import build_diagnosis_pack

    pack = build_diagnosis_pack(
        "Should I cut marketing?",
        decision_type=DecisionType.DECIDE,
        context={"financial_scope": {"scope_hash": "scope-a", "filters": {}}, "summary": {"cm2": 1}},
        scenario_refs=[ScenarioRef(scope_hash="scope-b", digest="other-scope")],
    )
    assert pack.scenario_refs == []


def test_d11_supporting_evidence_from_decision_pack(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should I cut marketing?")
    answer, _, _ = run_strategic_partner_judgment(
        message="Should I cut marketing?",
        working_context=ctx,
        agent=FakeAiCfoModel(),
    )
    assert answer.get("evidence")
    for item in answer["evidence"]:
        assert "evidence_id" in item or item.get("metric")


def test_d12_unknown_contamination_channel_exit(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should we stop selling D2C?")
    answer, _, _ = run_strategic_partner_judgment(
        message="Should we stop selling D2C?",
        working_context=ctx,
        agent=FakeAiCfoModel(),
    )
    uncertainty = (answer.get("strategic") or {}).get("uncertainty") or ""
    if isinstance(uncertainty, list):
        uncertainty = " ".join(uncertainty)
    assert "acquisition spend" not in uncertainty.lower()


def test_d13_persistence_in_frame(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should we stop selling D2C?")
    pack = build_strategic_control_plane(
        "Should we stop selling D2C?",
        capability_is_strategic=True,
        context=ctx,
    )["diagnosis_pack"]
    frame = build_decision_frame("Should we stop selling D2C?", pack=pack, context=ctx)
    assert any("persistence_state:" in req for req in frame.persistence_requirements)


def test_d14_company_channel_comparison_evidence(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    breakdown = tools.get_breakdown(dimension="channel", sort={"metric": "cm2", "direction": "asc"}, limit=10)
    ctx = _company_ctx(tools, "Should we stop selling D2C?")
    ctx["forced_evidence"] = {"get_breakdown": breakdown}
    ctx["evidence_envelope"] = build_evidence_envelope("Should we stop selling D2C?", ctx)
    pack = build_strategic_control_plane(
        "Should we stop selling D2C?",
        capability_is_strategic=True,
        context=ctx,
    )["diagnosis_pack"]
    evidence = build_decision_evidence_pack(
        theme=DecisionTheme.CHANNEL_EXIT,
        pack=pack,
        envelope=ctx["evidence_envelope"],
        context=ctx,
    )
    assert evidence.subject_economics or evidence.peer_comparison or evidence.all_ids()


def test_d15_pinned_scope_no_silent_broadening(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts,
        active_filters={"channel": ["D2C Website"]},
        dataset_id="b",
        dimension="channel",
    )
    ctx = _company_ctx(tools, "Should we stop selling D2C?")
    frame = build_decision_frame(
        "Should we stop selling D2C?",
        pack=build_strategic_control_plane(
            "Should we stop selling D2C?",
            capability_is_strategic=True,
            context=ctx,
        )["diagnosis_pack"],
        context=ctx,
    )
    assert frame.comparison_requirements == ["within_channel_concentration"]


def test_d16_model_freedom_among_allowed_actions():
    class _AltModel(FakeAiCfoModel):
        def run_strategic_turn(self, *, message: str, model_input: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
            return {
                "action": "MONITOR",
                "strength": "TENTATIVE",
                "confidence": "LOW",
                "evidence": (model_input.get("evidence_catalog") or [{"evidence_id": "e1"}])[0:1],
                "unknowns": model_input.get("unknowns") or ["DEMAND_RESPONSE"],
            }

    pack = DiagnosisPack(decision_type=DecisionType.DECIDE, theme=DecisionTheme.MARKETING, evidence_ids=["e1"])
    contract = StrategicReasoningContract(
        allowed_actions=[ActionType.EXPERIMENT, ActionType.MONITOR],
        forbidden_actions=[],
        unknowns=[StrategicUnknown.DEMAND_RESPONSE],
        evidence_ids=["e1"],
        recommendations_enabled=True,
    )
    raw = {
        "action": "MONITOR",
        "strength": "TENTATIVE",
        "confidence": "LOW",
        "evidence": ["e1"],
        "unknowns": ["DEMAND_RESPONSE"],
    }
    decision = parse_strategic_model_decision(raw)
    result = validate_strategic_model_decision(decision, contract=contract, known_evidence_ids={"e1"})
    assert result.ok
    assert decision.selected_action == ActionType.MONITOR


def test_d17_python_non_selection_in_model_input(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should I cut marketing?")
    plane = build_strategic_control_plane(
        "Should I cut marketing?",
        capability_is_strategic=True,
        context=ctx,
    )
    pack = plane["diagnosis_pack"]
    frame = build_decision_frame("Should I cut marketing?", pack=pack, context=ctx)
    evidence = build_decision_evidence_pack(theme=pack.theme, pack=pack, envelope=ctx["evidence_envelope"], context=ctx)
    model_input = build_strategic_model_input(
        message="Should I cut marketing?",
        assessment=plane["assessment"],
        pack=pack,
        eligibilities=plane["action_eligibility"],
        contract=plane["reasoning_contract"],
        envelope=ctx["evidence_envelope"],
        decision_frame=frame,
        decision_evidence=evidence,
    )
    assert "selected_action" not in model_input
    assert "recommendation" not in str(model_input)


def test_d18_change_my_view_renders(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should I cut marketing?")
    answer, _, _ = run_strategic_partner_judgment(
        message="Should I cut marketing?",
        working_context=ctx,
        agent=FakeAiCfoModel(),
    )
    change = (answer.get("strategic") or {}).get("what_would_change_my_view")
    assert change


def test_d19_no_internal_key_leakage(beautyco_facts):
    tools = _company_tools(beautyco_facts)
    ctx = _company_ctx(tools, "Should we stop selling D2C?")
    answer, _, _ = run_strategic_partner_judgment(
        message="Should we stop selling D2C?",
        working_context=ctx,
        agent=FakeAiCfoModel(),
    )
    body = answer.get("strategic") or {}
    for field in ("direct_answer", "why", "uncertainty", "next_step"):
        text = str(body.get(field) or "")
        assert not is_internal_template_key(text.split(".")[0])


def test_d20_v1_boundary_unchanged(monkeypatch, beautyco_facts):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V1_BOUNDARY)
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"workspace_id": "t", "dataset_id": "b", "dataset_version": 1, "mapping_version": "m", "job_id": "j", "engine_version": "t"},
        analytical={"filters": {}, "surface": "margin"},
        message="Should I cut marketing?",
        guards_enabled=True,
        model=FakeAiCfoModel(),
    )
    assert STRATEGY_BOUNDARY_SENTENCE in response["answer"]["headline"]
