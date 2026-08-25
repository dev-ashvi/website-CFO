"""Directional financial relationship checks. Do not force equality."""

from __future__ import annotations

from typing import Any

import polars as pl

REL_TOL = 0.02
ABS_TOL = 1.0


def financial_relationships(frame: pl.DataFrame, mapped: dict[str, str]) -> list[dict[str, Any]]:
    inv = {dest: src for src, dest in mapped.items() if src in frame.columns}
    checks: list[dict[str, Any]] = []

    if {"quantity", "mrp_per_unit", "gross_revenue"} <= inv.keys():
        qty = pl.col(inv["quantity"]).cast(pl.Float64, strict=False)
        mrp = pl.col(inv["mrp_per_unit"]).cast(pl.Float64, strict=False)
        gross = pl.col(inv["gross_revenue"]).cast(pl.Float64, strict=False)
        computed = (qty * mrp).sum()
        actual = gross.sum()
        row = frame.select(computed.alias("computed"), actual.alias("actual")).row(0, named=True)
        checks.append(_compare("gross_revenue_vs_qty_mrp", row["actual"], row["computed"]))

    if {"gross_revenue", "discount_amount", "net_sales_pre_return"} <= inv.keys():
        gross = pl.col(inv["gross_revenue"]).cast(pl.Float64, strict=False)
        discount = pl.col(inv["discount_amount"]).cast(pl.Float64, strict=False)
        pre = pl.col(inv["net_sales_pre_return"]).cast(pl.Float64, strict=False)
        row = frame.select(
            (gross - discount).sum().alias("computed"),
            pre.sum().alias("actual"),
        ).row(0, named=True)
        checks.append(_compare("pre_return_vs_gross_minus_discount", row["actual"], row["computed"]))

    if {"gross_revenue", "discount_amount", "refund_amount", "net_revenue"} <= inv.keys():
        gross = pl.col(inv["gross_revenue"]).cast(pl.Float64, strict=False)
        discount = pl.col(inv["discount_amount"]).cast(pl.Float64, strict=False)
        refund = pl.col(inv["refund_amount"]).cast(pl.Float64, strict=False)
        net = pl.col(inv["net_revenue"]).cast(pl.Float64, strict=False)
        row = frame.select(
            (gross - discount - refund).sum().alias("computed"),
            net.sum().alias("actual"),
        ).row(0, named=True)
        checks.append(_compare("net_revenue_vs_gross_minus_leakage", row["actual"], row["computed"]))

    if {"gross_revenue", "net_revenue"} <= inv.keys():
        row = frame.select(
            pl.col(inv["gross_revenue"]).cast(pl.Float64, strict=False).sum().alias("gross"),
            pl.col(inv["net_revenue"]).cast(pl.Float64, strict=False).sum().alias("net"),
        ).row(0, named=True)
        ok = row["net"] <= row["gross"] + ABS_TOL
        checks.append(
            {
                "name": "net_revenue_not_above_gross",
                "ok": bool(ok),
                "actual": float(row["net"] or 0),
                "expected_max": float(row["gross"] or 0),
                "severity": "flag" if not ok else "info",
            }
        )

    if {"unit_manufacturing_cogs", "unit_primary_packaging", "unit_inbound_freight", "unit_other_direct_cogs", "unit_total_cogs"} <= inv.keys():
        parts = [
            pl.col(inv[name]).cast(pl.Float64, strict=False)
            for name in (
                "unit_manufacturing_cogs",
                "unit_primary_packaging",
                "unit_inbound_freight",
                "unit_other_direct_cogs",
            )
        ]
        total = pl.col(inv["unit_total_cogs"]).cast(pl.Float64, strict=False)
        row = frame.select(pl.sum_horizontal(parts).sum().alias("computed"), total.sum().alias("actual")).row(0, named=True)
        checks.append(_compare("sku_unit_cogs_components", row["actual"], row["computed"]))

    return checks


def _compare(name: str, actual: float | None, expected: float | None) -> dict[str, Any]:
    actual_f = float(actual or 0.0)
    expected_f = float(expected or 0.0)
    delta = actual_f - expected_f
    scale = max(abs(expected_f), abs(actual_f), 1.0)
    ok = abs(delta) <= max(ABS_TOL, REL_TOL * scale)
    return {
        "name": name,
        "ok": ok,
        "actual": actual_f,
        "expected": expected_f,
        "delta": delta,
        "severity": "info" if ok else "flag",
        "note": "Directional check; client definitions may differ.",
    }
