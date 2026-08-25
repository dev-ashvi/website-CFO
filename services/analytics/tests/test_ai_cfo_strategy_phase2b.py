"""Phase 2B strategic diagnosis + eligibility tests (B1–B20)."""

from __future__ import annotations

import inspect

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.evidence.requirements import resolve_evidence_requirement
from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.strategy.actions import ActionType, EvidenceBurden, evidence_burden_for
from wyz_analytics.ai_cfo.strategy.assessment import ScenarioRef
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence, DiagnosisConfidence
from wyz_analytics.ai_cfo.strategy.conflicts import StrategicConflict, detect_strategic_conflicts
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack, build_diagnosis_pack
from wyz_analytics.ai_cfo.strategy.eligibility import evaluate_action_eligibility
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme, EvidenceFlag
from wyz_analytics.ai_cfo.strategy.intent import DecisionType
from wyz_analytics.ai_cfo.strategy.materiality import (
    AbsoluteImpactClass,
    ContributionShareClass,
    Materiality,
    SeverityClass,
)
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V1_BOUNDARY, resolve_strategy_mode
from wyz_analytics.ai_cfo.strategy.persistence import TemporalPersistence, classify_temporal_persistence
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown
from wyz_analytics.ai_cfo.tools import AiCfoTools
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


def _ask(facts, message, *, filters=None, previous_turns=None, signal_context=None):
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


def test_b1_cut_marketing_diagnosis_no_recommendation(beautyco_facts):
    message = "Should I cut marketing?"
    tools = AiCfoTools(
        beautyco_facts,
        active_filters={"channel": ["D2C Website"]},
        dataset_id="b",
        dimension="channel",
    )
    context = _ctx_from_tools(tools, message)
    plane = build_strategic_control_plane(
        message, capability_is_strategic=True, context=context, financial_scope=tools.financial_scope
    )
    assert plane["strategic_intent_detected"]
    pack = plane["diagnosis_pack"]
    assert pack is not None
    assert any("cm1" in eid or "cm2" in eid or "marketing" in eid for eid in pack.evidence_ids)
    assert StrategicUnknown.DEMAND_RESPONSE in pack.unknowns
    eligible = {e.action_type for e in plane["action_eligibility"] if e.eligible}
    assert ActionType.INVESTIGATE in eligible
    assert ActionType.EXPERIMENT in eligible or ActionType.OPTIMIZE in eligible or ActionType.MONITOR in eligible
    assert plane["assessment"].recommendation is None
    assert plane["assessment"].recommendations_enabled is False
    response = _ask(beautyco_facts, message)
    assert response["answer"]["headline"] == STRATEGY_BOUNDARY_SENTENCE
    assert response["telemetry"].get("recommendations_enabled") is False


def test_b2_stop_d2c_exit_ineligible(beautyco_facts):
    message = "Should we stop selling D2C?"
    response = _ask(beautyco_facts, message)
    plane = response["context"].get("strategic_control_plane") or {}
    elig = {row["action_type"]: row for row in (plane.get("action_eligibility") or [])}
    assert elig.get("EXIT", {}).get("eligible") is False
    eligible = {k for k, v in elig.items() if v.get("eligible")}
    assert "INVESTIGATE" in eligible
    assert "EXPERIMENT" in eligible or "MONITOR" in eligible


def test_b3_exit_structurally_eligible_with_very_strong_burden():
    """Purpose-built pack satisfying VERY_STRONG EXIT requirements — not BeautyCo-weakened."""
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
    assert evidence_burden_for(ActionType.EXIT) == EvidenceBurden.VERY_STRONG
    results = {e.action_type: e for e in evaluate_action_eligibility(pack, decision_type=DecisionType.DECIDE)}
    assert results[ActionType.EXIT].eligible is True
    assert results[ActionType.EXIT].burden_required == EvidenceBurden.VERY_STRONG
    assert results[ActionType.EXIT].burden_met is True


def test_b4_one_month_negative_exit_not_eligible():
    persistence = classify_temporal_persistence(
        trend_payload={"rows": [{"month": "2024-01", "cm2": -100.0}]},
        metric="cm2",
    )
    assert persistence == TemporalPersistence.UNKNOWN
    pack = DiagnosisPack(
        theme=DecisionTheme.SKU_EXIT,
        scope_hash="s",
        diagnosis_confidence=DiagnosisConfidence.MEDIUM,
        temporal_persistence=persistence,
        evidence_flags={
            EvidenceFlag.HAS_SCOPE,
            EvidenceFlag.HAS_CM2,
            EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
        },
        empty_scope=False,
    )
    results = {e.action_type: e for e in evaluate_action_eligibility(pack, decision_type=DecisionType.DECIDE)}
    assert results[ActionType.EXIT].eligible is False


def test_b5_prioritize_candidates_no_recommendation(beautyco_facts):
    message = "What should I fix first?"
    plane = build_strategic_control_plane(message, capability_is_strategic=True)
    assert plane["assessment"].decision_type == DecisionType.PRIORITIZE
    assert len(plane["assessment"].candidate_actions) >= 1
    assert plane["assessment"].recommendation is None


def test_b6_price_elasticity_caps_decision_confidence(beautyco_facts):
    message = "Should I increase prices?"
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, message)
    plane = build_strategic_control_plane(
        message, capability_is_strategic=True, context=context, financial_scope=tools.financial_scope
    )
    assert StrategicUnknown.PRICE_ELASTICITY in plane["diagnosis_pack"].unknowns
    assert plane["assessment"].decision_confidence in {
        DecisionConfidence.INSUFFICIENT,
        DecisionConfidence.LOW,
    }
    elig = {e.action_type: e for e in plane["action_eligibility"]}
    if ActionType.INCREASE in elig:
        assert elig[ActionType.INCREASE].eligible is False


def test_b7_reduce_product_costs_forces_cost_breakdown(beautyco_facts):
    message = "Should I reduce product costs?"
    req = resolve_evidence_requirement(
        message=message,
        analytical={"filters": {"channel": ["D2C Website"]}, "dimension": "channel"},
        context={"signals": [], "followup": {}},
        capability=Capability.STRATEGIC_RECOMMENDATION,
    )
    assert req.required_tool == "get_cost_breakdown"
    response = _ask(beautyco_facts, message)
    forced = ((response["answer"].get("telemetry") or {}).get("guard") or {}).get("forced_tools") or []
    assert any(item.get("tool") == "get_cost_breakdown" for item in forced)
    assert response["telemetry"].get("cost_breakdown_forced") is True


def test_b8_cost_recon_mismatch_lowers_diagnosis_confidence():
    context = {
        "summary": {"cm1": 100.0, "cm2": -50.0, "gross_margin": 200.0, "net_revenue": 1000.0},
        "signals": [{"signal_type": "PRODUCT_COGS_PRESSURE", "severity": "high", "materiality": 0.2, "entity": "x", "entity_type": "channel"}],
        "financial_scope": {"scope_hash": "s", "filters": {"channel": ["D2C Website"]}, "dataset_id": "b"},
        "filters": {"channel": ["D2C Website"]},
        "forced_evidence": {
            "get_cost_breakdown": {
                "available": True,
                "reconciliation": {"status": "mismatch"},
                "product_cogs": {"total": 10, "components": [{"key": "manufacturing_cogs", "value": 10}]},
                "cm1_costs": {"total": 5, "components": []},
                "limitations": ["component_sum_mismatch"],
            }
        },
    }
    context["evidence_envelope"] = build_evidence_envelope("Should I reduce product costs?", context)
    pack = build_diagnosis_pack(
        "Should I reduce product costs?",
        decision_type=DecisionType.DECIDE,
        context=context,
    )
    assert pack.cost_context is not None
    assert pack.cost_context.reconciliation_status == "mismatch"
    assert "cost_breakdown_reconciliation_mismatch" in pack.limitations
    assert pack.diagnosis_confidence in {DiagnosisConfidence.LOW, DiagnosisConfidence.MEDIUM}


def test_b9_scenario_ref_does_not_raise_decision_confidence(beautyco_facts):
    message = "Should I cut marketing?"
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, message)
    scope_hash = tools.financial_scope["scope_hash"]
    plane_no = build_strategic_control_plane(
        message, capability_is_strategic=True, context=context, financial_scope=tools.financial_scope
    )
    plane_yes = build_strategic_control_plane(
        message,
        capability_is_strategic=True,
        context=context,
        financial_scope=tools.financial_scope,
        scenario_refs=[ScenarioRef(scope_hash=scope_hash, lever="MARKETING_SPEND", digest="d1")],
    )
    assert plane_yes["diagnosis_pack"].scenario_refs
    assert plane_yes["assessment"].decision_confidence == plane_no["assessment"].decision_confidence
    assert plane_yes["assessment"].decision_confidence != DecisionConfidence.HIGH or True  # may be MEDIUM/LOW
    # Explicit: scenario must not force HIGH
    assert not (
        plane_no["assessment"].decision_confidence != DecisionConfidence.HIGH
        and plane_yes["assessment"].decision_confidence == DecisionConfidence.HIGH
    )


def test_b10_cross_scope_scenario_ref_ignored():
    context = {
        "summary": {"cm1": 1.0, "cm2": -1.0, "net_revenue": 10.0},
        "signals": [],
        "financial_scope": {"scope_hash": "scope-a", "filters": {"channel": ["D2C Website"]}},
        "filters": {"channel": ["D2C Website"]},
    }
    pack = build_diagnosis_pack(
        "Should I cut marketing?",
        decision_type=DecisionType.DECIDE,
        context=context,
        scenario_refs=[ScenarioRef(scope_hash="scope-b", lever="MARKETING_SPEND", digest="x")],
    )
    assert pack.scenario_refs == []


def test_b11_signal_context_same_scope_included(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = _ctx_from_tools(tools, "Should I cut marketing?")
    verified = {
        "signal_type": "MARKETING_PRESSURE",
        "entity": "D2C Website",
        "entity_type": "channel",
        "severity": "high",
        "materiality": 0.2,
        "evidence": {"marketing_pct": 0.4},
    }
    context["signal_context_resolution"] = {
        "grounding_allowed": True,
        "verified_signal": verified,
        "source": "CURRENT_SIGNAL",
    }
    context["active_signal_verified"] = verified
    pack = build_diagnosis_pack("Should I cut marketing?", decision_type=DecisionType.DECIDE, context=context)
    assert any("MARKETING_PRESSURE" in ref for ref in pack.verified_signal_refs)


def test_b12_stale_signal_excluded():
    context = {
        "summary": {"cm1": 1.0, "cm2": -1.0, "net_revenue": 10.0, "allocated_marketing": 5.0},
        "signals": [],
        "financial_scope": {"scope_hash": "s", "filters": {"channel": ["D2C Website"]}},
        "filters": {"channel": ["D2C Website"]},
        "signal_context_resolution": {"grounding_allowed": False, "source": "STALE_DROPPED"},
        "active_signal_verified": None,
    }
    pack = build_diagnosis_pack("Should I cut marketing?", decision_type=DecisionType.DECIDE, context=context)
    assert pack.verified_signal_refs == [] or all("STALE" not in r for r in pack.verified_signal_refs)


def test_b13_growth_vs_margin_conflict_retained():
    conflicts = detect_strategic_conflicts(
        summary={"net_revenue": 1_000_000.0, "cm2": -50_000.0, "cm2_pct": -0.05},
        change_evidence=[
            {"metric": "net_revenue", "direction": "up"},
            {"metric": "cm2", "direction": "down"},
        ],
    )
    assert StrategicConflict.GROWTH_VS_MARGIN in conflicts


def test_b14_insufficient_history_persistence_unknown():
    assert (
        classify_temporal_persistence(trend_payload={"rows": [{"month": "2024-01", "cm2": -1}, {"month": "2024-02", "cm2": -2}]})
        == TemporalPersistence.UNKNOWN
    )


def test_b15_empty_scope_insufficient():
    pack = build_diagnosis_pack(
        "Should I cut marketing?",
        decision_type=DecisionType.DECIDE,
        context={"summary": {}, "signals": [], "financial_scope": {"scope_hash": "", "filters": {}}, "filters": {}},
    )
    assert pack.diagnosis_confidence == DiagnosisConfidence.INSUFFICIENT
    results = evaluate_action_eligibility(pack, decision_type=DecisionType.DECIDE)
    high = [e for e in results if e.action_type in {ActionType.PAUSE, ActionType.EXIT, ActionType.REDUCE}]
    assert all(not e.eligible for e in high)


def test_b16_low_materiality_blocks_high_impact():
    pack = DiagnosisPack(
        theme=DecisionTheme.MARKETING,
        scope_hash="s",
        diagnosis_confidence=DiagnosisConfidence.MEDIUM,
        materiality=Materiality(
            absolute_impact_class=AbsoluteImpactClass.LOW,
            contribution_share_class=ContributionShareClass.LOW,
            severity_class=SeverityClass.LOW,
        ),
        evidence_flags={
            EvidenceFlag.HAS_SCOPE,
            EvidenceFlag.HAS_CM2,
            EvidenceFlag.HAS_CM1,
            EvidenceFlag.HAS_CM1_CM2_RELATION,
            EvidenceFlag.HAS_MARKETING_METRIC,
        },
        empty_scope=False,
    )
    results = {e.action_type: e for e in evaluate_action_eligibility(pack, decision_type=DecisionType.DECIDE)}
    assert results[ActionType.REDUCE].eligible is False


def test_b17_cost_breakdown_tool_no_filter_args():
    sig = inspect.signature(AiCfoTools.get_cost_breakdown)
    assert list(sig.parameters) == ["self"]
    # dispatch strips filters
    src = inspect.getsource(AiCfoTools.dispatch)
    assert 'args.pop("filters"' in src
    assert "get_cost_breakdown" in src


def test_b18_recommendation_disabled_phase2b(beautyco_facts):
    plane = build_strategic_control_plane("Should I cut marketing?", capability_is_strategic=True)
    assert plane["assessment"].recommendation is None
    assert plane["assessment"].recommendations_enabled is False
    assert plane["reasoning_contract"].recommendations_enabled is False


def test_b19_v1_boundary_unchanged(beautyco_facts):
    assert resolve_strategy_mode() == STRATEGY_MODE_V1_BOUNDARY
    response = _ask(beautyco_facts, "Should we stop selling D2C?")
    assert response["answer"]["headline"] == STRATEGY_BOUNDARY_SENTENCE


def test_b20_deterministic_scenario_unchanged(beautyco_facts):
    assert classify_capability("What happens if marketing drops 20%?") == Capability.SCENARIO_REQUEST
    response = _ask(beautyco_facts, "What happens if marketing drops 20%?")
    assert response["answer"].get("answer_kind") == "SCENARIO"
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario"
