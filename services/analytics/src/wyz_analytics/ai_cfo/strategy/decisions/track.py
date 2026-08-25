"""Explicit TRACK_STRATEGIC_DECISION — seeds durable record from lean thread."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.decisions.baseline import capture_baseline_snapshot
from wyz_analytics.ai_cfo.strategy.decisions.models import (
    DecisionStatus,
    StrategicDecisionRecord,
    _utc_now,
    new_decision_id,
)
from wyz_analytics.ai_cfo.strategy.decisions.monitoring import build_monitoring_spec
from wyz_analytics.ai_cfo.strategy.decisions.repository import StrategicDecisionRepository
from wyz_analytics.ai_cfo.strategy.decisions.telemetry import decision_track_telemetry
from wyz_analytics.ai_cfo.strategy.thread import StrategicDecisionThread


def thread_from_payload(raw: Any) -> StrategicDecisionThread | None:
    if isinstance(raw, StrategicDecisionThread):
        return raw
    return StrategicDecisionThread.from_dict(raw)


def track_strategic_decision(
    *,
    repository: StrategicDecisionRepository,
    dataset_id: str,
    scope_hash: str,
    summary: dict[str, Any] | None,
    observation_period: str | None,
    analysis_job_id: str | None = None,
    strategic_thread: Any | None = None,
    seed: dict[str, Any] | None = None,
    client_baseline_values: dict[str, Any] | None = None,
    activate: bool = True,
) -> tuple[StrategicDecisionRecord, dict[str, Any]]:
    """Create ACTIVE decision from explicit track. Never auto-called from ask path."""
    thread = thread_from_payload(strategic_thread)
    seed = seed if isinstance(seed, dict) else {}

    if not scope_hash and thread and thread.scope_hash:
        scope_hash = thread.scope_hash
    if not scope_hash:
        raise ValueError("scope_hash_required")

    decision_id = new_decision_id()
    theme = (thread.decision_theme if thread else None) or seed.get("decision_theme")
    selected = (thread.selected_action if thread else None) or seed.get("selected_action")
    strength = (thread.recommendation_strength if thread else None) or seed.get("recommendation_strength")
    conf = (thread.decision_confidence if thread else None) or seed.get("decision_confidence")
    diag = (thread.diagnosis_confidence if thread else None) or seed.get("diagnosis_confidence")
    monitor_keys = list(
        (thread.monitoring_metric_keys if thread else None)
        or seed.get("monitoring_metric_keys")
        or []
    )
    cmv_keys = list(
        (thread.change_my_view_keys if thread else None) or seed.get("change_my_view_keys") or []
    )
    unknowns = list((thread.unknowns if thread else None) or seed.get("unknowns") or [])
    evidence_ids = list(
        (thread.supporting_evidence_ids if thread else None)
        or seed.get("supporting_evidence_ids")
        or []
    )
    subject = (thread.subject if thread else None) or seed.get("subject")
    scenario_ref = None
    if thread and thread.latest_scenario_ref:
        scenario_ref = thread.latest_scenario_ref.to_dict()
    elif isinstance(seed.get("latest_scenario_ref"), dict):
        scenario_ref = seed["latest_scenario_ref"]

    monitoring = build_monitoring_spec(
        decision_id=decision_id,
        decision_theme=theme,
        monitoring_metric_keys=monitor_keys,
        change_my_view_keys=cmv_keys,
    )

    baseline = capture_baseline_snapshot(
        decision_id=decision_id,
        dataset_id=dataset_id,
        scope_hash=scope_hash,
        summary=summary,
        metric_keys=monitoring.metric_keys,
        observation_period=observation_period or analysis_job_id,
        evidence_refs=evidence_ids,
        client_metric_values=client_baseline_values,
    )

    status = DecisionStatus.ACTIVE if activate else DecisionStatus.DRAFT
    record = StrategicDecisionRecord(
        decision_id=decision_id,
        dataset_id=dataset_id,
        scope_hash=scope_hash,
        decision_theme=theme,
        decision_type=(thread.decision_type if thread else None) or seed.get("decision_type"),
        subject=subject if isinstance(subject, dict) else None,
        original_question=(thread.original_question if thread else None)
        or seed.get("original_question"),
        selected_action=selected,
        recommendation_strength=strength,
        decision_confidence=conf,
        diagnosis_confidence=diag,
        position_key=(thread.position_key if thread else None) or seed.get("position_key"),
        primary_reason_key=(thread.primary_reason_key if thread else None)
        or seed.get("primary_reason_key"),
        supporting_evidence_ids=evidence_ids[:12],
        unknowns=unknowns[:8],
        monitoring_metric_keys=list(monitoring.metric_keys),
        change_my_view_keys=list(monitoring.change_condition_keys),
        baseline_snapshot=baseline,
        monitoring_spec=monitoring,
        latest_scenario_ref=scenario_ref,
        status=status,
        source_thread_id=(thread.thread_id if thread else None) or seed.get("source_thread_id"),
        analysis_job_id=analysis_job_id,
        original_selected_action=selected,
        original_recommendation_strength=strength,
        original_decision_confidence=conf,
    )
    repository.create(record)
    telem = decision_track_telemetry(record)
    return record, telem
