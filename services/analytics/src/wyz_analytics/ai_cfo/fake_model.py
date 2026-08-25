"""Fake AI CFO model for tests — no network, no API keys.

Default path emits the V1 controlled semantic contract (insight_type + evidence_ids).
Legacy full-answer mode remains available via WYZ_AI_CFO_ANSWER_MODE.
"""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.semantic_contract import ANSWER_MODE_LEGACY, resolve_answer_mode
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence, RecommendationStrength
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


class FakeAiCfoModel:
    id = "fake-ai-cfo"

    def run_turn(
        self,
        *,
        message: str,
        context: dict[str, Any],
        tools: Any,
        get_signals: Any,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        lower = message.lower()
        tool_calls: list[dict[str, Any]] = []
        _ = history
        mode = resolve_answer_mode()

        if mode != ANSWER_MODE_LEGACY:
            return _semantic_turn(
                message=message,
                lower=lower,
                context=context,
                tools=tools,
                get_signals=get_signals,
                tool_calls=tool_calls,
            )

        return _legacy_turn(
            message=message,
            lower=lower,
            context=context,
            tools=tools,
            get_signals=get_signals,
            tool_calls=tool_calls,
        )

    def run_strategic_turn(
        self,
        *,
        message: str,
        model_input: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        override = context.get("fake_strategic_override")
        if isinstance(override, dict):
            return dict(override)
        return _fake_strategic_decision(message=message, model_input=model_input, context=context)


def _semantic_turn(
    *,
    message: str,
    lower: str,
    context: dict[str, Any],
    tools: Any,
    get_signals: Any,
    tool_calls: list[dict[str, Any]],
) -> dict[str, Any]:
    envelope = context.get("evidence_envelope") or {}
    ids = _pick_evidence_ids(envelope, lower)

    if "dislike" in lower or "sentiment" in lower:
        return _semantic_payload("UNKNOWN", "NEUTRAL_OBSERVATION", ids, context, tool_calls)
    if "stop selling" in lower or "should we" in lower:
        return _semantic_payload("MIXED", "MIXED_ECONOMICS", ids, context, tool_calls)
    if "if marketing falls" in lower or "falls 20%" in lower or "what will cm2 be if" in lower:
        return _semantic_payload("UNKNOWN", "INSUFFICIENT_EVIDENCE", ids, context, tool_calls)

    if any(token in lower for token in ("sku", "breakdown", "channel", "category", "which", "products", "causing")):
        if "sku" in lower or "product" in lower:
            dimension = "sku"
        elif "channel" in lower:
            dimension = "channel"
        elif "category" in lower:
            dimension = "category"
        else:
            dimension = "channel"
        tools.get_breakdown(dimension=dimension, limit=10)
        tool_calls.append({"tool": "get_breakdown", "arguments": {"dimension": dimension}})
        ids = _pick_evidence_ids(envelope, lower) or _summary_ids(envelope)
        if "weakest" in lower or "leak" in lower or "pressure" in lower or "causing" in lower:
            stage = "MARKETING" if "marketing" in lower else "MIXED"
            insight = "MARGIN_PRESSURE"
        elif "sku" in lower:
            stage = "PRODUCT"
            insight = "CONTRIBUTION_LEADER"
        else:
            stage = "MIXED"
            insight = "CONTRIBUTION_LEADER"
        return _semantic_payload(stage, insight, ids, context, tool_calls)

    if "trend" in lower or "period" in lower:
        tools.get_trend()
        tool_calls.append({"tool": "get_trend", "arguments": {}})
        return _semantic_payload("MIXED", "MIXED_ECONOMICS", _summary_ids(envelope), context, tool_calls)

    tool_calls.append({"tool": "get_current_financial_view", "arguments": {}})
    _ = get_signals
    return _semantic_payload(
        "MIXED",
        "MIXED_ECONOMICS",
        _summary_ids(envelope) or ids,
        context,
        tool_calls,
    )


def _pick_evidence_ids(envelope: dict[str, Any], lower: str) -> list[str]:
    ids: list[str] = []
    pressure = {"MARGIN_PRESSURE", "NEGATIVE_CONTRIBUTOR", "COST_CONCENTRATION"}
    top = {"TOP_CONTRIBUTOR"}
    for item in envelope.get("verified_signals") or []:
        roles = set(item.get("semantic_roles") or [])
        eid = item.get("evidence_id")
        if not eid:
            continue
        if ("weakest" in lower or "leak" in lower or "pressure" in lower or "negative" in lower) and roles.intersection(
            pressure
        ):
            ids.append(str(eid))
        elif roles.intersection(top):
            ids.append(str(eid))
        if len(ids) >= 3:
            return ids[:3]
    for item in envelope.get("tool_results") or []:
        eid = item.get("evidence_id")
        if eid:
            ids.append(str(eid))
        if len(ids) >= 3:
            return ids[:3]
    return _summary_ids(envelope)


def _summary_ids(envelope: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    preferred = {"cm2", "cm2_pct", "cm1", "cm1_pct", "net_revenue", "allocated_marketing", "marketing_pct"}
    for item in envelope.get("verified_facts") or []:
        if str(item.get("metric")) in preferred and item.get("evidence_id"):
            ids.append(str(item["evidence_id"]))
        if len(ids) >= 3:
            break
    if ids:
        return ids[:3]
    for item in envelope.get("verified_facts") or []:
        if item.get("evidence_id"):
            ids.append(str(item["evidence_id"]))
        if len(ids) >= 3:
            break
    return ids[:3]


def _semantic_payload(
    driver_stage: str,
    insight_type: str,
    evidence_ids: list[str],
    context: dict[str, Any],
    tool_calls: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "semantic": {
            "driver_stage": driver_stage,
            "insight_type": insight_type,
            "evidence_ids": evidence_ids[:3],
            "confidence": "MEDIUM",
        },
        "driver_stage": driver_stage,
        "insight_type": insight_type,
        "evidence_ids": evidence_ids[:3],
        "tool_calls": tool_calls,
        "context_version": (context.get("meta") or {}).get("context_version"),
        "telemetry": {"model_calls": 1, "answer_mode": "semantic"},
    }


def _legacy_turn(
    *,
    message: str,
    lower: str,
    context: dict[str, Any],
    tools: Any,
    get_signals: Any,
    tool_calls: list[dict[str, Any]],
) -> dict[str, Any]:
    summary = context.get("summary") or tools.get_current_financial_view().get("summary") or {}
    signals = get_signals().get("highlighted") or context.get("signals") or []

    if "dislike" in lower or "sentiment" in lower:
        return _format_answer(
            "Financial data does not establish customer sentiment.",
            ["Verified metrics cover revenue and margin economics, not customer preference surveys."],
            "No stage diagnosis — question is outside financial evidence.",
            context,
            tool_calls,
            caveat="Do not infer customer dislike from contribution or sales alone.",
        )
    if "stop selling" in lower or "should we" in lower:
        return _format_answer(
            "AI CFO V1 can explain verified economics but cannot recommend stop or continue decisions.",
            ["Verified contribution and cost metrics are available for the active view."],
            "Strategic recommendations are outside V1 scope.",
            context,
            tool_calls,
        )
    if "if marketing falls" in lower or "falls 20%" in lower or "what will cm2 be if" in lower:
        return _format_answer(
            "Scenario modelling is outside AI CFO V1.",
            ["Use the verified current-view metrics rather than hypothetical projections."],
            "Read-only interpretation only.",
            context,
            tool_calls,
        )

    if any(token in lower for token in ("sku", "breakdown", "channel", "category", "which", "products", "causing")):
        if "sku" in lower or "product" in lower:
            dimension = "sku"
        elif "channel" in lower:
            dimension = "channel"
        elif "category" in lower:
            dimension = "category"
        else:
            dimension = "channel"
        result = tools.get_breakdown(dimension=dimension, limit=10)
        tool_calls.append({"tool": "get_breakdown", "arguments": {"dimension": dimension}})
        rows = (result or {}).get("rows") or []
        evidence = []
        for row in rows[:3]:
            metric = "cm2" if "cm2" in row else next(iter(row.keys()), None)
            if metric is None:
                continue
            evidence.append(
                {
                    "metric": metric,
                    "value": row.get(metric),
                    "unit": "INR",
                    "scope": {"dimension": dimension, "dimension_value": row.get(dimension) or row.get("label")},
                    "interpretation": "Verified breakdown row.",
                }
            )
        return _format_answer(
            "Verified breakdown highlights the leading segments in this view.",
            evidence or ["No breakdown rows returned."],
            "Ordering follows the verified tool result.",
            context,
            tool_calls,
        )

    if "trend" in lower or "period" in lower:
        tools.get_trend()
        tool_calls.append({"tool": "get_trend", "arguments": {}})
        return _format_answer(
            "Period trend reflects the active filtered population only.",
            [f"Net revenue {summary.get('net_revenue')}", f"CM2 {summary.get('cm2')}"],
            "Trend is scoped to active filters.",
            context,
            tool_calls,
        )

    tool_calls.append({"tool": "get_current_financial_view", "arguments": {}})
    _ = signals
    return _format_answer(
        "Current filtered economics are driven by verified margin-stage evidence.",
        [
            {"metric": "cm2", "value": summary.get("cm2"), "unit": "INR", "scope": {}, "interpretation": "Verified CM2."},
            {
                "metric": "cm1",
                "value": summary.get("cm1"),
                "unit": "INR",
                "scope": {},
                "interpretation": "Verified CM1.",
            },
        ],
        "Use product COGS for gross margin, channel/fulfilment costs for CM1, and attributed marketing for CM2 interpretation.",
        context,
        tool_calls,
        caveat="Attributed marketing CM2 is not fully-loaded profitability.",
    )


def _catalog_evidence_ids(model_input: dict[str, Any], limit: int = 3) -> list[str]:
    ids: list[str] = []
    for item in model_input.get("evidence_catalog") or []:
        if isinstance(item, dict) and item.get("evidence_id"):
            ids.append(str(item["evidence_id"]))
        if len(ids) >= limit:
            break
    return ids


def _pick_allowed(model_input: dict[str, Any], preferred: list[ActionType]) -> ActionType:
    allowed_raw = {str(a).upper() for a in (model_input.get("allowed_actions") or [])}
    for action in preferred:
        if action.value in allowed_raw:
            return action
    if allowed_raw:
        try:
            return ActionType(next(iter(allowed_raw)))
        except ValueError:
            pass
    return ActionType.INVESTIGATE


def _decision_theme_from_input(model_input: dict[str, Any]) -> str | None:
    decision = model_input.get("decision") if isinstance(model_input.get("decision"), dict) else {}
    theme = decision.get("theme") or (model_input.get("decision_frame") or {}).get("theme")
    return str(theme).upper() if theme else None


def _decision_evidence_ids(model_input: dict[str, Any]) -> list[str]:
    pack = model_input.get("decision_evidence") if isinstance(model_input.get("decision_evidence"), dict) else {}
    ids: list[str] = []
    for key in ("subject", "comparison", "persistence", "drivers", "scenario"):
        for eid in pack.get(key) or []:
            if eid not in ids:
                ids.append(str(eid))
    return ids or _catalog_evidence_ids(model_input)


def _fake_strategic_decision(
    *,
    message: str,
    model_input: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    lower = (message or "").lower()
    allowed = {str(a).upper() for a in (model_input.get("allowed_actions") or [])}
    unknowns_list = [str(u).upper() for u in (model_input.get("unknowns") or [])]
    unknowns = set(unknowns_list)
    theme = _decision_theme_from_input(model_input)
    evidence_ids = _decision_evidence_ids(model_input)
    conflicts = model_input.get("diagnosis", {}).get("conflicts") or []
    scenario_refs = model_input.get("scenario_refs") or []
    scenario_digest = None
    if scenario_refs and isinstance(scenario_refs[0], dict):
        scenario_digest = scenario_refs[0].get("scenario_id")

    if context.get("fake_strategic_fixture") == "exit_eligible" and ActionType.EXIT.value in allowed:
        return {
            "selected_action": ActionType.EXIT.value,
            "recommendation_strength": RecommendationStrength.MODERATE.value,
            "decision_confidence": DecisionConfidence.MEDIUM.value,
            "thesis": {
                "position": "I'd exit this SKU line — persistent negative contribution is material and peer-ranked weak.",
                "why_keys_or_evidence_ids": evidence_ids[:2] or ["insight:NEGATIVE_CONTRIBUTOR"],
                "uncertainty_keys": unknowns_list[:2] or [StrategicUnknown.RETENTION.value],
                "next_step_action": ActionType.EXIT.value,
                "monitoring_metric_keys": ["cm2", "net_revenue"],
            },
            "supporting_evidence_ids": evidence_ids,
            "tradeoff_keys": ["exit_is_irreversible"],
            "change_my_view_keys": ["persistent_negative_sku_contribution"],
            "primary_reason_key": "insufficient_exit_burden",
            "rationale": (
                "Contribution stays negative after marketing with persistent trend and peer weakness. "
                "I'd exit rather than keep funding the leak."
            ),
        }

    if theme == "CHANNEL_EXIT" or "stop selling" in lower or "stop d2c" in lower:
        action = _pick_allowed(model_input, [ActionType.INVESTIGATE, ActionType.OPTIMIZE, ActionType.MONITOR])
        channel_unknowns = [u for u in unknowns_list if u != StrategicUnknown.DEMAND_RESPONSE.value][:3]
        if not channel_unknowns:
            channel_unknowns = [
                StrategicUnknown.RETENTION.value,
                StrategicUnknown.TEMPORAL_STABILITY.value,
            ]
        return {
            "selected_action": action.value,
            "recommendation_strength": RecommendationStrength.MODERATE.value,
            "decision_confidence": DecisionConfidence.MEDIUM.value,
            "thesis": {
                "position_key": "channel_exit_hold",
                "why_keys_or_evidence_ids": evidence_ids[:3],
                "uncertainty_keys": channel_unknowns,
                "next_step_action": action.value,
                "monitoring_metric_keys": ["net_revenue", "cm1_pct", "cm2_pct", "marketing_pct"],
            },
            "supporting_evidence_ids": evidence_ids[:4],
            "primary_reason_key": "insufficient_exit_burden",
            "change_my_view_keys": ["channel_stays_below_peers_after_fixes", "persistent_negative_contribution"],
            "tradeoff_keys": ["exit_is_irreversible"],
            "rationale": (
                "I'd compare channel economics with peers and isolate whether weakness is channel-wide "
                "or concentrated before considering exit."
            ),
        }

    if theme == "PRICE" or "increase price" in lower or "raise price" in lower:
        action = _pick_allowed(model_input, [ActionType.INVESTIGATE, ActionType.MONITOR, ActionType.EXPERIMENT])
        return {
            "selected_action": action.value,
            "recommendation_strength": RecommendationStrength.TENTATIVE.value,
            "decision_confidence": DecisionConfidence.LOW.value,
            "thesis": {
                "position_key": "price_investigate_first",
                "uncertainty_keys": [
                    StrategicUnknown.PRICE_ELASTICITY.value,
                    StrategicUnknown.DEMAND_RESPONSE.value,
                ],
                "next_step_action": action.value,
                "monitoring_metric_keys": ["gross_margin_pct", "cm1_pct", "cm2_pct", "net_revenue"],
            },
            "supporting_evidence_ids": evidence_ids[:4],
            "primary_reason_key": "margin_not_primary_constraint",
            "change_my_view_keys": ["bounded_price_test_shows_volume_risk"],
            "rationale": "Margin structure alone does not justify a broad price increase without elasticity evidence.",
        }

    if theme == "PRIORITIZE" or "fix first" in lower or "priorit" in lower:
        candidates = (model_input.get("decision") or {}).get("prioritize_candidates") or []
        chosen = candidates[0] if candidates else None
        # Prefer a specific entity pressure when available (fake judgment, not Python ranking).
        for cand in candidates:
            subject = cand.get("subject") if isinstance(cand, dict) else None
            if isinstance(subject, dict) and subject.get("entity"):
                chosen = cand
                break
        if chosen is None:
            for cand in candidates:
                if str(cand.get("theme") or "").upper() == "MARKETING":
                    chosen = cand
                    break
        candidate_id = (chosen or {}).get("candidate_id") or "priority:marketing"
        top_theme = (chosen or {}).get("theme") or "MARKETING"
        action = _pick_allowed(model_input, [ActionType.OPTIMIZE, ActionType.INVESTIGATE, ActionType.REDUCE])
        reason_key = "marketing_most_material" if top_theme == "MARKETING" else "contribution_most_material"
        if "channel" in str(candidate_id):
            reason_key = "contribution_most_material"
        evidence = list((chosen or {}).get("evidence_ids") or [])[:4] or evidence_ids[:4]
        label = (chosen or {}).get("presentation_label") or (chosen or {}).get("label") or "verified pressure"
        return {
            "selected_action": action.value,
            "recommendation_strength": RecommendationStrength.MODERATE.value,
            "decision_confidence": DecisionConfidence.MEDIUM.value,
            "thesis": {
                "position_key": "prioritize_material_pressure",
                "why_keys_or_evidence_ids": evidence[:3],
                "uncertainty_keys": unknowns_list[:3],
                "next_step_action": action.value,
                "monitoring_metric_keys": ["cm2", "cm2_pct", "net_revenue", "marketing_pct"],
            },
            "supporting_evidence_ids": evidence,
            "priority_candidate_id": candidate_id,
            "primary_reason_key": reason_key,
            "change_my_view_keys": ["higher_material_pressure_emerges"],
            "rationale": f"Prioritize {label} among the verified candidates in this view.",
        }

    if theme == "MARKETING" or "cut marketing" in lower or ("marketing" in lower and "cut" in lower):
        action = _pick_allowed(
            model_input,
            [ActionType.EXPERIMENT, ActionType.OPTIMIZE, ActionType.REDUCE, ActionType.INVESTIGATE],
        )
        return {
            "selected_action": action.value,
            "recommendation_strength": RecommendationStrength.MODERATE.value,
            "decision_confidence": DecisionConfidence.MEDIUM.value,
            "thesis": {
                "position_key": "controlled_reduction_test",
                "why_keys_or_evidence_ids": evidence_ids[:4],
                "uncertainty_keys": [StrategicUnknown.DEMAND_RESPONSE.value],
                "next_step_action": action.value,
                "monitoring_metric_keys": ["cm1", "cm1_pct", "marketing_pct", "cm2", "cm2_pct"],
            },
            "supporting_evidence_ids": evidence_ids[:4],
            "primary_reason_key": "cm2_pressure_material",
            "change_my_view_keys": ["demand_deteriorates_during_reduction"],
            "tradeoff_keys": ["demand_response_unknown"],
            "rationale": (
                "Contribution before marketing is positive while post-marketing contribution is pressured. "
                "I'd experiment before a broad cut because demand response is unknown."
            ),
        }

    if theme == "PRODUCT_COST" or ("cost" in lower and ("cut" in lower or "reduce" in lower)):
        action = _pick_allowed(model_input, [ActionType.OPTIMIZE, ActionType.INVESTIGATE, ActionType.REDUCE])
        return {
            "selected_action": action.value,
            "recommendation_strength": RecommendationStrength.MODERATE.value,
            "decision_confidence": DecisionConfidence.MEDIUM.value,
            "thesis": {
                "position": "I'd target verified cost drivers from the scoped breakdown before broad cuts.",
                "why_keys_or_evidence_ids": evidence_ids[:3],
                "uncertainty_keys": unknowns_list[:3] or [StrategicUnknown.OPERATIONAL_FEASIBILITY.value],
                "next_step_action": action.value,
                "monitoring_metric_keys": ["cm1", "cm2", "net_revenue"],
            },
            "supporting_evidence_ids": evidence_ids[:4],
            "primary_reason_key": "cogs_material_pressure",
            "rationale": "Use verified cost concentration evidence rather than guessing where spend sits.",
        }

    if "would you do it" in lower or "should i do it" in lower:
        action = _pick_allowed(model_input, [ActionType.EXPERIMENT, ActionType.INVESTIGATE, ActionType.MONITOR])
        return {
            "selected_action": action.value,
            "recommendation_strength": RecommendationStrength.TENTATIVE.value,
            "decision_confidence": DecisionConfidence.MEDIUM.value,
            "thesis": {
                "position": "I'd treat the scenario as sensitivity evidence, not a forecast.",
                "uncertainty_keys": [StrategicUnknown.DEMAND_RESPONSE.value],
                "next_step_action": action.value,
                "monitoring_metric_keys": ["cm2", "net_revenue", "marketing_pct"],
            },
            "supporting_evidence_ids": evidence_ids,
            "scenario_ref_digest": scenario_digest,
            "rationale": (
                "A deterministic sensitivity exists, but demand response to lower spend remains unknown."
            ),
        }

    if "GROWTH_VS_MARGIN" in conflicts or (
        "growth" in lower and any("GROWTH" in str(c) for c in conflicts)
    ):
        action = _pick_allowed(model_input, [ActionType.OPTIMIZE, ActionType.INVESTIGATE])
        return {
            "selected_action": action.value,
            "recommendation_strength": RecommendationStrength.MODERATE.value,
            "decision_confidence": DecisionConfidence.MEDIUM.value,
            "thesis": {
                "position": "Growth is healthy on revenue but increasingly expensive at CM2.",
                "why_keys_or_evidence_ids": evidence_ids[:2] or ["conflict:GROWTH_VS_MARGIN"],
                "uncertainty_keys": list(unknowns)[:3],
                "next_step_action": action.value,
                "monitoring_metric_keys": ["cm2", "net_revenue"],
            },
            "supporting_evidence_ids": evidence_ids,
            "tradeoff_keys": ["growth_quality_vs_topline"],
            "rationale": "I'd focus on growth quality rather than maximizing topline alone.",
        }

    action = _pick_allowed(model_input, [ActionType.INVESTIGATE, ActionType.MONITOR])
    return {
        "selected_action": action.value,
        "recommendation_strength": RecommendationStrength.TENTATIVE.value,
        "decision_confidence": DecisionConfidence.LOW.value,
        "thesis": {
            "position": "I'd investigate the verified drivers before recommending a stronger move.",
            "uncertainty_keys": unknowns_list[:4],
            "next_step_action": action.value,
            "monitoring_metric_keys": ["cm2", "net_revenue"],
        },
        "supporting_evidence_ids": evidence_ids,
        "rationale": "Verified economics need clearer driver isolation before a stronger recommendation.",
    }


def _format_answer(
    headline: str,
    evidence: list[Any],
    interpretation: str,
    context: dict[str, Any],
    tool_calls: list[dict[str, Any]],
    *,
    caveat: str | None = None,
) -> dict[str, Any]:
    items = []
    for item in evidence:
        if isinstance(item, dict):
            items.append(item)
        else:
            items.append({"metric": None, "value": None, "unit": None, "scope": {}, "interpretation": str(item)})
    return {
        "headline": headline,
        "evidence": items,
        "driver_stage": "MIXED",
        "interpretation": interpretation,
        "caveat": caveat,
        "tool_calls": tool_calls,
        "context_version": (context.get("meta") or {}).get("context_version"),
        "telemetry": {"model_calls": 1, "answer_mode": "legacy_full_answer"},
    }
