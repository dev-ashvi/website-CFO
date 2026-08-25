"""Reconciliation checks that must pass before results are trusted."""

from __future__ import annotations

from typing import Any

import polars as pl

from wyz_analytics.contracts.columns import (
    CM1_COST,
    CM1_COST_COMPONENTS,
    GROSS_REVENUE,
    MARKETING_COST,
    MRP_PER_UNIT,
    NET_REVENUE,
    NET_SALES_PRE_RETURN,
    ORDER_ID,
    PRODUCT_COGS,
    QUANTITY,
    REFUND_AMOUNT,
    SKU_ID,
    TOTAL_CM1_COST,
    UNIT_INBOUND_FREIGHT,
    UNIT_MANUFACTURING_COGS,
    UNIT_OTHER_DIRECT_COGS,
    UNIT_PRIMARY_PACKAGING,
    UNIT_TOTAL_COGS,
    SourceTables,
)
from wyz_analytics.contracts.results import ReconciliationReport, Waterfall

ABS_TOL = 0.05  # rupees


def _check(name: str, actual: float, expected: float, abs_tol: float = ABS_TOL) -> dict[str, Any]:
    delta = float(actual) - float(expected)
    return {
        "name": name,
        "actual": float(actual),
        "expected": float(expected),
        "delta": delta,
        "ok": abs(delta) <= abs_tol,
    }


def reconcile(
    sources: SourceTables,
    lines: pl.DataFrame,
    waterfall: Waterfall,
    marketing_recon: dict[str, float],
) -> ReconciliationReport:
    checks: list[dict[str, Any]] = []
    sku = sources.sku_master
    cogs_parts = (
        UNIT_MANUFACTURING_COGS,
        UNIT_PRIMARY_PACKAGING,
        UNIT_INBOUND_FREIGHT,
        UNIT_OTHER_DIRECT_COGS,
        UNIT_TOTAL_COGS,
    )
    if all(col in sku.columns for col in cogs_parts):
        sku_cogs_identity = sku.select(
            (
                pl.col(UNIT_MANUFACTURING_COGS)
                + pl.col(UNIT_PRIMARY_PACKAGING)
                + pl.col(UNIT_INBOUND_FREIGHT)
                + pl.col(UNIT_OTHER_DIRECT_COGS)
                - pl.col(UNIT_TOTAL_COGS)
            )
            .abs()
            .max()
            .alias("max_abs")
        ).item()
        checks.append(_check("sku_unit_cogs_identity", float(sku_cogs_identity or 0.0), 0.0, abs_tol=0.02))

    component_cols = [col for col in CM1_COST_COMPONENTS if col in sources.channel_settlements.columns]
    if component_cols and TOTAL_CM1_COST in sources.channel_settlements.columns:
        settlement_components = sources.channel_settlements.select(
            pl.sum_horizontal(component_cols).sum().alias("components"),
            pl.col(TOTAL_CM1_COST).sum().alias("total"),
        ).row(0, named=True)
        checks.append(
            _check("cm1_components_match_total", settlement_components["components"], settlement_components["total"])
        )

    order_cols = sources.order_lines.columns
    if {QUANTITY, MRP_PER_UNIT, GROSS_REVENUE} <= set(order_cols):
        qty_mrp = sources.order_lines.select(
            (pl.col(QUANTITY) * pl.col(MRP_PER_UNIT)).sum().alias("qty_mrp"),
            pl.col(GROSS_REVENUE).sum().alias("gross"),
        ).row(0, named=True)
        checks.append(_check("gross_revenue_source", waterfall.gross_revenue, qty_mrp["gross"]))
        checks.append(_check("gross_revenue_qty_mrp", qty_mrp["gross"], qty_mrp["qty_mrp"], abs_tol=1.0))
    elif GROSS_REVENUE in order_cols:
        checks.append(
            _check(
                "gross_revenue_source",
                waterfall.gross_revenue,
                float(sources.order_lines.select(pl.col(GROSS_REVENUE).sum()).item()),
            )
        )

    if {GROSS_REVENUE, "discount_amount", REFUND_AMOUNT, NET_REVENUE} <= set(order_cols):
        net_identity = sources.order_lines.select(
            (
                pl.col(GROSS_REVENUE)
                - pl.col("discount_amount")
                - pl.col(REFUND_AMOUNT)
                - pl.col(NET_REVENUE)
            )
            .abs()
            .sum()
            .alias("abs_sum")
        ).item()
        checks.append(_check("net_revenue_identity", net_identity, 0.0, abs_tol=1.0))

    if {GROSS_REVENUE, "discount_amount", NET_SALES_PRE_RETURN} <= set(order_cols):
        pre_return_identity = sources.order_lines.select(
            (pl.col(GROSS_REVENUE) - pl.col("discount_amount") - pl.col(NET_SALES_PRE_RETURN))
            .abs()
            .sum()
            .alias("abs_sum")
        ).item()
        checks.append(_check("pre_return_identity", pre_return_identity, 0.0, abs_tol=1.0))

    ol_orders = sources.order_lines.select(pl.col(ORDER_ID).n_unique()).item()
    st_orders = sources.channel_settlements.select(pl.col(ORDER_ID).n_unique()).item()
    unmatched_skus = (
        sources.order_lines.join(sources.sku_master.select(SKU_ID), on=SKU_ID, how="anti").height
    )

    checks.extend(
        [
            _check("product_cogs_additive", waterfall.product_cogs, float(lines.select(pl.col(PRODUCT_COGS).sum()).item())),
            _check(
                "cm1_costs_match_settlements",
                waterfall.cm1_costs,
                float(sources.channel_settlements.select(pl.col(TOTAL_CM1_COST).sum()).item()),
            ),
            _check(
                "cm1_costs_allocated_to_lines",
                float(lines.select(pl.col(CM1_COST).sum()).item()),
                float(sources.channel_settlements.select(pl.col(TOTAL_CM1_COST).sum()).item()),
            ),
            _check("marketing_allocated_to_source", marketing_recon["allocated_spend"], marketing_recon["source_spend"]),
            _check("unmapped_platform_spend", marketing_recon["unmapped_platform_spend"], 0.0),
            _check("marketing_line_sum", float(lines.select(pl.col(MARKETING_COST).sum()).item()), waterfall.marketing_spend),
            _check("order_settlement_grain", float(ol_orders), float(st_orders)),
            _check("unmatched_sku_rows", float(unmatched_skus), 0.0),
            _check(
                "waterfall_net_revenue",
                waterfall.net_revenue,
                waterfall.gross_revenue - waterfall.discounts - waterfall.returns_rto_cancellations,
            ),
            _check("waterfall_gross_margin", waterfall.gross_margin, waterfall.net_revenue - waterfall.product_cogs),
            _check("waterfall_cm1", waterfall.cm1, waterfall.gross_margin - waterfall.cm1_costs),
            _check("waterfall_cm2", waterfall.cm2, waterfall.cm1 - waterfall.marketing_spend),
        ]
    )
    return ReconciliationReport(ok=all(item["ok"] for item in checks), checks=tuple(checks))
