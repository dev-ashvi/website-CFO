"""Query request validation and normalization."""

from __future__ import annotations

from typing import Any

from wyz_analytics.facts.metrics import ALLOWED_METRICS
from wyz_analytics.facts.schema import (
    DIMENSION_COLUMNS,
    FILTER_DIMENSIONS,
    GROUP_BY_DIMENSIONS,
    RANGE_FILTER_KEYS,
)
from wyz_analytics.workers.errors import AnalyticsError, INVALID_QUERY


def _normalize_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value if item is not None and str(item) != ""]
    raise AnalyticsError(INVALID_QUERY, f"Filter values must be a string or list, got {type(value).__name__}.")


def validate_query(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise AnalyticsError(INVALID_QUERY, "Query body must be a JSON object.")

    filters_in = raw.get("filters") or {}
    if not isinstance(filters_in, dict):
        raise AnalyticsError(INVALID_QUERY, "filters must be an object.")

    filters: dict[str, Any] = {}
    for key, value in filters_in.items():
        if key in RANGE_FILTER_KEYS:
            if value is None or str(value) == "":
                continue
            filters[key] = str(value)
            continue
        if key not in FILTER_DIMENSIONS:
            raise AnalyticsError(INVALID_QUERY, f"Unknown filter dimension: {key}")
        values = _normalize_list(value)
        if values:
            filters[key] = values

    group_by_raw = raw.get("group_by") or []
    if group_by_raw is None:
        group_by_raw = []
    if isinstance(group_by_raw, str):
        group_by = [group_by_raw]
    elif isinstance(group_by_raw, list):
        group_by = [str(item) for item in group_by_raw if item]
    else:
        raise AnalyticsError(INVALID_QUERY, "group_by must be a string or list.")

    if len(group_by) > 2:
        raise AnalyticsError(INVALID_QUERY, "At most two group_by dimensions are supported.")
    for dim in group_by:
        if dim not in GROUP_BY_DIMENSIONS:
            raise AnalyticsError(INVALID_QUERY, f"Unknown group_by dimension: {dim}")

    metrics_in = raw.get("metrics") or []
    if not metrics_in:
        metrics = ["net_revenue"]
    else:
        metrics = [str(item) for item in metrics_in]
    for metric in metrics:
        if metric not in ALLOWED_METRICS:
            raise AnalyticsError(INVALID_QUERY, f"Unknown metric: {metric}")

    sort_in = raw.get("sort")
    sort: dict[str, str] | None = None
    if sort_in is not None:
        if not isinstance(sort_in, dict):
            raise AnalyticsError(INVALID_QUERY, "sort must be an object.")
        metric = str(sort_in.get("metric") or "")
        direction = str(sort_in.get("direction") or "desc").lower()
        if metric not in ALLOWED_METRICS:
            raise AnalyticsError(INVALID_QUERY, f"Unknown sort metric: {metric}")
        if direction not in {"asc", "desc"}:
            raise AnalyticsError(INVALID_QUERY, "sort.direction must be asc or desc.")
        sort = {"metric": metric, "direction": direction}

    limit = raw.get("limit")
    if limit is not None:
        try:
            limit = int(limit)
        except (TypeError, ValueError) as exc:
            raise AnalyticsError(INVALID_QUERY, "limit must be an integer.") from exc
        if limit < 1:
            raise AnalyticsError(INVALID_QUERY, "limit must be at least 1.")

    return {
        "dataset_id": raw.get("dataset_id"),
        "analysis_job_id": raw.get("analysis_job_id"),
        "workspace_id": raw.get("workspace_id"),
        "filters": filters,
        "group_by": group_by,
        "metrics": metrics,
        "sort": sort,
        "limit": limit,
    }


def group_by_columns(group_by: list[str]) -> list[str]:
    return [DIMENSION_COLUMNS[dim] for dim in group_by]
