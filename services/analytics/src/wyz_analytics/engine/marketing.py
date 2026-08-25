"""Allocate campaign spend onto order lines for CM2.

Join rule for CM2 (golden workbook):
  1. Map marketing platform → selling channel.
  2. If the campaign has a hero SKU, allocate to that SKU's lines in the channel.
  3. Else if it has a real product category, allocate to that category in the channel.
  4. Else allocate across all lines in the channel.
  5. Weights are line NET_REVENUE. Allocation is over the full analysis window
     (campaign month is not used for CM2).

CAMPAIGN_ID on order lines is not the CM2 allocation key. It is retained on
the line facts for later campaign-performance analytics.
"""

from __future__ import annotations

import polars as pl

from wyz_analytics.contracts.columns import (
    CATEGORY,
    CHANNEL,
    MARKETING_COST,
    NET_REVENUE,
    ORDER_LINE_ID,
    PRODUCT_CATEGORY,
    SKU_ID,
    SPEND,
)
from wyz_analytics.engine.definitions import ALL_CATEGORIES


def _blank_to_null(column: str) -> pl.Expr:
    return (
        pl.when(
            pl.col(column).is_null()
            | (pl.col(column).cast(pl.Utf8).str.strip_chars() == "")
        )
        .then(None)
        .otherwise(pl.col(column).cast(pl.Utf8).str.strip_chars())
    )


def _allocate_pool(
    lines: pl.DataFrame,
    spend: pl.DataFrame,
    keys: list[str],
    spend_alias: str,
) -> pl.DataFrame:
    if spend.height == 0:
        return lines.with_columns(pl.lit(0.0).alias(spend_alias))

    pooled = spend.group_by(keys).agg(pl.col(SPEND).sum())
    matched = lines.join(pooled, on=keys, how="left")
    weight_total = pl.col(NET_REVENUE).sum().over(keys)
    allocated = (
        pl.when(pl.col(SPEND).is_null() | (weight_total <= 0))
        .then(0.0)
        .otherwise(pl.col(SPEND) * (pl.col(NET_REVENUE) / weight_total))
        .alias(spend_alias)
    )
    return matched.with_columns(allocated).drop(SPEND)


def allocate_marketing(
    lines: pl.DataFrame,
    marketing: pl.DataFrame,
    platform_to_channel: dict[str, str],
) -> tuple[pl.DataFrame, dict[str, float]]:
    campaigns = marketing.with_columns(
        pl.col("platform").replace_strict(platform_to_channel, default=None).alias("_target_channel"),
        _blank_to_null(SKU_ID).alias("_target_sku"),
        _blank_to_null(PRODUCT_CATEGORY).alias("_raw_category"),
    )
    unmapped_spend = (
        campaigns.filter(pl.col("_target_channel").is_null())
        .select(pl.col(SPEND).sum())
        .item()
        or 0.0
    )
    campaigns = campaigns.filter(pl.col("_target_channel").is_not_null()).with_columns(
        pl.when(pl.col("_target_sku").is_not_null())
        .then(None)
        .when(
            pl.col("_raw_category").is_not_null()
            & (pl.col("_raw_category") != ALL_CATEGORIES)
        )
        .then(pl.col("_raw_category"))
        .otherwise(None)
        .alias("_target_category")
    )

    sku_campaigns = campaigns.filter(pl.col("_target_sku").is_not_null()).select(
        pl.col("_target_channel").alias(CHANNEL),
        pl.col("_target_sku").alias(SKU_ID),
        pl.col(SPEND),
    )
    category_campaigns = campaigns.filter(
        pl.col("_target_sku").is_null() & pl.col("_target_category").is_not_null()
    ).select(
        pl.col("_target_channel").alias(CHANNEL),
        pl.col("_target_category").alias(CATEGORY),
        pl.col(SPEND),
    )
    channel_campaigns = campaigns.filter(
        pl.col("_target_sku").is_null() & pl.col("_target_category").is_null()
    ).select(
        pl.col("_target_channel").alias(CHANNEL),
        pl.col(SPEND),
    )

    work = lines
    work = _allocate_pool(work, sku_campaigns, [CHANNEL, SKU_ID], "_mkt_sku")
    work = _allocate_pool(work, category_campaigns, [CHANNEL, CATEGORY], "_mkt_category")
    work = _allocate_pool(work, channel_campaigns, [CHANNEL], "_mkt_channel")
    work = work.with_columns(
        (
            pl.col("_mkt_sku").fill_null(0)
            + pl.col("_mkt_category").fill_null(0)
            + pl.col("_mkt_channel").fill_null(0)
        ).alias(MARKETING_COST)
    ).drop(["_mkt_sku", "_mkt_category", "_mkt_channel"])

    source_spend = float(marketing.select(pl.col(SPEND).sum()).item() or 0.0)
    allocated = float(work.select(pl.col(MARKETING_COST).sum()).item() or 0.0)
    recon = {
        "source_spend": source_spend,
        "allocated_spend": allocated,
        "unmapped_platform_spend": float(unmapped_spend),
        "unallocated_spend": source_spend - allocated,
    }
    return work.sort(ORDER_LINE_ID), recon
