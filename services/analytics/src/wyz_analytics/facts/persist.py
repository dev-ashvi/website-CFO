"""Build and persist the analytical fact dataset from engine line facts."""

from __future__ import annotations

import io
from typing import Any

import polars as pl

from wyz_analytics.contracts.columns import (
    CM1_COST_COMPONENTS,
    NET_SALES_PRE_RETURN,
    ORDER_DATE,
    ORDER_ID,
    ORDER_MONTH,
)
from wyz_analytics.facts.schema import (
    ALLOCATED_MARKETING,
    CM1_COMPONENT_MAP,
    DATE,
    DISCOUNT,
    MONTH,
    NEW_REPEAT,
    PRODUCT_COGS_COMPONENTS,
    QUARTER,
    REFUND,
    RETURN_QTY_COL,
    RTO_QTY_COL,
)
from wyz_analytics.workers.storage import BlobStore

FACTS_FILENAME = "financial_facts.parquet"
METADATA_FILENAME = "metadata.json"


def _sales_share() -> pl.Expr:
    order_sales = pl.col(NET_SALES_PRE_RETURN).sum().over(ORDER_ID)
    line_count = pl.len().over(ORDER_ID)
    return (
        pl.when(order_sales > 0)
        .then(pl.col(NET_SALES_PRE_RETURN) / order_sales)
        .otherwise(1.0 / line_count)
    )


def _quarter_expr() -> pl.Expr:
    date_col = pl.col(DATE).cast(pl.Date)
    return (
        date_col.dt.year().cast(pl.Utf8)
        + "-Q"
        + (((date_col.dt.month() - 1) // 3) + 1).cast(pl.Utf8)
    ).alias(QUARTER)


def build_fact_frame(lines: pl.DataFrame) -> pl.DataFrame:
    """Normalize engine line facts into the persisted analytical schema."""
    share = _sales_share()
    exprs: list[pl.Expr] = [
        pl.col(ORDER_DATE).cast(pl.Date).alias(DATE),
        pl.col(ORDER_MONTH).alias(MONTH),
        pl.col("discount_amount").alias(DISCOUNT),
        pl.col("refund_amount").alias(REFUND),
        pl.col("new_repeat_flag").alias(NEW_REPEAT),
        pl.col("marketing_cost").alias(ALLOCATED_MARKETING),
        pl.col("return_qty").alias(RETURN_QTY_COL),
        pl.col("rto_qty").alias(RTO_QTY_COL),
    ]
    for target, unit_col in PRODUCT_COGS_COMPONENTS:
        exprs.append((pl.col("units_retained") * pl.col(unit_col)).alias(target))
    for target, source_col in CM1_COMPONENT_MAP.items():
        if source_col in lines.columns:
            exprs.append((share * pl.col(source_col)).alias(target))
    frame = lines.with_columns(exprs).with_columns(_quarter_expr())
    keep = [
        DATE,
        MONTH,
        QUARTER,
        "order_id",
        "order_line_id",
        "customer_id",
        NEW_REPEAT,
        "sku_id",
        "category",
        "subcategory",
        "channel",
        "platform",
        "region",
        "state",
        "city",
        "city_tier",
        "campaign_id",
        "payment_mode",
        "quantity",
        "units_retained",
        "gross_revenue",
        DISCOUNT,
        REFUND,
        "net_revenue",
        "manufacturing_cogs",
        "primary_packaging",
        "inbound_freight",
        "other_direct_cogs",
        "product_cogs",
        "gross_margin",
        *CM1_COMPONENT_MAP.keys(),
        "cm1_cost",
        "cm1",
        ALLOCATED_MARKETING,
        "cm2",
        RETURN_QTY_COL,
        RTO_QTY_COL,
    ]
    present = [col for col in keep if col in frame.columns]
    return frame.select(present).sort(["order_id", "order_line_id"])


def facts_uri_for_job(job_id: str) -> str:
    return f"wyz-blob://facts/{job_id}/{FACTS_FILENAME}"


def facts_metadata_uri_for_job(job_id: str) -> str:
    return f"wyz-blob://facts/{job_id}/{METADATA_FILENAME}"


def persist_financial_facts(
    blobs: BlobStore,
    *,
    job_id: str,
    lines: pl.DataFrame,
    lineage: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    facts = build_fact_frame(lines)
    facts_uri = blobs.facts_uri(job_id)
    meta_uri = blobs.facts_metadata_uri(job_id)
    metadata = {
        **lineage,
        "job_id": job_id,
        "facts_uri": facts_uri,
        "row_count": facts.height,
        "schema_version": "facts_v1",
    }
    blobs.put_parquet(facts_uri, facts)
    blobs.put_json(meta_uri, metadata)
    return facts_uri, metadata


def load_financial_facts(blobs: BlobStore, facts_uri: str) -> pl.DataFrame:
    return blobs.get_parquet(facts_uri)
