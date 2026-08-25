"""Join-key coverage between mapped source tables."""

from __future__ import annotations

from typing import Any

import polars as pl


def join_coverage(
    left: pl.DataFrame,
    right: pl.DataFrame,
    *,
    left_key: str,
    right_key: str,
    name: str,
    left_cardinality: str = "many",
    right_cardinality: str = "one",
) -> dict[str, Any]:
    if left_key not in left.columns or right_key not in right.columns:
        return {
            "name": name,
            "ok": False,
            "reason": "key_unmapped",
            "match_pct": 0.0,
            "unmatched_count": None,
            "left_null_keys": None,
            "right_null_keys": None,
            "left_duplicate_keys": None,
            "right_duplicate_keys": None,
            "left_cardinality": left_cardinality,
            "right_cardinality": right_cardinality,
            "unexpected_duplicate_keys": None,
            "cardinality_ok": False,
        }

    left_keys = left.select(pl.col(left_key).cast(pl.Utf8).alias("key"))
    right_keys = right.select(pl.col(right_key).cast(pl.Utf8).alias("key"))
    left_null = int(left_keys.filter(pl.col("key").is_null() | (pl.col("key") == "")).height)
    right_null = int(right_keys.filter(pl.col("key").is_null() | (pl.col("key") == "")).height)
    left_non_null = left_keys.filter(pl.col("key").is_not_null() & (pl.col("key") != ""))
    right_non_null = right_keys.filter(pl.col("key").is_not_null() & (pl.col("key") != ""))
    left_unique = left_non_null.unique()
    right_unique = right_non_null.unique()
    unmatched = left_unique.join(right_unique, on="key", how="anti")
    unmatched_count = unmatched.height
    denom = max(left_unique.height, 1)
    match_pct = 1.0 - (unmatched_count / denom)

    def duplicate_count(frame: pl.DataFrame) -> int:
        counts = frame.group_by("key").len()
        return int(counts.filter(pl.col("len") > 1).height)

    left_duplicate_keys = duplicate_count(left_non_null)
    right_duplicate_keys = duplicate_count(right_non_null)
    unexpected_left = left_duplicate_keys if left_cardinality == "one" else 0
    unexpected_right = right_duplicate_keys if right_cardinality == "one" else 0
    unexpected_duplicate_keys = unexpected_left + unexpected_right

    return {
        "name": name,
        "ok": match_pct >= 0.95 and unexpected_duplicate_keys == 0,
        "match_pct": round(match_pct, 6),
        "unmatched_count": unmatched_count,
        "left_null_keys": left_null,
        "right_null_keys": right_null,
        "left_duplicate_keys": left_duplicate_keys,
        "right_duplicate_keys": right_duplicate_keys,
        "left_unique_keys": left_unique.height,
        "right_unique_keys": right_unique.height,
        "left_cardinality": left_cardinality,
        "right_cardinality": right_cardinality,
        "unexpected_duplicate_keys": unexpected_duplicate_keys,
        "cardinality_ok": unexpected_duplicate_keys == 0,
    }
