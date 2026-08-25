"""Guarded AI CFO turn orchestration."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.answer_composer import compose_cfo_answer
from wyz_analytics.ai_cfo.change_evidence import (
    build_change_evidence_from_trend,
    classify_change_insight,
    compose_temporal_answer,
    select_primary_change,
)
from wyz_analytics.ai_cfo.driver_comparison import compose_driver_comparison_answer
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.evidence.requirements import resolve_evidence_requirement
from wyz_analytics.ai_cfo.followup import ComparisonBasis, FollowUpIntent, resolve_followup
from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.guards.post_response import detect_output_violations
from wyz_analytics.ai_cfo.guards.responses import (
    build_scope_blocked_answer,
    merge_strategy_boundary,
)
from wyz_analytics.ai_cfo.ranking_followup import compose_ranking_followup_answer
from wyz_analytics.ai_cfo.response_validation import (
    build_deterministic_fallback,
    validate_structured_answer,
)
from wyz_analytics.ai_cfo.scenario import (
    compose_scenario_answer,
    is_demand_response_question,
    parse_scenario_spec,
    simulate_scenario,
)
from wyz_analytics.ai_cfo.scenario.spec import HOLD_CONSTANT_ASSUMPTION, SUPPORTED_LEVERS_UX
from wyz_analytics.ai_cfo.semantic_contract import (
    ANSWER_MODE_LEGACY,
    ANSWER_MODE_SEMANTIC,
    ANSWER_MODE_SEMANTIC_PROSE,
    parse_semantic_output,
    resolve_answer_mode,
)
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.followup_answers import (
    compose_change_my_view_followup_answer,
    compose_cross_scope_followup_answer,
    compose_monitor_followup_answer,
    compose_next_step_followup_answer,
    compose_why_followup_answer,
)
from wyz_analytics.ai_cfo.strategy.mode import is_v2_partner_mode, resolve_strategy_mode
from wyz_analytics.ai_cfo.strategy.partner import run_strategic_partner_judgment
from wyz_analytics.ai_cfo.strategy.strategic_followup import (
    StrategicFollowupType,
    resolve_strategic_followup,
    thread_telemetry,
)
from wyz_analytics.ai_cfo.strategy.thread import (
    attach_scenario_ref_to_thread,
    touch_thread_followup,
)
MAX_GUARD_RETRIES = 1

GUARD_CORRECTION = (
    "Your prior answer violated AI CFO V1 scope. Do not infer customer sentiment, "
    "issue strategic stop/continue recommendations, or invent scenario arithmetic. "
    "Explain verified financial evidence only, or refuse clearly."
)
VALIDATION_CORRECTION_TEMPLATE = (
    "Your answer failed structured-output validation: {violations}\n"
    "Return ONLY a JSON object with:\n"
    "- 1 headline (no numbers)\n"
    "- at most {max_evidence} evidence items\n"
    "- at most {max_numeric} distinct numeric values TOTAL across the entire response\n"
    "- Do NOT repeat numeric values from evidence[] in headline, interpretation, or caveat\n"
    "- 1 driver_stage from: PRODUCT | CHANNEL | MARKETING | REVENUE_QUALITY | MIXED | UNKNOWN\n"
    "- 1 short interpretation (refer to metrics by name, not value)\n"
    "- optional caveat (no numbers)\n"
    "Remove all extra numbers. Use only evidence from the EvidenceEnvelope."
)


def _set_answer_source(answer: dict[str, Any], source: str) -> None:
    telemetry = answer.setdefault("telemetry", {})
    telemetry["answer_source"] = source


def _headline_snapshot(answer: dict[str, Any] | None) -> str | None:
    if not answer:
        return None
    text = str(answer.get("headline") or "").strip()
    return text[:240] if text else None


def _publish_user_answer(
    *,
    body: dict[str, Any],
    source: str,
    tool_calls: list[dict[str, Any]],
    validation_meta: dict[str, Any],
    guard_telemetry: dict[str, Any] | None = None,
    extra_telemetry: dict[str, Any] | None = None,
    answer_trace: dict[str, Any],
) -> dict[str, Any]:
    """Build the user-visible answer from the chosen final body only.

    Failed parse attempts must not leak leftover keys (parse_warning, stale headline).
    """
    published = {
        "headline": body.get("headline"),
        "evidence": list(body.get("evidence") or []),
        "driver_stage": body.get("driver_stage") or body.get("drivers"),
        "interpretation": body.get("interpretation"),
        "drivers": body.get("driver_stage") or body.get("drivers"),
        "caveat": body.get("caveat"),
        "methodology": body.get("methodology") if body.get("methodology") is not None else body.get("caveat"),
        "comparison": body.get("comparison"),
        "change_evidence": list(body.get("change_evidence") or []),
        "tool_calls": list(tool_calls or []),
        "context_version": body.get("context_version"),
        "markdown": body.get("markdown"),
        "telemetry": {
            **dict(extra_telemetry or {}),
            "answer_source": source,
            "response_validation": validation_meta,
            "answer_trace": answer_trace,
        },
    }
    if guard_telemetry is not None:
        _publish_guard_on_answer(published, guard_telemetry)
    return published


def _merge_forced_tool_calls(answer: dict[str, Any], forced: list[dict[str, Any]]) -> None:
    if not forced:
        return
    telemetry = answer.setdefault("telemetry", {})
    records = list(telemetry.get("tool_calls") or [])
    existing = {(item.get("name"), str(item.get("parsed_arguments"))) for item in records}
    for call in forced:
        key = (call.get("tool"), str(call.get("arguments")))
        if key in existing:
            continue
        records.insert(
            0,
            {
                "name": call.get("tool"),
                "executed": True,
                "forced": True,
                "parsed_arguments": call.get("arguments") or {},
            },
        )
    telemetry["tool_calls"] = records
    answer_tool_calls = list(answer.get("tool_calls") or [])
    for call in forced:
        if call not in answer_tool_calls:
            answer_tool_calls.append(call)
    answer["tool_calls"] = answer_tool_calls


def _apply_forced_evidence(
    context: dict[str, Any],
    tools: Any,
    evidence_req: Any,
    guard_telemetry: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    forced_calls: list[dict[str, Any]] = []
    if not evidence_req.requires_tool or not evidence_req.required_tool:
        return context, forced_calls

    tool_name = evidence_req.required_tool
    args = dict(evidence_req.required_tool_args or {})
    result = tools.dispatch(tool_name, args)
    forced_calls.append({"tool": tool_name, "arguments": args})
    guard_telemetry.setdefault("forced_tools", []).append({"tool": tool_name, "arguments": args})

    forced_evidence = dict(context.get("forced_evidence") or {})
    forced_evidence[tool_name] = result
    context = {**context, "forced_evidence": forced_evidence}
    return context, forced_calls


def _force_tool_once(
    context: dict[str, Any],
    tools: Any,
    *,
    tool_name: str,
    args: dict[str, Any] | None,
    guard_telemetry: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    forced = dict(context.get("forced_evidence") or {})
    if tool_name in forced:
        return context, []
    call_args = dict(args or {})
    result = tools.dispatch(tool_name, call_args)
    forced[tool_name] = result
    guard_telemetry.setdefault("forced_tools", []).append({"tool": tool_name, "arguments": call_args})
    return {**context, "forced_evidence": forced}, [{"tool": tool_name, "arguments": call_args}]


def _apply_strategic_evidence_gathering(
    message: str,
    context: dict[str, Any],
    tools: Any,
    guard_telemetry: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Force diagnosis tools for strategic turns (cost / trend / breakdown as required)."""
    from wyz_analytics.ai_cfo.strategy.evidence_requirements import build_strategic_evidence_plan
    from wyz_analytics.ai_cfo.strategy.intent import classify_decision_type

    scope = context.get("financial_scope") or {}
    filters = scope.get("filters") or context.get("filters") or {}
    plan = build_strategic_evidence_plan(
        message,
        decision_type=classify_decision_type(message),
        filters=filters if isinstance(filters, dict) else {},
    )
    forced_calls: list[dict[str, Any]] = []
    working = context
    if plan.force_cost_breakdown:
        working, calls = _force_tool_once(
            working, tools, tool_name="get_cost_breakdown", args={}, guard_telemetry=guard_telemetry
        )
        forced_calls.extend(calls)
    if plan.force_trend:
        working, calls = _force_tool_once(
            working,
            tools,
            tool_name="get_trend",
            args={
                "metrics": [
                    "net_revenue",
                    "gross_margin",
                    "cm1",
                    "allocated_marketing",
                    "marketing_pct",
                    "cm2",
                    "cm2_pct",
                ]
            },
            guard_telemetry=guard_telemetry,
        )
        forced_calls.extend(calls)
    if plan.force_breakdown:
        working, calls = _force_tool_once(
            working,
            tools,
            tool_name="get_breakdown",
            args={
                "dimension": plan.breakdown_dimension or "category",
                "sort": {"metric": "cm2", "direction": "asc"},
                "limit": 20,
            },
            guard_telemetry=guard_telemetry,
        )
        forced_calls.extend(calls)
    return working, forced_calls


def _store_strategy_plane(
    *,
    message: str,
    capability: Capability,
    working_context: dict[str, Any],
    context: dict[str, Any],
    guard_telemetry: dict[str, Any],
) -> dict[str, Any]:
    strategy_plane = build_strategic_control_plane(
        message,
        capability_is_strategic=(capability == Capability.STRATEGIC_RECOMMENDATION),
        financial_scope=working_context.get("financial_scope"),
        context=working_context,
        strategy_mode=resolve_strategy_mode(),
    )
    plane_payload = {
        "strategy_mode": strategy_plane.get("strategy_mode"),
        "strategic_intent_detected": strategy_plane.get("strategic_intent_detected"),
        "assessment": (
            strategy_plane["assessment"].to_dict()
            if strategy_plane.get("assessment") is not None
            else None
        ),
        "diagnosis_pack": (
            strategy_plane["diagnosis_pack"].to_dict()
            if strategy_plane.get("diagnosis_pack") is not None
            else None
        ),
        "action_eligibility": [
            item.to_dict() for item in (strategy_plane.get("action_eligibility") or [])
        ],
        "reasoning_contract": (
            strategy_plane["reasoning_contract"].to_dict()
            if strategy_plane.get("reasoning_contract") is not None
            else None
        ),
        "validation": strategy_plane.get("validation"),
        "recommendations_enabled": False,
    }
    working_context["strategic_control_plane"] = plane_payload
    context["strategic_control_plane"] = plane_payload
    guard_telemetry["strategy"] = strategy_plane.get("telemetry") or {
        "strategy_mode": resolve_strategy_mode()
    }
    return strategy_plane


def _finalize_guard_telemetry(guard_telemetry: dict[str, Any]) -> None:
    interventions = guard_telemetry.get("interventions") or []
    guard_telemetry["preempted_turn_count"] = sum(1 for item in interventions if item.get("phase") == "preempt")
    guard_telemetry["forced_tool_count"] = len(guard_telemetry.get("forced_tools") or [])
    guard_telemetry["post_response_intervention_count"] = sum(
        1 for item in interventions if item.get("phase") in {"post_response", "retry_success"}
    )
    guard_telemetry["retry_count"] = sum(1 for item in interventions if item.get("phase") == "retry_success")
    guard_telemetry["deterministic_replacement_count"] = sum(
        1 for item in interventions if item.get("phase") in {"replaced", "replaced_after_retry"}
    )
    guard_telemetry["correction_attempt_count"] = sum(
        1 for item in interventions if item.get("phase") == "validation_correction_attempt"
    )
    guard_telemetry["correction_success_count"] = sum(
        1 for item in interventions if item.get("phase") == "validation_correction_success"
    )
    guard_telemetry["deterministic_fallback_count"] = sum(
        1 for item in interventions if item.get("phase") == "validation_fallback"
    )


def _publish_guard_on_answer(answer: dict[str, Any], guard_telemetry: dict[str, Any]) -> None:
    _finalize_guard_telemetry(guard_telemetry)
    telemetry = answer.setdefault("telemetry", {})
    telemetry["guard"] = guard_telemetry
    strategy = guard_telemetry.get("strategy")
    if isinstance(strategy, dict):
        telemetry["strategy"] = strategy


def _routing_telemetry(resolution: Any, capability: Capability) -> dict[str, Any]:
    payload = resolution.to_dict() if hasattr(resolution, "to_dict") else dict(resolution or {})
    return {
        "resolved_intent": payload.get("intent"),
        "resolved_dimension": payload.get("dimension"),
        "rank_direction": payload.get("rank_direction"),
        "temporal_mode": payload.get("comparison_basis"),
        "comparison_basis": payload.get("comparison_basis"),
        "intent_source": payload.get("intent_source"),
        "conversation_context_used": bool(payload.get("is_followup") or payload.get("referent_valid")),
        "capability": capability.value,
    }


def run_guarded_turn(
    *,
    message: str,
    context: dict[str, Any],
    analytical: dict[str, Any],
    tools: Any,
    agent: Any,
    get_signals: Any,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """
    Deterministic capability classification, evidence forcing, model interpretation,
    and post-response guard with bounded retry.

    Intent precedence:
      GUARD / unsupported domain
      > SCENARIO (supported numeric) / STRATEGIC (+ optional sensitivity)
      > TEMPORAL > EXPLICIT/FOLLOW-UP RANKING > DRIVER COMPARISON > CURRENT-STATE
    """
    working_context = dict(context)
    resolution = resolve_followup(
        message,
        conversation=working_context.get("conversation"),
        analytical=analytical,
    )
    working_context["followup"] = resolution.to_dict()
    if resolution.dimension:
        working_context["dimension"] = resolution.dimension

    capability = classify_capability(message, analytical)
    # Explicit follow-up / temporal intents override generic capability classification.
    if capability not in {
        Capability.UNSUPPORTED_CAUSALITY,
        Capability.SCENARIO_REQUEST,
        Capability.STRATEGIC_RECOMMENDATION,
    }:
        if resolution.intent in {FollowUpIntent.TREND, FollowUpIntent.COMPARISON}:
            capability = Capability.TREND_REQUIRED
        elif resolution.intent in {
            FollowUpIntent.RANKING_BOTTOM,
            FollowUpIntent.RANKING_TOP,
            FollowUpIntent.BREAKDOWN,
        }:
            capability = Capability.BREAKDOWN_REQUIRED

    # Phase 2 control plane (intent first; diagnosis rebuilt after strategic evidence).
    strategy_plane = _store_strategy_plane(
        message=message,
        capability=capability,
        working_context=working_context,
        context=context,
        guard_telemetry={"strategy": {}},
    )
    guard_telemetry: dict[str, Any] = {
        "capability": capability.value,
        "forced_tools": [],
        "interventions": [],
        "followup": resolution.to_dict(),
        "strategy": strategy_plane.get("telemetry") or {"strategy_mode": resolve_strategy_mode()},
        **_routing_telemetry(resolution, capability),
    }

    # Unsupported causality still preempts.
    if capability == Capability.UNSUPPORTED_CAUSALITY:
        guard_telemetry["interventions"].append({"phase": "preempt", "reason": capability.value})
        guard_telemetry["intent_source"] = "guard"
        answer = build_scope_blocked_answer(
            capability,
            context=working_context,
            forced_tool_calls=[],
            guard_meta=guard_telemetry,
        )
        _publish_guard_on_answer(answer, guard_telemetry)
        answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
        answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
        answer["telemetry"]["intent_source"] = "guard"
        answer["telemetry"]["answer_source"] = "deterministic_guard"
        return answer

    # Phase 2D — ACTIVE strategic follow-up (after guards, before new strategic / scenario).
    if is_v2_partner_mode():
        scope_hash = str(
            (working_context.get("financial_scope") or {}).get("scope_hash")
            or working_context.get("scope_hash")
            or ""
        )
        strat_fu = resolve_strategic_followup(
            message,
            current_scope_hash=scope_hash,
            conversation=working_context.get("conversation"),
        )
        working_context["strategic_followup"] = strat_fu.to_dict()
        guard_telemetry["strategy"] = {
            **(guard_telemetry.get("strategy") or {}),
            **thread_telemetry(strat_fu),
        }

        if strat_fu.cross_scope_block and strat_fu.historical_thread is not None:
            answer = compose_cross_scope_followup_answer(
                historical=strat_fu.historical_thread,
                current_scope_hash=scope_hash,
                followup_type=strat_fu.followup_type.value,
            )
            guard_telemetry["interventions"].append({"phase": "strategic_followup_cross_scope"})
            _publish_guard_on_answer(answer, guard_telemetry)
            answer.setdefault("telemetry", {}).update(guard_telemetry.get("strategy") or {})
            answer["telemetry"]["followup"] = resolution.to_dict()
            answer["telemetry"].update(_routing_telemetry(resolution, capability))
            return answer

        if strat_fu.followup_type == StrategicFollowupType.WHY and strat_fu.thread is not None:
            thread = touch_thread_followup(
                strat_fu.thread, turn_id=(working_context.get("conversation") or {}).get("turn_id")
            )
            answer = compose_why_followup_answer(thread)
            answer["strategic_thread"] = thread.to_lean_dict()
            guard_telemetry["interventions"].append({"phase": "strategic_followup_why"})
            _publish_guard_on_answer(answer, guard_telemetry)
            answer.setdefault("telemetry", {}).update(thread_telemetry(strat_fu))
            answer["telemetry"]["provider_calls"] = 0
            return answer

        if strat_fu.followup_type == StrategicFollowupType.CHANGE_MY_VIEW and strat_fu.thread is not None:
            thread = touch_thread_followup(
                strat_fu.thread, turn_id=(working_context.get("conversation") or {}).get("turn_id")
            )
            answer = compose_change_my_view_followup_answer(thread)
            answer["strategic_thread"] = thread.to_lean_dict()
            guard_telemetry["interventions"].append({"phase": "strategic_followup_cmv"})
            _publish_guard_on_answer(answer, guard_telemetry)
            answer.setdefault("telemetry", {}).update(thread_telemetry(strat_fu))
            answer["telemetry"]["provider_calls"] = 0
            return answer

        if strat_fu.followup_type == StrategicFollowupType.MONITOR and strat_fu.thread is not None:
            thread = touch_thread_followup(
                strat_fu.thread, turn_id=(working_context.get("conversation") or {}).get("turn_id")
            )
            answer = compose_monitor_followup_answer(thread)
            answer["strategic_thread"] = thread.to_lean_dict()
            guard_telemetry["interventions"].append({"phase": "strategic_followup_monitor"})
            _publish_guard_on_answer(answer, guard_telemetry)
            answer.setdefault("telemetry", {}).update(thread_telemetry(strat_fu))
            answer["telemetry"]["provider_calls"] = 0
            return answer

        if strat_fu.followup_type == StrategicFollowupType.NEXT_STEP and strat_fu.thread is not None:
            thread = touch_thread_followup(
                strat_fu.thread, turn_id=(working_context.get("conversation") or {}).get("turn_id")
            )
            answer = compose_next_step_followup_answer(thread)
            answer["strategic_thread"] = thread.to_lean_dict()
            guard_telemetry["interventions"].append({"phase": "strategic_followup_next_step"})
            _publish_guard_on_answer(answer, guard_telemetry)
            answer.setdefault("telemetry", {}).update(thread_telemetry(strat_fu))
            answer["telemetry"]["provider_calls"] = 0
            return answer

        if strat_fu.followup_type == StrategicFollowupType.RECONSIDER and strat_fu.thread is not None:
            working_context, _strat_calls = _apply_strategic_evidence_gathering(
                strat_fu.thread.original_question or message,
                working_context,
                tools,
                guard_telemetry,
            )
            working_context["evidence_envelope"] = build_evidence_envelope(
                strat_fu.thread.original_question or message, working_context
            )
            working_context["tools"] = tools
            answer, strat_telemetry, _assessment = run_strategic_partner_judgment(
                message=message,
                working_context=working_context,
                agent=agent,
                forced_calls=_strat_calls,
                reconsider_thread=strat_fu.thread,
            )
            guard_telemetry["interventions"].append({"phase": "strategic_reconsider"})
            guard_telemetry["strategy"] = {
                **(guard_telemetry.get("strategy") or {}),
                **(strat_telemetry or {}),
                **thread_telemetry(strat_fu),
            }
            _publish_guard_on_answer(answer, guard_telemetry)
            answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
            answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
            for key, value in (strat_telemetry or {}).items():
                answer["telemetry"][key] = value
            answer["telemetry"].update(thread_telemetry(strat_fu))
            _set_answer_source(answer, answer["telemetry"].get("answer_source") or "model_strategic")
            return answer

        if strat_fu.followup_type == StrategicFollowupType.SCENARIO and strat_fu.thread is not None:
            scenario_message = strat_fu.enriched_scenario_message or message
            answer = _run_scenario_path(
                message=scenario_message,
                working_context=working_context,
                tools=tools,
                capability=Capability.SCENARIO_REQUEST,
                guard_telemetry=guard_telemetry,
                resolution=resolution,
                strategic_prefix=True,
                strategic_thread=strat_fu.thread,
            )
            return answer

        if strat_fu.force_new_strategic:
            capability = Capability.STRATEGIC_RECOMMENDATION

    # SCENARIO — deterministic sensitivity when supported; refuse otherwise (no approximation).
    if capability == Capability.SCENARIO_REQUEST:
        answer = _run_scenario_path(
            message=message,
            working_context=working_context,
            tools=tools,
            capability=capability,
            guard_telemetry=guard_telemetry,
            resolution=resolution,
            strategic_prefix=False,
        )
        return answer

    # STRATEGIC + concrete numeric assumption → boundary retained + optional sensitivity.
    if capability == Capability.STRATEGIC_RECOMMENDATION:
        prior_scenario = _previous_scenario_spec(working_context.get("conversation"))
        scope = working_context.get("financial_scope") or {}
        trial_spec = parse_scenario_spec(
            message,
            scope_hash=str(scope.get("scope_hash") or working_context.get("scope_hash") or ""),
            dataset_id=scope.get("dataset_id") or working_context.get("dataset_id"),
            previous_scenario=prior_scenario,
        )
        if trial_spec.valid and not is_demand_response_question(message):
            return _run_scenario_path(
                message=message,
                working_context=working_context,
                tools=tools,
                capability=capability,
                guard_telemetry=guard_telemetry,
                resolution=resolution,
                strategic_prefix=True,
                preparsed_spec=trial_spec,
            )
        # Phase 2B: gather strategic diagnosis evidence, rebuild control plane, keep V1 answer boundary.
        working_context, _strat_calls = _apply_strategic_evidence_gathering(
            message, working_context, tools, guard_telemetry
        )
        working_context["evidence_envelope"] = build_evidence_envelope(message, working_context)
        _store_strategy_plane(
            message=message,
            capability=capability,
            working_context=working_context,
            context=context,
            guard_telemetry=guard_telemetry,
        )
        if is_v2_partner_mode():
            answer, strat_telemetry, _assessment = run_strategic_partner_judgment(
                message=message,
                working_context=working_context,
                agent=agent,
                forced_calls=_strat_calls,
            )
            guard_telemetry["interventions"].append({"phase": "strategic_partner_judgment"})
            guard_telemetry["strategy"] = {
                **(guard_telemetry.get("strategy") or {}),
                **(strat_telemetry or {}),
            }
            _publish_guard_on_answer(answer, guard_telemetry)
            answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
            answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
            answer["telemetry"]["strategy"] = guard_telemetry["strategy"]
            for key, value in (strat_telemetry or {}).items():
                answer["telemetry"][key] = value
            _set_answer_source(answer, answer["telemetry"].get("answer_source") or "model_strategic")
            return answer

    # TEMPORAL — never fall through to contributor ranking.
    if capability == Capability.TREND_REQUIRED or resolution.intent in {
        FollowUpIntent.TREND,
        FollowUpIntent.COMPARISON,
    }:
        evidence_req = resolve_evidence_requirement(
            message=message,
            analytical=analytical,
            context=working_context,
            capability=Capability.TREND_REQUIRED,
        )
        guard_telemetry["evidence_plan"] = evidence_req.explanation
        working_context, forced_calls = _apply_forced_evidence(
            working_context, tools, evidence_req, guard_telemetry
        )
        trend_payload = (working_context.get("forced_evidence") or {}).get("get_trend")
        if trend_payload is None:
            trend_args = dict(evidence_req.required_tool_args or {})
            trend_payload = tools.get_trend(metrics=trend_args.get("metrics"))
            forced_calls.append({"tool": "get_trend", "arguments": trend_args})
            guard_telemetry.setdefault("forced_tools", []).append(
                {"tool": "get_trend", "arguments": trend_args}
            )
            forced_evidence = dict(working_context.get("forced_evidence") or {})
            forced_evidence["get_trend"] = trend_payload
            working_context["forced_evidence"] = forced_evidence
        working_context["evidence_envelope"] = build_evidence_envelope(message, working_context)
        basis = resolution.comparison_basis or ComparisonBasis.WITHIN_PERIOD
        scope_hash = str(
            (working_context.get("financial_scope") or {}).get("scope_hash")
            or working_context.get("scope_hash")
            or ""
        )
        changes = build_change_evidence_from_trend(
            trend_payload, scope_hash=scope_hash, basis=basis
        )
        primary = select_primary_change(changes)
        insight = classify_change_insight(changes, primary)
        answer = compose_temporal_answer(
            changes=changes,
            primary=primary,
            insight=insight,
            context=working_context,
            tool_calls=forced_calls,
            basis=basis,
        )
        guard_telemetry["interventions"].append({"phase": "deterministic_temporal"})
        guard_telemetry["tool_dimensions"] = ["month"]
        _publish_guard_on_answer(answer, guard_telemetry)
        answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
        answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, Capability.TREND_REQUIRED))
        answer["telemetry"]["evidence_source"] = "get_trend"
        answer["telemetry"]["temporal_mode"] = basis.value
        answer["telemetry"]["comparison_basis"] = basis.value
        return answer

    # EXPLICIT / FOLLOW-UP RANKING — Python owns ranking for SKU/product and follow-ups.
    # Channel/category "contributes most" may still use existing TOP signals when present.
    if resolution.intent == FollowUpIntent.RANKING_BOTTOM or (
        resolution.intent in {FollowUpIntent.RANKING_TOP, FollowUpIntent.BREAKDOWN}
        and (
            resolution.dimension == "sku"
            or resolution.is_followup
            or resolution.referent_valid
            or (resolution.dimension and resolution.dimension not in {"channel", "category"})
        )
    ):
        if resolution.intent == FollowUpIntent.BREAKDOWN and not resolution.rank_direction:
            from wyz_analytics.ai_cfo.followup import RankDirection

            resolution.rank_direction = RankDirection.BEST
            resolution.intent = FollowUpIntent.RANKING_TOP
        answer = compose_ranking_followup_answer(
            resolution=resolution,
            tools=tools,
            context=working_context,
            message=message,
        )
        guard_telemetry["interventions"].append({"phase": "deterministic_ranking"})
        guard_telemetry["forced_tools"] = list(
            ((answer.get("telemetry") or {}).get("guard") or {}).get("forced_tools") or []
        )
        guard_telemetry["tool_dimensions"] = [resolution.dimension] if resolution.dimension else []
        _publish_guard_on_answer(answer, guard_telemetry)
        answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
        answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
        return answer

    # DRIVER COMPARISON — explicit X-or-Y answer when requested.
    if resolution.intent == FollowUpIntent.DRIVER_DIAGNOSIS and resolution.driver_comparison:
        working_context["evidence_envelope"] = build_evidence_envelope(message, working_context)
        answer = compose_driver_comparison_answer(context=working_context, message=message)
        guard_telemetry["interventions"].append({"phase": "deterministic_driver_comparison"})
        _publish_guard_on_answer(answer, guard_telemetry)
        answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
        answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
        return answer

    evidence_req = resolve_evidence_requirement(
        message=message,
        analytical=analytical,
        context=working_context,
        capability=capability,
    )
    guard_telemetry["evidence_plan"] = evidence_req.explanation

    working_context, forced_calls = _apply_forced_evidence(
        working_context, tools, evidence_req, guard_telemetry
    )

    if capability == Capability.STRATEGIC_RECOMMENDATION:
        # Continue into model/semantic path with strategy boundary (existing behavior).
        pass

    working_context["guard"] = {
        "capability": capability.value,
        "forbidden_inference": evidence_req.forbidden_inference,
        "evidence_plan": evidence_req.explanation,
    }

    answer = agent.run_turn(
        message=message,
        context=working_context,
        tools=tools,
        get_signals=get_signals,
        history=history,
    )
    forced_tool = bool(forced_calls)
    _merge_forced_tool_calls(answer, forced_calls)

    mode = resolve_answer_mode()
    if mode in {ANSWER_MODE_SEMANTIC, ANSWER_MODE_SEMANTIC_PROSE}:
        published = _compose_semantic_answer(
            message=message,
            answer=answer,
            capability=capability,
            working_context=working_context,
            tools=tools,
            get_signals=get_signals,
            forced_calls=forced_calls,
            forced_tool=forced_tool,
            guard_telemetry=guard_telemetry,
        )
        _publish_guard_on_answer(published, guard_telemetry)
        published.setdefault("telemetry", {})["followup"] = resolution.to_dict()
        published.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
        return published

    if forced_tool:
        _set_answer_source(answer, "model_with_forced_tool")
    else:
        _set_answer_source(answer, "model")

    if capability == Capability.STRATEGIC_RECOMMENDATION and not is_v2_partner_mode():
        answer = merge_strategy_boundary(answer, context=working_context)

    violations = detect_output_violations(answer, capability)
    if violations:
        guard_telemetry["interventions"].append(
            {
                "phase": "post_response",
                "violations": [item.code for item in violations],
            }
        )
        retried = False
        for _ in range(MAX_GUARD_RETRIES):
            retried = True
            retry_context = {
                **working_context,
                "guard": {
                    **working_context["guard"],
                    "correction": GUARD_CORRECTION,
                    "prior_violations": [item.code for item in violations],
                },
            }
            retry_answer = agent.run_turn(
                message=message,
                context=retry_context,
                tools=tools,
                get_signals=get_signals,
                history=history,
            )
            _merge_forced_tool_calls(retry_answer, forced_calls)
            if capability == Capability.STRATEGIC_RECOMMENDATION and not is_v2_partner_mode():
                retry_answer = merge_strategy_boundary(retry_answer, context=working_context)
            retry_violations = detect_output_violations(retry_answer, capability)
            if not retry_violations:
                guard_telemetry["interventions"].append({"phase": "retry_success"})
                answer = retry_answer
                _set_answer_source(answer, "model_with_post_intervention")
                violations = []
                break
            violations = retry_violations

        if violations:
            guard_telemetry["interventions"].append(
                {
                    "phase": "replaced_after_retry" if retried else "replaced",
                    "violations": [item.code for item in violations],
                }
            )
            if capability == Capability.STRATEGIC_RECOMMENDATION:
                economics = _answer_text(answer)
                blocked = build_scope_blocked_answer(
                    capability,
                    context=working_context,
                    forced_tool_calls=forced_calls,
                    guard_meta=guard_telemetry,
                )
                if economics.strip():
                    blocked["interpretation"] = economics[:240]
                answer = blocked
            else:
                answer = build_scope_blocked_answer(
                    capability,
                    context=working_context,
                    forced_tool_calls=forced_calls,
                    guard_meta=guard_telemetry,
                )
            _set_answer_source(answer, "deterministic_replacement")

    answer = _validate_answer_contract(
        answer=answer,
        capability=capability,
        message=message,
        working_context=working_context,
        tools=tools,
        agent=agent,
        get_signals=get_signals,
        history=history,
        forced_calls=forced_calls,
        guard_telemetry=guard_telemetry,
    )
    _publish_guard_on_answer(answer, guard_telemetry)
    answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
    answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
    return answer


def _previous_scenario_spec(conversation: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(conversation, dict):
        return None
    for turn in reversed(list(conversation.get("previous_turns") or [])):
        if not isinstance(turn, dict) or not turn.get("same_scope"):
            continue
        scenario = turn.get("scenario_spec")
        if isinstance(scenario, dict) and scenario.get("changes"):
            return scenario
    return None


def _run_scenario_path(
    *,
    message: str,
    working_context: dict[str, Any],
    tools: Any,
    capability: Capability,
    guard_telemetry: dict[str, Any],
    resolution: Any,
    strategic_prefix: bool = False,
    preparsed_spec: Any | None = None,
    strategic_thread: Any | None = None,
) -> dict[str, Any]:
    """Parse → validate → simulate → compose. Model never produces ScenarioResult."""
    scope = working_context.get("financial_scope") or {}
    scope_hash = str(scope.get("scope_hash") or working_context.get("scope_hash") or "")
    dataset_id = scope.get("dataset_id") or working_context.get("dataset_id")
    prior = _previous_scenario_spec(working_context.get("conversation"))

    spec = preparsed_spec or parse_scenario_spec(
        message,
        scope_hash=scope_hash,
        dataset_id=dataset_id,
        previous_scenario=prior,
    )
    # Force current scope onto the spec — model/user cannot override filters.
    spec.scope_hash = scope_hash
    spec.dataset_id = dataset_id

    if not spec.valid:
        guard_telemetry["interventions"].append(
            {"phase": "scenario_unsupported", "errors": list(spec.parse_errors)}
        )
        answer = compose_scenario_answer(
            {
                "ok": False,
                "error": "; ".join(spec.parse_errors) if spec.parse_errors else None,
                "refusal_code": spec.refusal_code,
                "baseline": {},
                "scenario": {},
                "deltas": [],
                "assumptions": [HOLD_CONSTANT_ASSUMPTION],
                "scope": scope,
                "scope_hash": scope_hash,
                "spec": spec.to_dict(),
                "provenance": {},
                "dependency_path": [],
                "latency_ms": 0,
            },
            context=working_context,
            tool_calls=[],
            strategic_prefix=False,
        )
        # Demand-response copy override when parse code says so.
        if spec.refusal_code == "DEMAND_RESPONSE":
            answer["headline"] = "This scenario requires a demand-response assumption that AI CFO V1.1 does not model."
            answer["interpretation"] = (
                "I can show the mechanical effect of changing marketing spend while holding revenue constant, "
                "but not predict customer acquisition or loss. " + SUPPORTED_LEVERS_UX
            )
        _publish_guard_on_answer(answer, guard_telemetry)
        answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
        answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
        answer["telemetry"]["resolved_intent"] = "SCENARIO"
        answer["telemetry"]["scenario_parse_source"] = spec.parse_source
        answer["telemetry"]["answer_source"] = "deterministic_scenario_refusal"
        answer["telemetry"]["provider_calls"] = 0
        answer["answer_kind"] = "SCENARIO"
        answer["scenario_label"] = "WHAT-IF"
        if strategic_thread is not None:
            answer["strategic_thread"] = strategic_thread.to_lean_dict()
        return answer

    forced_calls = [{"tool": "get_current_financial_view", "arguments": {}}]
    guard_telemetry.setdefault("forced_tools", []).append(forced_calls[0])
    result = simulate_scenario(tools, spec, financial_scope=scope)
    answer = compose_scenario_answer(
        result,
        context=working_context,
        tool_calls=forced_calls,
        strategic_prefix=strategic_prefix,
    )
    guard_telemetry["interventions"].append({"phase": "deterministic_scenario"})
    guard_telemetry["capability"] = capability.value
    _publish_guard_on_answer(answer, guard_telemetry)
    answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
    answer.setdefault("telemetry", {}).update(_routing_telemetry(resolution, capability))
    answer["telemetry"]["intent_source"] = "scenario"
    answer["telemetry"]["provider_calls"] = 0
    lean = spec.lean_followup_context()
    answer["scenario_spec"] = lean
    if strategic_thread is not None:
        updated = attach_scenario_ref_to_thread(
            strategic_thread,
            lean_spec=lean,
            scope_hash=scope_hash,
            turn_id=(working_context.get("conversation") or {}).get("turn_id"),
        )
        answer["strategic_thread"] = updated.to_lean_dict()
        answer["telemetry"]["strategic_thread_scenario_present"] = bool(updated.latest_scenario_ref)
        answer["telemetry"]["strategic_thread_scenario_scope_match"] = bool(
            updated.latest_scenario_ref
            and updated.latest_scenario_ref.scope_hash == scope_hash
        )
        answer["telemetry"]["strategic_thread_id"] = updated.thread_id
        answer["telemetry"]["strategic_thread_present"] = True
        answer["telemetry"]["conversation_context_used"] = True
    return answer


def _compose_semantic_answer(
    *,
    message: str,
    answer: dict[str, Any],
    capability: Capability,
    working_context: dict[str, Any],
    tools: Any,
    get_signals: Any,
    forced_calls: list[dict[str, Any]],
    forced_tool: bool,
    guard_telemetry: dict[str, Any],
) -> dict[str, Any]:
    """Compose the final structured answer from the model's semantic contract.

    No expensive model correction loop: invalid IDs / unsafe interpretation are
    replaced deterministically.
    """
    working_context = _refresh_evidence_envelope(
        message=message,
        context=working_context,
        answer=answer,
        tools=tools,
        get_signals=get_signals,
    )
    envelope = working_context.get("evidence_envelope") or {}
    semantic_raw = answer.get("semantic")
    if semantic_raw is None and answer.get("parse_warning"):
        semantic_raw = {
            "driver_stage": answer.get("driver_stage") or "UNKNOWN",
            "insight_type": answer.get("insight_type"),
            "evidence_ids": [],
            "interpretation": "",
        }
    elif semantic_raw is None:
        # Accept direct semantic fields on the model payload.
        semantic_raw = {
            "driver_stage": answer.get("driver_stage"),
            "insight_type": answer.get("insight_type"),
            "evidence_ids": answer.get("evidence_ids") or [],
            "interpretation": answer.get("interpretation") or "",
            "comparison_type": answer.get("comparison_type"),
            "confidence": answer.get("confidence"),
        }
    semantic = parse_semantic_output(semantic_raw)
    model_calls = int(((answer.get("telemetry") or {}).get("model_calls") or 1))

    composed = compose_cfo_answer(
        semantic=semantic,
        envelope=envelope,
        context=working_context,
        capability=capability,
        message=message,
        tool_calls=list(answer.get("tool_calls") or []) or list(forced_calls),
        answer_source="model_semantic_with_forced_tool" if forced_tool else "model_semantic",
        forced_tool=forced_tool,
    )

    # Safety net on composed prose (no second model call).
    post_violations = detect_output_violations(composed, capability)
    if post_violations:
        guard_telemetry["interventions"].append(
            {"phase": "post_compose_deterministic", "violations": [item.code for item in post_violations]}
        )
        composed = compose_cfo_answer(
            semantic={"driver_stage": "UNKNOWN", "insight_type": "INSUFFICIENT_EVIDENCE", "evidence_ids": []},
            envelope=envelope,
            context=working_context,
            capability=capability,
            message=message,
            tool_calls=list(composed.get("tool_calls") or []),
            answer_source="deterministic_semantic",
            forced_tool=forced_tool,
        )

    source = str((composed.get("telemetry") or {}).get("answer_source") or "model_semantic")
    extra = {
        k: v
        for k, v in (answer.get("telemetry") or {}).items()
        if k not in {"response_validation", "answer_trace", "answer_source", "semantic", "guard"}
    }
    extra["model_calls"] = model_calls
    validation_meta = dict((composed.get("telemetry") or {}).get("response_validation") or {})
    validation_meta["provider_calls"] = model_calls
    published = _publish_user_answer(
        body=composed,
        source=source,
        tool_calls=list(composed.get("tool_calls") or []),
        validation_meta=validation_meta,
        guard_telemetry=None,
        extra_telemetry={
            **extra,
            "answer_mode": resolve_answer_mode(),
            "semantic": (composed.get("telemetry") or {}).get("semantic"),
        },
        answer_trace={
            "initial_headline": None,
            "corrected_headline": None,
            "final_headline": _headline_snapshot(composed),
            "answer_source": source,
            "semantic_parse_ok": semantic.parse_ok,
        },
    )
    return published


def _parse_diagnostics(answer: dict[str, Any]) -> dict[str, Any]:
    telemetry = answer.get("telemetry") or {}
    parse = dict(telemetry.get("parse") or {})
    if answer.get("parse_warning") and not parse.get("status"):
        parse["status"] = "malformed"
    if not parse.get("began_with"):
        headline = str(answer.get("headline") or "").strip()
        if not headline:
            parse["began_with"] = "empty"
        elif headline.startswith("{"):
            parse["began_with"] = "{"
        elif headline.startswith("```"):
            parse["began_with"] = "```"
        else:
            parse["began_with"] = "prose"
    return parse


def _answer_text(answer: dict[str, Any]) -> str:
    parts = [
        answer.get("headline") or "",
        " ".join(str(item) for item in (answer.get("evidence") or [])),
        answer.get("drivers") or "",
    ]
    return " ".join(parts)


_INGESTIBLE_TOOLS = frozenset({"get_breakdown", "get_trend"})


def _refresh_evidence_envelope(
    *,
    message: str,
    context: dict[str, Any],
    answer: dict[str, Any],
    tools: Any,
    get_signals: Any,
) -> dict[str, Any]:
    """Fold already-generated signals and executed tool rows into the envelope.

    Does not compute new rankings. Re-dispatches only tools the turn already ran
    so fallback/validation can cite those verified rows.
    """
    working = dict(context)
    pack = get_signals() if callable(get_signals) else {}
    fuller = pack.get("signals") if isinstance(pack, dict) else None
    if fuller:
        working["signals"] = list(fuller)
    forced = dict(working.get("forced_evidence") or {})
    records: list[dict[str, Any]] = list((answer.get("telemetry") or {}).get("tool_calls") or [])
    for call in answer.get("tool_calls") or []:
        records.append(
            {
                "name": call.get("tool") or call.get("name"),
                "executed": True,
                "parsed_arguments": call.get("arguments") or {},
            }
        )
    seen = set(forced)
    for record in records:
        name = str(record.get("name") or "")
        if name not in _INGESTIBLE_TOOLS or name in seen:
            continue
        if record.get("executed") is False:
            continue
        args = dict(record.get("parsed_arguments") or record.get("arguments") or {})
        try:
            forced[name] = tools.dispatch(name, args)
            seen.add(name)
        except Exception:
            continue
    working["forced_evidence"] = forced
    working["evidence_envelope"] = build_evidence_envelope(message, working)
    return working


def _validate_answer_contract(
    *,
    answer: dict[str, Any],
    capability: Capability,
    message: str,
    working_context: dict[str, Any],
    tools: Any,
    agent: Any,
    get_signals: Any,
    history: list[dict[str, str]] | None,
    forced_calls: list[dict[str, Any]],
    guard_telemetry: dict[str, Any],
) -> dict[str, Any]:
    working_context = _refresh_evidence_envelope(
        message=message,
        context=working_context,
        answer=answer,
        tools=tools,
        get_signals=get_signals,
    )
    envelope = working_context.get("evidence_envelope") or {}
    validation = validate_structured_answer(answer, envelope=envelope, context=working_context)
    initial_headline = _headline_snapshot(answer)
    telemetry = answer.setdefault("telemetry", {})
    extra_telemetry = {
        k: v for k, v in telemetry.items() if k not in {"response_validation", "answer_trace"}
    }
    combined_tool_calls = list(answer.get("tool_calls") or [])
    initial_parse = _parse_diagnostics(answer)
    validation_meta = {
        "valid": validation.valid,
        "violations": validation.violations,
        "correction_attempted": False,
        "correction_succeeded": False,
        "deterministic_fallback_used": False,
        "initial_response_valid": validation.valid,
        "correction_valid": False,
        "fallback_used": False,
        "claim_budget": envelope.get("claim_budget") or {},
        "evidence_items_available": len(envelope.get("verified_facts") or [])
        + len(envelope.get("verified_signals") or [])
        + len(envelope.get("tool_results") or []),
        "evidence_items_used": validation.evidence_items_used,
        "numeric_claims_generated": validation.numeric_claim_count,
        "initial_parse_status": initial_parse.get("status"),
        "correction_diagnostics": None,
    }
    if validation.valid:
        source = str(telemetry.get("answer_source") or "model")
        return _publish_user_answer(
            body=validation.normalized_answer,
            source=source,
            tool_calls=combined_tool_calls,
            validation_meta=validation_meta,
            extra_telemetry=extra_telemetry,
            answer_trace={
                "initial_headline": initial_headline,
                "corrected_headline": None,
                "final_headline": _headline_snapshot(validation.normalized_answer),
                "answer_source": source,
            },
        )

    guard_telemetry.setdefault("interventions", []).append(
        {"phase": "validation_correction_attempt", "violations": validation.violations}
    )
    validation_meta["correction_attempted"] = True

    claim_budget = envelope.get("claim_budget") or {}
    correction_msg = VALIDATION_CORRECTION_TEMPLATE.format(
        violations=", ".join(validation.violations),
        max_evidence=int(claim_budget.get("evidence_items_max") or 3),
        max_numeric=int(claim_budget.get("numeric_claims_max") or 3),
    )
    retry_context = {
        **working_context,
        "guard": {
            **(working_context.get("guard") or {}),
            "correction": correction_msg,
            "validation_errors": validation.violations,
        },
    }
    retry_answer = agent.run_turn(
        message=message,
        context=retry_context,
        tools=tools,
        get_signals=get_signals,
        history=history,
    )
    _merge_forced_tool_calls(retry_answer, forced_calls)
    if capability == Capability.STRATEGIC_RECOMMENDATION and not is_v2_partner_mode():
        retry_answer = merge_strategy_boundary(retry_answer, context=working_context)
    retry_check = validate_structured_answer(retry_answer, envelope=envelope, context=working_context)
    corrected_headline = _headline_snapshot(retry_answer)
    retry_tool_calls = list(retry_answer.get("tool_calls") or []) or combined_tool_calls
    correction_parse = _parse_diagnostics(retry_answer)
    correction_diag = {
        "initial_parse_status": initial_parse.get("status"),
        "initial_validation_errors": list(validation.violations),
        "correction_raw_response_shape": correction_parse.get("began_with"),
        "correction_parse_status": correction_parse.get("status"),
        "correction_validation_errors": list(retry_check.violations),
        "finish_reason": correction_parse.get("finish_reason"),
        "response_content_type": correction_parse.get("content_type"),
        "began_with": correction_parse.get("began_with"),
        "has_reasoning_metadata": correction_parse.get("has_reasoning_metadata"),
    }
    validation_meta["correction_diagnostics"] = correction_diag
    if retry_check.valid:
        guard_telemetry.setdefault("interventions", []).append({"phase": "validation_correction_success"})
        validation_meta = {
            **validation_meta,
            "valid": True,
            "violations": [],
            "correction_attempted": True,
            "correction_succeeded": True,
            "correction_valid": True,
            "deterministic_fallback_used": False,
            "fallback_used": False,
            "evidence_items_used": retry_check.evidence_items_used,
            "numeric_claims_generated": retry_check.numeric_claim_count,
        }
        return _publish_user_answer(
            body=retry_check.normalized_answer,
            source="corrected_model",
            tool_calls=retry_tool_calls,
            validation_meta=validation_meta,
            extra_telemetry=extra_telemetry,
            answer_trace={
                "initial_headline": initial_headline,
                "corrected_headline": corrected_headline,
                "final_headline": _headline_snapshot(retry_check.normalized_answer),
                "answer_source": "corrected_model",
            },
        )

    guard_telemetry.setdefault("interventions", []).append(
        {"phase": "validation_fallback", "violations": retry_check.violations}
    )
    fallback = build_deterministic_fallback(
        envelope=envelope,
        context=working_context,
        reason=retry_check.violations or validation.violations,
        tool_calls=combined_tool_calls,
        capability=capability,
        message=message,
    )
    validation_meta = {
        **validation_meta,
        "valid": False,
        "violations": retry_check.violations or validation.violations,
        "correction_attempted": True,
        "correction_succeeded": False,
        "correction_valid": False,
        "deterministic_fallback_used": True,
        "fallback_used": True,
        "evidence_items_used": len(fallback.get("evidence") or []),
        "numeric_claims_generated": 0,
    }
    published = _publish_user_answer(
        body=fallback,
        source="deterministic_fallback",
        tool_calls=combined_tool_calls,
        validation_meta=validation_meta,
        guard_telemetry=guard_telemetry,
        extra_telemetry=extra_telemetry,
        answer_trace={
            "initial_headline": initial_headline,
            "corrected_headline": corrected_headline,
            "final_headline": _headline_snapshot(fallback),
            "answer_source": "deterministic_fallback",
        },
    )
    return published
