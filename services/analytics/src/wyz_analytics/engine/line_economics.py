"""Join SKU master + settlements and compute line-level GM / CM1."""

from __future__ import annotations

import polars as pl

from wyz_analytics.contracts.columns import (
    CM1,
    CM1_COST,
    GROSS_MARGIN,
    NET_REVENUE,
    NET_SALES_PRE_RETURN,
    ORDER_DATE,
    ORDER_ID,
    ORDER_LINE_ID,
    ORDER_MONTH,
    ORDER_STATUS,
    PRODUCT_COGS,
    QUANTITY,
    RETURN_QTY,
    RTO_QTY,
    SKU_ID,
    TOTAL_CM1_COST,
    UNIT_TOTAL_COGS,
    UNITS_RETAINED,
    SourceTables,
)
from wyz_analytics.engine.definitions import CANCELLED_STATUS


def build_line_economics(sources: SourceTables) -> pl.DataFrame:
    sku_cols = [col for col in sources.sku_master.columns if col != SKU_ID]
    sku = sources.sku_master.select([SKU_ID, *sku_cols])

    lines = sources.order_lines.join(sku, on=SKU_ID, how="left")
    unmatched_sku = lines.filter(pl.col(UNIT_TOTAL_COGS).is_null()).height
    if unmatched_sku:
        raise ValueError(f"{unmatched_sku} order lines have no SKU master match")

    settlement_keep = [ORDER_ID, TOTAL_CM1_COST]
    extra_settlement = [
        col
        for col in sources.channel_settlements.columns
        if col not in settlement_keep and col not in {"channel", "platform"}
    ]
    settlements = sources.channel_settlements.select(settlement_keep + extra_settlement)
    lines = lines.join(settlements, on=ORDER_ID, how="left", suffix="_settlement")
    unmatched_orders = lines.filter(pl.col(TOTAL_CM1_COST).is_null()).height
    if unmatched_orders:
        raise ValueError(f"{unmatched_orders} order lines have no channel settlement match")

    cancelled = pl.col(ORDER_STATUS) == CANCELLED_STATUS
    retained = (
        pl.when(cancelled)
        .then(pl.lit(0.0))
        .otherwise(
            pl.max_horizontal(
                pl.col(QUANTITY) - pl.col(RETURN_QTY) - pl.col(RTO_QTY),
                pl.lit(0),
            )
        )
        .cast(pl.Float64)
        .alias(UNITS_RETAINED)
    )

    order_sales = (
        pl.col(NET_SALES_PRE_RETURN).sum().over(ORDER_ID).alias("_order_sales")
    )
    line_count = pl.len().over(ORDER_ID)
    sales_share = (
        pl.when(pl.col("_order_sales") > 0)
        .then(pl.col(NET_SALES_PRE_RETURN) / pl.col("_order_sales"))
        .otherwise(1.0 / line_count)
    )

    return (
        lines.with_columns(
            retained,
            order_sales,
            pl.col(ORDER_DATE).dt.strftime("%Y-%m").alias(ORDER_MONTH),
        )
        .with_columns(
            (pl.col(UNITS_RETAINED) * pl.col(UNIT_TOTAL_COGS)).alias(PRODUCT_COGS),
            (sales_share * pl.col(TOTAL_CM1_COST)).alias(CM1_COST),
        )
        .with_columns(
            (pl.col(NET_REVENUE) - pl.col(PRODUCT_COGS)).alias(GROSS_MARGIN),
        )
        .with_columns(
            (pl.col(GROSS_MARGIN) - pl.col(CM1_COST)).alias(CM1),
        )
        .drop("_order_sales")
        .sort([ORDER_ID, ORDER_LINE_ID])
    )
