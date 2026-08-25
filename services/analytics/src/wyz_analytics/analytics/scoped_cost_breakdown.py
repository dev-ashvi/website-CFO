"""Scoped cost breakdown from filtered financial facts (Phase 1C).

Traced production path (legacy, job-time, unscoped):
  build_line_facts
    → build_analysis_result / build_explorer_analytics
        → analytics.cost_breakdown.build_cost_breakdown(lines, sources, net_revenue)
        → result.explorers.cost_breakdown
    → CostBreakdownPanel read static explorers.cost_breakdown (ignored UI filters)

Root cause of scope leak: enrichment aggregates full-company line/settlement
rows once at analysis time; the Margin panel never re-queried filtered facts.

This module aggregates ABSOLUTE component columns already on the fact frame
(see facts.schema PRODUCT_COGS_COMPONENTS / CM1_COMPONENT_MAP) under the
canonical FinancialScope / apply_filters path. It does NOT re-run engine
formulas or read raw client files.
"""

from __future__ import annotations

from typing import Any

import polars as pl

from wyz_analytics.ai_cfo.financial_scope import build_financial_scope
from wyz_analytics.facts.models import validate_query
from wyz_analytics.facts.query import INR_TOL, apply_filters
from wyz_analytics.facts.schema import CM1_COMPONENT_MAP, PRODUCT_COGS_COMPONENTS

# Display labels for fact-frame component columns (presentation only).
PRODUCT_COGS_LABELS: dict[str, str] = {
    "manufacturing_cogs": "Manufacturing",
    "primary_packaging": "Primary Packaging",
    "inbound_freight": "Inbound Freight",
    "other_direct_cogs": "Other Direct COGS",
}

CM1_COST_LABELS: dict[str, str] = {
    "marketplace_commission": "Marketplace Commission",
    "transaction_fee": "Transaction Fee",
    "fulfilment": "Fulfilment",
    "forward_shipping": "Forward Shipping",
    "reverse_shipping": "Reverse Shipping",
    "rto_cost": "RTO",
    "payment_gateway_fee": "Payment Gateway",
    "cod_fee": "COD",
    "pick_pack_fee": "Pick & Pack",
    "warehouse_fee": "Warehouse",
    "packaging_cost": "Packaging",
    "penalty": "Penalty",
    "other_variable_cost": "Other Variable Costs",
}

PRODUCT_COGS_FACT_KEYS = tuple(key for key, _ in PRODUCT_COGS_COMPONENTS)
CM1_COST_FACT_KEYS = tuple(CM1_COMPONENT_MAP.keys())


def _pct_of_net(value: float, net_revenue: float | None) -> float | None:
    if net_revenue is None or net_revenue == 0:
        return None
    return value / net_revenue


def _sum_column(frame: pl.DataFrame, column: str) -> float | None:
    if column not in frame.columns:
        return None
    return float(frame[column].sum() or 0)


def _component_rows(
    frame: pl.DataFrame,
    *,
    keys: tuple[str, ...],
    labels: dict[str, str],
    net_revenue: float | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    unavailable: list[str] = []
    for key in keys:
        if key not in frame.columns:
            unavailable.append(key)
            continue
        value = float(frame[key].sum() or 0)
        rows.append(
            {
                "key": key,
                "label": labels.get(key, key),
                "value": value,
                "pct_of_net_revenue": _pct_of_net(value, net_revenue),
            }
        )
    return rows, unavailable


def _recon_status(delta: float | None, *, available: bool) -> str:
    if not available or delta is None:
        return "unavailable"
    if abs(delta) <= INR_TOL:
        return "ok"
    return "mismatch"


def build_scoped_cost_breakdown(
    facts: pl.DataFrame,
    *,
    dataset_id: str | None,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Aggregate cost components for the active FinancialScope.

    Never falls back to company-wide enrichment when the filtered frame is empty.
    """
    validated = validate_query({"filters": filters or {}, "metrics": ["net_revenue", "product_cogs", "cm1_cost"]})
    scope = build_financial_scope(dataset_id=dataset_id, filters=validated["filters"])
    filtered = apply_filters(facts, scope["filters"])

    limitations: list[str] = []
    empty = filtered.height == 0

    if empty:
        return {
            "scope_hash": scope["scope_hash"],
            "scope": {
                "dataset_id": scope.get("dataset_id"),
                "filters": scope.get("filters") or {},
                "scope_hash": scope["scope_hash"],
            },
            "row_count": 0,
            "net_revenue": None,
            "product_cogs": {"total": None, "components": []},
            "cm1_costs": {"total": None, "components": []},
            "reconciliation": {
                "product_cogs_delta": None,
                "cm1_cost_delta": None,
                "product_cogs_status": "empty",
                "cm1_cost_status": "empty",
                "status": "empty",
            },
            "limitations": ["No financial facts match the active filters."],
            "available": False,
        }

    net_revenue = _sum_column(filtered, "net_revenue")
    product_total = _sum_column(filtered, "product_cogs")
    cm1_total = _sum_column(filtered, "cm1_cost")

    product_rows, product_missing = _component_rows(
        filtered,
        keys=PRODUCT_COGS_FACT_KEYS,
        labels=PRODUCT_COGS_LABELS,
        net_revenue=net_revenue,
    )
    cm1_rows, cm1_missing = _component_rows(
        filtered,
        keys=CM1_COST_FACT_KEYS,
        labels=CM1_COST_LABELS,
        net_revenue=net_revenue,
    )

    if product_missing:
        limitations.append(
            "Product COGS component columns unavailable on facts: " + ", ".join(product_missing)
        )
    if cm1_missing:
        limitations.append(
            "CM1 cost component columns unavailable on facts: " + ", ".join(cm1_missing)
        )
    if not product_rows and product_total is not None:
        limitations.append("Product COGS total is available; component split is unavailable.")
    if not cm1_rows and cm1_total is not None:
        limitations.append("CM1 cost total is available; component split is unavailable.")

    product_sum = sum(row["value"] for row in product_rows) if product_rows else None
    cm1_sum = sum(row["value"] for row in cm1_rows) if cm1_rows else None
    product_delta = (
        None if product_sum is None or product_total is None else float(product_sum - product_total)
    )
    cm1_delta = None if cm1_sum is None or cm1_total is None else float(cm1_sum - cm1_total)

    product_status = _recon_status(product_delta, available=bool(product_rows) and product_total is not None)
    cm1_status = _recon_status(cm1_delta, available=bool(cm1_rows) and cm1_total is not None)
    overall = "ok"
    if product_status == "mismatch" or cm1_status == "mismatch":
        overall = "mismatch"
    elif product_status == "unavailable" and cm1_status == "unavailable":
        overall = "unavailable"
    elif product_status != "ok" or cm1_status != "ok":
        overall = "partial"

    return {
        "scope_hash": scope["scope_hash"],
        "scope": {
            "dataset_id": scope.get("dataset_id"),
            "filters": scope.get("filters") or {},
            "scope_hash": scope["scope_hash"],
        },
        "row_count": int(filtered.height),
        "net_revenue": net_revenue,
        "product_cogs": {
            "total": product_total,
            "components": product_rows,
        },
        "cm1_costs": {
            "total": cm1_total,
            "components": cm1_rows,
        },
        "reconciliation": {
            "product_cogs_delta": product_delta,
            "cm1_cost_delta": cm1_delta,
            "product_cogs_status": product_status,
            "cm1_cost_status": cm1_status,
            "status": overall,
        },
        "limitations": limitations,
        "available": bool(product_rows or cm1_rows or product_total is not None or cm1_total is not None),
    }
