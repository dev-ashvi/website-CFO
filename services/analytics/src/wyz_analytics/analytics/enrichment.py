"""Deterministic post-engine analytics for Revenue & Margin explorers.

Aggregates and classifies engine-produced facts. Does not change financial formulas.
"""

from __future__ import annotations

from typing import Any

from wyz_analytics.analytics.classification import classify_profitability
from wyz_analytics.analytics.cost_breakdown import build_cost_breakdown
from wyz_analytics.analytics.growth import enrich_monthly_growth, growth_for_dimension_rows
from wyz_analytics.analytics.shares import enrich_dimension_rows, mix_shares
from wyz_analytics.contracts.results import EngineResult

DIMENSION_CONFIG = {
    "channel": {"key": "channel", "label": "Channel", "rows": lambda r: r.by_channel},
    "category": {"key": "category", "label": "Category", "rows": lambda r: r.by_category},
    "sku": {"key": "sku_id", "label": "SKU", "rows": lambda r: r.by_sku},
}


def _safe_div(numer: float | None, denom: float | None) -> float | None:
    if numer is None or denom is None or denom == 0:
        return None
    return float(numer) / float(denom)


def enrich_company(waterfall: dict[str, float], identity: dict[str, Any], totals: dict[str, float]) -> dict[str, Any]:
    orders = identity.get("orders")
    units = identity.get("units")
    gross = waterfall.get("gross_revenue")
    net = waterfall.get("net_revenue")
    return {
        "gross_revenue": gross,
        "net_revenue": net,
        "orders": orders,
        "units": units,
        "customers": identity.get("customers"),
        "gross_aov": _safe_div(gross, orders),
        "net_aov": _safe_div(net, orders),
        "units_per_order": _safe_div(units, orders),
        "gross_margin": waterfall.get("gross_margin"),
        "gross_margin_pct": waterfall.get("gross_margin_pct"),
        "cm1": waterfall.get("cm1"),
        "cm1_pct": waterfall.get("cm1_pct"),
        "marketing_spend": waterfall.get("marketing_spend"),
        "marketing_pct": waterfall.get("marketing_pct"),
        "cm2": waterfall.get("cm2"),
        "cm2_pct": waterfall.get("cm2_pct"),
        "discount_pct": _safe_div(waterfall.get("discounts"), gross),
        "return_pct": _safe_div(totals.get("return_qty"), totals.get("units")),
        "rto_pct": _safe_div(totals.get("rto_qty"), totals.get("units")),
        "revenue_realisation_pct": _safe_div(net, gross),
    }


def _sum_monthly_totals(by_month: tuple[dict[str, Any], ...]) -> dict[str, float]:
    totals = {"return_qty": 0.0, "rto_qty": 0.0, "units": 0.0}
    for row in by_month:
        totals["return_qty"] += float(row.get("return_qty") or 0)
        totals["rto_qty"] += float(row.get("rto_qty") or 0)
        totals["units"] += float(row.get("units") or 0)
    return totals


def _concentration(rows: list[dict[str, Any]], metric: str, *, limit: int = 5) -> dict[str, Any]:
    material = [row for row in rows if abs(float(row.get(metric) or 0)) >= 1]
    total = sum(float(row.get(metric) or 0) for row in material)
    ranked = sorted(material, key=lambda row: float(row.get(metric) or 0), reverse=True)
    top = []
    for row in ranked[:limit]:
        value = float(row.get(metric) or 0)
        top.append(
            {
                "entity": row.get("_entity"),
                "value": value,
                "share_of_total": None if total == 0 else value / total,
            }
        )
    negative = [
        {
            "entity": row.get("_entity"),
            "value": float(row.get(metric) or 0),
            "share_of_total": None if total == 0 else float(row.get(metric) or 0) / total,
        }
        for row in sorted(material, key=lambda row: float(row.get(metric) or 0))
        if float(row.get(metric) or 0) < 0
    ][:limit]
    return {"metric": metric, "total": total, "top": top, "negative": negative}


def build_explorer_analytics(
    engine_result: EngineResult,
    *,
    lines=None,
    sources=None,
) -> dict[str, Any]:
    waterfall = engine_result.waterfall.to_dict()
    by_month = tuple(dict(row) for row in engine_result.by_month)
    monthly_trend, growth_meta = enrich_monthly_growth(by_month)
    totals = _sum_monthly_totals(by_month)

    identity = {
        "orders": sum(int(row.get("orders") or 0) for row in by_month) or None,
        "units": totals["units"] or None,
        "customers": None,
    }
    if engine_result.by_channel:
        identity["customers"] = max(int(row.get("customers") or 0) for row in engine_result.by_channel)

    company = enrich_company(waterfall, identity, totals)
    gaps: list[str] = []
    if not growth_meta.get("yoy_available"):
        gaps.append("yoy_growth_requires_12_month_history")

    dimensions: dict[str, Any] = {}
    channel_month = list(engine_result.extras.get("by_channel_month") or [])
    category_month = list(engine_result.extras.get("by_category_month") or [])

    for dim_id, cfg in DIMENSION_CONFIG.items():
        raw_rows = [dict(row) for row in cfg["rows"](engine_result)]
        enriched = enrich_dimension_rows(raw_rows, cfg["key"])
        for row in enriched:
            row["profitability_class"] = classify_profitability(row)
        month_slices = channel_month if dim_id == "channel" else category_month if dim_id == "category" else []
        if month_slices:
            enriched = growth_for_dimension_rows(enriched, month_slices, cfg["key"])
        else:
            for row in enriched:
                row["growth"] = {"available": False, "reason": "monthly_dimensional_history_not_available"}
        dimensions[dim_id] = {
            "id": dim_id,
            "label": cfg["label"],
            "entity_key": cfg["key"],
            "rows": enriched,
            "mix": mix_shares(enriched),
        }

    concentration = {
        "gross_margin": _concentration(dimensions["channel"]["rows"], "gross_margin"),
        "cm1": _concentration(dimensions["channel"]["rows"], "cm1"),
        "cm2": _concentration(dimensions["channel"]["rows"], "cm2"),
    }

    cost_breakdown = build_cost_breakdown(lines=lines, sources=sources, net_revenue=waterfall.get("net_revenue"))

    return {
        "gaps": gaps,
        "company": company,
        "monthly_trend": monthly_trend,
        "growth": growth_meta,
        "dimensions": dimensions,
        "concentration": concentration,
        "cost_breakdown": cost_breakdown,
    }
