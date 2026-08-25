"""Phase 2E Strategic Decision Management — durable decision state.

Separate from Phase 2D StrategicDecisionThread (conversational memory).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def new_decision_id() -> str:
    return f"sdr_{uuid.uuid4().hex[:12]}"


def new_snapshot_id() -> str:
    return f"dbs_{uuid.uuid4().hex[:12]}"


def new_evaluation_id() -> str:
    return f"dev_{uuid.uuid4().hex[:12]}"


def new_revision_id() -> str:
    return f"drv_{uuid.uuid4().hex[:12]}"


class DecisionStatus(str, Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    REVIEW_DUE = "REVIEW_DUE"
    REVISIT_REQUIRED = "REVISIT_REQUIRED"
    RESOLVED = "RESOLVED"
    ARCHIVED = "ARCHIVED"


class EvaluationStatus(str, Enum):
    INSUFFICIENT_NEW_EVIDENCE = "INSUFFICIENT_NEW_EVIDENCE"
    SCOPE_NOT_COMPARABLE = "SCOPE_NOT_COMPARABLE"
    UNCHANGED = "UNCHANGED"
    SUPPORTING = "SUPPORTING"
    WEAKENING = "WEAKENING"
    REVISIT_REQUIRED = "REVISIT_REQUIRED"


class EvidenceDirection(str, Enum):
    UNKNOWN = "UNKNOWN"
    SUPPORTING = "SUPPORTING"
    WEAKENING = "WEAKENING"
    MIXED = "MIXED"
    UNCHANGED = "UNCHANGED"


class RevisionDisposition(str, Enum):
    MAINTAIN = "MAINTAIN"
    STRENGTHEN = "STRENGTHEN"
    WEAKEN = "WEAKEN"
    CHANGE = "CHANGE"


@dataclass
class MetricObservation:
    metric_key: str
    value: float | None
    unit: str | None = None
    scope_hash: str | None = None
    period: str | None = None
    provenance: str = "VERIFIED_AGGREGATE"
    evidence_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "metric_key": self.metric_key,
            "value": self.value,
            "unit": self.unit,
            "scope_hash": self.scope_hash,
            "period": self.period,
            "provenance": self.provenance,
            "evidence_id": self.evidence_id,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> MetricObservation | None:
        if not isinstance(raw, dict) or not raw.get("metric_key"):
            return None
        try:
            value = float(raw["value"]) if raw.get("value") is not None else None
        except (TypeError, ValueError):
            value = None
        return cls(
            metric_key=str(raw["metric_key"])[:80],
            value=value,
            unit=str(raw.get("unit") or "")[:40] or None,
            scope_hash=str(raw.get("scope_hash") or "")[:80] or None,
            period=str(raw.get("period") or "")[:80] or None,
            provenance=str(raw.get("provenance") or "VERIFIED_AGGREGATE")[:40],
            evidence_id=str(raw.get("evidence_id") or "")[:120] or None,
        )


@dataclass
class DecisionBaselineSnapshot:
    snapshot_id: str
    decision_id: str
    dataset_id: str
    scope_hash: str
    evidence_refs: list[str] = field(default_factory=list)
    metric_observations: list[MetricObservation] = field(default_factory=list)
    observation_period: str | None = None
    created_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "decision_id": self.decision_id,
            "dataset_id": self.dataset_id,
            "scope_hash": self.scope_hash,
            "evidence_refs": list(self.evidence_refs)[:24],
            "metric_observations": [m.to_dict() for m in self.metric_observations[:24]],
            "observation_period": self.observation_period,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> DecisionBaselineSnapshot | None:
        if not isinstance(raw, dict) or not raw.get("snapshot_id"):
            return None
        obs = [MetricObservation.from_dict(x) for x in (raw.get("metric_observations") or [])]
        return cls(
            snapshot_id=str(raw["snapshot_id"])[:80],
            decision_id=str(raw.get("decision_id") or "")[:80],
            dataset_id=str(raw.get("dataset_id") or "")[:120],
            scope_hash=str(raw.get("scope_hash") or "")[:80],
            evidence_refs=[str(x) for x in (raw.get("evidence_refs") or []) if x][:24],
            metric_observations=[m for m in obs if m][:24],
            observation_period=str(raw.get("observation_period") or "")[:80] or None,
            created_at=str(raw.get("created_at") or _utc_now()),
        )


@dataclass
class DecisionMonitoringSpec:
    decision_id: str
    metric_keys: list[str] = field(default_factory=list)
    change_condition_keys: list[str] = field(default_factory=list)
    minimum_comparable_periods: int = 1
    required_evidence_flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "metric_keys": list(self.metric_keys)[:12],
            "change_condition_keys": list(self.change_condition_keys)[:8],
            "minimum_comparable_periods": int(self.minimum_comparable_periods),
            "required_evidence_flags": list(self.required_evidence_flags)[:8],
        }

    @classmethod
    def from_dict(cls, raw: Any) -> DecisionMonitoringSpec | None:
        if not isinstance(raw, dict):
            return None
        return cls(
            decision_id=str(raw.get("decision_id") or "")[:80],
            metric_keys=[str(x) for x in (raw.get("metric_keys") or []) if x][:12],
            change_condition_keys=[str(x) for x in (raw.get("change_condition_keys") or []) if x][:8],
            minimum_comparable_periods=int(raw.get("minimum_comparable_periods") or 1),
            required_evidence_flags=[str(x) for x in (raw.get("required_evidence_flags") or []) if x][:8],
        )


@dataclass
class DecisionEvaluation:
    decision_id: str
    evaluation_id: str
    evaluation_status: EvaluationStatus
    evidence_direction: EvidenceDirection = EvidenceDirection.UNKNOWN
    triggered_conditions: list[str] = field(default_factory=list)
    supporting_conditions: list[str] = field(default_factory=list)
    unresolved_conditions: list[str] = field(default_factory=list)
    baseline_period: str | None = None
    current_period: str | None = None
    evidence_ids: list[str] = field(default_factory=list)
    scope_hash: str | None = None
    evaluated_at: str = field(default_factory=_utc_now)
    recommendation_reconsideration_required: bool = False
    comparable: bool = True
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "evaluation_id": self.evaluation_id,
            "evaluation_status": self.evaluation_status.value,
            "evidence_direction": self.evidence_direction.value,
            "triggered_conditions": list(self.triggered_conditions)[:8],
            "supporting_conditions": list(self.supporting_conditions)[:8],
            "unresolved_conditions": list(self.unresolved_conditions)[:8],
            "baseline_period": self.baseline_period,
            "current_period": self.current_period,
            "evidence_ids": list(self.evidence_ids)[:12],
            "scope_hash": self.scope_hash,
            "evaluated_at": self.evaluated_at,
            "recommendation_reconsideration_required": bool(self.recommendation_reconsideration_required),
            "comparable": bool(self.comparable),
            "notes": list(self.notes)[:6],
        }

    @classmethod
    def from_dict(cls, raw: Any) -> DecisionEvaluation | None:
        if not isinstance(raw, dict) or not raw.get("evaluation_id"):
            return None
        try:
            status = EvaluationStatus(str(raw.get("evaluation_status") or EvaluationStatus.UNCHANGED.value))
        except ValueError:
            status = EvaluationStatus.UNCHANGED
        try:
            direction = EvidenceDirection(str(raw.get("evidence_direction") or EvidenceDirection.UNKNOWN.value))
        except ValueError:
            direction = EvidenceDirection.UNKNOWN
        return cls(
            decision_id=str(raw.get("decision_id") or "")[:80],
            evaluation_id=str(raw["evaluation_id"])[:80],
            evaluation_status=status,
            evidence_direction=direction,
            triggered_conditions=[str(x) for x in (raw.get("triggered_conditions") or []) if x][:8],
            supporting_conditions=[str(x) for x in (raw.get("supporting_conditions") or []) if x][:8],
            unresolved_conditions=[str(x) for x in (raw.get("unresolved_conditions") or []) if x][:8],
            baseline_period=str(raw.get("baseline_period") or "")[:80] or None,
            current_period=str(raw.get("current_period") or "")[:80] or None,
            evidence_ids=[str(x) for x in (raw.get("evidence_ids") or []) if x][:12],
            scope_hash=str(raw.get("scope_hash") or "")[:80] or None,
            evaluated_at=str(raw.get("evaluated_at") or _utc_now()),
            recommendation_reconsideration_required=bool(raw.get("recommendation_reconsideration_required")),
            comparable=bool(raw.get("comparable", True)),
            notes=[str(x) for x in (raw.get("notes") or []) if x][:6],
        )


@dataclass
class DecisionRevision:
    revision_id: str
    decision_id: str
    previous_action: str | None = None
    new_action: str | None = None
    previous_strength: str | None = None
    new_strength: str | None = None
    previous_confidence: str | None = None
    new_confidence: str | None = None
    disposition: RevisionDisposition = RevisionDisposition.MAINTAIN
    evidence_ids: list[str] = field(default_factory=list)
    evaluation_id: str | None = None
    created_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "revision_id": self.revision_id,
            "decision_id": self.decision_id,
            "previous_action": self.previous_action,
            "new_action": self.new_action,
            "previous_strength": self.previous_strength,
            "new_strength": self.new_strength,
            "previous_confidence": self.previous_confidence,
            "new_confidence": self.new_confidence,
            "disposition": self.disposition.value,
            "evidence_ids": list(self.evidence_ids)[:8],
            "evaluation_id": self.evaluation_id,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, raw: Any) -> DecisionRevision | None:
        if not isinstance(raw, dict) or not raw.get("revision_id"):
            return None
        try:
            disposition = RevisionDisposition(str(raw.get("disposition") or RevisionDisposition.MAINTAIN.value))
        except ValueError:
            disposition = RevisionDisposition.MAINTAIN
        return cls(
            revision_id=str(raw["revision_id"])[:80],
            decision_id=str(raw.get("decision_id") or "")[:80],
            previous_action=str(raw.get("previous_action") or "")[:40] or None,
            new_action=str(raw.get("new_action") or "")[:40] or None,
            previous_strength=str(raw.get("previous_strength") or "")[:40] or None,
            new_strength=str(raw.get("new_strength") or "")[:40] or None,
            previous_confidence=str(raw.get("previous_confidence") or "")[:40] or None,
            new_confidence=str(raw.get("new_confidence") or "")[:40] or None,
            disposition=disposition,
            evidence_ids=[str(x) for x in (raw.get("evidence_ids") or []) if x][:8],
            evaluation_id=str(raw.get("evaluation_id") or "")[:80] or None,
            created_at=str(raw.get("created_at") or _utc_now()),
        )


@dataclass
class StrategicDecisionRecord:
    """Durable strategic decision — not conversational thread memory."""

    decision_id: str
    dataset_id: str
    scope_hash: str
    decision_theme: str | None = None
    decision_type: str | None = None
    subject: dict[str, Any] | None = None
    original_question: str | None = None
    selected_action: str | None = None
    recommendation_strength: str | None = None
    decision_confidence: str | None = None
    diagnosis_confidence: str | None = None
    position_key: str | None = None
    primary_reason_key: str | None = None
    supporting_evidence_ids: list[str] = field(default_factory=list)
    unknowns: list[str] = field(default_factory=list)
    monitoring_metric_keys: list[str] = field(default_factory=list)
    change_my_view_keys: list[str] = field(default_factory=list)
    baseline_snapshot: DecisionBaselineSnapshot | None = None
    monitoring_spec: DecisionMonitoringSpec | None = None
    latest_scenario_ref: dict[str, Any] | None = None
    status: DecisionStatus = DecisionStatus.DRAFT
    source_thread_id: str | None = None
    analysis_job_id: str | None = None
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    last_evaluated_at: str | None = None
    latest_evaluation: DecisionEvaluation | None = None
    revisions: list[DecisionRevision] = field(default_factory=list)
    # Preserve original recommendation when revised (never overwrite).
    original_selected_action: str | None = None
    original_recommendation_strength: str | None = None
    original_decision_confidence: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "dataset_id": self.dataset_id,
            "scope_hash": self.scope_hash,
            "decision_theme": self.decision_theme,
            "decision_type": self.decision_type,
            "subject": self.subject,
            "original_question": (self.original_question or "")[:500] or None,
            "recommendation": {
                "selected_action": self.selected_action,
                "recommendation_strength": self.recommendation_strength,
                "decision_confidence": self.decision_confidence,
                "diagnosis_confidence": self.diagnosis_confidence,
            },
            "original_recommendation": {
                "selected_action": self.original_selected_action or self.selected_action,
                "recommendation_strength": self.original_recommendation_strength or self.recommendation_strength,
                "decision_confidence": self.original_decision_confidence or self.decision_confidence,
            },
            "thesis": {
                "position_key": self.position_key,
                "primary_reason_key": self.primary_reason_key,
            },
            "supporting_evidence_ids": list(self.supporting_evidence_ids)[:12],
            "unknowns": list(self.unknowns)[:8],
            "monitoring_metric_keys": list(self.monitoring_metric_keys)[:12],
            "change_my_view_keys": list(self.change_my_view_keys)[:8],
            "baseline_snapshot": self.baseline_snapshot.to_dict() if self.baseline_snapshot else None,
            "monitoring_spec": self.monitoring_spec.to_dict() if self.monitoring_spec else None,
            "latest_scenario_ref": self.latest_scenario_ref,
            "status": self.status.value,
            "source_thread_id": self.source_thread_id,
            "analysis_job_id": self.analysis_job_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "last_evaluated_at": self.last_evaluated_at,
            "latest_evaluation": self.latest_evaluation.to_dict() if self.latest_evaluation else None,
            "revisions": [r.to_dict() for r in self.revisions[-20:]],
        }

    def public_summary(self) -> dict[str, Any]:
        """Lean list-card payload — no large observation dumps."""
        latest_rev = self.revisions[-1] if self.revisions else None
        evidence_status = (
            self.latest_evaluation.evaluation_status.value if self.latest_evaluation else None
        )
        return {
            "decision_id": self.decision_id,
            "dataset_id": self.dataset_id,
            "scope_hash": self.scope_hash,
            "decision_theme": self.decision_theme,
            "subject": self.subject,
            "original_question": (self.original_question or "")[:200] or None,
            # Current (latest) recommendation — may differ from original after Review.
            "selected_action": self.selected_action,
            "recommendation_strength": self.recommendation_strength,
            "decision_confidence": self.decision_confidence,
            # Immutable original at track time.
            "original_selected_action": self.original_selected_action or self.selected_action,
            "original_recommendation_strength": self.original_recommendation_strength
            or self.recommendation_strength,
            "original_decision_confidence": self.original_decision_confidence or self.decision_confidence,
            "status": self.status.value,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "last_evaluated_at": self.last_evaluated_at,
            # Evidence evaluation — separate from recommendation.
            "evidence_status": evidence_status,
            "evaluation_status": evidence_status,
            "recommendation_reconsideration_required": bool(
                self.latest_evaluation.recommendation_reconsideration_required
                if self.latest_evaluation
                else False
            ),
            "latest_revision": latest_rev.to_dict() if latest_rev else None,
            "revision_count": len(self.revisions or []),
        }

    @classmethod
    def from_dict(cls, raw: Any) -> StrategicDecisionRecord | None:
        if not isinstance(raw, dict) or not raw.get("decision_id"):
            return None
        try:
            status = DecisionStatus(str(raw.get("status") or DecisionStatus.DRAFT.value))
        except ValueError:
            status = DecisionStatus.DRAFT
        rec = raw.get("recommendation") if isinstance(raw.get("recommendation"), dict) else {}
        orig = raw.get("original_recommendation") if isinstance(raw.get("original_recommendation"), dict) else {}
        thesis = raw.get("thesis") if isinstance(raw.get("thesis"), dict) else {}
        revisions = [DecisionRevision.from_dict(x) for x in (raw.get("revisions") or [])]
        return cls(
            decision_id=str(raw["decision_id"])[:80],
            dataset_id=str(raw.get("dataset_id") or "")[:120],
            scope_hash=str(raw.get("scope_hash") or "")[:80],
            decision_theme=str(raw.get("decision_theme") or "")[:40] or None,
            decision_type=str(raw.get("decision_type") or "")[:40] or None,
            subject=raw.get("subject") if isinstance(raw.get("subject"), dict) else None,
            original_question=str(raw.get("original_question") or "")[:500] or None,
            selected_action=str(rec.get("selected_action") or raw.get("selected_action") or "")[:40] or None,
            recommendation_strength=str(rec.get("recommendation_strength") or "")[:40] or None,
            decision_confidence=str(rec.get("decision_confidence") or "")[:40] or None,
            diagnosis_confidence=str(rec.get("diagnosis_confidence") or "")[:40] or None,
            position_key=str(thesis.get("position_key") or "")[:80] or None,
            primary_reason_key=str(thesis.get("primary_reason_key") or "")[:80] or None,
            supporting_evidence_ids=[str(x) for x in (raw.get("supporting_evidence_ids") or []) if x][:12],
            unknowns=[str(x) for x in (raw.get("unknowns") or []) if x][:8],
            monitoring_metric_keys=[str(x) for x in (raw.get("monitoring_metric_keys") or []) if x][:12],
            change_my_view_keys=[str(x) for x in (raw.get("change_my_view_keys") or []) if x][:8],
            baseline_snapshot=DecisionBaselineSnapshot.from_dict(raw.get("baseline_snapshot")),
            monitoring_spec=DecisionMonitoringSpec.from_dict(raw.get("monitoring_spec")),
            latest_scenario_ref=raw.get("latest_scenario_ref")
            if isinstance(raw.get("latest_scenario_ref"), dict)
            else None,
            status=status,
            source_thread_id=str(raw.get("source_thread_id") or "")[:80] or None,
            analysis_job_id=str(raw.get("analysis_job_id") or "")[:80] or None,
            created_at=str(raw.get("created_at") or _utc_now()),
            updated_at=str(raw.get("updated_at") or _utc_now()),
            last_evaluated_at=str(raw.get("last_evaluated_at") or "")[:80] or None,
            latest_evaluation=DecisionEvaluation.from_dict(raw.get("latest_evaluation")),
            revisions=[r for r in revisions if r][-20:],
            original_selected_action=str(orig.get("selected_action") or "")[:40] or None,
            original_recommendation_strength=str(orig.get("recommendation_strength") or "")[:40] or None,
            original_decision_confidence=str(orig.get("decision_confidence") or "")[:40] or None,
        )
