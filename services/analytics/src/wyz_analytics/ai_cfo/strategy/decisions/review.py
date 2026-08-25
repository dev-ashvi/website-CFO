"""REVIEW_STRATEGIC_DECISION — reuses Phase 2C/2D partner path; never invents a second engine."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.strategy.decisions.evaluate import (
    apply_evaluation_to_status,
    evaluate_strategic_decision,
)
from wyz_analytics.ai_cfo.strategy.decisions.models import (
    DecisionRevision,
    DecisionStatus,
    RevisionDisposition,
    StrategicDecisionRecord,
    new_revision_id,
)
from wyz_analytics.ai_cfo.strategy.decisions.repository import StrategicDecisionRepository
from wyz_analytics.ai_cfo.strategy.decisions.telemetry import decision_review_telemetry
from wyz_analytics.ai_cfo.strategy.partner import run_strategic_partner_judgment
from wyz_analytics.ai_cfo.strategy.thread import (
    ScenarioThreadRef,
    StrategicDecisionThread,
    ThreadStatus,
    compute_revision_disposition,
)


def thread_from_decision_record(record: StrategicDecisionRecord) -> StrategicDecisionThread:
    """Lean conversational shell for partner reconsider — not a second SoT."""
    scenario = None
    if isinstance(record.latest_scenario_ref, dict):
        scenario = ScenarioThreadRef.from_dict(record.latest_scenario_ref)
    return StrategicDecisionThread(
        thread_id=record.source_thread_id or f"review_{record.decision_id}",
        decision_theme=record.decision_theme,
        decision_type=record.decision_type,
        subject=record.subject,
        original_question=record.original_question or "Review tracked strategic decision",
        current_position=record.position_key,
        selected_action=record.selected_action,
        recommendation_strength=record.recommendation_strength,
        decision_confidence=record.decision_confidence,
        diagnosis_confidence=record.diagnosis_confidence,
        unknowns=list(record.unknowns),
        monitoring_metric_keys=list(record.monitoring_metric_keys),
        change_my_view_keys=list(record.change_my_view_keys),
        supporting_evidence_ids=list(record.supporting_evidence_ids),
        primary_reason_key=record.primary_reason_key,
        position_key=record.position_key,
        latest_scenario_ref=scenario,
        scope_hash=record.scope_hash,
        status=ThreadStatus.ACTIVE,
    )


def _map_disposition(raw: str | None) -> RevisionDisposition:
    try:
        return RevisionDisposition(str(raw or RevisionDisposition.MAINTAIN.value))
    except ValueError:
        return RevisionDisposition.MAINTAIN


def review_strategic_decision(
    *,
    repository: StrategicDecisionRepository,
    record: StrategicDecisionRecord,
    working_context: dict[str, Any],
    agent: Any,
    tools: Any | None = None,
    current_summary: dict[str, Any] | None = None,
    current_period: str | None = None,
    message: str = "Review this tracked strategic decision given current verified evidence.",
) -> dict[str, Any]:
    """Evaluate evidence, then run partner reconsider. Does not auto-resolve."""
    if record.status == DecisionStatus.ARCHIVED:
        raise ValueError("archived_decision_not_reviewable")

    scope = working_context.get("financial_scope") or {}
    current_scope_hash = str(scope.get("scope_hash") or working_context.get("scope_hash") or "")
    current_dataset_id = str(
        scope.get("dataset_id")
        or working_context.get("dataset_id")
        or record.dataset_id
    )

    evaluation = evaluate_strategic_decision(
        record,
        record.baseline_snapshot,
        current_evidence={"summary": current_summary or working_context.get("summary") or {}},
        current_period=current_period
        or (working_context.get("meta") or {}).get("job_id")
        or working_context.get("analysis_job_id"),
        current_dataset_id=current_dataset_id,
        current_scope_hash=current_scope_hash or None,
    )
    record.latest_evaluation = evaluation
    record.last_evaluated_at = evaluation.evaluated_at
    new_status = apply_evaluation_to_status(record, evaluation)
    # Explicit review always allowed when not archived; status may become REVISIT_REQUIRED.
    if evaluation.recommendation_reconsideration_required:
        record.status = DecisionStatus.REVISIT_REQUIRED
    elif record.status not in {DecisionStatus.RESOLVED}:
        record.status = new_status if new_status != DecisionStatus.DRAFT else DecisionStatus.ACTIVE

    if tools is not None:
        working_context = dict(working_context)
        working_context["tools"] = tools
    working_context.setdefault(
        "evidence_envelope",
        build_evidence_envelope(record.original_question or message, working_context),
    )
    # Attach evaluation as structured context for presentation (no client numbers).
    working_context = dict(working_context)
    working_context["decision_evaluation"] = {
        "evaluation_status": evaluation.evaluation_status.value,
        "evidence_direction": evaluation.evidence_direction.value,
        "triggered_conditions": list(evaluation.triggered_conditions),
        "supporting_conditions": list(evaluation.supporting_conditions),
        "unresolved_conditions": list(evaluation.unresolved_conditions),
        "recommendation_reconsideration_required": evaluation.recommendation_reconsideration_required,
        # Explicit: evaluation never includes a recommendation.
        "has_recommendation": False,
    }
    working_context["tracked_decision_id"] = record.decision_id

    reconsider_thread = thread_from_decision_record(record)
    answer, strat_telemetry, _assessment = run_strategic_partner_judgment(
        message=message,
        working_context=working_context,
        agent=agent,
        forced_calls=[{"tool": "get_current_financial_view", "arguments": {}}],
        reconsider_thread=reconsider_thread,
    )

    previous_action = record.selected_action
    previous_strength = record.recommendation_strength
    previous_confidence = record.decision_confidence

    strategic = answer.get("strategic") if isinstance(answer.get("strategic"), dict) else {}
    new_action = (
        strategic.get("selected_action")
        or (answer.get("telemetry") or {}).get("final_selected_action")
        or (strat_telemetry or {}).get("final_selected_action")
        or previous_action
    )
    new_strength = (
        strategic.get("recommendation_strength")
        or (strat_telemetry or {}).get("final_recommendation_strength")
        or previous_strength
    )
    new_confidence = (
        strategic.get("decision_confidence")
        or (strat_telemetry or {}).get("final_decision_confidence")
        or previous_confidence
    )

    # Prefer disposition from partner thread revision if present.
    thread_payload = answer.get("strategic_thread") if isinstance(answer.get("strategic_thread"), dict) else {}
    rev_raw = thread_payload.get("revision") if isinstance(thread_payload.get("revision"), dict) else None
    if rev_raw and rev_raw.get("disposition"):
        disposition = _map_disposition(rev_raw.get("disposition"))
        new_action = rev_raw.get("new_action") or new_action
        new_strength = rev_raw.get("new_strength") or new_strength
    else:
        computed = compute_revision_disposition(
            previous_action=previous_action,
            new_action=new_action,
            previous_strength=previous_strength,
            new_strength=new_strength,
        )
        disposition = _map_disposition(getattr(computed, "value", str(computed)))

    revision = DecisionRevision(
        revision_id=new_revision_id(),
        decision_id=record.decision_id,
        previous_action=previous_action,
        new_action=str(new_action) if new_action else None,
        previous_strength=previous_strength,
        new_strength=str(new_strength) if new_strength else None,
        previous_confidence=previous_confidence,
        new_confidence=str(new_confidence) if new_confidence else None,
        disposition=disposition,
        evidence_ids=list(evaluation.evidence_ids)[:8],
        evaluation_id=evaluation.evaluation_id,
    )

    # Preserve original recommendation forever; update current fields only.
    if not record.original_selected_action:
        record.original_selected_action = previous_action
        record.original_recommendation_strength = previous_strength
        record.original_decision_confidence = previous_confidence

    record.selected_action = revision.new_action
    record.recommendation_strength = revision.new_strength
    record.decision_confidence = revision.new_confidence
    record.revisions = list(record.revisions or []) + [revision]
    # After explicit review, leave REVISIT_REQUIRED until founder archives/resolves,
    # unless disposition MAINTAIN and evaluation was not revisit → ACTIVE.
    if record.status == DecisionStatus.REVISIT_REQUIRED and disposition == RevisionDisposition.MAINTAIN:
        if not evaluation.recommendation_reconsideration_required:
            record.status = DecisionStatus.ACTIVE
    elif disposition != RevisionDisposition.MAINTAIN:
        record.status = DecisionStatus.ACTIVE

    repository.save(record)

    model_called = bool(
        (strat_telemetry or {}).get("strategic_model_called")
        or (strat_telemetry or {}).get("strategic_reconsideration_model_called")
        or (answer.get("telemetry") or {}).get("strategic_model_called")
        or (answer.get("telemetry") or {}).get("provider_calls", 0)
    )
    telem = decision_review_telemetry(
        revision=revision,
        evaluation=evaluation,
        model_called=model_called,
    )
    if isinstance(answer.get("telemetry"), dict):
        answer["telemetry"].update(telem)
    else:
        answer["telemetry"] = telem

    return {
        "decision": record.to_dict(),
        "evaluation": evaluation.to_dict(),
        "revision": revision.to_dict(),
        "answer": answer,
        "telemetry": telem,
        # Hard invariant: evaluation has no recommendation field.
        "evaluation_has_recommendation": False,
        # Explicit: recommendation mutation comes from Review/Revision, not Evaluate.
        "recommendation_source": "strategic_review_revision",
    }
