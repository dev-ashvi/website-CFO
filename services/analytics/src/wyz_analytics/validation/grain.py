"""Estimate dataset grain from mapped identifier columns."""

from __future__ import annotations

from typing import Any

import polars as pl


def detect_grain(frame: pl.DataFrame, mapped: dict[str, str]) -> dict[str, Any]:
    """mapped is source_column → canonical_field."""
    canonical = {dest: src for src, dest in mapped.items() if src in frame.columns}
    n = max(frame.height, 1)

    def unique_ratio(*fields: str) -> float | None:
        cols = [canonical[field] for field in fields if field in canonical]
        if not cols:
            return None
        return float(frame.select(pl.struct(cols).n_unique()).item()) / n

    ratios = {
        "sku": unique_ratio("sku_id"),
        "order": unique_ratio("order_id"),
        "order_line": unique_ratio("order_line_id") or unique_ratio("order_id", "sku_id"),
        "campaign_month": unique_ratio("campaign_id", "spend_date") or unique_ratio("campaign_id"),
        "settlement": unique_ratio("settlement_id") or unique_ratio("order_id"),
    }
    labelled = {
        "sku": "sku",
        "order": "order",
        "order_line": "order_line",
        "campaign_month": "campaign_month",
        "settlement": "order",
    }
    best_name = "unknown"
    best_ratio = -1.0
    for key, ratio in ratios.items():
        if ratio is None:
            continue
        if ratio > best_ratio:
            best_ratio = ratio
            best_name = labelled[key]
    if best_ratio < 0.8:
        best_name = "other" if best_ratio >= 0 else "unknown"
    return {
        "estimated_grain": best_name,
        "row_count": frame.height,
        "unique_ratios": {key: ratio for key, ratio in ratios.items() if ratio is not None},
        "confidence": round(max(best_ratio, 0.0), 4) if best_ratio >= 0 else 0.0,
    }
