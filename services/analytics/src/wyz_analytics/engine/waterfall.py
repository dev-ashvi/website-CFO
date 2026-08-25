"""Aggregate line facts into company and dimensional waterfalls."""

from __future__ import annotations

from collections.abc import Sequence

import polars as pl

from wyz_analytics.contracts.columns import (
    CATEGORY,
    CHANNEL,
    CM1,
    CM1_COST,
    CUSTOMER_ID,
    DISCOUNT_AMOUNT,
    GROSS_MARGIN,
    GROSS_REVENUE,
    MARKETING_COST,
    NET_REVENUE,
    ORDER_ID,
    ORDER_MONTH,
    PRODUCT_COGS,
    PRODUCT_NAME,
    PRODUCT_STATUS,
    QUANTITY,
    REFUND_AMOUNT,
    RETURN_QTY,
    RTO_QTY,
    SKU_ID,
    SUBCATEGORY,
    UNITS_RETAINED,
)
from wyz_analytics.contracts.results import Waterfall


def company_waterfall(lines: pl.DataFrame) -> Waterfall:
    row = lines.select(
        pl.col(GROSS_REVENUE).sum().alias("gross_revenue"),
        pl.col(DISCOUNT_AMOUNT).sum().alias("discounts"),
        pl.col(REFUND_AMOUNT).sum().alias("returns_rto_cancellations"),
        pl.col(NET_REVENUE).sum().alias("net_revenue"),
        pl.col(PRODUCT_COGS).sum().alias("product_cogs"),
        pl.col(GROSS_MARGIN).sum().alias("gross_margin"),
        pl.col(CM1_COST).sum().alias("cm1_costs"),
        pl.col(CM1).sum().alias("cm1"),
        pl.col(MARKETING_COST).sum().alias("marketing_spend"),
        (pl.col(CM1).sum() - pl.col(MARKETING_COST).sum()).alias("cm2"),
    ).row(0, named=True)
    return Waterfall(
        gross_revenue=float(row["gross_revenue"]),
        discounts=float(row["discounts"]),
        returns_rto_cancellations=float(row["returns_rto_cancellations"]),
        net_revenue=float(row["net_revenue"]),
        product_cogs=float(row["product_cogs"]),
        gross_margin=float(row["gross_margin"]),
        cm1_costs=float(row["cm1_costs"]),
        cm1=float(row["cm1"]),
        marketing_spend=float(row["marketing_spend"]),
        cm2=float(row["cm2"]),
    )


def _pct(numer: str, denom: str = NET_REVENUE) -> pl.Expr:
    return (
        pl.when(pl.col(denom) == 0)
        .then(0.0)
        .otherwise(pl.col(numer) / pl.col(denom))
    )


def _agg(lines: pl.DataFrame, keys: Sequence[str], extra: Sequence[pl.Expr] | None = None) -> pl.DataFrame:
    exprs = [
        pl.col(ORDER_ID).n_unique().alias("orders"),
        pl.col(CUSTOMER_ID).n_unique().alias("customers"),
        pl.col(QUANTITY).sum().alias("units"),
        pl.col(UNITS_RETAINED).sum().alias("units_retained"),
        pl.col(GROSS_REVENUE).sum().alias(GROSS_REVENUE),
        pl.col(DISCOUNT_AMOUNT).sum().alias(DISCOUNT_AMOUNT),
        pl.col(REFUND_AMOUNT).sum().alias(REFUND_AMOUNT),
        pl.col(NET_REVENUE).sum().alias(NET_REVENUE),
        pl.col(PRODUCT_COGS).sum().alias(PRODUCT_COGS),
        pl.col(GROSS_MARGIN).sum().alias(GROSS_MARGIN),
        pl.col(CM1_COST).sum().alias(CM1_COST),
        pl.col(CM1).sum().alias(CM1),
        pl.col(MARKETING_COST).sum().alias(MARKETING_COST),
        (pl.col(CM1).sum() - pl.col(MARKETING_COST).sum()).alias("cm2"),
        pl.col(RETURN_QTY).sum().alias(RETURN_QTY),
        pl.col(RTO_QTY).sum().alias(RTO_QTY),
        *(extra or ()),
    ]
    frame = lines.group_by(list(keys)).agg(exprs)
    return frame.with_columns(
        pl.when(pl.col("orders") == 0)
        .then(0.0)
        .otherwise(pl.col(GROSS_REVENUE) / pl.col("orders"))
        .alias("aov"),
        _pct(DISCOUNT_AMOUNT, GROSS_REVENUE).alias("discount_pct"),
        _pct(RETURN_QTY, "units").alias("return_pct"),
        _pct(RTO_QTY, "units").alias("rto_pct"),
        _pct(GROSS_MARGIN).alias("gross_margin_pct"),
        _pct(CM1).alias("cm1_pct"),
        _pct("cm2").alias("cm2_pct"),
        _pct(MARKETING_COST).alias("marketing_pct"),
    )


def by_channel(lines: pl.DataFrame) -> pl.DataFrame:
    return _agg(lines, [CHANNEL]).sort(NET_REVENUE, descending=True)


def by_category(lines: pl.DataFrame) -> pl.DataFrame:
    return _agg(lines, [CATEGORY]).sort(NET_REVENUE, descending=True)


def by_sku(lines: pl.DataFrame) -> pl.DataFrame:
    extras = [
        pl.col(PRODUCT_NAME).first(),
        pl.col(CATEGORY).first(),
        pl.col(SUBCATEGORY).first(),
        pl.col(PRODUCT_STATUS).first(),
    ]
    return _agg(lines, [SKU_ID], extras).sort("cm2", descending=True)


def by_month(lines: pl.DataFrame) -> pl.DataFrame:
    return _agg(lines, [ORDER_MONTH]).sort(ORDER_MONTH)


def by_channel_month(lines: pl.DataFrame) -> pl.DataFrame:
    return _agg(lines, [CHANNEL, ORDER_MONTH]).sort([CHANNEL, ORDER_MONTH])


def by_category_month(lines: pl.DataFrame) -> pl.DataFrame:
    return _agg(lines, [CATEGORY, ORDER_MONTH]).sort([CATEGORY, ORDER_MONTH])
