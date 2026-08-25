from __future__ import annotations

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.engine.pipeline import run_revenue_margin_engine
from wyz_analytics.ingest.pipeline import ingest_tabular_files
from wyz_analytics.profiles.beautyco import beautyco_mapping_configuration, beautyco_methodology
from wyz_analytics.schemas.roles import FileRole


def _assert_engine_parity(left, right):
    lw = left.waterfall
    rw = right.waterfall
    for name in (
        "gross_revenue",
        "discounts",
        "returns_rto_cancellations",
        "net_revenue",
        "product_cogs",
        "gross_margin",
        "cm1_costs",
        "cm1",
        "marketing_spend",
        "cm2",
    ):
        assert abs(getattr(lw, name) - getattr(rw, name)) <= 0.05, name

    def index(rows, key):
        return {row[key]: row for row in rows}

    for actual, expected, key in (
        (left.by_channel, right.by_channel, "channel"),
        (left.by_category, right.by_category, "category"),
        (left.by_sku, right.by_sku, "sku_id"),
        (left.by_month, right.by_month, "order_month"),
    ):
        got = index(actual, key)
        want = index(expected, key)
        assert set(got) == set(want)
        for ident, row in want.items():
            for metric in ("net_revenue", "cm1", "cm2"):
                if metric in row:
                    assert abs(got[ident][metric] - row[metric]) <= 0.08, f"{key}={ident} {metric}"


def test_canonical_auto_ingest_matches_direct_adapter_and_golden(expected, beautyco_paths):
    paths = beautyco_paths
    ingested = ingest_tabular_files(paths, methodology=beautyco_methodology())
    assert ingested.sources is not None, ingested.errors
    assert not ingested.errors
    roles = {item.file_role for item in ingested.file_mappings}
    assert roles == {role.value for role in FileRole if role != FileRole.UNKNOWN}

    direct = run_revenue_margin_engine(load_beautyco_sources(paths[0].parent))
    canonical = run_revenue_margin_engine(
        ingested.sources,
        platform_to_channel=ingested.mapping_config.methodology.platform_to_channel,
    )
    _assert_engine_parity(canonical, direct)

    gold = expected["company_waterfall_inr"]
    assert abs(canonical.waterfall.net_revenue - gold["net_revenue"]) <= 0.05
    assert abs(canonical.waterfall.cm2 - gold["cm2"]) <= 0.05
    assert canonical.reconciliation.ok


def test_stored_beautyco_mapping_config_matches_adapter(beautyco_paths):
    paths = beautyco_paths
    ingested = ingest_tabular_files(paths, mapping_config=beautyco_mapping_configuration())
    assert ingested.sources is not None, ingested.errors
    config = ingested.mapping_config.to_dict()
    assert config["tenant_id"] == "beautyco"
    assert "platform_to_channel" in config["methodology"]
    assert config["mapping_version"]

    direct = run_revenue_margin_engine(load_beautyco_sources(paths[0].parent))
    canonical = run_revenue_margin_engine(
        ingested.sources,
        platform_to_channel=ingested.mapping_config.methodology.platform_to_channel,
    )
    _assert_engine_parity(canonical, direct)


def test_beautyco_ingest_join_and_grain_validation(beautyco_paths):
    ingested = ingest_tabular_files(beautyco_paths, methodology=beautyco_methodology())
    joins = {item["name"]: item for item in ingested.validation["joins"]}
    assert joins["order_lines.sku_id→sku_master.sku_id"]["match_pct"] == 1.0
    assert joins["order_lines.order_id→settlements.order_id"]["match_pct"] == 1.0
    grains = ingested.validation["grains"]
    assert grains[FileRole.ORDER_LINES.value]["estimated_grain"] == "order_line"
    assert grains[FileRole.SKU_MASTER.value]["estimated_grain"] == "sku"
    assert grains[FileRole.CHANNEL_SETTLEMENTS.value]["estimated_grain"] == "order"
    assert grains[FileRole.MARKETING_SPEND.value]["estimated_grain"] == "campaign_month"
