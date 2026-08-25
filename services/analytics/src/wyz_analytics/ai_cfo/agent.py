"""AI CFO orchestration."""

from __future__ import annotations

import logging
import time
from typing import Any

import polars as pl

from wyz_analytics.ai_cfo.context import build_financial_intelligence_context
from wyz_analytics.ai_cfo.conversation import (
    build_conversation_context,
    history_for_model,
    selected_entities_from_answer,
    selected_evidence_ids_from_answer,
)
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.financial_scope import build_financial_scope
from wyz_analytics.ai_cfo.guards.orchestrator import run_guarded_turn
from wyz_analytics.ai_cfo.providers import resolve_ai_cfo_model
from wyz_analytics.ai_cfo.signal_context import (
    lean_signal_context_for_conversation,
    resolve_signal_context,
    signal_context_telemetry,
)
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.facts.models import validate_query
from wyz_analytics.workers.errors import AnalyticsError, INVALID_QUERY
from wyz_analytics.workers.logging_config import log_event

logger = logging.getLogger("wyz_analytics.ai_cfo")


class StaleContextError(AnalyticsError):
    pass


def _resolve_filters(analytical: dict[str, Any]) -> dict[str, Any]:
    raw = analytical.get("filters") or {}
    probe = {"filters": raw, "metrics": ["net_revenue"]}
    validated = validate_query(probe)
    return validated["filters"]


def _public_telemetry(
    answer: dict[str, Any],
    *,
    provider_calls: int,
    latency_ms: int,
    signal_resolution: dict[str, Any] | None = None,
) -> dict[str, Any]:
    telemetry = answer.get("telemetry") or {}
    rv = telemetry.get("response_validation") or {}
    semantic = telemetry.get("semantic") or {}
    guard = telemetry.get("guard") or {}
    followup = telemetry.get("followup") or {}
    forced = []
    tool_dimensions = list(guard.get("tool_dimensions") or telemetry.get("tool_dimensions") or [])
    for item in guard.get("forced_tools") or []:
        if isinstance(item, dict) and item.get("tool"):
            forced.append(item.get("tool"))
            args = item.get("arguments") or {}
            if args.get("dimension") and args.get("dimension") not in tool_dimensions:
                tool_dimensions.append(args.get("dimension"))
        elif item:
            forced.append(str(item))
    invalid_ids = rv.get("invalid_evidence_ids") or semantic.get("invalid_evidence_ids") or []
    public = {
        "answer_source": telemetry.get("answer_source"),
        "insight_type": semantic.get("resolved_insight_type") or telemetry.get("insight_type"),
        "resolved_intent": telemetry.get("resolved_intent") or followup.get("intent") or guard.get("resolved_intent"),
        "resolved_dimension": telemetry.get("resolved_dimension")
        or followup.get("dimension")
        or guard.get("resolved_dimension"),
        "rank_direction": telemetry.get("rank_direction") or followup.get("rank_direction"),
        "temporal_mode": telemetry.get("temporal_mode") or followup.get("comparison_basis"),
        "comparison_basis": telemetry.get("comparison_basis") or followup.get("comparison_basis"),
        "forced_tools": forced,
        "tool_dimensions": tool_dimensions,
        "conversation_context_used": bool(
            telemetry.get("conversation_context_used")
            or followup.get("is_followup")
            or followup.get("referent_valid")
        ),
        "evidence_source": telemetry.get("evidence_source"),
        "intent_source": telemetry.get("intent_source")
        or followup.get("intent_source")
        or guard.get("intent_source"),
        "model_semantic_valid": rv.get("model_semantic_valid"),
        "evidence_selection_valid": not bool(invalid_ids),
        "deterministic_insight_override": bool(
            rv.get("deterministic_insight_override") or semantic.get("deterministic_insight_override")
        ),
        "deterministic_driver_override": bool(
            rv.get("deterministic_driver_override") or semantic.get("deterministic_driver_override")
        ),
        "provider_calls": int(
            telemetry.get("provider_calls")
            if telemetry.get("provider_calls") is not None
            else (telemetry.get("model_calls") or rv.get("provider_calls") or provider_calls or 0)
        ),
        "provider_latency_ms": telemetry.get("provider_latency_ms") or telemetry.get("model_native_latency_ms"),
        "end_to_end_latency_ms": latency_ms,
        "scenario_parse_source": telemetry.get("scenario_parse_source"),
        "scenario_lever": telemetry.get("scenario_lever"),
        "scenario_levers": telemetry.get("scenario_levers"),
        "scenario_operation": telemetry.get("scenario_operation"),
        "scenario_percentage": telemetry.get("scenario_percentage"),
        "scenario_change_count": telemetry.get("scenario_change_count"),
        "scenario_engine_used": telemetry.get("scenario_engine_used"),
        "baseline_source": telemetry.get("baseline_source"),
        "baseline_metric_count": telemetry.get("baseline_metric_count"),
        "scenario_metric_count": telemetry.get("scenario_metric_count"),
        "scenario_latency_ms": telemetry.get("scenario_latency_ms"),
    }
    strategy = telemetry.get("strategy") or guard.get("strategy") or {}
    if isinstance(strategy, dict):
        for key in (
            "strategy_mode",
            "strategic_intent_detected",
            "decision_type",
            "decision_theme",
            "action_candidates",
            "eligible_actions",
            "ineligible_actions",
            "max_action_severity",
            "max_eligible_severity",
            "diagnosis_pack_built",
            "diagnosis_confidence",
            "decision_confidence",
            "decision_confidence_ceiling",
            "recommendation_strength",
            "evidence_burden_required",
            "evidence_burden_met_by_action",
            "unknowns_count",
            "strategic_unknowns",
            "materiality_class",
            "temporal_persistence",
            "conflicting_evidence_count",
            "cost_breakdown_forced",
            "cost_breakdown_reconciliation",
            "scenario_ref_available",
            "scenario_ref_scope_match",
            "strategic_assessment_valid",
            "decision_thesis_present",
            "strategy_gate_failures",
            "recommendations_enabled",
            "strategic_model_called",
            "strategic_model_valid",
            "selected_action",
            "selected_action_severity",
            "model_recommendation_strength",
            "final_recommendation_strength",
            "model_decision_confidence",
            "final_decision_confidence",
            "confidence_clamped",
            "strength_clamped",
            "supporting_evidence_count",
            "scenario_ref_used",
            "strategic_fallback_used",
            "actions_emitted",
            "strategic_model_response_received",
            "strategic_model_parse_valid",
            "strategic_model_validation_valid",
            "strategic_failure_stage",
            "strategic_failure_codes",
            "model_selected_action",
            "final_selected_action",
            "strategic_provider_id",
            "priority_candidate_count",
            "model_priority_candidate",
            "final_priority_candidate",
            "priority_candidate_label_resolved",
            "strategic_evidence_section_roles",
            "strategic_display_evidence_count",
            "strategic_evidence_deduped_count",
            "strategic_semantic_variant",
            "strategic_next_step_variant",
            "action_next_step_consistent",
            "scope_comparison_mode",
            "strategic_thread_present",
            "strategic_thread_id",
            "strategic_thread_status",
            "strategic_thread_scope_match",
            "strategic_followup_detected",
            "strategic_followup_type",
            "strategic_followup_source",
            "strategic_previous_action",
            "strategic_current_action",
            "recommendation_revision_disposition",
            "strategic_thread_scenario_present",
            "strategic_thread_scenario_scope_match",
            "strategic_reconsideration_model_called",
        ):
            if key in strategy:
                public[key] = strategy.get(key)
    for key in (
        "strategic_thread_present",
        "strategic_thread_id",
        "strategic_thread_status",
        "strategic_thread_scope_match",
        "strategic_followup_detected",
        "strategic_followup_type",
        "strategic_followup_source",
        "strategic_previous_action",
        "strategic_current_action",
        "recommendation_revision_disposition",
        "strategic_thread_scenario_present",
        "strategic_thread_scenario_scope_match",
        "strategic_reconsideration_model_called",
        "conversation_context_used",
    ):
        if key in telemetry and public.get(key) is None:
            public[key] = telemetry[key]
    public.update(signal_context_telemetry(signal_resolution))
    return public


def run_ai_cfo_turn(
    facts: pl.DataFrame,
    *,
    lineage: dict[str, Any],
    analytical: dict[str, Any],
    message: str,
    expected_context_version: str | None = None,
    model: Any | None = None,
    provider: str | None = None,
    model_name: str | None = None,
    reconciliation: dict[str, Any] | None = None,
    methodology: dict[str, Any] | None = None,
    history: list[dict[str, str]] | None = None,
    conversation_id: str | None = None,
    previous_turns: list[dict[str, Any]] | None = None,
    signal_context: dict[str, Any] | None = None,
    guards_enabled: bool = True,
) -> dict[str, Any]:
    started = time.perf_counter()
    filters = _resolve_filters(analytical)
    dimension = str(analytical.get("dimension") or "channel")
    surface = str(analytical.get("surface") or "overview")
    # FinancialScope from CURRENT analytical.filters only — never from signal_context.
    financial_scope = build_financial_scope(dataset_id=lineage.get("dataset_id"), filters=filters)
    tools = AiCfoTools(
        facts,
        active_filters=financial_scope["filters"],
        surface=surface,
        dimension=dimension,
        dataset_id=lineage.get("dataset_id"),
        financial_scope=financial_scope,
    )
    view = tools.get_current_financial_view()
    signal_pack = tools.get_cfo_signals()
    verified_signals = signal_pack.get("highlighted") or signal_pack.get("signals") or []
    context = build_financial_intelligence_context(
        lineage=lineage,
        analytical={**analytical, "filters": financial_scope["filters"]},
        summary=view.get("summary") or {},
        signals=verified_signals,
        reconciliation=reconciliation,
        methodology=methodology,
    )
    context["financial_scope"] = financial_scope
    context["scope_hash"] = financial_scope["scope_hash"]
    if expected_context_version and expected_context_version != context["meta"]["context_version"]:
        raise StaleContextError(INVALID_QUERY, "Analytical context changed while the request was in flight.")
    context["evidence_envelope"] = build_evidence_envelope(message, context)

    conversation = build_conversation_context(
        current_scope=financial_scope,
        conversation_id=conversation_id,
        previous_turns=previous_turns,
    )
    context["conversation"] = conversation

    signal_resolution = resolve_signal_context(
        signal_context,
        current_scope=financial_scope,
        verified_signals=verified_signals,
        previous_turns=previous_turns,
    )
    context["signal_context_resolution"] = {
        "source": signal_resolution.get("source"),
        "scope_match": signal_resolution.get("scope_match"),
        "matched_verified_signal": signal_resolution.get("matched_verified_signal"),
        "grounding_allowed": signal_resolution.get("grounding_allowed"),
    }
    context["active_signal_topic"] = signal_resolution.get("active_signal_topic")
    if signal_resolution.get("grounding_allowed") and signal_resolution.get("verified_signal"):
        context["active_signal_verified"] = signal_resolution.get("verified_signal")
    else:
        context["active_signal_verified"] = None

    model_history = history_for_model(conversation)
    if history and not previous_turns:
        model_history = history

    agent = model or resolve_ai_cfo_model(provider=provider, model=model_name)
    if guards_enabled:
        answer = run_guarded_turn(
            message=message,
            context=context,
            analytical={**analytical, "filters": financial_scope["filters"]},
            tools=tools,
            agent=agent,
            get_signals=lambda: signal_pack,
            history=model_history,
        )
    else:
        answer = agent.run_turn(
            message=message,
            context=context,
            tools=tools,
            get_signals=lambda: signal_pack,
            history=model_history,
        )

    latency_ms = int((time.perf_counter() - started) * 1000)
    public = _public_telemetry(
        answer,
        provider_calls=1,
        latency_ms=latency_ms,
        signal_resolution=signal_resolution,
    )
    semantic = (answer.get("telemetry") or {}).get("semantic") or {}
    followup = (answer.get("telemetry") or {}).get("followup") or {}
    lean_signal = lean_signal_context_for_conversation(signal_resolution)
    plane = context.get("strategic_control_plane") or {}
    assessment = plane.get("assessment") if isinstance(plane.get("assessment"), dict) else None
    strategic_lean = None
    if isinstance(assessment, dict):
        strategic_lean = {
            "decision_type": assessment.get("decision_type"),
            "decision_theme": (plane.get("telemetry") or {}).get("decision_theme")
            or (plane.get("diagnosis_pack") or {}).get("theme"),
            "subject": assessment.get("subject"),
            "prior_recommendation_action": (assessment.get("recommendation") or {}).get("action_type")
            if isinstance(assessment.get("recommendation"), dict)
            else None,
            "recommendation_strength": (assessment.get("recommendation") or {}).get("strength")
            if isinstance(assessment.get("recommendation"), dict)
            else None,
            "diagnosis_confidence": assessment.get("diagnosis_confidence"),
            "decision_confidence": assessment.get("decision_confidence"),
            "scenario_ref_digest": (
                (assessment.get("scenario_refs") or [{}])[0].get("digest")
                if assessment.get("scenario_refs")
                else None
            ),
            "unknowns": list(assessment.get("unknowns") or [])[:6],
            "scope_hash": assessment.get("scope_hash"),
        }
    # Prefer explicit lean thread from answer (Phase 2D); fall back to assessment shell.
    strategic_thread_out = answer.get("strategic_thread")
    if not isinstance(strategic_thread_out, dict) and isinstance(strategic_lean, dict):
        strategic_thread_out = None
    conversation_out = {
        "conversation_id": conversation["conversation_id"],
        "turn_id": conversation["turn_id"],
        "scope_hash": financial_scope["scope_hash"],
        "intent": followup.get("intent") or (answer.get("telemetry") or {}).get("resolved_intent"),
        "insight_type": semantic.get("resolved_insight_type") or public.get("insight_type"),
        "driver_stage": answer.get("driver_stage"),
        "dimension": followup.get("dimension"),
        "rank_direction": followup.get("rank_direction"),
        "rank_metric": followup.get("rank_metric"),
        "selected_entities": selected_entities_from_answer(answer),
        "selected_evidence_ids": selected_evidence_ids_from_answer(answer),
        "scenario_spec": answer.get("scenario_spec"),
        "signal_context": lean_signal,
        "strategic": strategic_lean,
        "strategic_thread": strategic_thread_out if isinstance(strategic_thread_out, dict) else None,
        "question": message,
    }
    log_event(
        logger,
        "ai_cfo_turn",
        conversation_id=conversation_out["conversation_id"],
        turn_id=conversation_out["turn_id"],
        dataset_id=lineage.get("dataset_id"),
        scope_hash=financial_scope["scope_hash"],
        capability=((answer.get("telemetry") or {}).get("guard") or {}).get("capability"),
        evidence_plan=((answer.get("telemetry") or {}).get("guard") or {}).get("evidence_plan"),
        forced_tools=",".join(public.get("forced_tools") or []),
        selected_evidence_ids=",".join(conversation_out["selected_evidence_ids"] or []),
        insight_type=conversation_out.get("insight_type"),
        driver_stage=conversation_out.get("driver_stage"),
        deterministic_insight_override=public.get("deterministic_insight_override"),
        deterministic_driver_override=public.get("deterministic_driver_override"),
        answer_source=public.get("answer_source"),
        provider_calls=public.get("provider_calls"),
        end_to_end_latency_ms=latency_ms,
        signal_context_present=public.get("signal_context_present"),
        signal_context_valid=public.get("signal_context_valid"),
        signal_context_scope_match=public.get("signal_context_scope_match"),
        signal_context_source=public.get("signal_context_source"),
        signal_id=public.get("signal_id"),
        signal_type=public.get("signal_type"),
    )
    return {
        "answer": answer,
        "scoring_answer": answer,
        "context": context,
        "signals": verified_signals,
        "scope": financial_scope,
        "scope_hash": financial_scope["scope_hash"],
        "telemetry": public,
        "conversation": conversation_out,
        "signal_context_resolution": signal_resolution,
    }
