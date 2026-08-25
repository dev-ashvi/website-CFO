"""Phase 2A strategic control-plane tests (A1–A20).

Does not modify the frozen V1 benchmark suite.
"""

from __future__ import annotations

import os

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.strategy.actions import (
    ActionSeverity,
    ActionType,
    CfoAction,
    CfoActionType,
    EvidenceBurden,
    action_severity,
    evidence_burden_for,
    severity_rank,
    validate_cfo_action_payload,
)
from wyz_analytics.ai_cfo.strategy.assessment import (
    DecisionThesis,
    ScenarioRef,
    StrategicAssessment,
    empty_strategic_assessment,
)
from wyz_analytics.ai_cfo.strategy.confidence import (
    DecisionConfidence,
    DiagnosisConfidence,
    decision_confidence_not_raised_by_scenario,
)
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.intent import DecisionType, classify_decision_type
from wyz_analytics.ai_cfo.strategy.mode import (
    STRATEGY_MODE_V1_BOUNDARY,
    resolve_strategy_mode,
)
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown, infer_unknowns_for_question
from wyz_analytics.ai_cfo.strategy.validation import validate_strategic_assessment
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")
    monkeypatch.delenv("WYZ_AI_CFO_STRATEGY_MODE", raising=False)


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _ask(facts, message, *, filters=None):
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
            "filters": filters or {"channel": ["D2C Website"]},
            "surface": "margin",
            "dimension": "channel",
        },
        message=message,
        guards_enabled=True,
    )


# --- A1–A9 intent / routing ---


def test_a1_should_i_cut_marketing_strategic_decide_v1_boundary(beautyco_facts):
    message = "Should I cut marketing?"
    assert classify_capability(message) == Capability.STRATEGIC_RECOMMENDATION
    assert classify_decision_type(message) == DecisionType.DECIDE
    plane = build_strategic_control_plane(message, capability_is_strategic=True)
    assert plane["strategic_intent_detected"] is True
    assert plane["assessment"].decision_type == DecisionType.DECIDE
    assert resolve_strategy_mode() == STRATEGY_MODE_V1_BOUNDARY
    response = _ask(beautyco_facts, message)
    assert response["answer"]["headline"] == STRATEGY_BOUNDARY_SENTENCE
    assert response["telemetry"].get("strategic_intent_detected") is True
    assert response["telemetry"].get("decision_type") == DecisionType.DECIDE.value
    assert response["telemetry"].get("strategy_mode") == STRATEGY_MODE_V1_BOUNDARY
    assert response["telemetry"].get("recommendations_enabled") is False


def test_a2_what_should_i_fix_first_prioritize():
    message = "What should I fix first?"
    assert classify_capability(message) == Capability.STRATEGIC_RECOMMENDATION
    assert classify_decision_type(message) == DecisionType.PRIORITIZE
    plane = build_strategic_control_plane(message, capability_is_strategic=True)
    assert plane["assessment"].decision_type == DecisionType.PRIORITIZE


def test_a3_what_would_you_do_as_cfo_decide():
    message = "What would you do if you were my CFO?"
    assert classify_capability(message) == Capability.STRATEGIC_RECOMMENDATION
    assert classify_decision_type(message) == DecisionType.DECIDE


def test_a4_what_should_i_monitor():
    message = "What should I monitor?"
    assert classify_capability(message) == Capability.STRATEGIC_RECOMMENDATION
    assert classify_decision_type(message) == DecisionType.MONITOR


def test_a5_what_should_i_test():
    message = "What should I test?"
    assert classify_capability(message) == Capability.STRATEGIC_RECOMMENDATION
    assert classify_decision_type(message) == DecisionType.EXPERIMENT


def test_a6_why_is_cm2_weak_diagnostic_unchanged():
    message = "Why is CM2 weak?"
    assert classify_capability(message) == Capability.FINANCIAL_INTERPRETATION
    plane = build_strategic_control_plane(message, capability_is_strategic=False)
    assert plane["strategic_intent_detected"] is False


def test_a7_customer_sentiment_guard_wins(beautyco_facts):
    message = "Why do customers dislike this SKU?"
    assert classify_capability(message) == Capability.UNSUPPORTED_CAUSALITY
    response = _ask(beautyco_facts, message, filters={"channel": ["Amazon"], "category": ["Lips"]})
    guard = (response["answer"].get("telemetry") or {}).get("guard") or {}
    assert guard.get("capability") == Capability.UNSUPPORTED_CAUSALITY.value


def test_a8_marketing_drop_scenario_path(beautyco_facts):
    message = "What happens if marketing drops 20%?"
    assert classify_capability(message) == Capability.SCENARIO_REQUEST
    response = _ask(beautyco_facts, message)
    assert response["answer"].get("answer_kind") == "SCENARIO"
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario"


def test_a9_should_cut_marketing_20_v1_precedence(beautyco_facts):
    message = "Should I cut marketing 20%?"
    assert classify_capability(message) == Capability.STRATEGIC_RECOMMENDATION
    response = _ask(beautyco_facts, message)
    # Strategic + numeric → deterministic scenario with strategic boundary prefix retained.
    answer = response["answer"]
    assert answer.get("answer_kind") == "SCENARIO"
    assert (answer.get("telemetry") or {}).get("answer_source") == "deterministic_scenario"
    text = f"{answer.get('headline') or ''} {answer.get('interpretation') or ''}".lower()
    assert "strategic" in text or "recommend" in text or "stop/continue" in text or "boundary" in text


# --- A10–A18 contracts / validation ---


def test_a10_action_severity_ordering():
    assert severity_rank(ActionType.EXIT) > severity_rank(ActionType.PAUSE)
    assert severity_rank(ActionType.PAUSE) > severity_rank(ActionType.REDUCE)
    assert severity_rank(ActionType.REDUCE) == severity_rank(ActionType.OPTIMIZE)
    assert severity_rank(ActionType.OPTIMIZE) > severity_rank(ActionType.INVESTIGATE)
    assert action_severity(ActionType.EXIT) == ActionSeverity.VERY_HIGH


def test_a11_exit_requires_highest_evidence_burden():
    assert evidence_burden_for(ActionType.EXIT) == EvidenceBurden.VERY_STRONG
    assert evidence_burden_for(ActionType.PAUSE) == EvidenceBurden.VERY_STRONG
    assert evidence_burden_for(ActionType.INVESTIGATE) == EvidenceBurden.MINIMAL
    assert EvidenceBurden.VERY_STRONG.value == "VERY_STRONG"


def test_a12_diagnosis_and_decision_confidence_can_differ():
    assessment = empty_strategic_assessment(decision_type=DecisionType.DECIDE, scope_hash="abc")
    assessment.diagnosis_confidence = DiagnosisConfidence.HIGH
    assessment.decision_confidence = DecisionConfidence.LOW
    assert assessment.diagnosis_confidence != assessment.decision_confidence
    result = validate_strategic_assessment(assessment, active_scope_hash="abc")
    assert result.ok


def test_a13_scenario_does_not_raise_decision_confidence():
    base = DecisionConfidence.LOW
    raised = decision_confidence_not_raised_by_scenario(base, scenario_present=True)
    assert raised == DecisionConfidence.LOW
    plane = build_strategic_control_plane(
        "Should I cut marketing?",
        capability_is_strategic=True,
        diagnosis_confidence=DiagnosisConfidence.HIGH,
        scenario_refs=[ScenarioRef(scope_hash="s1", lever="marketing", digest="d1")],
        financial_scope={"scope_hash": "s1", "dataset_id": "b"},
    )
    assert plane["assessment"].diagnosis_confidence == DiagnosisConfidence.HIGH
    assert plane["assessment"].decision_confidence != DecisionConfidence.HIGH


def test_a14_price_decision_price_elasticity_unknown():
    unknowns = infer_unknowns_for_question("Should I increase prices?")
    assert StrategicUnknown.PRICE_ELASTICITY in unknowns
    plane = build_strategic_control_plane("Should I increase prices?", capability_is_strategic=True)
    assert StrategicUnknown.PRICE_ELASTICITY in plane["assessment"].unknowns
    assert plane["assessment"].decision_confidence in {
        DecisionConfidence.INSUFFICIENT,
        DecisionConfidence.LOW,
    }


def test_a15_marketing_reduction_demand_response_unknown():
    unknowns = infer_unknowns_for_question("Should I cut marketing?")
    assert StrategicUnknown.DEMAND_RESPONSE in unknowns
    plane = build_strategic_control_plane("Should I cut marketing?", capability_is_strategic=True)
    assert StrategicUnknown.DEMAND_RESPONSE in plane["assessment"].unknowns


def test_a16_decision_thesis_without_financial_numbers():
    thesis = DecisionThesis(
        position_key="prefer_controlled_experiment_over_immediate_exit",
        basis_keys=["verified_margin_pressure_may_exist"],
        uncertainty_keys=["DEMAND_RESPONSE"],
        next_step_action=ActionType.EXPERIMENT,
        next_step_key="test_controlled_marketing_reduction",
        monitoring_metric_keys=["net_revenue", "cm2"],
    )
    assessment = empty_strategic_assessment(scope_hash="s")
    assessment.decision_thesis = thesis
    assert validate_strategic_assessment(assessment, active_scope_hash="s").ok
    # Numeric financial facts in thesis keys must fail validation.
    bad = DecisionThesis(position_key="cut_spend_by_20_percent")
    assessment.decision_thesis = bad
    assert not validate_strategic_assessment(assessment, active_scope_hash="s").ok


def test_a17_cfo_action_rejects_model_filters():
    action = CfoAction(
        id="a1",
        type=CfoActionType.INVESTIGATE_DIMENSION,
        label="Investigate channel",
        payload={"filters": {"channel": ["D2C"]}, "dimension": "channel"},
    )
    errors = validate_cfo_action_payload(action)
    assert any("filters" in e for e in errors)
    assessment = empty_strategic_assessment(scope_hash="s")
    assessment.next_actions = [action]
    assert not validate_strategic_assessment(assessment, active_scope_hash="s").ok


def test_a18_cross_scope_scenario_ref_rejected():
    assessment = empty_strategic_assessment(decision_type=DecisionType.DECIDE, scope_hash="scope-a")
    assessment.scenario_refs = [ScenarioRef(scope_hash="scope-b", lever="marketing", digest="x")]
    result = validate_strategic_assessment(assessment, active_scope_hash="scope-a")
    assert not result.ok
    assert any("Cross-scope" in e or "scope_hash" in e for e in result.errors)


# --- A19–A20 mode / V1 freeze ---


def test_a19_v1_boundary_is_default():
    os.environ.pop("WYZ_AI_CFO_STRATEGY_MODE", None)
    assert resolve_strategy_mode() == STRATEGY_MODE_V1_BOUNDARY
    assert resolve_strategy_mode(None) == STRATEGY_MODE_V1_BOUNDARY


def test_a20_frozen_v1_strategic_behavior_unchanged(beautyco_facts):
    response = _ask(beautyco_facts, "Should we stop selling D2C?")
    assert response["answer"]["headline"] == STRATEGY_BOUNDARY_SENTENCE
    assert response["telemetry"].get("strategy_mode") == STRATEGY_MODE_V1_BOUNDARY
    assert response["telemetry"].get("recommendations_enabled") is False
    plane = (response["context"].get("strategic_control_plane") or {})
    assert plane.get("recommendations_enabled") is False
    assert plane.get("assessment") is not None


def test_strategic_assessment_is_separate_from_insight_type():
    assessment = StrategicAssessment(
        decision_type=DecisionType.DECIDE,
        diagnosis_confidence=DiagnosisConfidence.HIGH,
        decision_confidence=DecisionConfidence.LOW,
    )
    payload = assessment.to_dict()
    assert "insight_type" not in payload
    assert payload["decision_type"] == "DECIDE"
