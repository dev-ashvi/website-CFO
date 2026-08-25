"""Dynamic fact query execution with Polars."""

from __future__ import annotations

from typing import Any

import polars as pl

from wyz_analytics.analytics.classification import classify_profitability
from wyz_analytics.facts.metrics import METRICS, MetricDef, metric_def
from wyz_analytics.facts.models import group_by_columns, validate_query
from wyz_analytics.facts.schema import (
    DATE,
    DIMENSION_COLUMNS,
    MONTH,
    SUMMARY_METRICS,
)
from wyz_analytics.workers.errors import AnalyticsError, INVALID_QUERY

INR_TOL = 0.08


def _safe_ratio(numer: float | None, denom: float | None) -> float | None:
    if numer is None or denom is None or denom == 0:
        return 0.0 if numer == 0 and denom == 0 else (0.0 if denom == 0 else None)
    return float(numer) / float(denom)


def apply_filters(frame: pl.DataFrame, filters: dict[str, Any]) -> pl.DataFrame:
    filtered = frame
    for dim, values in filters.items():
        if dim in {"month_from", "month_to"}:
            continue
        if dim in {"date_from", "date_to"}:
            continue
        column = DIMENSION_COLUMNS[dim]
        if column not in filtered.columns:
            continue
        if isinstance(values, list):
            filtered = filtered.filter(pl.col(column).is_in(values))
    if month_from := filters.get("month_from"):
        filtered = filtered.filter(pl.col(MONTH) >= month_from)
    if month_to := filters.get("month_to"):
        filtered = filtered.filter(pl.col(MONTH) <= month_to)
    if date_from := filters.get("date_from"):
        filtered = filtered.filter(pl.col(DATE) >= pl.lit(date_from).str.to_date())
    if date_to := filters.get("date_to"):
        filtered = filtered.filter(pl.col(DATE) <= pl.lit(date_to).str.to_date())
    return filtered


def _collect_additive(frame: pl.DataFrame) -> dict[str, float]:
    """Aggregate all additive base columns needed for metrics."""
    cols_needed: set[str] = set()
    for metric in METRICS.values():
        if metric.kind == "additive" and metric.column and metric.column in frame.columns:
            cols_needed.add(metric.column)
        if metric.kind == "distinct" and metric.distinct_column and metric.distinct_column in frame.columns:
            cols_needed.add(metric.distinct_column)
    exprs: list[pl.Expr] = []
    for col in sorted(cols_needed):
        if col in {"order_id", "customer_id"}:
            continue
        exprs.append(pl.col(col).sum().alias(col))
    base: dict[str, float] = {}
    if exprs:
        row = frame.select(exprs).row(0, named=True)
        base = {key: float(value or 0) for key, value in row.items()}
    if "order_id" in frame.columns:
        base["orders"] = float(frame["order_id"].n_unique())
    if "customer_id" in frame.columns:
        base["customers"] = float(frame["customer_id"].n_unique())
    return base


def _metric_from_base(metric: MetricDef, base: dict[str, float]) -> float | None:
    if metric.kind == "additive":
        assert metric.column
        return base.get(metric.column, base.get(metric.id))
    if metric.kind == "distinct":
        return base.get(metric.id)
    assert metric.numerator and metric.denominator
    numer_metric = metric_def(metric.numerator)
    denom_metric = metric_def(metric.denominator)
    numer = _metric_from_base(numer_metric, base)
    denom = _metric_from_base(denom_metric, base)
    result = _safe_ratio(numer, denom)
    return result if result is not None else 0.0


def _build_metrics(base: dict[str, float], metric_ids: list[str]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for metric_id in metric_ids:
        value = _metric_from_base(metric_def(metric_id), base)
        out[metric_id] = value
    return out


def _aggregate_grouped(
    frame: pl.DataFrame,
    group_by: list[str],
    metric_ids: list[str],
) -> list[dict[str, Any]]:
    if not group_by:
        return []

    keys = group_by_columns(group_by)
    agg_exprs: list[pl.Expr] = []
    columns_needed: set[str] = set()
    for metric_id in metric_ids:
        metric = metric_def(metric_id)
        if metric.kind == "additive" and metric.column:
            columns_needed.add(metric.column)
        if metric.kind == "distinct" and metric.distinct_column:
            columns_needed.add(metric.distinct_column)
        if metric.kind == "ratio":
            if metric.numerator:
                columns_needed.add(metric_def(metric.numerator).column or metric.numerator)
            if metric.denominator:
                denom = metric_def(metric.denominator)
                columns_needed.add(denom.column or denom.distinct_column or metric.denominator)

    for col in columns_needed:
        if col in {"order_id", "customer_id"}:
            continue
        if col in frame.columns:
            agg_exprs.append(pl.col(col).sum().alias(col))

    grouped = frame.group_by(keys).agg(
        [
            *agg_exprs,
            pl.col("order_id").n_unique().alias("orders") if "order_id" in frame.columns else pl.lit(0).alias("orders"),
            pl.col("customer_id").n_unique().alias("customers")
            if "customer_id" in frame.columns
            else pl.lit(0).alias("customers"),
        ]
    )

    rows: list[dict[str, Any]] = []
    for record in grouped.iter_rows(named=True):
        base = {key: float(value or 0) for key, value in record.items() if key not in keys}
        row: dict[str, Any] = {}
        for dim, col in zip(group_by, keys, strict=True):
            row[dim] = record.get(col)
            if len(group_by) == 1:
                row[col] = record.get(col)
        row.update(_build_metrics(base, metric_ids))
        if any(metric in metric_ids for metric in ("gross_margin", "cm1", "cm2", "gross_margin_pct", "cm1_pct", "cm2_pct")):
            row["profitability_class"] = classify_profitability(row)
        rows.append(row)
    return rows


def execute_query(facts: pl.DataFrame, raw_query: dict[str, Any]) -> dict[str, Any]:
    query = validate_query(raw_query)
    filtered = apply_filters(facts, query["filters"])
    summary_base = _collect_additive(filtered)
    summary = _build_metrics(summary_base, list(SUMMARY_METRICS))
    extra_metrics = [metric for metric in query["metrics"] if metric not in summary]
    if extra_metrics:
        summary.update(_build_metrics(summary_base, extra_metrics))
    rows = _aggregate_grouped(filtered, query["group_by"], query["metrics"])

    sort = query.get("sort")
    if sort and rows:
        reverse = sort["direction"] == "desc"
        rows.sort(key=lambda row: float(row.get(sort["metric"]) or 0), reverse=reverse)
    limit = query.get("limit")
    if limit is not None:
        rows = rows[:limit]

    return {
        "query": query,
        "summary": summary,
        "rows": rows,
        "metadata": {
            "row_count": filtered.height,
            "filtered": bool(query["filters"]),
        },
    }


def cache_key(query: dict[str, Any], *, dataset_version: int, mapping_version: str, engine_version: str, facts_uri: str) -> str:
    """Stable cache key contract (implementation optional)."""
    import hashlib
    import json

    payload = {
        "facts_uri": facts_uri,
        "dataset_version": dataset_version,
        "mapping_version": mapping_version,
        "engine_version": engine_version,
        "filters": query.get("filters"),
        "group_by": query.get("group_by"),
        "metrics": query.get("metrics"),
        "sort": query.get("sort"),
        "limit": query.get("limit"),
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    return f"fact-query:{digest[:16]}"
