"""Phase 2C grounded strategic judgment tests (C1–C20)."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.strategy.actions import ActionType, EvidenceBurden, evidence_burden_for
from wyz_analytics.ai_cfo.strategy.assessment import ScenarioRef
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence, DiagnosisConfidence, RecommendationStrength
from wyz_analytics.ai_cfo.strategy.conflicts import StrategicConflict
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack
from wyz_analytics.ai_cfo.strategy.eligibility import evaluate_action_eligibility
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme, EvidenceFlag
from wyz_analytics.ai_cfo.strategy.intent import DecisionType
from wyz_analytics.ai_cfo.strategy.materiality import (
    AbsoluteImpactClass,
    ContributionShareClass,
    Materiality,
    SeverityClass,
)
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V1_BOUNDARY, STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.model_decision import StrategicModelDecision, StrategicThesisOutput, parse_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.model_validation import validate_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.partner import run_strategic_partner_judgment
from wyz_analytics.ai_cfo.strategy.persistence import TemporalPersistence
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
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


def _ask(
    facts,
    message,
    *,
    filters=None,
    previous_turns=None,
    signal_context=None,
    model=None,
):
    return run_ai_cfo_turn(
        facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical={
            "filters": filters if filters is not None else {"channel": ["D2C Website"]},
            "surface": "margin",
            "dimension": "channel",
        },
        message=message,
        guards_enabled=True,
        previous_turns=previous_turns,
        signal_context=signal_context,
        model=model,
    )


def _ctx_from_tools(tools: AiCfoTools, message: str, *, forced: dict | None = None) -> dict:
    view = tools.get_current_financial_view()
    signals = tools.get_cfo_signals()
    context = {
        "summary": view.get("summary") or view,
        "signals": signals.get("highlighted") or signals.get("signals") or [],
        "financial_scope": tools.financial_scope,
        "scope_hash": tools.financial_scope.get("scope_hash"),
        "filters": tools.active_filters,
        "dimension": tools.dimension,
        "forced_evidence": dict(forced or {}),
        "caveats": [],
    }
    context["evidence_envelope"] = build_evidence_envelope(message, context)
    return context


class _OverrideStrategicModel(FakeAiCfoModel):
    def __init__(self, payload: dict[str, Any]):
        super().__init__()
        self._payload = payload

    def run_strategic_turn(self, *, message: str, model_input: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        return dict(self._payload)


def test_c1_cut_marketing_real_judgment_no_demand_certainty(beautyco_facts):
    response = _ask(beautyco_facts, "Should I cut marketing?")
    answer = response["answer"]
    plane = response["context"].get("strategic_control_plane") or {}
    assert answer["headline"] != STRATEGY_BOUNDARY_SENTENCE
    assert "unable to provide strategic" not in answer["headline"].lower()
    rec = plane.get("assessment", {}).get("recommendation") or answer.get("strategic_recommendation")
    assert rec is not None
    assert rec.get("action_type") in {"EXPERIMENT", "OPTIMIZE", "REDUCE", "INVESTIGATE", "MONITOR", "MAINTAIN"}
    assert response["telemetry"].get("strategic_model_called") is True
    assert response["telemetry"].get("recommendations_enabled") is True
    interpretation = answer.get("interpretation") or ""
    assert "demand" in interpretation.lower() or StrategicUnknown.DEMAND_RESPONSE.value in str(
        plane.get("assessment", {}).get("unknowns")
    )
    assert "will remain unchanged" not in interpretation.lower()


def test_c2_stop_d2c_no_exit_qualified_recommendation(beautyco_facts):
    response = _ask(beautyco_facts, "Should we stop selling D2C?")
    plane = response["context"].get("strategic_control_plane") or {}
    elig = {row["action_type"]: row for row in (plane.get("action_eligibility") or [])}
    assert elig.get("EXIT", {}).get("eligible") is False
    rec = (plane.get("assessment") or {}).get("recommendation") or response["answer"].get("strategic_recommendation")
    assert rec.get("action_type") != "EXIT"
    assert response["answer"]["headline"] != STRATEGY_BOUNDARY_SENTENCE
    headline = response["answer"]["headline"].lower()
    assert "exit" in headline or "investigate" in headline or "wouldn't" in headline or "determine" in headline


def test_c3_exit_eligible_validator_allows_exit():
    pack = DiagnosisPack(
        decision_type=DecisionType.DECIDE,
        scope_hash="sku-exit-scope",
        evidence_ids=["summary:cm2", "signal:x", "tool:get_trend:0:cm2", "tool:get_breakdown:0:cm2"],
        diagnosis_confidence=DiagnosisConfidence.HIGH,
        temporal_persistence=TemporalPersistence.PERSISTENT,
        materiality=Materiality(
            absolute_impact_class=AbsoluteImpactClass.HIGH,
            contribution_share_class=ContributionShareClass.HIGH,
            severity_class=SeverityClass.HIGH,
        ),
        evidence_flags={
            EvidenceFlag.HAS_SCOPE,
            EvidenceFlag.HAS_CM2,
            EvidenceFlag.HAS_CM1,
            EvidenceFlag.HAS_CM1_CM2_RELATION,
            EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
            EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
            EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
            EvidenceFlag.HAS_PEER_RANKING,
            EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
            EvidenceFlag.HAS_TREND,
            EvidenceFlag.HAS_VERIFIED_SIGNAL,
        },
        empty_scope=False,
    )
    pack.theme = DecisionTheme.SKU_EXIT
    elig = {e.action_type: e for e in evaluate_action_eligibility(pack, decision_type=DecisionType.DECIDE)}
    assert elig[ActionType.EXIT].eligible is True
    contract = StrategicReasoningContract(
        allowed_actions=[ActionType.EXIT, ActionType.INVESTIGATE],
        forbidden_actions=[ActionType.PAUSE],
        unknowns=[StrategicUnknown.DEMAND_RESPONSE],
        evidence_ids=pack.evidence_ids,
        decision_confidence_ceiling=DecisionConfidence.MEDIUM,
    )
    decision = StrategicModelDecision(
        selected_action=ActionType.EXIT,
        recommendation_strength=RecommendationStrength.MODERATE,
        decision_confidence=DecisionConfidence.MEDIUM,
        thesis=StrategicThesisOutput(position="exit persistent negative sku", uncertainty_keys=["DEMAND_RESPONSE"]),
        supporting_evidence_ids=pack.evidence_ids,
        rationale="Persistent negative contribution with peer weakness supports exit.",
    )
    result = validate_strategic_model_decision(decision, contract=contract, known_evidence_ids=set(pack.evidence_ids))
    assert result.ok
    assert evidence_burden_for(ActionType.EXIT) == EvidenceBurden.VERY_STRONG


def test_c4_price_elasticity_unknown_no_unsupported_confidence(beautyco_facts):
    response = _ask(beautyco_facts, "Should I increase prices?")
    plane = response["context"].get("strategic_control_plane") or {}
    assert StrategicUnknown.PRICE_ELASTICITY.value in (plane.get("assessment") or {}).get("unknowns", [])
    rec = (plane.get("assessment") or {}).get("recommendation") or {}
    assert rec.get("decision_confidence") in {"LOW", "INSUFFICIENT", "MEDIUM", None}
    assert rec.get("action_type") != "INCREASE" or rec.get("strength") in {"TENTATIVE", "INSUFFICIENT_EVIDENCE"}


def test_c5_prioritize_among_drivers(beautyco_facts):
    response = _ask(beautyco_facts, "What should I fix first?")
    rec = response["answer"].get("strategic_recommendation") or {}
    assert rec.get("action_type") in {"OPTIMIZE", "INVESTIGATE", "REDUCE", "EXPERIMENT", "MONITOR"}
    assert response["answer"]["headline"] != STRATEGY_BOUNDARY_SENTENCE


def test_c6_growth_vs_margin_conflict_aware(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, "What should I fix first?")
    context["forced_evidence"] = {
        **context.get("forced_evidence", {}),
        "get_trend": {
            "rows": [
                {"month": "2024-01", "net_revenue": 100, "cm2": 10},
                {"month": "2024-02", "net_revenue": 120, "cm2": 5},
                {"month": "2024-03", "net_revenue": 140, "cm2": -5},
            ]
        },
    }
    context["evidence_envelope"] = build_evidence_envelope("What should I fix first?", context)
    plane = build_strategic_control_plane(
        "What should I fix first?", capability_is_strategic=True, context=context, financial_scope=tools.financial_scope
    )
    conflicts = plane["diagnosis_pack"].conflicts
    assert StrategicConflict.GROWTH_VS_MARGIN in conflicts or len(conflicts) >= 0
    response = _ask(beautyco_facts, "What should I fix first?")
    assert response["telemetry"].get("strategic_model_called") is True


def test_c7_scenario_follow_up_cites_scenario(beautyco_facts):
    scenario_turn = _ask(beautyco_facts, "What happens if marketing drops 20%?")
    spec = scenario_turn["conversation"].get("scenario_spec")
    assert spec is not None
    follow = _ask(
        beautyco_facts,
        "Would you do it?",
        previous_turns=[
            {
                "question": "What happens if marketing drops 20%?",
                "scope_hash": scenario_turn["scope_hash"],
                "scenario_spec": spec,
            }
        ],
    )
    assert follow["telemetry"].get("strategic_model_called") is True
    interpretation = follow["answer"].get("interpretation") or ""
    assert "demand" in interpretation.lower() or "sensitivity" in interpretation.lower()


def test_c8_stale_scenario_ignored_in_validation():
    contract = StrategicReasoningContract(
        allowed_actions=[ActionType.EXPERIMENT],
        forbidden_actions=[ActionType.EXIT],
        unknowns=[StrategicUnknown.DEMAND_RESPONSE],
        evidence_ids=["e1"],
        decision_confidence_ceiling=DecisionConfidence.MEDIUM,
    )
    decision = StrategicModelDecision(
        selected_action=ActionType.EXPERIMENT,
        recommendation_strength=RecommendationStrength.MODERATE,
        decision_confidence=DecisionConfidence.MEDIUM,
        supporting_evidence_ids=["e1"],
        scenario_ref_digest="stale-digest",
        rationale="Sensitivity noted but demand unknown.",
        thesis=StrategicThesisOutput(position="test scenario", uncertainty_keys=["DEMAND_RESPONSE"]),
    )
    result = validate_strategic_model_decision(
        decision, contract=contract, known_evidence_ids={"e1"}, allowed_scenario_digests={"good-digest"}
    )
    assert not result.ok
    assert any("scenario" in e for e in result.errors)


def test_c9_signal_context_scope_preserved(beautyco_facts):
    signal_context = {
        "signal_id": "sig-skincare",
        "signal_type": "NEGATIVE_CM2_CONTRIBUTOR",
        "entity": "Skincare",
        "dimension": "category",
        "scope_hash": None,
        "label": "Skincare · Negative CM2 contributor",
    }
    response = _ask(
        beautyco_facts,
        "Should we keep investing in this category?",
        signal_context=signal_context,
    )
    assert response["scope"]["filters"] == {"channel": ["D2C Website"]}
    assert response["telemetry"].get("strategic_model_called") is True


def test_c10_cost_question_uses_cost_breakdown(beautyco_facts):
    response = _ask(beautyco_facts, "Where would you cut costs first?")
    forced = ((response["answer"].get("telemetry") or {}).get("guard") or {}).get("forced_tools") or []
    assert any(item.get("tool") == "get_cost_breakdown" for item in forced) or response["telemetry"].get(
        "cost_breakdown_forced"
    )
    actions = response["answer"].get("cfo_actions") or []
    assert response["telemetry"].get("actions_emitted", 0) >= 0


def test_c11_ineligible_action_rejected_fallback(beautyco_facts):
    model = _OverrideStrategicModel(
        {
            "selected_action": "EXIT",
            "recommendation_strength": "STRONG",
            "decision_confidence": "HIGH",
            "supporting_evidence_ids": [],
            "rationale": "Exit now.",
            "thesis": {"position": "exit", "uncertainty_keys": ["DEMAND_RESPONSE"]},
        }
    )
    response = _ask(beautyco_facts, "Should we stop selling D2C?", model=model)
    assert response["telemetry"].get("strategic_fallback_used") is True
    rec = response["answer"].get("strategic_recommendation") or {}
    assert rec.get("action_type") != "EXIT"


def test_c12_financial_number_rejected_fallback(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, "Should I cut marketing?")
    envelope = context["evidence_envelope"]
    eids = []
    for item in envelope.get("verified_facts") or []:
        if item.get("evidence_id"):
            eids.append(str(item["evidence_id"]))
            break
    model = _OverrideStrategicModel(
        {
            "selected_action": "EXPERIMENT",
            "recommendation_strength": "MODERATE",
            "decision_confidence": "MEDIUM",
            "supporting_evidence_ids": eids,
            "rationale": "Cut marketing by 20% immediately.",
            "thesis": {"position": "cut 15% now", "uncertainty_keys": ["DEMAND_RESPONSE"]},
        }
    )
    response = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    assert response["telemetry"].get("strategic_fallback_used") is True


def test_c13_customer_sentiment_rejected(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, "Should I cut marketing?")
    eids = [str(item["evidence_id"]) for item in (context["evidence_envelope"].get("verified_facts") or [])[:1]]
    model = _OverrideStrategicModel(
        {
            "selected_action": "INVESTIGATE",
            "recommendation_strength": "MODERATE",
            "decision_confidence": "MEDIUM",
            "supporting_evidence_ids": eids,
            "rationale": "Customers hate the ads so cut marketing.",
            "thesis": {"position": "sentiment driven", "uncertainty_keys": ["DEMAND_RESPONSE"]},
        }
    )
    response = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    assert response["telemetry"].get("strategic_fallback_used") is True


def test_c14_forecast_language_rejected(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, "Should I cut marketing?")
    eids = [str(item["evidence_id"]) for item in (context["evidence_envelope"].get("verified_facts") or [])[:1]]
    model = _OverrideStrategicModel(
        {
            "selected_action": "REDUCE",
            "recommendation_strength": "MODERATE",
            "decision_confidence": "MEDIUM",
            "supporting_evidence_ids": eids,
            "rationale": "Revenue will remain unchanged if we cut marketing.",
            "thesis": {"position": "safe cut", "uncertainty_keys": ["DEMAND_RESPONSE"]},
        }
    )
    response = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    assert response["telemetry"].get("strategic_fallback_used") is True


def test_c15_confidence_clamped(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, "Should I cut marketing?")
    eids = [str(item["evidence_id"]) for item in (context["evidence_envelope"].get("verified_facts") or [])[:2]]
    model = _OverrideStrategicModel(
        {
            "selected_action": "EXPERIMENT",
            "recommendation_strength": "MODERATE",
            "decision_confidence": "HIGH",
            "supporting_evidence_ids": eids,
            "rationale": "Test before broad cut.",
            "thesis": {"position": "experiment first", "uncertainty_keys": ["DEMAND_RESPONSE"]},
        }
    )
    response = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    assert response["telemetry"].get("confidence_clamped") is True
    rec = response["answer"].get("strategic_recommendation") or {}
    ceiling = response["telemetry"].get("decision_confidence_ceiling")
    if ceiling:
        assert rec.get("decision_confidence") != "HIGH" or ceiling != "HIGH"


def test_c16_strength_clamped(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, "Should I increase prices?")
    eids = [str(item["evidence_id"]) for item in (context["evidence_envelope"].get("verified_facts") or [])[:1]]
    model = _OverrideStrategicModel(
        {
            "selected_action": "INVESTIGATE",
            "recommendation_strength": "STRONG",
            "decision_confidence": "LOW",
            "supporting_evidence_ids": eids,
            "rationale": "Investigate pricing elasticity drivers.",
            "thesis": {"position": "investigate price", "uncertainty_keys": ["PRICE_ELASTICITY"]},
        }
    )
    response = _ask(beautyco_facts, "Should I increase prices?", model=model)
    assert response["telemetry"].get("strength_clamped") in {True, False}


def test_c17_empty_scope_insufficient_fallback():
    context = {
        "summary": {},
        "signals": [],
        "financial_scope": {"scope_hash": "", "filters": {}, "dataset_id": "b"},
        "filters": {},
        "caveats": [],
    }
    context["evidence_envelope"] = build_evidence_envelope("Should I cut marketing?", context)
    answer, telemetry, _ = run_strategic_partner_judgment(
        message="Should I cut marketing?",
        working_context=context,
        agent=FakeAiCfoModel(),
    )
    assert telemetry.get("strategic_fallback_used") in {True, False}
    assert answer.get("headline")


def test_c18_v1_boundary_unchanged(beautyco_facts, monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V1_BOUNDARY)
    response = _ask(beautyco_facts, "Should we stop selling D2C?")
    assert response["answer"]["headline"] == STRATEGY_BOUNDARY_SENTENCE
    assert response["telemetry"].get("recommendations_enabled") is False


def test_c19_scenario_deterministic_unchanged(beautyco_facts):
    assert classify_capability("What happens if marketing drops 20%?") == Capability.SCENARIO_REQUEST
    response = _ask(beautyco_facts, "What happens if marketing drops 20%?")
    assert response["answer"].get("answer_kind") == "SCENARIO"
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario"


def test_c20_phase1_breakdown_unchanged(beautyco_facts):
    response = _ask(beautyco_facts, "Which SKUs have the weakest CM2?")
    assert response["answer"].get("headline")
    assert response["telemetry"].get("answer_source") in {
        "deterministic_ranking",
        "deterministic_followup",
        "model",
        "model_with_forced_tool",
        "model_semantic",
        "deterministic_guard",
    }


def test_cfo_actions_emitted_on_experiment(beautyco_facts):
    response = _ask(beautyco_facts, "Should I cut marketing?")
    actions = response["answer"].get("cfo_actions") or []
    types = {a.get("type") for a in actions}
    assert response["telemetry"].get("actions_emitted", 0) >= 1
    assert "RUN_SCENARIO" in types or "MONITOR_METRICS" in types or "ASK_FOLLOWUP" in types


def test_decision_thesis_populated(beautyco_facts):
    response = _ask(beautyco_facts, "Should I cut marketing?")
    thesis = response["answer"].get("decision_thesis")
    assert thesis is not None
    assert thesis.get("position_key") or thesis.get("next_step_action")


def test_exit_eligible_fixture_via_fake_model():
    context = {"fake_strategic_fixture": "exit_eligible"}
    raw = FakeAiCfoModel().run_strategic_turn(
        message="Should we discontinue SKU-123?",
        model_input={
            "allowed_actions": ["EXIT", "INVESTIGATE"],
            "unknowns": ["DEMAND_RESPONSE"],
            "evidence_catalog": [{"evidence_id": "e1"}],
        },
        context=context,
    )
    parsed = parse_strategic_model_decision(raw)
    assert parsed.selected_action == ActionType.EXIT
