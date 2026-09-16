"""Project existing AI CFO public telemetry into a safe ObservabilityEvent."""

from __future__ import annotations

from typing import Any

from wyz_analytics.observability.emit import emit_event


def emit_ai_cfo_turn_trace(
    *,
    public_telemetry: dict[str, Any],
    conversation: dict[str, Any],
    lineage: dict[str, Any],
    scope_hash: str | None,
    latency_ms: int | None,
    request_id: str | None = None,
    answer: dict[str, Any] | None = None,
) -> None:
    telem = public_telemetry or {}
    answer_telem = (answer or {}).get("telemetry") if isinstance(answer, dict) else {}
    answer_telem = answer_telem if isinstance(answer_telem, dict) else {}
    strategic = telem.get("strategic") if isinstance(telem.get("strategic"), dict) else {}
    if not strategic and isinstance(conversation.get("strategic"), dict):
        strategic = conversation.get("strategic") or {}
    partner = answer_telem
    attrs = {
        "answer_source": telem.get("answer_source"),
        "insight_type": telem.get("insight_type") or conversation.get("insight_type"),
        "intent": telem.get("resolved_intent") or conversation.get("intent"),
        "decision_type": strategic.get("decision_type"),
        "decision_theme": strategic.get("decision_theme"),
        "signal_context_present": telem.get("signal_context_present"),
        "signal_context_valid": telem.get("signal_context_valid"),
        "signal_context_scope_match": telem.get("signal_context_scope_match"),
        "signal_context_source": telem.get("signal_context_source"),
        "strategic_thread_present": bool(conversation.get("strategic_thread")),
        "strategic_followup_type": partner.get("strategic_followup_type") or partner.get("followup_type"),
        "forced_tools": telem.get("forced_tools") or [],
        "tool_count": len(telem.get("forced_tools") or []) + int(telem.get("provider_calls") or 0),
        "evidence_count": len(conversation.get("selected_evidence_ids") or []),
        "evidence_ids": list(conversation.get("selected_evidence_ids") or [])[:24],
        "diagnosis_confidence": strategic.get("diagnosis_confidence"),
        "decision_confidence": strategic.get("decision_confidence") or partner.get("final_decision_confidence"),
        "final_selected_action": partner.get("final_selected_action")
        or strategic.get("prior_recommendation_action"),
        "recommendation_strength": partner.get("final_recommendation_strength")
        or strategic.get("recommendation_strength"),
        "strategic_model_called": partner.get("strategic_model_called"),
        "strategic_fallback_used": partner.get("strategic_fallback_used") or partner.get("fallback_used"),
        "confidence_clamped": partner.get("confidence_clamped"),
        "strength_clamped": partner.get("strength_clamped"),
        "failure_stage": partner.get("strategic_failure_stage") or partner.get("failure_stage"),
        "provider_calls": telem.get("provider_calls"),
        "provider": partner.get("provider") or partner.get("strategic_provider"),
        "model": partner.get("model") or partner.get("strategic_model"),
        "end_to_end_latency_ms": latency_ms or telem.get("end_to_end_latency_ms"),
        "capability": ((answer_telem.get("guard") or {}) if isinstance(answer_telem.get("guard"), dict) else {}).get(
            "capability"
        ),
        "scenario_ref": strategic.get("scenario_ref_digest"),
        "revision_disposition": partner.get("revision_disposition")
        or partner.get("reconsideration_disposition"),
    }
    # Fallback / validation explicit events
    if attrs.get("strategic_fallback_used"):
        emit_event(
            "ai_strategic_fallback_used",
            component="ai_cfo",
            category="fallback",
            severity="WARNING",
            request_id=request_id,
            conversation_id=conversation.get("conversation_id"),
            turn_id=conversation.get("turn_id"),
            dataset_id=lineage.get("dataset_id"),
            scope_hash=scope_hash,
            attributes={
                "failure_stage": attrs.get("failure_stage"),
                "answer_source": attrs.get("answer_source"),
                "final_selected_action": attrs.get("final_selected_action"),
            },
        )
    if attrs.get("confidence_clamped"):
        emit_event(
            "ai_model_confidence_clamped",
            component="ai_cfo",
            category="validation",
            severity="WARNING",
            request_id=request_id,
            conversation_id=conversation.get("conversation_id"),
            turn_id=conversation.get("turn_id"),
            dataset_id=lineage.get("dataset_id"),
            scope_hash=scope_hash,
            attributes={"decision_theme": attrs.get("decision_theme")},
        )
    if attrs.get("strength_clamped"):
        emit_event(
            "ai_model_strength_clamped",
            component="ai_cfo",
            category="validation",
            severity="WARNING",
            request_id=request_id,
            conversation_id=conversation.get("conversation_id"),
            turn_id=conversation.get("turn_id"),
            dataset_id=lineage.get("dataset_id"),
            scope_hash=scope_hash,
            attributes={"decision_theme": attrs.get("decision_theme")},
        )

    emit_event(
        "ai_cfo_turn_completed",
        component="ai_cfo",
        category="ai_turn",
        severity="INFO",
        request_id=request_id,
        conversation_id=conversation.get("conversation_id"),
        turn_id=conversation.get("turn_id"),
        dataset_id=lineage.get("dataset_id"),
        job_id=lineage.get("job_id"),
        scope_hash=scope_hash,
        duration_ms=latency_ms,
        attributes=attrs,
    )
