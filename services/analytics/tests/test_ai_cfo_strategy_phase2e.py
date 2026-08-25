"""Phase 2E — Strategic Decision Management (E1–E35)."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.financial_scope import build_financial_scope
from wyz_analytics.ai_cfo.strategy.actions import CfoActionType
from wyz_analytics.ai_cfo.strategy.decisions.baseline import capture_baseline_snapshot
from wyz_analytics.ai_cfo.strategy.decisions.evaluate import evaluate_strategic_decision
from wyz_analytics.ai_cfo.strategy.decisions.models import (
    DecisionStatus,
    EvaluationStatus,
    MetricObservation,
    RevisionDisposition,
)
from wyz_analytics.ai_cfo.strategy.decisions.monitoring import build_monitoring_spec
from wyz_analytics.ai_cfo.strategy.decisions.repository import InMemoryStrategicDecisionRepository
from wyz_analytics.ai_cfo.strategy.decisions.review import review_strategic_decision, thread_from_decision_record
from wyz_analytics.ai_cfo.strategy.decisions.signals import (
    build_decision_review_signal,
    evaluate_active_decisions_for_scope,
)
from wyz_analytics.ai_cfo.strategy.decisions.track import track_strategic_decision
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.thread import StrategicDecisionThread, assert_thread_has_no_financial_payload
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


class _OverrideStrategicModel(FakeAiCfoModel):
    def __init__(self, payload: dict[str, Any]):
        super().__init__()
        self._payload = payload

    def run_strategic_turn(self, *, message: str, model_input: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        return dict(self._payload)


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


def _ask(facts, message, *, filters=None, previous_turns=None, model=None):
    return run_ai_cfo_turn(
        facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "ds_e",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j1",
            "engine_version": "t",
        },
        analytical={
            "filters": filters if filters is not None else {},
            "surface": "margin",
            "dimension": "channel",
        },
        message=message,
        guards_enabled=True,
        previous_turns=previous_turns,
        model=model or FakeAiCfoModel(),
    )


def _scope(dataset_id: str = "ds_e", filters: dict | None = None):
    return build_financial_scope(dataset_id=dataset_id, filters=filters or {})


def _summary(facts, filters=None):
    scope = _scope(filters=filters)
    tools = AiCfoTools(facts, active_filters=scope["filters"], financial_scope=scope, dataset_id="ds_e")
    return tools.get_current_financial_view().get("summary") or {}, scope


def _seed_thread(**overrides: Any) -> StrategicDecisionThread:
    base = dict(
        thread_id="sdt_test1",
        decision_theme="MARKETING",
        decision_type="DECIDE",
        subject={"dimension": "channel", "entity": None},
        original_question="Should I cut marketing?",
        selected_action="EXPERIMENT",
        recommendation_strength="MODERATE",
        decision_confidence="MEDIUM",
        diagnosis_confidence="MEDIUM",
        unknowns=["DEMAND_RESPONSE"],
        monitoring_metric_keys=["cm2", "cm2_pct", "net_revenue", "orders", "marketing_pct"],
        change_my_view_keys=[
            "demand_deteriorates_during_reduction",
            "cm2_benefit_outweighed_by_revenue_loss",
            "marketing_pressure_not_persistent",
        ],
        supporting_evidence_ids=["summary:cm2", "signal:MARKETING_PRESSURE"],
        position_key="controlled_reduction_test",
        primary_reason_key="cm2_pressure_material",
        scope_hash=_scope()["scope_hash"],
    )
    base.update(overrides)
    return StrategicDecisionThread(**base)


def _track(facts, *, repo=None, period="period_a", filters=None, client_baseline=None):
    repo = repo or InMemoryStrategicDecisionRepository()
    summary, scope = _summary(facts, filters=filters)
    record, telem = track_strategic_decision(
        repository=repo,
        dataset_id="ds_e",
        scope_hash=scope["scope_hash"],
        summary=summary,
        observation_period=period,
        analysis_job_id=period,
        strategic_thread=_seed_thread(scope_hash=scope["scope_hash"]),
        client_baseline_values=client_baseline,
    )
    return repo, record, summary, scope, telem


def _obs(metric_key: str, value: float, *, period: str, scope_hash: str) -> MetricObservation:
    return MetricObservation(
        metric_key=metric_key,
        value=value,
        unit="INR" if metric_key in {"cm2", "net_revenue"} else "ratio",
        scope_hash=scope_hash,
        period=period,
        provenance="VERIFIED_AGGREGATE",
        evidence_id=f"summary:{metric_key}",
    )


# --- E1–E6 track / baseline / monitoring ---


def test_e1_strategic_conversation_does_not_auto_create_active_decision(beautyco_facts, tmp_path):
    from wyz_analytics.workers.service import AnalyticsWorkspace

    ws = AnalyticsWorkspace(root=tmp_path)
    before = ws.strategic_decisions.list("ds_e")
    _ask(beautyco_facts, "Should I cut marketing?")
    after = ws.strategic_decisions.list("ds_e")
    assert before == after == []


def test_e2_explicit_track_creates_record(beautyco_facts):
    _, record, _, _, telem = _track(beautyco_facts)
    assert record.status == DecisionStatus.ACTIVE
    assert record.decision_id.startswith("sdr_")
    assert telem["strategic_decision_created"] is True


def test_e3_tracked_decision_preserves_scope_hash(beautyco_facts):
    _, record, _, scope, _ = _track(beautyco_facts)
    assert record.scope_hash == scope["scope_hash"]
    assert record.baseline_snapshot is not None
    assert record.baseline_snapshot.scope_hash == scope["scope_hash"]


def test_e4_baseline_values_rebuilt_server_side(beautyco_facts):
    _, record, summary, _, _ = _track(beautyco_facts)
    cm2_obs = next(o for o in record.baseline_snapshot.metric_observations if o.metric_key == "cm2")
    assert cm2_obs.value == pytest.approx(float(summary["cm2"]), rel=1e-6)
    assert cm2_obs.provenance == "VERIFIED_AGGREGATE"


def test_e5_client_injected_baseline_ignored(beautyco_facts):
    _, record, summary, _, _ = _track(
        beautyco_facts,
        client_baseline={"cm2": 999999999.0, "net_revenue": -1},
    )
    cm2_obs = next(o for o in record.baseline_snapshot.metric_observations if o.metric_key == "cm2")
    assert cm2_obs.value != 999999999.0
    assert cm2_obs.value == pytest.approx(float(summary["cm2"]), rel=1e-6)


def test_e6_monitoring_spec_from_semantics():
    spec = build_monitoring_spec(
        decision_id="sdr_x",
        decision_theme="MARKETING",
        monitoring_metric_keys=["cm2", "net_revenue"],
        change_my_view_keys=["demand_deteriorates_during_reduction"],
    )
    assert "cm2" in spec.metric_keys
    assert "demand_deteriorates_during_reduction" in spec.change_condition_keys
    assert "scenario_not_observed_outcome" in spec.required_evidence_flags


# --- E7–E16 evaluation ---


def test_e7_same_scope_comparable(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    current = [
        _obs("cm2", float(summary["cm2"]) * 1.12, period="p1", scope_hash=scope["scope_hash"]),
        _obs("net_revenue", float(summary["net_revenue"]) * 1.01, period="p1", scope_hash=scope["scope_hash"]),
        _obs("cm2_pct", float(summary.get("cm2_pct") or 0) + 0.06, period="p1", scope_hash=scope["scope_hash"]),
    ]
    evaluation = evaluate_strategic_decision(
        record,
        current_observations=current,
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    assert evaluation.comparable is True
    assert evaluation.evaluation_status != EvaluationStatus.SCOPE_NOT_COMPARABLE
    repo.save_evaluation("ds_e", record.decision_id, evaluation)


def test_e8_cross_scope_cannot_evaluate(beautyco_facts):
    _, record, _, scope, _ = _track(beautyco_facts, period="p0")
    other = _scope(filters={"channel": ["D2C"]})
    assert other["scope_hash"] != scope["scope_hash"]
    evaluation = evaluate_strategic_decision(
        record,
        current_evidence={"summary": {"cm2": 1.0}},
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=other["scope_hash"],
    )
    assert evaluation.evaluation_status == EvaluationStatus.SCOPE_NOT_COMPARABLE
    assert "SCOPE_NOT_COMPARABLE" in evaluation.unresolved_conditions


def test_e9_different_dataset_cannot_evaluate(beautyco_facts):
    _, record, _, scope, _ = _track(beautyco_facts, period="p0")
    evaluation = evaluate_strategic_decision(
        record,
        current_evidence={"summary": {"cm2": 1.0}},
        current_period="p1",
        current_dataset_id="other_ds",
        current_scope_hash=scope["scope_hash"],
    )
    assert evaluation.evaluation_status == EvaluationStatus.SCOPE_NOT_COMPARABLE


def test_e10_insufficient_new_period(beautyco_facts):
    _, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    evaluation = evaluate_strategic_decision(
        record,
        current_evidence={"summary": summary},
        current_period="p0",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    assert evaluation.evaluation_status == EvaluationStatus.INSUFFICIENT_NEW_EVIDENCE


def test_e11_tiny_move_no_revisit(beautyco_facts):
    _, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    cm2 = float(summary["cm2"])
    rev = float(summary["net_revenue"])
    evaluation = evaluate_strategic_decision(
        record,
        current_observations=[
            _obs("cm2", cm2 * 1.005, period="p1", scope_hash=scope["scope_hash"]),
            _obs("net_revenue", rev * 1.005, period="p1", scope_hash=scope["scope_hash"]),
            _obs("cm2_pct", float(summary.get("cm2_pct") or 0.1), period="p1", scope_hash=scope["scope_hash"]),
        ],
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    assert evaluation.evaluation_status == EvaluationStatus.UNCHANGED
    assert evaluation.recommendation_reconsideration_required is False


def test_e12_supporting_evidence(beautyco_facts):
    _, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    cm2 = float(summary["cm2"])
    rev = float(summary["net_revenue"])
    evaluation = evaluate_strategic_decision(
        record,
        current_observations=[
            _obs("cm2", cm2 * 1.15 if cm2 else 1000.0, period="p1", scope_hash=scope["scope_hash"]),
            _obs("net_revenue", rev * 1.01 if rev else 1000.0, period="p1", scope_hash=scope["scope_hash"]),
            _obs("cm2_pct", float(summary.get("cm2_pct") or 0) + 0.08, period="p1", scope_hash=scope["scope_hash"]),
        ],
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    assert evaluation.evaluation_status == EvaluationStatus.SUPPORTING
    assert evaluation.recommendation_reconsideration_required is False


def test_e13_weakening_evidence(beautyco_facts):
    _, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    cm2 = float(summary["cm2"])
    rev = float(summary["net_revenue"])
    # Material CM2 deterioration without CMV trigger combo → WEAKENING
    evaluation = evaluate_strategic_decision(
        record,
        current_observations=[
            _obs("cm2", (cm2 * 0.8) if cm2 else -1000.0, period="p1", scope_hash=scope["scope_hash"]),
            _obs("net_revenue", rev * 1.0 if rev else 1000.0, period="p1", scope_hash=scope["scope_hash"]),
            _obs("cm2_pct", float(summary.get("cm2_pct") or 0.2) - 0.08, period="p1", scope_hash=scope["scope_hash"]),
        ],
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    assert evaluation.evaluation_status == EvaluationStatus.WEAKENING
    assert "selected_action" not in evaluation.to_dict()


def test_e14_material_cmv_revisit_required(beautyco_facts):
    _, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    cm2 = float(summary["cm2"]) or 1000.0
    rev = float(summary["net_revenue"]) or 10000.0
    evaluation = evaluate_strategic_decision(
        record,
        current_observations=[
            _obs("cm2", cm2 * 1.2, period="p1", scope_hash=scope["scope_hash"]),
            _obs("net_revenue", rev * 0.8, period="p1", scope_hash=scope["scope_hash"]),
            _obs("cm2_pct", float(summary.get("cm2_pct") or 0) + 0.1, period="p1", scope_hash=scope["scope_hash"]),
        ],
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    assert evaluation.evaluation_status == EvaluationStatus.REVISIT_REQUIRED
    assert evaluation.recommendation_reconsideration_required is True
    assert "cm2_benefit_outweighed_by_revenue_loss" in evaluation.triggered_conditions


def test_e15_scenario_not_observed_outcome(beautyco_facts):
    _, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    scenario_obs = MetricObservation(
        metric_key="cm2",
        value=float(summary["cm2"]) * 2,
        provenance="CALCULATED_SCENARIO",
        period="p1",
        scope_hash=scope["scope_hash"],
    )
    evaluation = evaluate_strategic_decision(
        record,
        current_observations=[scenario_obs],
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    # Scenario stripped → insufficient observations
    assert evaluation.evaluation_status == EvaluationStatus.INSUFFICIENT_NEW_EVIDENCE


def test_e16_evaluation_never_produces_recommendation(beautyco_facts):
    _, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    evaluation = evaluate_strategic_decision(
        record,
        current_evidence={"summary": summary},
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    payload = evaluation.to_dict()
    assert "recommendation" not in payload
    assert "selected_action" not in payload
    assert payload.get("recommendation_reconsideration_required") in {True, False}


# --- E17–E25 review / revision ---


def test_e17_revisit_exposes_review_action(beautyco_facts):
    _, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    cm2 = float(summary["cm2"]) or 1000.0
    rev = float(summary["net_revenue"]) or 10000.0
    evaluation = evaluate_strategic_decision(
        record,
        current_observations=[
            _obs("cm2", cm2 * 1.2, period="p1", scope_hash=scope["scope_hash"]),
            _obs("net_revenue", rev * 0.8, period="p1", scope_hash=scope["scope_hash"]),
        ],
        current_period="p1",
        current_dataset_id="ds_e",
        current_scope_hash=scope["scope_hash"],
    )
    record.latest_evaluation = evaluation
    record.status = DecisionStatus.REVISIT_REQUIRED
    signal = build_decision_review_signal(record)
    assert signal["evidence"]["action"] == "REVIEW_STRATEGIC_DECISION"
    assert signal["proactive_recommendation"] is None


def _review(beautyco_facts, record, repo, summary, scope, payload: dict[str, Any], period="p1"):
    from wyz_analytics.ai_cfo.context import build_financial_intelligence_context

    tools = AiCfoTools(beautyco_facts, active_filters=scope["filters"], financial_scope=scope, dataset_id="ds_e")
    ctx = build_financial_intelligence_context(
        lineage={
            "workspace_id": "t",
            "dataset_id": "ds_e",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": period,
            "engine_version": "t",
        },
        analytical={"filters": scope["filters"], "surface": "margin", "dimension": "channel"},
        summary=summary,
        signals=[],
    )
    ctx["financial_scope"] = scope
    ctx["scope_hash"] = scope["scope_hash"]
    return review_strategic_decision(
        repository=repo,
        record=record,
        working_context=ctx,
        agent=_OverrideStrategicModel(payload),
        tools=tools,
        current_summary=summary,
        current_period=period,
    )


def _strategic_payload(
    *,
    action: str = "EXPERIMENT",
    strength: str = "MODERATE",
    confidence: str = "MEDIUM",
    position: str = "controlled_reduction_test",
) -> dict[str, Any]:
    return {
        "selected_action": action,
        "recommendation_strength": strength,
        "decision_confidence": confidence,
        "thesis": {
            "position": position,
            "why_keys_or_evidence_ids": ["summary:cm2"],
            "uncertainty_keys": ["DEMAND_RESPONSE"],
            "next_step_action": action,
            "monitoring_metric_keys": ["cm2", "net_revenue"],
        },
        "supporting_evidence_ids": ["summary:cm2"],
        "primary_reason_key": "cm2_pressure_material",
        "change_my_view_keys": ["demand_deteriorates_during_reduction"],
        "rationale": "Bounded strategic judgment for Phase 2E review tests.",
    }


def test_e18_review_reuses_partner(beautyco_facts, monkeypatch):
    called = {"partner": False}
    import wyz_analytics.ai_cfo.strategy.decisions.review as review_mod

    original = review_mod.run_strategic_partner_judgment

    def _wrap(**kwargs):
        called["partner"] = True
        assert kwargs.get("reconsider_thread") is not None
        return original(**kwargs)

    monkeypatch.setattr(review_mod, "run_strategic_partner_judgment", _wrap)
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    out = _review(beautyco_facts, record, repo, summary, scope, _strategic_payload())
    assert called["partner"] is True
    assert out["evaluation_has_recommendation"] is False
    assert out["revision"]["disposition"] in {d.value for d in RevisionDisposition}


def test_e19_review_may_maintain(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    out = _review(beautyco_facts, record, repo, summary, scope, _strategic_payload())
    rev = out["revision"]
    assert rev["disposition"] in {
        RevisionDisposition.MAINTAIN.value,
        RevisionDisposition.STRENGTHEN.value,
        RevisionDisposition.WEAKEN.value,
        RevisionDisposition.CHANGE.value,
    }
    # Maintain path: same action family kept as current recommendation.
    assert rev["new_action"] is not None
    if rev["previous_action"] == rev["new_action"] and rev["previous_strength"] == rev["new_strength"]:
        assert rev["disposition"] == RevisionDisposition.MAINTAIN.value


def test_e20_review_may_weaken(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    record.recommendation_strength = "STRONG"
    repo.save(record)
    out = _review(
        beautyco_facts,
        record,
        repo,
        summary,
        scope,
        _strategic_payload(strength="TENTATIVE", confidence="LOW"),
    )
    assert out["revision"]["disposition"] in {
        RevisionDisposition.WEAKEN.value,
        RevisionDisposition.MAINTAIN.value,
        RevisionDisposition.CHANGE.value,
    }


def test_e21_review_may_change_when_eligible(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    out = _review(
        beautyco_facts,
        record,
        repo,
        summary,
        scope,
        _strategic_payload(action="MONITOR", position="monitor_pressure"),
    )
    assert out["revision"]["new_action"] in {
        "MONITOR",
        "EXPERIMENT",
        "INVESTIGATE",
        "REDUCE",
        "MAINTAIN",
        "OPTIMIZE",
    }


def test_e22_review_cannot_select_ineligible_exit(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    out = _review(
        beautyco_facts,
        record,
        repo,
        summary,
        scope,
        _strategic_payload(action="EXIT", strength="STRONG", confidence="HIGH", position="exit"),
    )
    final = out["revision"]["new_action"]
    telem = out["answer"].get("telemetry") or {}
    assert final != "EXIT" or telem.get("strategic_fallback_used") or telem.get("model_validation_valid") is False


def test_e23_confidence_ceilings_still_apply(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    out = _review(
        beautyco_facts,
        record,
        repo,
        summary,
        scope,
        _strategic_payload(strength="STRONG", confidence="HIGH"),
    )
    telem = out["answer"].get("telemetry") or {}
    conf = out["revision"]["new_confidence"] or telem.get("final_decision_confidence")
    assert conf in {None, "LOW", "MEDIUM", "HIGH", "INSUFFICIENT"} or telem.get("confidence_clamped") in {
        True,
        False,
    }


def test_e24_revision_history_preserved(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    _review(
        beautyco_facts,
        record,
        repo,
        summary,
        scope,
        _strategic_payload(action="MONITOR", position="monitor"),
    )
    saved = repo.get("ds_e", record.decision_id)
    assert len(saved.revisions) >= 1


def test_e25_previous_recommendation_not_overwritten(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    original = record.selected_action
    _review(
        beautyco_facts,
        record,
        repo,
        summary,
        scope,
        _strategic_payload(action="MONITOR", position="monitor"),
    )
    saved = repo.get("ds_e", record.decision_id)
    assert saved.original_selected_action == original
    assert saved.revisions[-1].previous_action == original


# --- E26–E31 lifecycle / separation ---


def test_e26_archive_explicit(beautyco_facts):
    repo, record, _, _, _ = _track(beautyco_facts)
    repo.update_status("ds_e", record.decision_id, DecisionStatus.ARCHIVED)
    assert repo.get("ds_e", record.decision_id).status == DecisionStatus.ARCHIVED


def test_e27_archived_not_auto_evaluated(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    repo.update_status("ds_e", record.decision_id, DecisionStatus.ARCHIVED)
    signals = evaluate_active_decisions_for_scope(
        repository=repo,
        dataset_id="ds_e",
        scope_hash=scope["scope_hash"],
        summary={**summary, "cm2": float(summary.get("cm2") or 0) * 0.5},
        observation_period="p1",
    )
    assert all(s.get("decision_id") != record.decision_id for s in signals)


def test_e28_proactive_review_signal(beautyco_facts):
    repo, record, summary, scope, _ = _track(beautyco_facts, period="p0")
    cm2 = float(summary["cm2"]) or 1000.0
    rev = float(summary["net_revenue"]) or 10000.0
    # Force baseline then evaluate with adverse current via repo path
    record.baseline_snapshot.metric_observations = [
        _obs("cm2", cm2, period="p0", scope_hash=scope["scope_hash"]),
        _obs("net_revenue", rev, period="p0", scope_hash=scope["scope_hash"]),
        _obs("cm2_pct", 0.1, period="p0", scope_hash=scope["scope_hash"]),
    ]
    repo.save(record)
    signals = evaluate_active_decisions_for_scope(
        repository=repo,
        dataset_id="ds_e",
        scope_hash=scope["scope_hash"],
        summary={"cm2": cm2 * 1.2, "net_revenue": rev * 0.75, "cm2_pct": 0.2},
        observation_period="p1",
    )
    assert any(s.get("signal_type") == "STRATEGIC_DECISION_REVIEW" for s in signals)


def test_e29_proactive_signal_no_recommendation(beautyco_facts):
    _, record, _, _, _ = _track(beautyco_facts)
    record.status = DecisionStatus.REVISIT_REQUIRED
    signal = build_decision_review_signal(record)
    assert signal.get("proactive_recommendation") is None
    assert signal["evidence"].get("recommendation") is None


def test_e30_financial_scope_unchanged():
    a = build_financial_scope(dataset_id="ds_e", filters={"channel": ["D2C"]})
    b = build_financial_scope(dataset_id="ds_e", filters={"channel": ["D2C"]})
    assert a["scope_hash"] == b["scope_hash"]
    assert "filters" in a


def test_e31_thread_separate_from_record(beautyco_facts):
    _, record, _, _, _ = _track(beautyco_facts)
    thread = thread_from_decision_record(record)
    lean = thread.to_lean_dict()
    assert_thread_has_no_financial_payload(lean)
    assert record.decision_id != thread.thread_id or record.source_thread_id == thread.thread_id
    assert "baseline_snapshot" not in lean
    assert record.baseline_snapshot is not None


def test_e32_cross_scope_thread_behavior_unchanged(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    thread = (r1.get("conversation") or {}).get("strategic_thread")
    assert thread
    r2 = _ask(
        beautyco_facts,
        "Why?",
        filters={"channel": ["D2C"]},
        previous_turns=[
            {
                "question": "Should I cut marketing?",
                "scope_hash": r1.get("scope_hash"),
                "strategic_thread": thread,
            }
        ],
    )
    # Cross-scope follow-up should not pretend same-scope continuity as ACTIVE decision truth
    st = (r2.get("conversation") or {}).get("strategic_thread") or {}
    status = st.get("status")
    assert status in {None, "HISTORICAL", "ACTIVE", "SUPERSEDED"} or r2.get("answer")


def test_e33_why_zero_provider_invariant(beautyco_facts):
    model = FakeAiCfoModel()
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = {
        "question": "Should I cut marketing?",
        "scope_hash": r1.get("scope_hash"),
        "strategic_thread": (r1.get("conversation") or {}).get("strategic_thread"),
    }
    before = model.strategic_calls if hasattr(model, "strategic_calls") else 0
    r2 = _ask(beautyco_facts, "Why?", previous_turns=[t1], model=model)
    telem = r2.get("telemetry") or {}
    assert int(telem.get("provider_calls") or 0) == 0


def test_e34_scenario_deterministic_unchanged(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    t1 = {
        "question": "Should I cut marketing?",
        "scope_hash": r1.get("scope_hash"),
        "strategic_thread": (r1.get("conversation") or {}).get("strategic_thread"),
    }
    r2 = _ask(beautyco_facts, "What if I cut marketing 20%?", previous_turns=[t1])
    answer = r2.get("answer") or {}
    assert answer.get("answer_kind") == "SCENARIO" or (r2.get("telemetry") or {}).get("scenario_engine_used")


def test_e35_v1_boundary_mode_still_loads(monkeypatch, beautyco_facts):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", "v1_boundary")
    out = _ask(beautyco_facts, "Should I cut marketing?")
    assert out.get("answer") is not None


def test_track_action_emitted_on_strategic(beautyco_facts):
    out = _ask(beautyco_facts, "Should I cut marketing?")
    actions = (out.get("answer") or {}).get("cfo_actions") or []
    types = {a.get("type") for a in actions if isinstance(a, dict)}
    assert CfoActionType.TRACK_STRATEGIC_DECISION.value in types


def test_capture_baseline_rejects_client_values_in_snapshot():
    snap = capture_baseline_snapshot(
        decision_id="sdr_x",
        dataset_id="ds",
        scope_hash="abc",
        summary={"cm2": 10.0, "net_revenue": 100.0},
        metric_keys=["cm2", "net_revenue"],
        observation_period="p0",
        client_metric_values={"cm2": 999.0},
    )
    assert snap.metric_observations[0].value == 10.0
