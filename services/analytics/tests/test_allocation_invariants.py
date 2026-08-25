"""Synthetic allocation tests that do not need the BeautyCo CSVs."""

from __future__ import annotations

from datetime import date

import polars as pl

from wyz_analytics.contracts.columns import SourceTables
from wyz_analytics.engine.line_economics import build_line_economics
from wyz_analytics.engine.marketing import allocate_marketing
from wyz_analytics.engine.pipeline import attach_cm2, run_revenue_margin_engine


def _sources() -> SourceTables:
    order_lines = pl.DataFrame(
        {
            "order_id": ["O1", "O1", "O2"],
            "order_line_id": ["L1", "L2", "L3"],
            "order_date": [date(2025, 4, 1), date(2025, 4, 1), date(2025, 4, 2)],
            "customer_id": ["C1", "C1", "C2"],
            "channel": ["D2C Website", "D2C Website", "Amazon"],
            "platform": ["D2C Website", "D2C Website", "Amazon"],
            "sku_id": ["SKU_A", "SKU_B", "SKU_A"],
            "quantity": [2, 1, 1],
            "mrp_per_unit": [100.0, 100.0, 100.0],
            "gross_revenue": [200.0, 100.0, 100.0],
            "discount_amount": [20.0, 10.0, 0.0],
            "net_sales_pre_return": [180.0, 90.0, 100.0],
            "order_status": ["Delivered", "Delivered", "Cancelled"],
            "return_qty": [0, 0, 0],
            "rto_qty": [0, 0, 0],
            "refund_amount": [0.0, 0.0, 100.0],
            "net_revenue": [180.0, 90.0, 0.0],
            "new_repeat_flag": ["New", "New", "New"],
            "campaign_id": ["CMP1", None, None],
        }
    )
    sku_master = pl.DataFrame(
        {
            "sku_id": ["SKU_A", "SKU_B"],
            "product_name": ["A", "B"],
            "category": ["Face", "Lips"],
            "subcategory": ["Foundation", "Lipstick"],
            "product_status": ["Active", "Active"],
            "unit_manufacturing_cogs": [10.0, 20.0],
            "unit_primary_packaging": [1.0, 1.0],
            "unit_inbound_freight": [1.0, 1.0],
            "unit_other_direct_cogs": [0.0, 0.0],
            "unit_total_cogs": [12.0, 22.0],
        }
    )
    settlements = pl.DataFrame(
        {
            "order_id": ["O1", "O2"],
            "total_cm1_cost": [30.0, 9.0],
            "marketplace_commission": [30.0, 9.0],
            "transaction_fee": [0.0, 0.0],
            "fulfilment_fee": [0.0, 0.0],
            "forward_shipping": [0.0, 0.0],
            "reverse_shipping": [0.0, 0.0],
            "rto_cost": [0.0, 0.0],
            "payment_gateway_fee": [0.0, 0.0],
            "cod_fee": [0.0, 0.0],
            "pick_pack_fee": [0.0, 0.0],
            "variable_warehouse_fee": [0.0, 0.0],
            "packaging_cost": [0.0, 0.0],
            "penalty": [0.0, 0.0],
            "other_variable_channel_cost": [0.0, 0.0],
        }
    )
    marketing = pl.DataFrame(
        {
            "spend_date": [date(2025, 4, 1), date(2025, 4, 1), date(2025, 4, 1)],
            "platform": ["Meta Prospecting", "Meta Prospecting", "Amazon Ads"],
            "campaign_id": ["CMP1", "CMP2", "CMP3"],
            "product_category": ["Face", "All Categories", "All Categories"],
            "sku_id": ["SKU_A", "", ""],
            "spend": [40.0, 20.0, 10.0],
        }
    )
    return SourceTables(order_lines, sku_master, settlements, marketing)


def test_cancelled_lines_have_zero_product_cogs():
    lines = build_line_economics(_sources())
    cancelled = lines.filter(pl.col("order_id") == "O2").row(0, named=True)
    delivered = lines.filter(pl.col("order_line_id") == "L1").row(0, named=True)
    assert cancelled["product_cogs"] == 0.0
    assert cancelled["units_retained"] == 0.0
    assert delivered["product_cogs"] == 24.0  # 2 retained × 12


def test_cm1_is_allocated_by_pre_return_sales_share():
    lines = build_line_economics(_sources())
    by_line = {row["order_line_id"]: row for row in lines.to_dicts()}
    # O1 sales 180 + 90 = 270 → L1 20, L2 10
    assert abs(by_line["L1"]["cm1_cost"] - 20.0) < 1e-9
    assert abs(by_line["L2"]["cm1_cost"] - 10.0) < 1e-9
    assert abs(lines.select(pl.col("cm1_cost").sum()).item() - 39.0) < 1e-9


def test_marketing_sku_then_category_then_channel_does_not_double_count():
    lines = build_line_economics(_sources())
    mapped = {"Meta Prospecting": "D2C Website", "Amazon Ads": "Amazon"}
    lines, recon = allocate_marketing(lines, _sources().marketing_spend, mapped)
    lines = attach_cm2(lines)
    assert abs(recon["source_spend"] - 70.0) < 1e-9
    assert abs(recon["allocated_spend"] - 60.0) < 1e-9
    by_line = {row["order_line_id"]: row for row in lines.to_dicts()}
    # SKU_A D2C gets the 40 hero-SKU campaign + share of 20 all-category D2C campaign.
    # D2C net revenue: L1 180, L2 90.
    assert abs(by_line["L1"]["marketing_cost"] - (40.0 + 20.0 * 180 / 270)) < 1e-9
    assert abs(by_line["L2"]["marketing_cost"] - (20.0 * 90 / 270)) < 1e-9
    # Amazon cancelled line has 0 net revenue, so Amazon Ads 10 is unallocated.
    assert by_line["L3"]["marketing_cost"] == 0.0
    assert abs(recon["unallocated_spend"] - 10.0) < 1e-9


def test_pipeline_reconciliation_flags_unallocated_marketing_on_synthetic_data():
    result = run_revenue_margin_engine(_sources())
    assert result.waterfall.net_revenue == 270.0
    assert result.waterfall.product_cogs == 24.0 + 22.0
    names = {check["name"]: check for check in result.reconciliation.checks}
    assert names["cm1_costs_allocated_to_lines"]["ok"]
    assert not names["marketing_allocated_to_source"]["ok"]
