"""Deterministic strategic decision evaluation — evidence direction only.

Does NOT produce recommendations or causal attribution.
"""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.decisions.baseline import observations_from_summary
from wyz_analytics.ai_cfo.strategy.decisions.models import (
    DecisionBaselineSnapshot,
    DecisionEvaluation,
    DecisionMonitoringSpec,
    DecisionStatus,
    EvidenceDirection,
    EvaluationStatus,
    MetricObservation,
    StrategicDecisionRecord,
    new_evaluation_id,
)

# Reuse materiality float bands from strategy.materiality (0.05 / 0.15).
_MATERIAL_RELATIVE = 0.05
_TINY_RELATIVE = 0.01
_MATERIAL_RATIO_POINTS = 0.05  # for *_pct metrics
_TINY_RATIO_POINTS = 0.005

_RATIO_METRICS = frozenset({"cm1_pct", "cm2_pct", "marketing_pct", "gross_margin_pct", "discount_pct"})


def _obs_map(observations: list[MetricObservation]) -> dict[str, MetricObservation]:
    return {o.metric_key: o for o in observations if o.metric_key}


def _relative_delta(baseline: float | None, current: float | None) -> float | None:
    if baseline is None or current is None:
        return None
    denom = abs(baseline)
    if denom < 1e-9:
        # Near-zero baseline: treat absolute move relative to 1 as unresolved precision.
        return None if abs(current) < 1e-9 else None
    return (current - baseline) / denom


def _absolute_delta(baseline: float | None, current: float | None) -> float | None:
    if baseline is None or current is None:
        return None
    return current - baseline


def _is_material_move(metric_key: str, baseline: float | None, current: float | None) -> bool | None:
    """True/False when defensible; None when unresolved (no inventing precision)."""
    if baseline is None or current is None:
        return None
    if metric_key in _RATIO_METRICS:
        delta = _absolute_delta(baseline, current)
        if delta is None:
            return None
        if abs(delta) < _TINY_RATIO_POINTS:
            return False
        if abs(delta) >= _MATERIAL_RATIO_POINTS:
            return True
        return False  # between tiny and material → non-material
    rel = _relative_delta(baseline, current)
    if rel is None:
        return None
    if abs(rel) < _TINY_RELATIVE:
        return False
    if abs(rel) >= _MATERIAL_RELATIVE:
        return True
    return False


def _direction_of(metric_key: str, baseline: float | None, current: float | None) -> str | None:
    """'up' | 'down' | 'flat' | None."""
    material = _is_material_move(metric_key, baseline, current)
    if material is None:
        return None
    if material is False:
        delta = _absolute_delta(baseline, current)
        if delta is None or abs(delta) < 1e-12:
            return "flat"
        return "flat"  # non-material → treat as unchanged for strategic gates
    delta = _absolute_delta(baseline, current)
    if delta is None:
        return None
    return "up" if delta > 0 else "down"


def _eval_condition(
    key: str,
    *,
    base: dict[str, MetricObservation],
    curr: dict[str, MetricObservation],
) -> str:
    """Return 'triggered' | 'supporting' | 'unresolved' | 'inactive'."""

    def val(m: dict[str, MetricObservation], metric: str) -> float | None:
        obs = m.get(metric)
        return obs.value if obs else None

    # Marketing CMV / support semantics
    if key == "demand_deteriorates_during_reduction":
        rev = _direction_of("net_revenue", val(base, "net_revenue"), val(curr, "net_revenue"))
        orders = _direction_of("orders", val(base, "orders"), val(curr, "orders"))
        if rev == "down" or orders == "down":
            return "triggered"
        if rev is None and orders is None:
            return "unresolved"
        if rev == "flat" and (orders in {None, "flat"}):
            return "inactive"
        return "inactive"

    if key == "cm2_benefit_outweighed_by_revenue_loss":
        cm2 = _direction_of("cm2", val(base, "cm2"), val(curr, "cm2"))
        cm2p = _direction_of("cm2_pct", val(base, "cm2_pct"), val(curr, "cm2_pct"))
        rev = _direction_of("net_revenue", val(base, "net_revenue"), val(curr, "net_revenue"))
        cm2_up = cm2 == "up" or cm2p == "up"
        if cm2_up and rev == "down":
            return "triggered"
        if cm2 is None and cm2p is None and rev is None:
            return "unresolved"
        if cm2_up and rev in {"flat", "up"}:
            return "supporting"  # contribution improved without material revenue loss
        return "inactive"

    if key == "marketing_pressure_not_persistent":
        mkt = _direction_of("marketing_pct", val(base, "marketing_pct"), val(curr, "marketing_pct"))
        # Lower marketing_pct = pressure eased → challenges need-to-cut thesis
        if mkt == "down":
            return "triggered"
        if mkt is None:
            return "unresolved"
        if mkt == "up":
            return "supporting"  # pressure persists / worsens — thesis still relevant
        return "inactive"

    if key in {
        "persistent_negative_contribution",
        "persistent_negative_sku_contribution",
        "channel_stays_below_peers_after_fixes",
    }:
        cm2 = val(curr, "cm2")
        cm2p = val(curr, "cm2_pct")
        if cm2 is None and cm2p is None:
            return "unresolved"
        if (cm2 is not None and cm2 < 0) or (cm2p is not None and cm2p < 0):
            # Persistence requires comparable new period — caller already gated periods.
            return "triggered"
        return "inactive"

    if key == "higher_material_pressure_emerges":
        # Without peer/driver ranking in evaluation, leave unresolved rather than invent.
        return "unresolved"

    # Unknown semantic keys → unresolved (do not invent)
    return "unresolved"


def evaluate_strategic_decision(
    decision_record: StrategicDecisionRecord,
    baseline_snapshot: DecisionBaselineSnapshot | None = None,
    *,
    current_evidence: dict[str, Any] | None = None,
    current_observations: list[MetricObservation] | None = None,
    current_period: str | None = None,
    current_dataset_id: str | None = None,
    current_scope_hash: str | None = None,
) -> DecisionEvaluation:
    """Compare verified current evidence to baseline. Never emits a recommendation."""
    baseline = baseline_snapshot or decision_record.baseline_snapshot
    spec = decision_record.monitoring_spec or DecisionMonitoringSpec(decision_id=decision_record.decision_id)
    eval_id = new_evaluation_id()
    now_period = current_period
    scope = current_scope_hash or decision_record.scope_hash

    if decision_record.status in {DecisionStatus.ARCHIVED, DecisionStatus.RESOLVED}:
        return DecisionEvaluation(
            decision_id=decision_record.decision_id,
            evaluation_id=eval_id,
            evaluation_status=EvaluationStatus.INSUFFICIENT_NEW_EVIDENCE,
            notes=["decision_not_active_for_evaluation"],
            recommendation_reconsideration_required=False,
            comparable=False,
            scope_hash=scope,
        )

    if current_dataset_id and current_dataset_id != decision_record.dataset_id:
        return DecisionEvaluation(
            decision_id=decision_record.decision_id,
            evaluation_id=eval_id,
            evaluation_status=EvaluationStatus.SCOPE_NOT_COMPARABLE,
            unresolved_conditions=["dataset_mismatch"],
            comparable=False,
            recommendation_reconsideration_required=False,
            scope_hash=scope,
            notes=["different_dataset"],
        )

    if current_scope_hash and current_scope_hash != decision_record.scope_hash:
        return DecisionEvaluation(
            decision_id=decision_record.decision_id,
            evaluation_id=eval_id,
            evaluation_status=EvaluationStatus.SCOPE_NOT_COMPARABLE,
            unresolved_conditions=["SCOPE_NOT_COMPARABLE"],
            comparable=False,
            recommendation_reconsideration_required=False,
            scope_hash=current_scope_hash,
            notes=["scope_hash_mismatch"],
        )

    if baseline is None:
        return DecisionEvaluation(
            decision_id=decision_record.decision_id,
            evaluation_id=eval_id,
            evaluation_status=EvaluationStatus.INSUFFICIENT_NEW_EVIDENCE,
            unresolved_conditions=["missing_baseline"],
            comparable=False,
            recommendation_reconsideration_required=False,
            scope_hash=scope,
        )

    # Reject CALCULATED_SCENARIO as current observations.
    if current_observations:
        cleaned: list[MetricObservation] = []
        for obs in current_observations:
            if str(obs.provenance or "").upper() == "CALCULATED_SCENARIO":
                continue
            cleaned.append(obs)
        current_observations = cleaned

    if current_observations is None:
        evidence = current_evidence if isinstance(current_evidence, dict) else {}
        # Strip scenario payloads if present
        if evidence.get("provenance") == "CALCULATED_SCENARIO" or evidence.get("scenario_result"):
            evidence = {k: v for k, v in evidence.items() if k not in {"scenario_result", "deltas"}}
        summary = evidence.get("summary") if isinstance(evidence.get("summary"), dict) else evidence
        now_period = now_period or evidence.get("observation_period") or evidence.get("analysis_job_id")
        current_observations = observations_from_summary(
            summary=summary,
            metric_keys=list(spec.metric_keys or decision_record.monitoring_metric_keys or ["cm2", "net_revenue"]),
            scope_hash=scope or decision_record.scope_hash,
            period=now_period,
        )

    base_period = baseline.observation_period
    if not now_period:
        now_period = next((o.period for o in current_observations if o.period), None)

    if base_period and now_period and base_period == now_period:
        return DecisionEvaluation(
            decision_id=decision_record.decision_id,
            evaluation_id=eval_id,
            evaluation_status=EvaluationStatus.INSUFFICIENT_NEW_EVIDENCE,
            baseline_period=base_period,
            current_period=now_period,
            scope_hash=scope,
            comparable=True,
            evidence_ids=[o.evidence_id for o in current_observations if o.evidence_id][:12],
            notes=["same_observation_period"],
            recommendation_reconsideration_required=False,
        )

    if not current_observations:
        return DecisionEvaluation(
            decision_id=decision_record.decision_id,
            evaluation_id=eval_id,
            evaluation_status=EvaluationStatus.INSUFFICIENT_NEW_EVIDENCE,
            baseline_period=base_period,
            current_period=now_period,
            scope_hash=scope,
            comparable=True,
            notes=["no_current_observations"],
            recommendation_reconsideration_required=False,
        )

    base_map = _obs_map(baseline.metric_observations)
    curr_map = _obs_map(current_observations)

    triggered: list[str] = []
    supporting: list[str] = []
    unresolved: list[str] = []
    for key in list(spec.change_condition_keys or decision_record.change_my_view_keys or []):
        result = _eval_condition(key, base=base_map, curr=curr_map)
        if result == "triggered":
            triggered.append(key)
        elif result == "supporting":
            supporting.append(key)
        elif result == "unresolved":
            unresolved.append(key)

    # Aggregate metric movement for UNCHANGED / SUPPORTING / WEAKENING without CMV fire.
    material_moves = 0
    for key in spec.metric_keys or []:
        b = base_map.get(key)
        c = curr_map.get(key)
        move = _is_material_move(key, b.value if b else None, c.value if c else None)
        if move is True:
            material_moves += 1

    if triggered:
        # Material change-my-view → revisit
        status = EvaluationStatus.REVISIT_REQUIRED
        direction = EvidenceDirection.WEAKENING
        revisit = True
    elif supporting and not triggered:
        status = EvaluationStatus.SUPPORTING
        direction = EvidenceDirection.SUPPORTING
        revisit = False
    elif material_moves == 0 and not unresolved:
        status = EvaluationStatus.UNCHANGED
        direction = EvidenceDirection.UNCHANGED
        revisit = False
    elif material_moves > 0 and supporting:
        status = EvaluationStatus.SUPPORTING
        direction = EvidenceDirection.SUPPORTING
        revisit = False
    elif material_moves > 0 and not supporting and not triggered:
        # Material move without known CMV interpretation → weakening signal, not auto-revisit
        # unless we have explicit weakening from demand deterioration style inactive keys handled above.
        status = EvaluationStatus.WEAKENING
        direction = EvidenceDirection.WEAKENING
        revisit = False
    elif unresolved and not triggered and not supporting and material_moves == 0:
        status = EvaluationStatus.UNCHANGED
        direction = EvidenceDirection.UNKNOWN
        revisit = False
    else:
        status = EvaluationStatus.UNCHANGED
        direction = EvidenceDirection.MIXED if (supporting or triggered) else EvidenceDirection.UNKNOWN
        revisit = False

    # If only supporting from cm2_benefit key path marked supporting without trigger
    if status == EvaluationStatus.WEAKENING and supporting and not triggered:
        # Prefer SUPPORTING when thesis-aligned conditions fired
        status = EvaluationStatus.SUPPORTING
        direction = EvidenceDirection.SUPPORTING

    return DecisionEvaluation(
        decision_id=decision_record.decision_id,
        evaluation_id=eval_id,
        evaluation_status=status,
        evidence_direction=direction,
        triggered_conditions=triggered[:8],
        supporting_conditions=supporting[:8],
        unresolved_conditions=unresolved[:8],
        baseline_period=base_period,
        current_period=now_period,
        evidence_ids=[o.evidence_id for o in current_observations if o.evidence_id][:12],
        scope_hash=scope,
        recommendation_reconsideration_required=revisit,
        comparable=True,
        notes=[],
    )


def apply_evaluation_to_status(
    record: StrategicDecisionRecord, evaluation: DecisionEvaluation
) -> DecisionStatus:
    """Map evaluation onto lifecycle without auto-RESOLVED."""
    if record.status in {DecisionStatus.ARCHIVED, DecisionStatus.RESOLVED}:
        return record.status
    if evaluation.evaluation_status == EvaluationStatus.REVISIT_REQUIRED:
        return DecisionStatus.REVISIT_REQUIRED
    if evaluation.evaluation_status in {
        EvaluationStatus.WEAKENING,
        EvaluationStatus.SUPPORTING,
    }:
        return DecisionStatus.REVIEW_DUE
    if evaluation.evaluation_status == EvaluationStatus.INSUFFICIENT_NEW_EVIDENCE:
        return DecisionStatus.ACTIVE if record.status == DecisionStatus.DRAFT else record.status
    if evaluation.evaluation_status == EvaluationStatus.SCOPE_NOT_COMPARABLE:
        return record.status
    return DecisionStatus.ACTIVE if record.status == DecisionStatus.DRAFT else (
        record.status if record.status != DecisionStatus.REVISIT_REQUIRED else DecisionStatus.ACTIVE
    )
