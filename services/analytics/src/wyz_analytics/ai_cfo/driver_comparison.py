"""Deterministic product-vs-marketing driver comparison answers."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.presentation import dedupe_evidence_items, present_evidence_item
from wyz_analytics.ai_cfo.semantic_contract import InsightType


def _summary(context: dict[str, Any]) -> dict[str, Any]:
    return dict(context.get("summary") or {})


def _signal_types(context: dict[str, Any]) -> set[str]:
    return {str(s.get("signal_type") or "") for s in (context.get("signals") or [])}


def _pick_summary_evidence(context: dict[str, Any], metrics: list[str]) -> list[dict[str, Any]]:
    envelope = context.get("evidence_envelope") or {}
    by_id = {str(item.get("evidence_id")): item for item in (envelope.get("verified_facts") or [])}
    out: list[dict[str, Any]] = []
    for metric in metrics:
        item = by_id.get(f"summary:{metric}")
        if item:
            out.append(present_evidence_item(item))
            continue
        summary = _summary(context)
        if summary.get(metric) is None:
            continue
        out.append(
            present_evidence_item(
                {
                    "evidence_id": f"summary:{metric}",
                    "metric": metric,
                    "value": summary.get(metric),
                    "scope": {"dimension_value": "This view"},
                    "source": "current_financial_view",
                }
            )
        )
    return dedupe_evidence_items(out)


def compose_driver_comparison_answer(
    *,
    context: dict[str, Any],
    message: str = "",
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Explicitly answer product economics vs marketing when stage evidence supports it."""
    _ = message
    summary = _summary(context)
    signals = _signal_types(context)
    gm_pct = summary.get("gross_margin_pct")
    cm1_pct = summary.get("cm1_pct")
    cm2_pct = summary.get("cm2_pct")
    mkt_pct = summary.get("marketing_pct")
    cm1 = summary.get("cm1")
    cm2 = summary.get("cm2")

    marketing_pressure = (
        "MARKETING_PRESSURE" in signals
        or "positive_cm1_negative_cm2" in signals
        or (
            cm1 is not None
            and cm2 is not None
            and float(cm1) > 0
            and float(cm2) <= 0
        )
        or (
            mkt_pct is not None
            and cm2_pct is not None
            and float(mkt_pct) >= 0.25
            and float(cm2_pct) < float(cm1_pct or 0)
        )
    )
    product_pressure = (
        "PRODUCT_COGS_PRESSURE" in signals
        or "negative_gross_margin" in signals
        or (gm_pct is not None and float(gm_pct) < 0.35)
    )
    channel_pressure = "CHANNEL_COST_PRESSURE" in signals or (
        gm_pct is not None
        and cm1_pct is not None
        and float(gm_pct) - float(cm1_pct) > 0.15
        and float(cm1_pct) < 0.25
    )

    if marketing_pressure and not product_pressure:
        headline = "Marketing is the clearer pressure point in this view."
        interpretation = (
            "Contribution remains positive through CM1 and weakens after attributed marketing."
        )
        insight = InsightType.MARKETING_PRESSURE.value
        driver = "MARKETING"
        metrics = ["cm1_pct", "marketing_pct", "cm2_pct"]
    elif product_pressure and not marketing_pressure:
        headline = "Product economics are the clearer pressure point in this view."
        interpretation = (
            "Pressure is visible at gross margin, pointing to product-cost economics rather than "
            "downstream marketing alone."
        )
        insight = InsightType.PRODUCT_COST_PRESSURE.value
        driver = "PRODUCT"
        metrics = ["gross_margin_pct", "cm1_pct", "cm2_pct"]
    elif marketing_pressure and product_pressure:
        headline = "Pressure is visible in both product economics and marketing."
        interpretation = (
            "Verified stage metrics show material pressure both at gross margin and after "
            "attributed marketing."
        )
        insight = InsightType.MIXED_ECONOMICS.value
        driver = "MIXED"
        metrics = ["gross_margin_pct", "marketing_pct", "cm2_pct"]
    elif channel_pressure and not marketing_pressure:
        headline = "Channel costs are the clearer pressure point versus marketing in this view."
        interpretation = (
            "Margin pressure emerges between gross margin and CM1, before attributed marketing."
        )
        insight = InsightType.CHANNEL_COST_PRESSURE.value
        driver = "CHANNEL"
        metrics = ["gross_margin_pct", "cm1_pct", "marketing_pct"]
    else:
        headline = "The current evidence does not clearly isolate product economics versus marketing."
        interpretation = (
            "Verified stage metrics do not show a decisive single-side pressure signal for this comparison."
        )
        insight = InsightType.INSUFFICIENT_EVIDENCE.value
        driver = "UNKNOWN"
        metrics = ["cm1_pct", "marketing_pct", "cm2_pct"]

    evidence = _pick_summary_evidence(context, metrics)
    answer = {
        "headline": headline,
        "evidence": evidence,
        "driver_stage": driver,
        "interpretation": interpretation,
        "drivers": driver,
        "caveat": next(
            (
                str(item)
                for item in (context.get("caveats") or [])
                if "attributed" in str(item).lower()
            ),
            "Attributed marketing CM2 is not fully-loaded profitability."
            if driver in {"MARKETING", "MIXED"}
            else None,
        ),
        "methodology": None,
        "context_version": (context.get("meta") or {}).get("context_version"),
        "tool_calls": list(tool_calls or []),
    }
    if answer["caveat"]:
        answer["methodology"] = answer["caveat"]
    answer["telemetry"] = {
        "answer_source": "deterministic_driver_comparison",
        "answer_mode": "semantic",
        "resolved_intent": "DRIVER_DIAGNOSIS",
        "intent_source": "explicit_user_text",
        "evidence_source": "current_financial_view",
        "semantic": {
            "resolved_insight_type": insight,
            "deterministic_insight_override": True,
            "selected_evidence_ids": [item.get("evidence_id") for item in evidence],
        },
        "response_validation": {
            "valid": True,
            "violations": [],
            "model_interpretation_used": False,
            "deterministic_interpretation_used": True,
            "numeric_claims_generated": len(evidence),
            "evidence_items_used": len(evidence),
        },
    }
    return answer
