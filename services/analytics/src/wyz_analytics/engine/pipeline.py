"""Pipeline entry point for the deterministic revenue/margin engine."""

from __future__ import annotations

from collections.abc import Mapping

import polars as pl

from wyz_analytics.adapters.beautyco import BEAUTYCO_MARKETING_PLATFORM_TO_CHANNEL
from wyz_analytics.config import ENGINE_ID, ENGINE_VERSION
from wyz_analytics.contracts.columns import CM2, MARKETING_COST, SourceTables
from wyz_analytics.contracts.results import EngineResult
from wyz_analytics.engine.line_economics import build_line_economics
from wyz_analytics.engine.marketing import allocate_marketing
from wyz_analytics.engine.waterfall import (
    by_category,
    by_category_month,
    by_channel,
    by_channel_month,
    by_month,
    by_sku,
    company_waterfall,
)
from wyz_analytics.recon.checks import reconcile


def attach_cm2(lines: pl.DataFrame) -> pl.DataFrame:
    return lines.with_columns((pl.col("cm1") - pl.col(MARKETING_COST)).alias(CM2))


def build_line_facts(
    sources: SourceTables,
    *,
    platform_to_channel: Mapping[str, str] | None = None,
) -> tuple[pl.DataFrame, dict[str, float]]:
    mapping = dict(platform_to_channel or BEAUTYCO_MARKETING_PLATFORM_TO_CHANNEL)
    lines = build_line_economics(sources)
    lines, marketing_recon = allocate_marketing(lines, sources.marketing_spend, mapping)
    return attach_cm2(lines), marketing_recon


def run_revenue_margin_engine(
    sources: SourceTables,
    *,
    platform_to_channel: Mapping[str, str] | None = None,
) -> EngineResult:
    lines, marketing_recon = build_line_facts(sources, platform_to_channel=platform_to_channel)
    waterfall = company_waterfall(lines)
    recon = reconcile(sources, lines, waterfall, marketing_recon)
    return EngineResult(
        engine_id=ENGINE_ID,
        engine_version=ENGINE_VERSION,
        waterfall=waterfall,
        by_channel=tuple(by_channel(lines).to_dicts()),
        by_category=tuple(by_category(lines).to_dicts()),
        by_sku=tuple(by_sku(lines).to_dicts()),
        by_month=tuple(by_month(lines).to_dicts()),
        reconciliation=recon,
        extras={
            "marketing_recon": marketing_recon,
            "line_count": lines.height,
            "by_channel_month": tuple(by_channel_month(lines).to_dicts()),
            "by_category_month": tuple(by_category_month(lines).to_dicts()),
        },
    )
