"""Lean StrategicDecisionThread — decision continuity, not financial truth.

Conversation memory provides decision context only. Current FinancialScope always
wins; evidence must be revalidated under the active scope every turn.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ThreadStatus(str, Enum):
    ACTIVE = "ACTIVE"
    HISTORICAL = "HISTORICAL"
    SUPERSEDED = "SUPERSEDED"


class RevisionDisposition(str, Enum):
    MAINTAIN = "MAINTAIN"
    STRENGTHEN = "STRENGTHEN"
    WEAKEN = "WEAKEN"
    CHANGE = "CHANGE"


# Keys that must never appear on a persisted thread (financial / filter dumps).
_BANNED_THREAD_KEYS = frozenset(
    {
        "filters",
        "net_revenue",
        "cm2",
        "cm1",
        "baseline",
        "scenario_result",
        "deltas",
        "raw_tool",
        "prompt",
        "evidence_objects",
        "row_dump",
        "financial_values",
    }
)


@dataclass
class ScenarioThreadRef:
    """Lean same-scope scenario pointer — no simulated financial values."""

    scenario_ref: str
    lever: str | None = None
    direction: str | None = None
    percentage: float | None = None
    scope_hash: str | None = None
    mechanical_effect_keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_ref": self.scenario_ref,
            "lever": self.lever,
            "direction": self.direction,
            "percentage": self.percentage,
            "scope_hash": self.scope_hash,
            "mechanical_effect_keys": list(self.mechanical_effect_keys)[:6],
        }

    @classmethod
    def from_dict(cls, raw: Any) -> ScenarioThreadRef | None:
        if not isinstance(raw, dict):
            return None
        ref = str(raw.get("scenario_ref") or raw.get("digest") or "").strip()
        if not ref:
            return None
        pct = raw.get("percentage")
        try:
            percentage = float(pct) if pct is not None else None
        except (TypeError, ValueError):
            percentage = None
        return cls(
            scenario_ref=ref[:120],
            lever=str(raw.get("lever") or "")[:40] or None,
            direction=str(raw.get("direction") or "")[:20] or None,
            percentage=percentage,
            scope_hash=str(raw.get("scope_hash") or "")[:80] or None,
            mechanical_effect_keys=[str(x) for x in (raw.get("mechanical_effect_keys") or []) if x][:6],
        )


@dataclass
class RecommendationRevision:
    disposition: RevisionDisposition
    previous_action: str | None = None
    new_action: str | None = None
    previous_strength: str | None = None
    new_strength: str | None = None
    reason_keys: list[str] = field(default_factory=list)
    evidence_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "disposition": self.disposition.value,
            "previous_action": self.previous_action,
            "new_action": self.new_action,
            "previous_strength": self.previous_strength,
            "new_strength": self.new_strength,
            "reason_keys": list(self.reason_keys)[:4],
            "evidence_ids": list(self.evidence_ids)[:6],
        }

    @classmethod
    def from_dict(cls, raw: Any) -> RecommendationRevision | None:
        if not isinstance(raw, dict) or not raw.get("disposition"):
            return None
        try:
            disposition = RevisionDisposition(str(raw["disposition"]))
        except ValueError:
            return None
        return cls(
            disposition=disposition,
            previous_action=str(raw.get("previous_action") or "")[:40] or None,
            new_action=str(raw.get("new_action") or "")[:40] or None,
            previous_strength=str(raw.get("previous_strength") or "")[:40] or None,
            new_strength=str(raw.get("new_strength") or "")[:40] or None,
            reason_keys=[str(x) for x in (raw.get("reason_keys") or []) if x][:4],
            evidence_ids=[str(x) for x in (raw.get("evidence_ids") or []) if x][:6],
        )


@dataclass
class StrategicDecisionThread:
    """Lean strategic decision continuity object."""

    thread_id: str
    decision_theme: str | None = None
    decision_type: str | None = None
    subject: dict[str, Any] | None = None
    original_question: str | None = None
    current_position: str | None = None
    selected_action: str | None = None
    recommendation_strength: str | None = None
    decision_confidence: str | None = None
    diagnosis_confidence: str | None = None
    unknowns: list[str] = field(default_factory=list)
    monitoring_metric_keys: list[str] = field(default_factory=list)
    change_my_view_keys: list[str] = field(default_factory=list)
    supporting_evidence_ids: list[str] = field(default_factory=list)
    primary_reason_key: str | None = None
    position_key: str | None = None
    priority_candidate_id: str | None = None
    latest_scenario_ref: ScenarioThreadRef | None = None
    scope_hash: str | None = None
    turn_count: int = 1
    status: ThreadStatus = ThreadStatus.ACTIVE
    created_turn_id: str | None = None
    last_turn_id: str | None = None
    revision: RecommendationRevision | None = None

    def to_lean_dict(self) -> dict[str, Any]:
        """Persistable lean form — no financial values, filters, or prompts."""
        subject = None
        if isinstance(self.subject, dict):
            subject = {
                "entity": str(self.subject.get("entity") or "")[:120] or None,
                "dimension": str(self.subject.get("dimension") or "")[:40] or None,
            }
        payload = {
            "thread_id": self.thread_id,
            "decision_theme": self.decision_theme,
            "decision_type": self.decision_type,
            "subject": subject,
            "original_question": (self.original_question or "")[:500] or None,
            "current_position": (self.current_position or "")[:240] or None,
            "selected_action": self.selected_action,
            "recommendation_strength": self.recommendation_strength,
            "decision_confidence": self.decision_confidence,
            "diagnosis_confidence": self.diagnosis_confidence,
            "unknowns": list(self.unknowns)[:6],
            "monitoring_metric_keys": list(self.monitoring_metric_keys)[:8],
            "change_my_view_keys": list(self.change_my_view_keys)[:4],
            "supporting_evidence_ids": list(self.supporting_evidence_ids)[:8],
            "primary_reason_key": self.primary_reason_key,
            "position_key": self.position_key,
            "priority_candidate_id": self.priority_candidate_id,
            "latest_scenario_ref": self.latest_scenario_ref.to_dict() if self.latest_scenario_ref else None,
            "scope_hash": self.scope_hash,
            "turn_count": int(self.turn_count),
            "status": self.status.value,
            "created_turn_id": self.created_turn_id,
            "last_turn_id": self.last_turn_id,
            "revision": self.revision.to_dict() if self.revision else None,
        }
        assert_thread_has_no_financial_payload(payload)
        return payload

    @classmethod
    def from_dict(cls, raw: Any) -> StrategicDecisionThread | None:
        if not isinstance(raw, dict):
            return None
        tid = str(raw.get("thread_id") or "").strip()
        if not tid:
            return None
        try:
            status = ThreadStatus(str(raw.get("status") or ThreadStatus.ACTIVE.value))
        except ValueError:
            status = ThreadStatus.HISTORICAL
        subject = raw.get("subject") if isinstance(raw.get("subject"), dict) else None
        return cls(
            thread_id=tid[:80],
            decision_theme=str(raw.get("decision_theme") or "")[:40] or None,
            decision_type=str(raw.get("decision_type") or "")[:40] or None,
            subject=subject,
            original_question=str(raw.get("original_question") or "")[:500] or None,
            current_position=str(raw.get("current_position") or "")[:240] or None,
            selected_action=str(raw.get("selected_action") or "")[:40] or None,
            recommendation_strength=str(raw.get("recommendation_strength") or "")[:40] or None,
            decision_confidence=str(raw.get("decision_confidence") or "")[:40] or None,
            diagnosis_confidence=str(raw.get("diagnosis_confidence") or "")[:40] or None,
            unknowns=[str(x) for x in (raw.get("unknowns") or []) if x][:6],
            monitoring_metric_keys=[str(x) for x in (raw.get("monitoring_metric_keys") or []) if x][:8],
            change_my_view_keys=[str(x) for x in (raw.get("change_my_view_keys") or []) if x][:4],
            supporting_evidence_ids=[str(x) for x in (raw.get("supporting_evidence_ids") or []) if x][:8],
            primary_reason_key=str(raw.get("primary_reason_key") or "")[:80] or None,
            position_key=str(raw.get("position_key") or "")[:80] or None,
            priority_candidate_id=str(raw.get("priority_candidate_id") or "")[:80] or None,
            latest_scenario_ref=ScenarioThreadRef.from_dict(raw.get("latest_scenario_ref")),
            scope_hash=str(raw.get("scope_hash") or "")[:80] or None,
            turn_count=int(raw.get("turn_count") or 1),
            status=status,
            created_turn_id=str(raw.get("created_turn_id") or "")[:40] or None,
            last_turn_id=str(raw.get("last_turn_id") or "")[:40] or None,
            revision=RecommendationRevision.from_dict(raw.get("revision")),
        )


def new_thread_id() -> str:
    return f"sdt_{uuid.uuid4().hex[:12]}"


def scenario_ref_digest(lean_spec: dict[str, Any] | None, *, scope_hash: str) -> str:
    """Stable digest for a lean scenario follow-up context (no result values)."""
    if not isinstance(lean_spec, dict):
        return f"scn_{hashlib.sha1(scope_hash.encode()).hexdigest()[:10]}"
    parts = [
        str(lean_spec.get("lever") or ""),
        str(lean_spec.get("direction") or ""),
        str(lean_spec.get("percentage") or ""),
        str(lean_spec.get("operation") or ""),
        scope_hash,
    ]
    return f"scn_{hashlib.sha1('|'.join(parts).encode()).hexdigest()[:12]}"


def assert_thread_has_no_financial_payload(payload: dict[str, Any]) -> None:
    """Hard guard for tests / persistence — reject banned keys at top level."""
    for key in payload:
        if key in _BANNED_THREAD_KEYS:
            raise ValueError(f"strategic_thread_banned_key:{key}")


def load_threads_from_conversation(conversation: dict[str, Any] | None) -> list[StrategicDecisionThread]:
    """Collect lean threads from previous turns (newest last)."""
    if not isinstance(conversation, dict):
        return []
    threads: list[StrategicDecisionThread] = []
    for turn in conversation.get("previous_turns") or []:
        if not isinstance(turn, dict):
            continue
        raw = turn.get("strategic_thread")
        thread = StrategicDecisionThread.from_dict(raw)
        if thread is None and isinstance(turn.get("strategic"), dict):
            # Back-compat: promote Phase 2A lean strategic fields into a thread shell.
            lean = turn["strategic"]
            if lean.get("historical_only"):
                continue
            tid = str(lean.get("thread_id") or "") or f"legacy_{turn.get('scope_hash') or 'x'}"
            thread = StrategicDecisionThread(
                thread_id=tid[:80],
                decision_theme=lean.get("decision_theme"),
                decision_type=lean.get("decision_type"),
                subject={"entity": lean.get("subject")} if lean.get("subject") else None,
                selected_action=lean.get("prior_recommendation_action"),
                recommendation_strength=lean.get("recommendation_strength"),
                decision_confidence=lean.get("decision_confidence"),
                diagnosis_confidence=lean.get("diagnosis_confidence"),
                unknowns=list(lean.get("unknowns") or [])[:6],
                scope_hash=lean.get("scope_hash") or turn.get("scope_hash"),
                status=ThreadStatus.ACTIVE,
            )
            if lean.get("scenario_ref_digest"):
                thread.latest_scenario_ref = ScenarioThreadRef(
                    scenario_ref=str(lean["scenario_ref_digest"]),
                    scope_hash=thread.scope_hash,
                )
        if thread:
            threads.append(thread)
    return threads


def resolve_active_thread(
    conversation: dict[str, Any] | None,
    *,
    current_scope_hash: str,
) -> tuple[StrategicDecisionThread | None, StrategicDecisionThread | None]:
    """Return (active_same_scope, latest_cross_scope_historical).

    Never silently promotes a historical/cross-scope thread to ACTIVE financial context.
    """
    current = str(current_scope_hash or "")
    active: StrategicDecisionThread | None = None
    historical: StrategicDecisionThread | None = None
    for thread in load_threads_from_conversation(conversation):
        if thread.status == ThreadStatus.SUPERSEDED:
            continue
        same = bool(thread.scope_hash and thread.scope_hash == current)
        if same and thread.status == ThreadStatus.ACTIVE:
            active = thread
        elif not same:
            # Prior view — mark conceptually historical for callers.
            hist = StrategicDecisionThread.from_dict(thread.to_lean_dict())
            if hist:
                hist.status = ThreadStatus.HISTORICAL
                historical = hist
        elif thread.status == ThreadStatus.HISTORICAL:
            historical = thread
    return active, historical


def create_thread_from_strategic_result(
    *,
    message: str,
    scope_hash: str,
    turn_id: str | None,
    decision_theme: str | None,
    decision_type: str | None,
    subject: dict[str, Any] | None,
    selected_action: str | None,
    recommendation_strength: str | None,
    decision_confidence: str | None,
    diagnosis_confidence: str | None,
    unknowns: list[str] | None,
    monitoring_metric_keys: list[str] | None,
    change_my_view_keys: list[str] | None,
    supporting_evidence_ids: list[str] | None,
    primary_reason_key: str | None = None,
    position_key: str | None = None,
    priority_candidate_id: str | None = None,
    current_position: str | None = None,
    prior_thread: StrategicDecisionThread | None = None,
) -> StrategicDecisionThread:
    """Create ACTIVE thread after a validated strategic recommendation."""
    thread = StrategicDecisionThread(
        thread_id=new_thread_id(),
        decision_theme=decision_theme,
        decision_type=decision_type,
        subject=subject,
        original_question=str(message or "")[:500] or None,
        current_position=current_position,
        selected_action=selected_action,
        recommendation_strength=recommendation_strength,
        decision_confidence=decision_confidence,
        diagnosis_confidence=diagnosis_confidence,
        unknowns=list(unknowns or [])[:6],
        monitoring_metric_keys=list(monitoring_metric_keys or [])[:8],
        change_my_view_keys=list(change_my_view_keys or [])[:4],
        supporting_evidence_ids=list(supporting_evidence_ids or [])[:8],
        primary_reason_key=primary_reason_key,
        position_key=position_key,
        priority_candidate_id=priority_candidate_id,
        scope_hash=scope_hash,
        turn_count=1,
        status=ThreadStatus.ACTIVE,
        created_turn_id=turn_id,
        last_turn_id=turn_id,
    )
    if prior_thread and prior_thread.thread_id != thread.thread_id:
        # Caller should mark prior SUPERSEDED in conversation; we don't mutate prior here.
        pass
    return thread


def touch_thread_followup(thread: StrategicDecisionThread, *, turn_id: str | None) -> StrategicDecisionThread:
    """Increment turn_count without mutating recommendation fields."""
    updated = StrategicDecisionThread.from_dict(thread.to_lean_dict())
    assert updated is not None
    updated.turn_count = int(thread.turn_count or 1) + 1
    updated.last_turn_id = turn_id
    updated.status = ThreadStatus.ACTIVE
    return updated


def attach_scenario_ref_to_thread(
    thread: StrategicDecisionThread,
    *,
    lean_spec: dict[str, Any],
    scope_hash: str,
    turn_id: str | None = None,
) -> StrategicDecisionThread:
    """Attach lean same-scope scenario ref only. Rejects cross-scope specs."""
    updated = StrategicDecisionThread.from_dict(thread.to_lean_dict())
    assert updated is not None
    spec_hash = str(lean_spec.get("scope_hash") or scope_hash or "")
    if updated.scope_hash and spec_hash and spec_hash != updated.scope_hash:
        # Cross-scope scenario must not attach.
        return updated
    if scope_hash and updated.scope_hash and scope_hash != updated.scope_hash:
        return updated
    digest = scenario_ref_digest(lean_spec, scope_hash=scope_hash or spec_hash)
    updated.latest_scenario_ref = ScenarioThreadRef(
        scenario_ref=digest,
        lever=str(lean_spec.get("lever") or "")[:40] or None,
        direction=str(lean_spec.get("direction") or "")[:20] or None,
        percentage=float(lean_spec["percentage"]) if lean_spec.get("percentage") is not None else None,
        scope_hash=scope_hash or spec_hash or updated.scope_hash,
        mechanical_effect_keys=["mechanical_cm2_sensitivity", "hold_revenue_constant"],
    )
    updated.turn_count = int(updated.turn_count or 1) + 1
    if turn_id:
        updated.last_turn_id = turn_id
    return updated


def update_thread_after_reconsider(
    thread: StrategicDecisionThread,
    *,
    selected_action: str | None,
    recommendation_strength: str | None,
    decision_confidence: str | None,
    unknowns: list[str] | None,
    monitoring_metric_keys: list[str] | None,
    change_my_view_keys: list[str] | None,
    supporting_evidence_ids: list[str] | None,
    primary_reason_key: str | None,
    position_key: str | None,
    current_position: str | None,
    priority_candidate_id: str | None,
    revision: RecommendationRevision | None,
    turn_id: str | None,
) -> StrategicDecisionThread:
    """Update validated FINAL action after reconsideration — preserve original_question."""
    updated = StrategicDecisionThread.from_dict(thread.to_lean_dict())
    assert updated is not None
    updated.selected_action = selected_action
    updated.recommendation_strength = recommendation_strength
    updated.decision_confidence = decision_confidence
    if unknowns is not None:
        updated.unknowns = list(unknowns)[:6]
    if monitoring_metric_keys is not None:
        updated.monitoring_metric_keys = list(monitoring_metric_keys)[:8]
    if change_my_view_keys is not None:
        updated.change_my_view_keys = list(change_my_view_keys)[:4]
    if supporting_evidence_ids is not None:
        updated.supporting_evidence_ids = list(supporting_evidence_ids)[:8]
    updated.primary_reason_key = primary_reason_key
    updated.position_key = position_key
    updated.current_position = current_position
    updated.priority_candidate_id = priority_candidate_id
    updated.revision = revision
    updated.turn_count = int(updated.turn_count or 1) + 1
    updated.last_turn_id = turn_id
    updated.status = ThreadStatus.ACTIVE
    return updated


def compute_revision_disposition(
    *,
    previous_action: str | None,
    new_action: str | None,
    previous_strength: str | None,
    new_strength: str | None,
) -> RevisionDisposition:
    if not previous_action or not new_action:
        return RevisionDisposition.MAINTAIN
    if previous_action != new_action:
        return RevisionDisposition.CHANGE
    strength_rank = {"WEAK": 1, "MODERATE": 2, "STRONG": 3, "VERY_STRONG": 4}
    prev_s = strength_rank.get(str(previous_strength or "").upper(), 0)
    new_s = strength_rank.get(str(new_strength or "").upper(), 0)
    if new_s > prev_s:
        return RevisionDisposition.STRENGTHEN
    if new_s < prev_s:
        return RevisionDisposition.WEAKEN
    return RevisionDisposition.MAINTAIN
