"""Lean telemetry for Phase 2E — no financial values / prompts / evidence payloads."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.decisions.models import (
    DecisionEvaluation,
    DecisionRevision,
    StrategicDecisionRecord,
)


def decision_track_telemetry(record: StrategicDecisionRecord) -> dict[str, Any]:
    return {
        "strategic_decision_created": True,
        "strategic_decision_status": record.status.value,
        "strategic_decision_theme": record.decision_theme,
        "strategic_decision_action": record.selected_action,
        "strategic_decision_id": record.decision_id,
    }


def decision_evaluation_telemetry(evaluation: DecisionEvaluation) -> dict[str, Any]:
    return {
        "decision_evaluation_status": evaluation.evaluation_status.value,
        "decision_comparable": bool(evaluation.comparable),
        "decision_trigger_count": len(evaluation.triggered_conditions),
        "decision_support_count": len(evaluation.supporting_conditions),
        "decision_unresolved_count": len(evaluation.unresolved_conditions),
        "decision_reconsideration_required": bool(evaluation.recommendation_reconsideration_required),
    }


def decision_review_telemetry(
    *,
    revision: DecisionRevision | None,
    evaluation: DecisionEvaluation | None = None,
    model_called: bool | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "decision_review_invoked": True,
        "decision_review_model_called": bool(model_called) if model_called is not None else None,
        "decision_review_previous_action": revision.previous_action if revision else None,
        "decision_review_new_action": revision.new_action if revision else None,
        "decision_revision_created": bool(revision),
        "decision_revision_disposition": revision.disposition.value if revision else None,
    }
    if evaluation is not None:
        out.update(decision_evaluation_telemetry(evaluation))
        out["decision_evaluation_status"] = evaluation.evaluation_status.value
    return out


def decision_status_telemetry(record: StrategicDecisionRecord) -> dict[str, Any]:
    return {
        "strategic_decision_status": record.status.value,
        "strategic_decision_theme": record.decision_theme,
        "strategic_decision_action": record.selected_action,
    }
