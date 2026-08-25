from __future__ import annotations

INR_TOL = 0.08
PCT_TOL = 1e-9


def _by(rows, key):
    return {row[key]: row for row in rows}


def test_channel_pnl_matches_golden(beautyco_result, expected):
    actual = _by(beautyco_result.by_channel, "channel")
    for gold in expected["channels"]:
        row = actual[gold["channel"]]
        assert abs(row["orders"] - gold["orders"]) < 1e-9
        assert abs(row["net_revenue"] - gold["net_revenue"]) <= INR_TOL
        assert abs(row["product_cogs"] - gold["product_cogs"]) <= INR_TOL
        assert abs(row["gross_margin"] - gold["gross_margin"]) <= INR_TOL
        assert abs(row["cm1_cost"] - gold["cm1_cost"]) <= INR_TOL
        assert abs(row["cm1"] - gold["cm1"]) <= INR_TOL
        assert abs(row["marketing_cost"] - gold["marketing"]) <= INR_TOL
        assert abs(row["cm2"] - gold["cm2"]) <= INR_TOL
        assert abs(row["gross_margin_pct"] - gold["gross_margin_pct"]) <= PCT_TOL
        assert abs(row["cm1_pct"] - gold["cm1_pct"]) <= PCT_TOL
        assert abs(row["cm2_pct"] - gold["cm2_pct"]) <= PCT_TOL


def test_category_rates_match_golden(beautyco_result, expected):
    actual = _by(beautyco_result.by_category, "category")
    for gold in expected["categories"]:
        row = actual[gold["category"]]
        assert abs(row["net_revenue"] - gold["net_revenue"]) <= INR_TOL
        assert abs(row["gross_margin_pct"] - gold["gross_margin_pct"]) <= PCT_TOL
        assert abs(row["cm1_pct"] - gold["cm1_pct"]) <= PCT_TOL
        assert abs(row["cm2_pct"] - gold["cm2_pct"]) <= PCT_TOL


def test_sku_contribution_matches_golden(beautyco_result, expected):
    actual = _by(beautyco_result.by_sku, "sku_id")
    for gold in expected["skus"]:
        row = actual[gold["sku_id"]]
        assert abs(row["net_revenue"] - gold["net_revenue"]) <= INR_TOL
        assert abs(row["gross_margin"] - gold["gross_margin"]) <= INR_TOL
        assert abs(row["cm1"] - gold["cm1"]) <= INR_TOL
        assert abs(row["cm2"] - gold["cm2"]) <= INR_TOL


def test_monthly_trend_matches_golden(beautyco_result, expected):
    actual = _by(beautyco_result.by_month, "order_month")
    for gold in expected["monthly"]:
        row = actual[gold["month"]]
        assert abs(row["orders"] - gold["orders"]) < 1e-9
        assert abs(row["gross_revenue"] - gold["gross_revenue"]) <= INR_TOL
        assert abs(row["net_revenue"] - gold["net_revenue"]) <= INR_TOL
        assert abs(row["cm2"] - gold["cm2"]) <= INR_TOL
