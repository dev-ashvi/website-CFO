"""Proactive review signals from tracked decisions — no autonomous recommendation."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.decisions.evaluate import (
    apply_evaluation_to_status,
    evaluate_strategic_decision,
)
from wyz_analytics.ai_cfo.strategy.decisions.models import (
    DecisionStatus,
    EvaluationStatus,
    StrategicDecisionRecord,
)
from wyz_analytics.ai_cfo.strategy.decisions.repository import StrategicDecisionRepository
from wyz_analytics.cfo_signals.models import CfoSignal

_EVALUABLE = frozenset(
    {
        DecisionStatus.ACTIVE,
        DecisionStatus.REVIEW_DUE,
        DecisionStatus.REVISIT_REQUIRED,
    }
)


def theme_label(theme: str | None) -> str:
    if not theme:
        return "Strategic"
    return str(theme).replace("_", " ").title()


def build_decision_review_signal(record: StrategicDecisionRecord) -> dict[str, Any]:
    """CfoSignal-shaped card — action is Review only; no recommendation text."""
    theme = theme_label(record.decision_theme)
    evaluation = record.latest_evaluation
    status = evaluation.evaluation_status.value if evaluation else record.status.value
    revisit = record.status == DecisionStatus.REVISIT_REQUIRED or (
        evaluation is not None and evaluation.evaluation_status == EvaluationStatus.REVISIT_REQUIRED
    )
    signal = CfoSignal(
        signal_type="STRATEGIC_DECISION_REVIEW",
        severity="medium" if revisit else "low",
        entity_type="strategic_decision",
        entity=theme,
        stage="DECISION",
        label=f"{theme} decision may need review",
        evidence={
            "decision_id": record.decision_id,
            "evaluation_status": status,
            "message": (
                "Evidence has changed materially since this decision was made."
                if revisit
                else "Comparable evidence is available for this tracked decision."
            ),
            "recommendation": None,
            "action": "REVIEW_STRATEGIC_DECISION",
        },
        materiality=0.1 if revisit else 0.04,
        caveats=["Evidence re-evaluation only — not a new recommendation."],
        filters={},
    )
    payload = signal.to_dict()
    payload["decision_id"] = record.decision_id
    payload["proactive_recommendation"] = None
    return payload


def evaluate_active_decisions_for_scope(
    *,
    repository: StrategicDecisionRepository,
    dataset_id: str,
    scope_hash: str,
    summary: dict[str, Any] | None,
    observation_period: str | None,
    persist: bool = True,
) -> list[dict[str, Any]]:
    """On workspace load: evaluate ACTIVE(+due) decisions; surface revisit cards."""
    signals: list[dict[str, Any]] = []
    for record in repository.list(dataset_id):
        if record.status not in _EVALUABLE:
            continue
        if record.scope_hash and record.scope_hash != scope_hash:
            continue
        # Evaluate must never mutate recommendation fields.
        prev_action = record.selected_action
        prev_strength = record.recommendation_strength
        prev_confidence = record.decision_confidence
        evaluation = evaluate_strategic_decision(
            record,
            record.baseline_snapshot,
            current_evidence={"summary": summary or {}, "observation_period": observation_period},
            current_period=observation_period,
            current_dataset_id=dataset_id,
            current_scope_hash=scope_hash,
        )
        record.latest_evaluation = evaluation
        record.last_evaluated_at = evaluation.evaluated_at
        record.status = apply_evaluation_to_status(record, evaluation)
        record.selected_action = prev_action
        record.recommendation_strength = prev_strength
        record.decision_confidence = prev_confidence
        if persist:
            repository.save(record)

        should_surface = (
            evaluation.evaluation_status == EvaluationStatus.REVISIT_REQUIRED
            or record.status == DecisionStatus.REVISIT_REQUIRED
            or (
                record.status == DecisionStatus.REVIEW_DUE
                and evaluation.evaluation_status
                in {EvaluationStatus.WEAKENING, EvaluationStatus.SUPPORTING}
            )
        )
        if should_surface:
            signals.append(build_decision_review_signal(record))

    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for sig in signals:
        did = str(sig.get("decision_id") or "")
        if did in seen:
            continue
        seen.add(did)
        out.append(sig)
    return out
