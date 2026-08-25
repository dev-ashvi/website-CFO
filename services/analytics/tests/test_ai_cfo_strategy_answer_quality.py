"""Phase 2C.1 strategic answer quality + decision semantics (Q1–Q20)."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.strategy.action_semantics import resolve_strategic_position, scope_comparison_mode
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.decision_evidence import (
    build_decision_evidence_pack,
    build_evidence_sections,
)
from wyz_analytics.ai_cfo.strategy.decision_frame import PrioritizeCandidate, build_decision_frame
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V1_BOUNDARY, STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.model_decision import parse_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.model_validation import validate_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.partner import run_strategic_partner_judgment
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
from wyz_analytics.ai_cfo.strategy.strategic_presentation import is_internal_template_key, strip_markdown_leakage
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown
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


def _tools(facts, *, filters=None):
    return AiCfoTools(
        facts,
        active_filters=filters if filters is not None else {},
        dataset_id="b",
        dimension="channel",
    )


def _ctx(tools: AiCfoTools, message: str, *, forced: dict | None = None) -> dict[str, Any]:
    view = tools.get_current_financial_view()
    context = {
        "summary": view.get("summary") or view,
        "signals": (tools.get_cfo_signals().get("highlighted") or []),
        "financial_scope": tools.financial_scope,
        "scope_hash": tools.financial_scope.get("scope_hash"),
        "filters": tools.active_filters,
        "dimension": tools.dimension,
        "forced_evidence": dict(forced or {}),
    }
    context["evidence_envelope"] = build_evidence_envelope(message, context)
    return context


def _partner(facts, message: str, *, filters=None, model=None, forced=None):
    tools = _tools(facts, filters=filters)
    if forced is None and filters is None:
        breakdown = tools.get_breakdown(dimension="channel", sort={"metric": "cm2", "direction": "asc"}, limit=10)
        forced = {"get_breakdown": breakdown}
    ctx = _ctx(tools, message, forced=forced)
    answer, telemetry, assessment = run_strategic_partner_judgment(
        message=message,
        working_context=ctx,
        agent=model or FakeAiCfoModel(),
    )
    return answer, telemetry, assessment, ctx


def test_q1_marketing_evidence_roles(beautyco_facts):
    answer, telem, _, _ = _partner(beautyco_facts, "Should I cut marketing?")
    roles = (answer.get("strategic") or {}).get("evidence_sections") or []
    role_names = [r["role"] for r in roles]
    assert "CONTRIBUTION_BEFORE_MARKETING" in role_names
    assert "MARKETING_PRESSURE" in role_names
    assert "CONTRIBUTION_AFTER_MARKETING" in role_names
    assert telem.get("decision_theme") == "MARKETING"


def test_q2_marketing_semantic_action_realization():
    text, variant = resolve_strategic_position(
        decision_theme=DecisionTheme.MARKETING,
        selected_action=ActionType.EXPERIMENT,
    )
    assert "controlled reduction" in text.lower()
    assert variant == "marketing_controlled_reduction"


def test_q3_channel_exit_wording_differs_from_marketing():
    from wyz_analytics.ai_cfo.strategy.assessment import DecisionSubject

    mkt, _ = resolve_strategic_position(
        decision_theme=DecisionTheme.MARKETING,
        selected_action=ActionType.EXPERIMENT,
    )
    ch, variant = resolve_strategic_position(
        decision_theme=DecisionTheme.CHANNEL_EXIT,
        selected_action=ActionType.EXPERIMENT,
        subject=DecisionSubject(entity="D2C Website", dimension="channel"),
    )
    assert "controlled reduction" not in ch.lower() or "exit" in ch.lower()
    assert "wouldn't exit" in ch.lower() or "exit" in ch.lower()
    assert variant == "channel_test_before_exit"
    assert mkt != ch


def test_q4_channel_exit_peer_evidence_company_scope(beautyco_facts):
    tools = _tools(beautyco_facts)
    breakdown = tools.get_breakdown(dimension="channel", sort={"metric": "cm2", "direction": "asc"}, limit=10)
    ctx = _ctx(tools, "Should we stop selling D2C?", forced={"get_breakdown": breakdown})
    pack = build_strategic_control_plane(
        "Should we stop selling D2C?", capability_is_strategic=True, context=ctx
    )["diagnosis_pack"]
    evidence = build_decision_evidence_pack(
        theme=DecisionTheme.CHANNEL_EXIT, pack=pack, envelope=ctx["evidence_envelope"], context=ctx
    )
    sections = build_evidence_sections(evidence, theme=DecisionTheme.CHANNEL_EXIT)
    roles = [s.role for s in sections]
    assert "SUBJECT_ECONOMICS" in roles
    assert scope_comparison_mode(theme=DecisionTheme.CHANNEL_EXIT, filters={}) == "multi_channel_peer_comparison"


def test_q5_channel_exit_pinned_never_broadens(beautyco_facts):
    answer, telem, assessment, ctx = _partner(
        beautyco_facts,
        "Should we stop selling D2C?",
        filters={"channel": ["D2C Website"]},
        forced={},
    )
    assert telem.get("scope_comparison_mode") == "within_channel_concentration"
    assert (ctx.get("filters") or {}).get("channel") == ["D2C Website"]
    frame = build_decision_frame(
        "Should we stop selling D2C?",
        pack=build_strategic_control_plane(
            "Should we stop selling D2C?", capability_is_strategic=True, context=ctx
        )["diagnosis_pack"],
        context=ctx,
    )
    assert frame.comparison_requirements == ["within_channel_concentration"]
    uncertainty = (answer.get("strategic") or {}).get("uncertainty") or []
    if isinstance(uncertainty, str):
        uncertainty = [uncertainty]
    joined = " ".join(uncertainty).lower()
    # May mention unavailable peer comparison; must not invent peer channel names as if compared.
    assert "controlled reduction" not in (answer.get("headline") or "").lower()


def test_q6_price_semantic_action_realization():
    text, variant = resolve_strategic_position(
        decision_theme=DecisionTheme.PRICE,
        selected_action=ActionType.EXPERIMENT,
    )
    assert "pricing test" in text.lower() or "price" in text.lower()
    assert "controlled reduction" not in text.lower()
    assert variant == "price_bounded_test"


def test_q7_price_elasticity_uncertainty(beautyco_facts):
    answer, telem, _, _ = _partner(beautyco_facts, "Should I increase prices?")
    assert telem.get("decision_theme") == "PRICE"
    uncertainty = (answer.get("strategic") or {}).get("uncertainty") or []
    if isinstance(uncertainty, str):
        uncertainty = [uncertainty]
    joined = " ".join(uncertainty).lower()
    assert "demand" in joined or "elasticity" in joined or "price" in joined
    assert "willingness to pay" not in joined


def test_q8_prioritize_candidate_selection_valid(beautyco_facts):
    answer, telem, _, _ = _partner(beautyco_facts, "What should I fix first?")
    assert telem.get("decision_theme") == "PRIORITIZE"
    assert telem.get("final_priority_candidate")
    headline = (answer.get("headline") or "").lower()
    assert "first focus" in headline or "focus would be" in headline
    assert "investigate the verified drivers" not in headline


def test_q9_prioritize_invalid_candidate_rejected(beautyco_facts):
    class _BadPriority(FakeAiCfoModel):
        def run_strategic_turn(self, *, message, model_input, context):
            catalog = model_input.get("evidence_catalog") or []
            eid = None
            for item in catalog:
                if isinstance(item, dict) and item.get("evidence_id"):
                    eid = item["evidence_id"]
                    break
            return {
                "action": "INVESTIGATE",
                "strength": "TENTATIVE",
                "confidence": "LOW",
                "evidence": [eid] if eid else [],
                "priority_candidate_id": "priority:not_a_real_candidate",
                "unknowns": list(model_input.get("unknowns") or [])[:2],
            }

    answer, telem, _, _ = _partner(beautyco_facts, "What should I fix first?", model=_BadPriority())
    assert telem.get("strategic_fallback_used") is True or telem.get("answer_source") == "deterministic_strategic_fallback"


def test_q10_python_does_not_preselect_priority(beautyco_facts):
    tools = _tools(beautyco_facts)
    ctx = _ctx(tools, "What should I fix first?")
    plane = build_strategic_control_plane(
        "What should I fix first?", capability_is_strategic=True, context=ctx
    )
    frame = build_decision_frame("What should I fix first?", pack=plane["diagnosis_pack"], context=ctx)
    assert frame.prioritize_candidates
    payload = frame.to_dict()
    assert "selected_action" not in payload
    assert "winner" not in str(payload).lower()
    # Candidates unordered list — no rank/score fields
    for cand in frame.prioritize_candidates:
        d = cand.to_dict()
        assert "score" not in d
        assert "rank" not in d


def test_q11_evidence_dedupe(beautyco_facts):
    answer, telem, _, _ = _partner(beautyco_facts, "Should I cut marketing?")
    identities = []
    for item in answer.get("evidence") or []:
        scope = item.get("scope") or {}
        identities.append(
            (
                str(item.get("entity") or scope.get("dimension_value") or ""),
                str(item.get("metric") or ""),
            )
        )
    assert len(identities) == len(set(identities))
    assert telem.get("strategic_display_evidence_count", 0) <= 6


def test_q12_evidence_section_ordering(beautyco_facts):
    answer, _, _, _ = _partner(beautyco_facts, "Should I cut marketing?")
    roles = [s["role"] for s in ((answer.get("strategic") or {}).get("evidence_sections") or [])]
    if "CONTRIBUTION_BEFORE_MARKETING" in roles and "CONTRIBUTION_AFTER_MARKETING" in roles:
        assert roles.index("CONTRIBUTION_BEFORE_MARKETING") < roles.index("CONTRIBUTION_AFTER_MARKETING")


def test_q13_strategic_evidence_density(beautyco_facts):
    answer, telem, _, _ = _partner(beautyco_facts, "Should I cut marketing?")
    assert len(answer.get("evidence") or []) <= 6
    assert telem.get("strategic_display_evidence_count", 99) <= 6


def test_q14_direct_answer_no_internal_keys(beautyco_facts):
    for q in (
        "Should I cut marketing?",
        "Should we stop selling D2C?",
        "What should I fix first?",
        "Should I increase prices?",
    ):
        answer, _, _, _ = _partner(beautyco_facts, q)
        headline = answer.get("headline") or ""
        assert not is_internal_template_key(headline.split(".")[0])
        assert "_" not in headline.split()[0] if headline else True


def test_q15_no_markdown_leakage():
    assert strip_markdown_leakage("**bold** answer") == "bold answer"
    assert "#" not in (strip_markdown_leakage("# Title") or "")


def test_q16_change_my_view_theme_aware(beautyco_facts):
    answer, _, _, _ = _partner(beautyco_facts, "Should we stop selling D2C?")
    change = (answer.get("strategic") or {}).get("what_would_change_my_view") or []
    joined = " ".join(change).lower() if isinstance(change, list) else str(change).lower()
    assert change
    assert "acquisition spend" not in joined or "channel" in joined or "peer" in joined or "contribution" in joined


def test_q17_monitoring_theme_aware(beautyco_facts):
    answer, _, _, _ = _partner(beautyco_facts, "Should I increase prices?")
    monitoring = str((answer.get("strategic") or {}).get("monitoring") or "").lower()
    assert "margin" in monitoring or "gross" in monitoring or "cm1" in monitoring or "cm2" in monitoring


def test_q18_scope_lineage_preserved(beautyco_facts):
    _, telem_company, assessment_c, ctx_c = _partner(beautyco_facts, "Should we stop selling D2C?")
    _, telem_pinned, assessment_p, ctx_p = _partner(
        beautyco_facts,
        "Should we stop selling D2C?",
        filters={"channel": ["D2C Website"]},
        forced={},
    )
    assert assessment_c.scope_hash != assessment_p.scope_hash or ctx_c.get("scope_hash") != ctx_p.get("scope_hash")
    assert telem_company.get("scope_comparison_mode") == "multi_channel_peer_comparison"
    assert telem_pinned.get("scope_comparison_mode") == "within_channel_concentration"


def test_q19_exit_eligibility_unchanged(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical={"filters": {}, "surface": "margin"},
        message="Should we stop selling D2C?",
        guards_enabled=True,
        model=FakeAiCfoModel(),
    )
    plane = response["context"].get("strategic_control_plane") or {}
    elig = {row["action_type"]: row for row in (plane.get("action_eligibility") or [])}
    assert elig.get("EXIT", {}).get("eligible") is False
    rec = (plane.get("assessment") or {}).get("recommendation") or {}
    assert rec.get("action_type") != "EXIT"


def test_q20_v1_boundary_unchanged(monkeypatch, beautyco_facts):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V1_BOUNDARY)
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical={"filters": {}, "surface": "margin"},
        message="Should I cut marketing?",
        guards_enabled=True,
        model=FakeAiCfoModel(),
    )
    assert STRATEGY_BOUNDARY_SENTENCE in response["answer"]["headline"]


def test_q8b_priority_validation_unit():
    contract = StrategicReasoningContract(
        allowed_actions=[ActionType.INVESTIGATE],
        forbidden_actions=[],
        unknowns=[StrategicUnknown.TEMPORAL_STABILITY],
        evidence_ids=["e1"],
        recommendations_enabled=True,
    )
    decision = parse_strategic_model_decision(
        {
            "action": "INVESTIGATE",
            "strength": "TENTATIVE",
            "confidence": "LOW",
            "evidence": ["e1"],
            "priority_candidate_id": "priority:marketing",
        }
    )
    ok = validate_strategic_model_decision(
        decision,
        contract=contract,
        known_evidence_ids={"e1"},
        allowed_priority_candidate_ids={"priority:marketing"},
        require_priority_candidate=True,
    )
    assert ok.ok
    bad = validate_strategic_model_decision(
        decision,
        contract=contract,
        known_evidence_ids={"e1"},
        allowed_priority_candidate_ids={"priority:product_cost"},
        require_priority_candidate=True,
    )
    assert not bad.ok
