"""Deterministic strategic follow-up answers (no GPT-OSS strategic call).

Follow-up shapes are intentionally lean — thread state remains complete;
only the rendered payload is scoped to the question asked.
"""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.action_semantics import realize_strategic_action_semantics
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.assessment import DecisionSubject
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme
from wyz_analytics.ai_cfo.strategy.strategic_presentation import (
    resolve_monitoring_labels,
    resolve_scenario_effect_text,
    sanitize_strategic_presentation_fields,
    strip_markdown_leakage,
)
from wyz_analytics.ai_cfo.strategy.strategic_semantic import resolve_change_my_view_keys, resolve_reason_key
from wyz_analytics.ai_cfo.strategy.thread import StrategicDecisionThread


def _theme(thread: StrategicDecisionThread) -> DecisionTheme:
    try:
        return DecisionTheme(str(thread.decision_theme or DecisionTheme.GENERIC.value))
    except ValueError:
        return DecisionTheme.GENERIC


def _action(thread: StrategicDecisionThread) -> ActionType | None:
    raw = thread.selected_action
    if not raw:
        return None
    try:
        return ActionType(str(raw))
    except ValueError:
        return None


def _subject(thread: StrategicDecisionThread) -> DecisionSubject | None:
    if not isinstance(thread.subject, dict):
        return None
    entity = thread.subject.get("entity")
    dimension = thread.subject.get("dimension")
    if not entity and not dimension:
        return None
    return DecisionSubject(entity=entity, dimension=dimension)


def _base_telemetry(thread: StrategicDecisionThread, *, followup_type: str, provider_calls: int = 0) -> dict[str, Any]:
    return {
        "answer_source": "deterministic_strategic_followup",
        "provider_calls": provider_calls,
        "strategic_model_called": False,
        "strategic_reconsideration_model_called": False,
        "strategic_followup_type": followup_type,
        "strategic_thread_id": thread.thread_id,
        "strategic_thread_present": True,
        "strategic_thread_status": thread.status.value,
        "strategic_thread_scope_match": True,
        "strategic_previous_action": thread.selected_action,
        "strategic_current_action": thread.selected_action,
        "decision_theme": thread.decision_theme,
        "selected_action": thread.selected_action,
        "conversation_context_used": True,
        "scope_hash": thread.scope_hash,
        "strategy_mode": "v2_partner",
        "recommendations_enabled": True,
    }


def _wrap_answer(
    *,
    headline: str,
    strategic_body: dict[str, Any],
    thread: StrategicDecisionThread,
    followup_type: str,
    interpretation: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    body = {
        **strategic_body,
        "followup_type": followup_type,
        "thread_id": thread.thread_id,
        "response_type": strategic_body.get("response_type") or followup_type,
        "direct_answer": strategic_body.get("direct_answer") or headline,
    }
    body, pres_telem = sanitize_strategic_presentation_fields(body)
    clean_headline = strip_markdown_leakage(body.get("direct_answer") or headline) or headline
    telem = _base_telemetry(thread, followup_type=followup_type)
    telem.update(pres_telem)
    if strategic_body.get("semantic_variant"):
        telem["strategic_followup_semantic_variant"] = strategic_body.get("semantic_variant")
    return {
        "headline": clean_headline,
        "interpretation": strip_markdown_leakage(interpretation or body.get("why")),
        "evidence": list(evidence or []),
        "driver_stage": "MARKETING" if thread.decision_theme == "MARKETING" else "MIXED",
        "caveat": None,
        "methodology": None,
        "strategic": body,
        "answer_kind": "STRATEGIC",
        "strategic_thread": thread.to_lean_dict(),
        "telemetry": telem,
        "tool_calls": [],
    }


def _channel_label(thread: StrategicDecisionThread) -> str:
    subject = thread.subject if isinstance(thread.subject, dict) else {}
    entity = str(subject.get("entity") or "").strip()
    return entity or "this channel"


def _why_direct_answer(thread: StrategicDecisionThread) -> tuple[str, str, str | None]:
    """Return (headline, why_body, semantic_variant) — deterministic, no model call."""
    theme = _theme(thread)
    reason = resolve_reason_key(thread.primary_reason_key)
    channel = _channel_label(thread)

    if theme == DecisionTheme.MARKETING:
        headline = (
            "Contribution is healthy before marketing, but attributed marketing consumes a material "
            "share and CM2 weakens afterward."
        )
        why = reason or headline
        if "demand" not in why.lower():
            why = (
                f"{why} That makes marketing a verified pressure point, but it doesn't tell us "
                "how demand will respond to a cut."
            )
        return headline, why, "marketing_why"

    if theme == DecisionTheme.CHANNEL_EXIT:
        headline = (
            f"Because {channel} is under contribution pressure, but the evidence doesn't yet show "
            "that exiting is better than fixing the channel."
        )
        why = reason or (
            f"{channel} looks economically weak on verified contribution, but we haven't established "
            "that the weakness is persistent, channel-wide, or better solved by exiting."
        )
        return headline, why, "channel_exit_why"

    if theme == DecisionTheme.SKU_EXIT:
        headline = (
            f"Because {channel} shows weak contribution, but exit isn't established as better than "
            "isolating and correcting the driver."
        )
        why = reason or headline
        return headline, why, "sku_exit_why"

    if theme == DecisionTheme.PRICE:
        headline = (
            "Margin data shows the current economics, but it doesn't tell us how customers would "
            "respond to a price change."
        )
        why = reason or (
            "Pricing may look attractive on margin structure alone, but elasticity and competitive "
            "response are not observable from this evidence."
        )
        return headline, why, "price_why"

    if theme == DecisionTheme.PRIORITIZE:
        candidate = thread.priority_candidate_id or thread.current_position or "the selected pressure"
        # Never leak snake_case candidate ids in prose.
        from wyz_analytics.ai_cfo.strategy.strategic_presentation import sanitize_founder_prose

        label = sanitize_founder_prose(str(candidate).replace("priority:", "").replace(":", " ")) or (
            "the selected verified pressure"
        )
        if "_" in label:
            label = "the selected verified pressure"
        headline = (
            f"{label} is the first focus because it is the material verified pressure selected "
            "in the current decision."
        )
        why = reason or headline
        return headline, why, "prioritize_why"

    if theme == DecisionTheme.PRODUCT_COST:
        headline = (
            "Product cost pressure is material in this view, but we still need to isolate which "
            "components are driving it before a stronger cut."
        )
        why = reason or headline
        return headline, why, "product_cost_why"

    headline = reason or (
        "The recommendation follows from the verified contribution pressure in the current view."
    )
    return headline, headline, "generic_why"


def compose_why_followup_answer(thread: StrategicDecisionThread) -> dict[str, Any]:
    headline, why, variant = _why_direct_answer(thread)
    uncertainty: list[str] = []
    if "DEMAND_RESPONSE" in {str(u).upper() for u in thread.unknowns}:
        uncertainty.append("We still don't know how revenue or orders respond if acquisition spend falls.")
    elif "PRICE_ELASTICITY" in {str(u).upper() for u in thread.unknowns}:
        uncertainty.append("We still don't know how volume would respond to a price change.")
    elif thread.unknowns:
        uncertainty.append("Some strategic unknowns remain for this decision.")

    body: dict[str, Any] = {
        "response_type": "WHY",
        "direct_answer": headline,
        "why": why,
        "semantic_variant": variant,
    }
    if uncertainty:
        body["uncertainty"] = uncertainty[:1]
    return _wrap_answer(headline=headline, strategic_body=body, thread=thread, followup_type="WHY", interpretation=why)


def compose_change_my_view_followup_answer(thread: StrategicDecisionThread) -> dict[str, Any]:
    theme = _theme(thread)
    lines = resolve_change_my_view_keys(list(thread.change_my_view_keys))
    if not lines:
        lines = resolve_change_my_view_keys(
            ["demand_deteriorates_during_reduction"] if theme == DecisionTheme.MARKETING else []
        )
    if theme == DecisionTheme.MARKETING:
        headline = (
            "I'd become less confident in reducing spend if a controlled reduction caused a material "
            "deterioration in revenue or orders."
        )
    elif theme == DecisionTheme.CHANNEL_EXIT:
        headline = (
            f"I'd change my view on {_channel_label(thread)} if weakness stayed material after "
            "controllable pressures were addressed, or if peer comparison kept pointing the same way."
        )
    elif theme == DecisionTheme.PRICE:
        headline = (
            "I'd change my view if a bounded price test showed unacceptable volume loss or a "
            "competitive response that worsened economics."
        )
    else:
        headline = "These criteria would change my view on the current recommendation."
    body: dict[str, Any] = {
        "response_type": "CHANGE_MY_VIEW",
        "direct_answer": headline,
        "what_would_change_my_view": lines,
    }
    return _wrap_answer(
        headline=headline,
        strategic_body=body,
        thread=thread,
        followup_type="CHANGE_MY_VIEW",
        interpretation="; ".join(lines) if lines else headline,
    )


def compose_monitor_followup_answer(thread: StrategicDecisionThread) -> dict[str, Any]:
    theme = _theme(thread)
    labels = resolve_monitoring_labels(list(thread.monitoring_metric_keys), theme=theme)
    # Keep as structured list — never a concatenated string.
    monitoring = list(labels[:6]) if labels else ["CM2", "Net Revenue"]
    headline = f"I'd watch {' · '.join(monitoring)}."
    if theme == DecisionTheme.MARKETING:
        interpretation = (
            "The key question is whether contribution improves without a material deterioration in demand."
        )
    else:
        interpretation = "Watch whether the verified pressure improves without new material deterioration."
    body: dict[str, Any] = {
        "response_type": "MONITOR",
        "direct_answer": headline,
        "monitoring": monitoring,
        "monitoring_display": " · ".join(monitoring),
        "why": interpretation,
    }
    return _wrap_answer(
        headline=headline,
        strategic_body=body,
        thread=thread,
        followup_type="MONITOR",
        interpretation=interpretation,
    )


def compose_next_step_followup_answer(thread: StrategicDecisionThread) -> dict[str, Any]:
    theme = _theme(thread)
    action = _action(thread)
    semantics = realize_strategic_action_semantics(
        decision_theme=theme,
        selected_action=action,
        subject=_subject(thread),
        priority_candidate=None,
        primary_reason_key=thread.primary_reason_key,
        position_key_or_text=thread.current_position or thread.position_key,
        fallback_used=False,
    )
    headline = semantics.next_step or semantics.direct_answer
    labels = resolve_monitoring_labels(list(thread.monitoring_metric_keys), theme=theme)
    body: dict[str, Any] = {
        "response_type": "NEXT_STEP",
        "direct_answer": headline,
        "next_step": semantics.next_step or headline,
        "why": semantics.direct_answer,
        "semantic_variant": semantics.semantic_variant,
    }
    if labels:
        body["monitoring"] = list(labels[:3])
    answer = _wrap_answer(
        headline=headline,
        strategic_body=body,
        thread=thread,
        followup_type="NEXT_STEP",
        interpretation=semantics.direct_answer,
    )
    answer["telemetry"]["strategic_semantic_variant"] = semantics.semantic_variant
    answer["telemetry"]["strategic_next_step_variant"] = semantics.next_step_variant
    return answer


def compose_reconsideration_presentation(
    *,
    headline: str,
    why: str | None,
    uncertainty: list[str],
    next_step: str | None,
    monitoring: list[str] | None,
    revision_disposition: str | None,
    prior_action: str | None,
    scenario_context: dict[str, Any] | None,
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    """Founder-facing RECONSIDERATION shape — CALCULATED_SCENARIO ≠ observed outcome."""
    _ = evidence
    what_changes = None
    what_doesnt = None
    effect_variant = None
    if scenario_context and scenario_context.get("mechanical_effects"):
        what_changes, what_doesnt = resolve_scenario_effect_text(
            scenario_context.get("mechanical_effects"),
            lever=scenario_context.get("lever"),
        )
        effect_variant = "mechanical_cm2_sensitivity"
    body: dict[str, Any] = {
        "response_type": "RECONSIDERATION",
        "direct_answer": headline,
        "prior_position": prior_action,
        "revision": revision_disposition,
        "why": why,
        "uncertainty": list(uncertainty or [])[:3],
        "next_step": next_step,
        "monitoring": list(monitoring or [])[:4] if monitoring else None,
        "new_evidence_summary": what_changes,
        "what_this_changes": what_changes,
        "what_it_doesnt_tell_us": what_doesnt,
        "therefore": next_step or headline,
        "semantic_variant": effect_variant,
    }
    cleaned, _telem = sanitize_strategic_presentation_fields(
        {k: v for k, v in body.items() if v not in (None, [], "")}
    )
    if effect_variant:
        cleaned["strategic_scenario_effect_variant"] = effect_variant
    return cleaned


def compose_cross_scope_followup_answer(
    *,
    historical: StrategicDecisionThread,
    current_scope_hash: str,
    followup_type: str,
) -> dict[str, Any]:
    """Prior recommendation belonged to a previous view — do not ground into new scope."""
    theme = historical.decision_theme or "prior"
    headline = (
        f"That earlier {str(theme).replace('_', ' ').lower()} recommendation belonged to a previous view. "
        "I won't apply it to the current filters — ask the decision again under this view if you want a fresh take."
    )
    return {
        "headline": headline,
        "interpretation": (
            "FinancialScope changed, so prior strategic evidence is historical only and cannot ground "
            "the current answer."
        ),
        "evidence": [],
        "driver_stage": "UNKNOWN",
        "caveat": None,
        "strategic": {
            "response_type": "CROSS_SCOPE",
            "direct_answer": headline,
            "followup_type": followup_type,
            "thread_id": historical.thread_id,
            "why": "Scope changed; prior thread is historical.",
        },
        "answer_kind": "STRATEGIC",
        "strategic_thread": {
            **historical.to_lean_dict(),
            "status": "HISTORICAL",
        },
        "telemetry": {
            "answer_source": "deterministic_strategic_followup",
            "provider_calls": 0,
            "strategic_model_called": False,
            "strategic_reconsideration_model_called": False,
            "strategic_followup_type": followup_type,
            "strategic_thread_present": True,
            "strategic_thread_id": historical.thread_id,
            "strategic_thread_status": "HISTORICAL",
            "strategic_thread_scope_match": False,
            "strategic_followup_source": "HISTORICAL_THREAD",
            "conversation_context_used": True,
            "scope_hash": current_scope_hash,
            "strategy_mode": "v2_partner",
        },
        "tool_calls": [],
    }
