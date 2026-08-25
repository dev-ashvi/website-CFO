from __future__ import annotations

import polars as pl

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.engine.pipeline import run_revenue_margin_engine
from wyz_analytics.ingest.pipeline import ingest_loaded_tables
from wyz_analytics.mapping.fake_model import FakeSchemaMappingModel
from wyz_analytics.profiles.beautyco import beautyco_methodology


def _money_text(col: str) -> pl.Expr:
    return (pl.lit("₹") + pl.col(col).cast(pl.Utf8)).alias(col)


def mutate_beautyco_frames(paths) -> list[tuple[str, pl.DataFrame]]:
    order_lines = pl.read_csv(paths[0], infer_schema_length=10_000)
    sku_master = pl.read_csv(paths[1], infer_schema_length=10_000)
    settlements = pl.read_csv(paths[2], infer_schema_length=10_000)
    marketing = pl.read_csv(paths[3], infer_schema_length=10_000)

    order_lines = order_lines.with_columns(
        (pl.lit("TXN-") + pl.col("ORDER_ID").cast(pl.Utf8)).alias("ORDER_ID"),
        (pl.lit("ITEM-") + pl.col("SKU_ID").cast(pl.Utf8)).alias("SKU_ID"),
        pl.col("ORDER_DATE").str.strptime(pl.Date, "%d-%m-%Y", strict=False).dt.strftime("%Y/%m/%d").alias("ORDER_DATE"),
        _money_text("GROSS_REVENUE"),
        pl.when(pl.col("REFUND_AMOUNT") < 0)
        .then(pl.lit("(") + pl.col("REFUND_AMOUNT").abs().cast(pl.Utf8) + pl.lit(")"))
        .otherwise(pl.col("REFUND_AMOUNT").cast(pl.Utf8))
        .alias("REFUND_AMOUNT"),
    )
    sku_master = sku_master.with_columns((pl.lit("ITEM-") + pl.col("SKU_ID").cast(pl.Utf8)).alias("SKU_ID"))
    settlements = settlements.with_columns((pl.lit("TXN-") + pl.col("ORDER_ID").cast(pl.Utf8)).alias("ORDER_ID"))
    if "SKU_ID" in marketing.columns:
        marketing = marketing.with_columns(
            pl.when(pl.col("SKU_ID").is_not_null() & (pl.col("SKU_ID").cast(pl.Utf8) != ""))
            .then(pl.lit("ITEM-") + pl.col("SKU_ID").cast(pl.Utf8))
            .otherwise(pl.col("SKU_ID"))
            .alias("SKU_ID")
        )

    drop_optional = [name for name in ("DEVICE_TYPE", "COUPON_CODE") if name in order_lines.columns]
    if drop_optional:
        order_lines = order_lines.drop(drop_optional)
    order_lines = order_lines.with_columns(
        pl.lit("ok").alias("notes"),
        pl.lit(1).alias("export_batch"),
    )

    order_lines = order_lines.rename(
        {
            "ORDER_ID": "txn_ref",
            "SKU_ID": "item_code",
        }
    )
    sku_master = sku_master.rename({"SKU_ID": "item_code"})
    settlements = settlements.rename(
        {
            "ORDER_ID": "txn_ref",
            "FORWARD_SHIPPING": "fwd_ship",
            "REVERSE_SHIPPING": "rev_ship",
            "RTO_COST": "failed_delivery_charge",
        }
    )
    return [
        ("01_ORDER_LINES.csv", order_lines),
        ("02_SKU_MASTER_COGS.csv", sku_master),
        ("03_CHANNEL_SETTLEMENTS.csv", settlements),
        ("04_MARKETING_SPEND.csv", marketing),
    ]


def test_mutated_beautyco_canonical_path_matches_direct_adapter(expected, beautyco_paths):
    tables = mutate_beautyco_frames(beautyco_paths)
    ingested = ingest_loaded_tables(
        tables,
        methodology=beautyco_methodology(),
        mapping_model=FakeSchemaMappingModel(),
    )
    assert ingested.sources is not None, ingested.errors
    assert not ingested.errors

    origins = {
        (item.file_role, mapping.canonical_field): mapping.origin.value
        for item in ingested.file_mappings
        for mapping in item.mappings
    }
    assert origins[("ORDER_LINES", "order_id")] == "ai_proposed"
    assert origins[("ORDER_LINES", "sku_id")] == "ai_proposed"
    assert origins[("CHANNEL_SETTLEMENTS", "forward_shipping")] == "ai_proposed"

    direct = run_revenue_margin_engine(load_beautyco_sources(beautyco_paths[0].parent))
    mutated = run_revenue_margin_engine(
        ingested.sources,
        platform_to_channel=ingested.mapping_config.methodology.platform_to_channel,
    )
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
        assert abs(getattr(mutated.waterfall, name) - getattr(direct.waterfall, name)) <= 0.05, name

    gold = expected["company_waterfall_inr"]
    assert abs(mutated.waterfall.net_revenue - gold["net_revenue"]) <= 0.05
    assert abs(mutated.waterfall.cm2 - gold["cm2"]) <= 0.05
    assert mutated.reconciliation.ok
