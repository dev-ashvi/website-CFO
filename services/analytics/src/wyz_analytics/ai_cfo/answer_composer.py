"""Deterministic CFO answer composer — Python owns numbers, headlines, and prose.

Consumes controlled SemanticOutput (insight_type + evidence_ids + driver_stage)
plus EvidenceEnvelope and emits the frontend structured answer contract.
"""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.answer_contract import DriverStage, build_markdown, normalize_driver_stage
from wyz_analytics.ai_cfo.deterministic_answer import build_deterministic_cfo_answer
from wyz_analytics.ai_cfo.guards.capability import Capability
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.presentation import dedupe_evidence_items, display_entity_name, present_evidence_item
from wyz_analytics.ai_cfo.semantic_contract import (
    InsightType,
    SemanticOutput,
    parse_semantic_output,
    resolve_answer_mode,
    validate_driver_stage,
    validate_evidence_selection,
    validate_insight_type,
)

_PRESSURE_ROLES = {"MARGIN_PRESSURE", "NEGATIVE_CONTRIBUTOR"}
_TOP_ROLES = {"TOP_CONTRIBUTOR"}
_COST_ROLES = {"COST_CONCENTRATION"}


class DeterministicCfoAnswerComposer:
    """Compose the user-visible CFO answer from verified evidence + semantic classification."""

    def compose(
        self,
        *,
        semantic: SemanticOutput | dict[str, Any] | None,
        envelope: dict[str, Any],
        context: dict[str, Any],
        capability: Capability | str | None = None,
        message: str = "",
        tool_calls: list[dict[str, Any]] | None = None,
        answer_source: str = "model_semantic",
        forced_tool: bool = False,
    ) -> dict[str, Any]:
        return compose_cfo_answer(
            semantic=semantic,
            envelope=envelope,
            context=context,
            capability=capability,
            message=message,
            tool_calls=tool_calls,
            answer_source=answer_source,
            forced_tool=forced_tool,
        )


def compose_cfo_answer(
    *,
    semantic: SemanticOutput | dict[str, Any] | None,
    envelope: dict[str, Any],
    context: dict[str, Any],
    capability: Capability | str | None = None,
    message: str = "",
    tool_calls: list[dict[str, Any]] | None = None,
    answer_source: str = "model_semantic",
    forced_tool: bool = False,
) -> dict[str, Any]:
    cap = _as_capability(capability)
    budget = envelope.get("claim_budget") or {}
    max_items = int(budget.get("evidence_items_max") or 3)
    sem = parse_semantic_output(semantic) if not isinstance(semantic, SemanticOutput) else semantic
    mode = resolve_answer_mode()

    if cap in {Capability.UNSUPPORTED_CAUSALITY, Capability.SCENARIO_REQUEST}:
        base = build_deterministic_cfo_answer(
            envelope=envelope,
            context=context,
            capability=cap,
            tool_calls=tool_calls,
            message=message,
            answer_source="deterministic_guard",
        )
        return _with_semantic_telemetry(
            base,
            sem,
            None,
            None,
            None,
            answer_source="deterministic_guard",
            mode=mode,
        )

    selection = validate_evidence_selection(
        evidence_ids=list(sem.evidence_ids),
        envelope=envelope,
        context=context,
        driver_stage=sem.driver_stage,
        max_items=max_items,
    )

    insight_result = validate_insight_type(
        insight_type=sem.insight_type,
        items=selection.selected_items,
        envelope=envelope,
    )
    driver_result = validate_driver_stage(
        driver_stage=sem.driver_stage,
        items=selection.selected_items,
        insight_type=insight_result.insight_type,
    )

    insight = insight_result.insight_type
    driver_stage = driver_result.driver_stage
    interpretation = render_interpretation_template(
        insight_type=insight,
        driver_stage=driver_stage,
        items=selection.selected_items,
        message=message,
    )
    evidence = dedupe_evidence_items(
        [_render_evidence_item(item) for item in selection.selected_items[:max_items]]
    )

    if cap == Capability.STRATEGIC_RECOMMENDATION:
        headline = STRATEGY_BOUNDARY_SENTENCE
        interpretation = (
            "Verified economics for the active view can be explained without prescribing "
            "stop/continue decisions."
        )
        caveat = _attribution_caveat(
            context,
            envelope,
            evidence,
            f"{headline} {interpretation} {message} cm2 marketing",
        )
        if not caveat:
            caveat = next(
                (
                    str(item)
                    for item in list(envelope.get("methodology_caveats") or []) + list(context.get("caveats") or [])
                    if "attributed" in str(item).lower()
                ),
                "Attributed marketing CM2 is not fully-loaded profitability.",
            )
    else:
        headline = render_headline_template(
            insight_type=insight,
            driver_stage=driver_stage,
            items=selection.selected_items,
            message=message,
        )
        caveat = _attribution_caveat(
            context,
            envelope,
            evidence,
            f"{headline} {interpretation} {message} {driver_stage}",
        )

    source = _resolve_answer_source(
        answer_source=answer_source,
        sem=sem,
        selection=selection,
        insight_result=insight_result,
        driver_result=driver_result,
        forced_tool=forced_tool,
    )

    answer = {
        "headline": headline,
        "evidence": evidence,
        "driver_stage": driver_stage,
        "interpretation": interpretation,
        "drivers": driver_stage,
        "caveat": caveat,
        "methodology": caveat,
        "context_version": (context.get("meta") or {}).get("context_version"),
        "tool_calls": list(tool_calls or []),
    }
    answer["markdown"] = build_markdown(answer)
    answer["telemetry"] = {
        "answer_source": source,
        "answer_mode": mode,
        "semantic": _semantic_telemetry(sem, selection, insight_result, driver_result),
        "response_validation": {
            "valid": True,
            "violations": list(sem.parse_errors),
            "correction_attempted": False,
            "correction_succeeded": False,
            "deterministic_fallback_used": False,
            "initial_response_valid": sem.parse_ok,
            "correction_valid": False,
            "fallback_used": False,
            "claim_budget": budget,
            "evidence_items_available": len(envelope.get("verified_facts") or [])
            + len(envelope.get("verified_signals") or [])
            + len(envelope.get("tool_results") or []),
            "evidence_items_used": len(evidence),
            "numeric_claims_generated": sum(1 for item in evidence if item.get("value") is not None),
            "model_semantic_valid": sem.parse_ok,
            "model_selected_evidence_count": len(sem.evidence_ids),
            "invalid_evidence_ids": list(selection.invalid_ids),
            "insight_type_valid": insight_result.model_insight_valid,
            "driver_stage_valid": driver_result.model_driver_valid,
            "deterministic_insight_override": insight_result.deterministic_insight_override,
            "deterministic_driver_override": driver_result.deterministic_driver_override,
            "deterministic_evidence_selection_used": selection.deterministic_selection_used,
            "model_interpretation_used": False,
            "deterministic_interpretation_used": True,
        },
    }
    return answer


def render_headline_template(
    *,
    insight_type: InsightType,
    driver_stage: str,
    items: list[dict[str, Any]],
    message: str = "",
) -> str:
    entity = _entity_name(items[0]) if items else "The active segment"
    lower = (message or "").lower()
    has_tool = any("tool:" in str(item.get("evidence_id") or "") for item in items)

    if insight_type == InsightType.CONTRIBUTION_LEADER:
        if has_tool or "sku" in lower:
            return f"{entity} is a leading verified contributor in this view."
        metric = str((items[0].get("metric") if items else "") or "CM2").upper()
        if metric in {"CM2", "CM2_PCT"}:
            return f"{entity} is a leading CM2 contributor."
        return f"{entity} is a leading verified contributor."
    if insight_type == InsightType.CONTRIBUTION_LAGGARD:
        return f"{entity} is a verified contribution laggard in the current view."
    if insight_type == InsightType.MARGIN_PRESSURE:
        return f"{entity} is a verified margin-pressure source."
    if insight_type == InsightType.NEGATIVE_CONTRIBUTOR:
        return f"{entity} is a verified negative contributor."
    if insight_type == InsightType.POSITIVE_CM1_NEGATIVE_CM2:
        return "Contribution turns negative after CM1."
    if insight_type == InsightType.MARKETING_PRESSURE:
        return "Attributed marketing spend is pressuring CM2 in the current view."
    if insight_type == InsightType.PRODUCT_COST_PRESSURE:
        return f"{entity} shows verified product-cost pressure at gross margin."
    if insight_type == InsightType.CHANNEL_COST_PRESSURE:
        return f"{entity} shows verified channel-cost pressure between gross margin and CM1."
    if insight_type == InsightType.REVENUE_QUALITY_PRESSURE:
        return "Revenue quality pressure is verified in the current view."
    if insight_type == InsightType.GROWTH_DRIVER:
        return f"{entity} is a verified growth driver in the current view."
    if insight_type == InsightType.GROWTH_WITH_MARGIN_COMPRESSION:
        return f"{entity} shows growth with verified margin compression."
    if insight_type == InsightType.MIXED_ECONOMICS:
        return "Verified economics are mixed across margin stages in the current view."
    if insight_type == InsightType.MARGIN_IMPROVEMENT:
        return "Verified margin improved over the compared periods."
    if insight_type == InsightType.MARGIN_DETERIORATION:
        return "Verified margin worsened over the compared periods."
    if insight_type == InsightType.REVENUE_GROWTH:
        return "Verified net revenue grew over the compared periods."
    if insight_type == InsightType.REVENUE_DECLINE:
        return "Verified net revenue declined over the compared periods."
    if insight_type == InsightType.MIXED_CHANGE:
        return "Verified metrics moved in mixed directions over the compared periods."
    if insight_type == InsightType.INSUFFICIENT_EVIDENCE:
        return "Insufficient verified evidence is available for a stronger conclusion."
    return "Current-view contribution is summarized from verified financial facts."


def render_interpretation_template(
    *,
    insight_type: InsightType,
    driver_stage: str,
    items: list[dict[str, Any]],
    message: str = "",
) -> str:
    entity = _entity_name(items[0]) if items else "The active segment"
    stage = normalize_driver_stage(driver_stage).value

    if insight_type == InsightType.CONTRIBUTION_LEADER:
        return f"{entity} is one of the strongest verified contribution sources in the current view."
    if insight_type == InsightType.CONTRIBUTION_LAGGARD:
        return f"{entity} ranks among the weaker verified contribution sources in the current view."
    if insight_type == InsightType.MARGIN_PRESSURE:
        return f"{entity} is a verified source of margin pressure in the current view."
    if insight_type == InsightType.NEGATIVE_CONTRIBUTOR:
        return f"{entity} is a verified negative contributor under the active scope."
    if insight_type == InsightType.POSITIVE_CM1_NEGATIVE_CM2 or (
        insight_type == InsightType.MARKETING_PRESSURE and stage == DriverStage.MARKETING.value
    ):
        return (
            "Contribution remains positive through CM1 and turns negative after attributed marketing."
        )
    if insight_type == InsightType.MARKETING_PRESSURE:
        return "Attributed marketing is the verified pressure stage for the selected evidence."
    if insight_type == InsightType.CHANNEL_COST_PRESSURE:
        return (
            "Margin pressure emerges between gross margin and CM1, indicating selling, fulfilment, "
            "or channel-cost pressure."
        )
    if insight_type == InsightType.PRODUCT_COST_PRESSURE:
        return (
            "Pressure is visible at gross margin, pointing to product-cost economics rather than "
            "downstream selling or marketing costs."
        )
    if insight_type == InsightType.REVENUE_QUALITY_PRESSURE:
        return (
            "Revenue quality is weakening through verified discount, return, RTO, or realisation signals."
        )
    if insight_type == InsightType.GROWTH_DRIVER:
        return f"{entity} contributes verified growth under the active scope."
    if insight_type == InsightType.GROWTH_WITH_MARGIN_COMPRESSION:
        return f"{entity} shows verified growth accompanied by margin compression."
    if insight_type == InsightType.MIXED_ECONOMICS:
        return "Verified signals show mixed economics across contribution stages."
    if insight_type == InsightType.MARGIN_IMPROVEMENT:
        return "The primary verified movement is an improvement in margin over the compared periods."
    if insight_type == InsightType.MARGIN_DETERIORATION:
        return "The primary verified movement is margin deterioration over the compared periods."
    if insight_type == InsightType.REVENUE_GROWTH:
        return "The primary verified movement is revenue growth over the compared periods."
    if insight_type == InsightType.REVENUE_DECLINE:
        return "The primary verified movement is revenue decline over the compared periods."
    if insight_type == InsightType.MIXED_CHANGE:
        return "Verified period-over-period movements are mixed across metrics."
    if insight_type == InsightType.INSUFFICIENT_EVIDENCE:
        return "Available verified evidence is insufficient for a stronger interpretation."
    if any("tool:" in str(item.get("evidence_id") or "") for item in items):
        return "SKU or segment ordering is taken from the verified tool result."
    return "Interpretation is constrained to verified evidence in the active scope."


def _resolve_answer_source(
    *,
    answer_source: str,
    sem: SemanticOutput,
    selection: Any,
    insight_result: Any,
    driver_result: Any,
    forced_tool: bool,
) -> str:
    override = bool(
        insight_result.deterministic_insight_override or driver_result.deterministic_driver_override
    )
    source = answer_source
    if not sem.parse_ok and not sem.evidence_ids and not sem.insight_type:
        source = "deterministic_semantic"
    elif selection.deterministic_selection_used and not sem.evidence_ids:
        source = "deterministic_semantic"
    elif override and source in {
        "model_semantic",
        "model_semantic_with_forced_tool",
        "model",
        "model_with_forced_tool",
    }:
        source = "model_semantic_with_deterministic_override"
    if forced_tool and source == "model_semantic":
        source = "model_semantic_with_forced_tool"
    elif forced_tool and source == "model_semantic_with_deterministic_override":
        source = "model_semantic_with_deterministic_override"
    return source


def _as_capability(raw: Capability | str | None) -> Capability | None:
    if isinstance(raw, Capability):
        return raw
    if not raw:
        return None
    try:
        return Capability(str(raw))
    except ValueError:
        return None


def _render_evidence_item(item: dict[str, Any]) -> dict[str, Any]:
    presented = present_evidence_item(
        {
            "evidence_id": item.get("evidence_id"),
            "metric": item.get("metric"),
            "value": item.get("value"),
            "unit": item.get("unit"),
            "scope": dict(item.get("scope") or {}),
            "entity": item.get("entity"),
            "source": item.get("source"),
            "semantic_roles": list(item.get("semantic_roles") or []),
            "signal_type": item.get("signal_type"),
            "interpretation": item.get("interpretation"),
        }
    )
    return {
        "evidence_id": presented.get("evidence_id"),
        "metric": presented.get("metric"),
        "value": presented.get("value"),
        "unit": presented.get("unit"),
        "scope": presented.get("scope") or {},
        "entity": presented.get("entity"),
        "display": presented.get("display"),
        "interpretation": presented.get("interpretation"),
    }


def _metric_interpretation(item: dict[str, Any]) -> str:
    presented = present_evidence_item(item)
    return str(presented.get("interpretation") or "")


def _entity_name(item: dict[str, Any]) -> str:
    scope = item.get("scope") or {}
    return display_entity_name(item.get("entity") or scope.get("dimension_value"))


def _attribution_caveat(
    context: dict[str, Any],
    envelope: dict[str, Any],
    evidence: list[dict[str, Any]],
    text: str,
) -> str | None:
    attributed = next(
        (
            str(item)
            for item in list(envelope.get("methodology_caveats") or []) + list(context.get("caveats") or [])
            if "attributed" in str(item).lower()
        ),
        None,
    )
    blob = " ".join(
        [
            text,
            " ".join(str(item.get("metric") or "") for item in evidence),
            " ".join(str(item.get("metric") or "") for item in (envelope.get("verified_facts") or [])[:8]),
        ]
    ).lower()
    needs = any(token in blob for token in ("marketing", "cm2", "attributed", "allocation"))
    if not needs:
        return None
    return attributed or "Attributed marketing CM2 is not fully-loaded profitability."


def _semantic_telemetry(
    sem: SemanticOutput,
    selection: Any,
    insight_result: Any,
    driver_result: Any,
) -> dict[str, Any]:
    return {
        "parse_ok": sem.parse_ok,
        "parse_errors": list(sem.parse_errors),
        "requested_insight_type": sem.insight_type,
        "resolved_insight_type": insight_result.insight_type.value if insight_result else None,
        "insight_type_valid": bool(insight_result.model_insight_valid) if insight_result else False,
        "deterministic_insight_override": bool(insight_result.deterministic_insight_override)
        if insight_result
        else False,
        "requested_driver_stage": sem.driver_stage,
        "resolved_driver_stage": driver_result.driver_stage if driver_result else None,
        "driver_stage_valid": bool(driver_result.model_driver_valid) if driver_result else False,
        "deterministic_driver_override": bool(driver_result.deterministic_driver_override)
        if driver_result
        else False,
        "requested_evidence_ids": list(sem.evidence_ids),
        "selected_evidence_ids": list(getattr(selection, "selected_ids", []) or []),
        "invalid_evidence_ids": list(getattr(selection, "invalid_ids", []) or []),
        "deterministic_evidence_selection_used": bool(
            getattr(selection, "deterministic_selection_used", False)
        ),
        "model_interpretation_used": False,
        "deterministic_interpretation_used": True,
        "confidence": sem.confidence,
        "comparison_type": sem.comparison_type,
    }


def _with_semantic_telemetry(
    answer: dict[str, Any],
    sem: SemanticOutput,
    selection: Any,
    insight_result: Any,
    driver_result: Any,
    *,
    answer_source: str,
    mode: str,
) -> dict[str, Any]:
    telemetry = dict(answer.get("telemetry") or {})
    telemetry["answer_source"] = answer_source
    telemetry["answer_mode"] = mode
    telemetry["semantic"] = _semantic_telemetry(sem, selection, insight_result, driver_result)
    rv = dict(telemetry.get("response_validation") or {})
    rv["model_semantic_valid"] = sem.parse_ok
    rv["deterministic_fallback_used"] = False
    rv["fallback_used"] = False
    telemetry["response_validation"] = rv
    answer["telemetry"] = telemetry
    return answer
