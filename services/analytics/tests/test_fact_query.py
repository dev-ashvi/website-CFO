"""Tests for persisted financial facts and the dynamic query layer."""

from __future__ import annotations

from datetime import date

import pytest
import polars as pl

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.engine.pipeline import build_line_facts, run_revenue_margin_engine
from wyz_analytics.engine.waterfall import company_waterfall
from wyz_analytics.facts.models import validate_query
from wyz_analytics.facts.persist import build_fact_frame, persist_financial_facts
from wyz_analytics.facts.query import apply_filters, execute_query
from wyz_analytics.workers.errors import AnalyticsError, INVALID_QUERY, WORKSPACE_MISMATCH
from wyz_analytics.workers.service import AnalyticsWorkspace
from wyz_analytics.workers.storage import FilesystemBlobStore

INR_TOL = 0.08
PCT_TOL = 1e-9


@pytest.fixture
def beautyco_lines(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return lines, run_revenue_margin_engine(sources)


@pytest.fixture
def beautyco_facts(beautyco_lines):
    lines, _engine = beautyco_lines
    return build_fact_frame(lines)


def _sum(facts: pl.DataFrame, column: str) -> float:
    return float(facts[column].sum())


def test_fact_totals_reconcile_to_company_waterfall(beautyco_facts, beautyco_lines):
    lines, engine = beautyco_lines
    waterfall = company_waterfall(lines)
    facts = beautyco_facts
    assert abs(_sum(facts, "gross_revenue") - waterfall.gross_revenue) <= INR_TOL
    assert abs(_sum(facts, "net_revenue") - waterfall.net_revenue) <= INR_TOL
    assert abs(_sum(facts, "product_cogs") - waterfall.product_cogs) <= INR_TOL
    assert abs(_sum(facts, "gross_margin") - waterfall.gross_margin) <= INR_TOL
    assert abs(_sum(facts, "cm1_cost") - waterfall.cm1_costs) <= INR_TOL
    assert abs(_sum(facts, "cm1") - waterfall.cm1) <= INR_TOL
    assert abs(_sum(facts, "allocated_marketing") - waterfall.marketing_spend) <= INR_TOL
    assert abs(_sum(facts, "cm2") - waterfall.cm2) <= INR_TOL
    assert engine.reconciliation.ok


def _query_group(facts: pl.DataFrame, dimension: str, metrics: list[str]) -> dict[str, dict]:
    result = execute_query(
        facts,
        {
            "filters": {},
            "group_by": [dimension],
            "metrics": metrics,
        },
    )
    key = dimension if dimension != "sku" else "sku"
    rows = {}
    for row in result["rows"]:
        entity = row.get(dimension) or row.get("sku_id")
        rows[entity] = row
    return rows


def test_aggregate_parity_channel(beautyco_facts, beautyco_lines):
    _, engine = beautyco_lines
    metrics = [
        "net_revenue",
        "product_cogs",
        "gross_margin",
        "cm1_cost",
        "cm1",
        "marketing_cost",
        "cm2",
        "gross_margin_pct",
        "cm1_pct",
        "cm2_pct",
    ]
    actual = _query_group(beautyco_facts, "channel", metrics)
    for row in engine.by_channel:
        queried = actual[row["channel"]]
        assert abs(queried["net_revenue"] - row["net_revenue"]) <= INR_TOL
        assert abs(queried["product_cogs"] - row["product_cogs"]) <= INR_TOL
        assert abs(queried["gross_margin"] - row["gross_margin"]) <= INR_TOL
        assert abs(queried["cm1_cost"] - row["cm1_cost"]) <= INR_TOL
        assert abs(queried["cm1"] - row["cm1"]) <= INR_TOL
        assert abs(queried["marketing_cost"] - row["marketing_cost"]) <= INR_TOL
        assert abs(queried["cm2"] - row["cm2"]) <= INR_TOL
        assert abs(queried["gross_margin_pct"] - row["gross_margin_pct"]) <= PCT_TOL
        assert abs(queried["cm1_pct"] - row["cm1_pct"]) <= PCT_TOL
        assert abs(queried["cm2_pct"] - row["cm2_pct"]) <= PCT_TOL


def test_aggregate_parity_category(beautyco_facts, beautyco_lines):
    _, engine = beautyco_lines
    actual = _query_group(
        beautyco_facts,
        "category",
        ["net_revenue", "gross_margin_pct", "cm1_pct", "cm2_pct"],
    )
    for row in engine.by_category:
        queried = actual[row["category"]]
        assert abs(queried["net_revenue"] - row["net_revenue"]) <= INR_TOL
        assert abs(queried["gross_margin_pct"] - row["gross_margin_pct"]) <= PCT_TOL


def test_aggregate_parity_sku(beautyco_facts, beautyco_lines):
    _, engine = beautyco_lines
    actual = _query_group(
        beautyco_facts,
        "sku",
        ["net_revenue", "gross_margin", "cm1", "cm2"],
    )
    for row in engine.by_sku:
        queried = actual[row["sku_id"]]
        assert abs(queried["net_revenue"] - row["net_revenue"]) <= INR_TOL
        assert abs(queried["gross_margin"] - row["gross_margin"]) <= INR_TOL
        assert abs(queried["cm1"] - row["cm1"]) <= INR_TOL
        assert abs(queried["cm2"] - row["cm2"]) <= INR_TOL


def test_aggregate_parity_month(beautyco_facts, beautyco_lines):
    _, engine = beautyco_lines
    result = execute_query(
        beautyco_facts,
        {
            "group_by": ["month"],
            "metrics": ["orders", "gross_revenue", "net_revenue", "cm2"],
        },
    )
    actual = {row["month"]: row for row in result["rows"]}
    for row in engine.by_month:
        month = row["order_month"]
        queried = actual[month]
        assert abs(queried["orders"] - row["orders"]) < 1e-9
        assert abs(queried["gross_revenue"] - row["gross_revenue"]) <= INR_TOL
        assert abs(queried["net_revenue"] - row["net_revenue"]) <= INR_TOL
        assert abs(queried["cm2"] - row["cm2"]) <= INR_TOL


def test_combined_filters_amazon_lips(beautyco_facts):
    channels = beautyco_facts["channel"].unique().to_list()
    categories = beautyco_facts["category"].unique().to_list()
    channel = channels[0]
    category = categories[0]
    filtered = apply_filters(
        beautyco_facts,
        {"channel": [channel], "category": [category]},
    )
    result = execute_query(
        beautyco_facts,
        {
            "filters": {"channel": [channel], "category": [category]},
            "group_by": ["sku"],
            "metrics": ["net_revenue", "cm2"],
        },
    )
    assert result["summary"]["net_revenue"] == pytest.approx(float(filtered["net_revenue"].sum()), abs=INR_TOL)
    assert result["rows"]
    for row in result["rows"]:
        slice_frame = filtered.filter(pl.col("sku_id") == row["sku"])
        assert slice_frame.height > 0
        assert slice_frame["channel"].unique().to_list() == [channel]
        assert slice_frame["category"].unique().to_list() == [category]


def test_month_range_filter(beautyco_facts):
    months = sorted(beautyco_facts["month"].unique().to_list())
    if len(months) < 2:
        pytest.skip("Need multiple months in fixture data.")
    start, end = months[0], months[-1]
    result = execute_query(
        beautyco_facts,
        {
            "filters": {"month_from": start, "month_to": end},
            "metrics": ["net_revenue"],
        },
    )
    filtered = apply_filters(beautyco_facts, {"month_from": start, "month_to": end})
    assert result["summary"]["net_revenue"] == pytest.approx(float(filtered["net_revenue"].sum()), abs=INR_TOL)


def test_metric_semantics_distinct_and_ratios(beautyco_facts):
    result = execute_query(
        beautyco_facts,
        {
            "metrics": ["orders", "customers", "net_aov", "gm_pct", "units_per_order"],
        },
    )
    summary = result["summary"]
    filtered = beautyco_facts
    expected_orders = filtered["order_id"].n_unique()
    expected_customers = filtered["customer_id"].n_unique()
    net = float(filtered["net_revenue"].sum())
    gross_margin = float(filtered["gross_margin"].sum())
    units = float(filtered["quantity"].sum())
    assert summary["orders"] == expected_orders
    assert summary["customers"] == expected_customers
    assert summary["net_aov"] == pytest.approx(net / expected_orders, rel=1e-9)
    assert summary["gm_pct"] == pytest.approx(gross_margin / net, abs=PCT_TOL)
    assert summary["units_per_order"] == pytest.approx(units / expected_orders, rel=1e-9)


def test_unknown_dimension_rejected():
    with pytest.raises(AnalyticsError) as exc:
        validate_query({"filters": {"not_a_dimension": ["x"]}, "metrics": ["net_revenue"]})
    assert exc.value.error_type == INVALID_QUERY


def test_unknown_metric_rejected():
    with pytest.raises(AnalyticsError) as exc:
        validate_query({"metrics": ["net_revenue + gross_revenue"]})
    assert exc.value.error_type == INVALID_QUERY


def test_empty_results_valid_summary():
    facts = pl.DataFrame(
        {
            "month": ["2025-01"],
            "channel": ["Amazon"],
            "category": ["Lips"],
            "sku_id": ["SKU1"],
            "order_id": ["o1"],
            "customer_id": ["c1"],
            "quantity": [1.0],
            "gross_revenue": [100.0],
            "discount": [0.0],
            "refund": [0.0],
            "net_revenue": [100.0],
            "product_cogs": [40.0],
            "gross_margin": [60.0],
            "cm1_cost": [10.0],
            "cm1": [50.0],
            "allocated_marketing": [5.0],
            "cm2": [45.0],
            "return_qty": [0.0],
            "rto_qty": [0.0],
        }
    )
    result = execute_query(
        facts,
        {
            "filters": {"channel": ["Nykaa"]},
            "group_by": ["channel"],
            "metrics": ["net_revenue", "orders"],
        },
    )
    assert result["rows"] == []
    assert result["summary"]["net_revenue"] == 0.0
    assert result["summary"]["cm2"] == 0.0


def test_workspace_mismatch_rejected(tmp_path):
    workspace = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    record = workspace.create_dataset(name="Facts test", workspace_id="ws_a")
    blobs = workspace.blobs
    lines = pl.DataFrame(
        {
            "order_date": [date(2025, 1, 1)],
            "order_month": ["2025-01"],
            "order_id": ["o1"],
            "order_line_id": ["l1"],
            "customer_id": ["c1"],
            "new_repeat_flag": ["New"],
            "sku_id": ["SKU1"],
            "category": ["Lips"],
            "subcategory": ["Matte"],
            "channel": ["Amazon"],
            "platform": ["Amazon"],
            "region": ["North"],
            "state": ["MH"],
            "city": ["Mumbai"],
            "city_tier": ["Tier 1"],
            "campaign_id": ["camp1"],
            "payment_mode": ["Prepaid"],
            "quantity": [1.0],
            "net_sales_pre_return": [100.0],
            "gross_revenue": [100.0],
            "discount_amount": [0.0],
            "refund_amount": [0.0],
            "net_revenue": [100.0],
            "return_qty": [0.0],
            "rto_qty": [0.0],
            "units_retained": [1.0],
            "unit_manufacturing_cogs": [30.0],
            "unit_primary_packaging": [5.0],
            "unit_inbound_freight": [2.0],
            "unit_other_direct_cogs": [3.0],
            "unit_total_cogs": [40.0],
            "product_cogs": [40.0],
            "total_cm1_cost": [10.0],
            "cm1_cost": [10.0],
            "gross_margin": [60.0],
            "cm1": [50.0],
            "marketing_cost": [5.0],
            "cm2": [45.0],
        }
    )
    job_id = "job_test_facts"
    facts_uri, _ = persist_financial_facts(
        blobs,
        job_id=job_id,
        lines=lines,
        lineage={"workspace_id": "ws_a", "dataset_id": record.dataset_id, "dataset_version": 1, "mapping_version": "m1"},
    )
    payload = {
        "job_id": job_id,
        "facts_uri": facts_uri,
        "workspace_id": "ws_a",
        "dataset_id": record.dataset_id,
        "dataset_version": 1,
        "mapping_version": "m1",
        "engine_version": "test",
    }
    blobs.put_json(blobs.result_uri(job_id), payload)
    record.latest_result_uri = blobs.result_uri(job_id)
    record.summary = payload
    record.status = "COMPLETED"
    workspace.datasets.put(record)

    with pytest.raises(AnalyticsError) as exc:
        workspace.query_facts(record.dataset_id, {"workspace_id": "ws_b", "metrics": ["net_revenue"]})
    assert exc.value.error_type == WORKSPACE_MISMATCH

    resolved = workspace.query_facts(record.dataset_id, {"workspace_id": "ws_a", "metrics": ["net_revenue"]})
    assert resolved["summary"]["net_revenue"] == 100.0


def test_margin_rows_include_profitability_class(beautyco_facts):
    result = execute_query(
        beautyco_facts,
        {
            "group_by": ["channel"],
            "metrics": ["gross_margin", "cm1", "cm2"],
        },
    )
    assert result["rows"]
    for row in result["rows"]:
        assert row["profitability_class"] in {
            "negative_gross_margin",
            "positive_gm_negative_cm1",
            "positive_cm1_negative_cm2",
            "profitable",
        }


def test_persist_and_load_parquet_roundtrip(tmp_path, beautyco_lines):
    lines, _ = beautyco_lines
    blobs = FilesystemBlobStore(tmp_path)
    uri, meta = persist_financial_facts(
        blobs,
        job_id="job_parquet",
        lines=lines,
        lineage={"workspace_id": "local", "dataset_id": "ds1", "dataset_version": 1, "mapping_version": "m1"},
    )
    loaded = blobs.get_parquet(uri)
    assert loaded.height == build_fact_frame(lines).height
    assert meta["row_count"] == loaded.height
