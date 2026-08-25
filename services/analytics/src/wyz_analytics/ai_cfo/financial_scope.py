"""Canonical Revenue & Margin financial scope for dashboard, signals, and AI CFO.

Uses the existing query filter contract from `facts.models.validate_query`.
Does not introduce a second filter schema.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from wyz_analytics.facts.models import validate_query
from wyz_analytics.facts.schema import FILTER_DIMENSIONS, RANGE_FILTER_KEYS

SCOPE_DIMENSION_KEYS = (
    "channel",
    "category",
    "sku",
    "region",
    "state",
    "city_tier",
    "new_repeat",
    "platform",
)

SCOPE_RANGE_KEYS = ("month_from", "month_to")


def normalize_scope_filters(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize filters so logically identical scopes hash identically.

    List values are sorted; empty lists are dropped; unknown keys are rejected
    via the existing query validator.
    """
    validated = validate_query({"filters": raw or {}, "metrics": ["net_revenue"]})
    filters = dict(validated.get("filters") or {})
    normalized: dict[str, Any] = {}
    for key in (*SCOPE_RANGE_KEYS, *sorted(FILTER_DIMENSIONS), *sorted(RANGE_FILTER_KEYS)):
        if key not in filters:
            continue
        value = filters[key]
        if isinstance(value, list):
            unique_sorted = sorted({str(item) for item in value if str(item)})
            if unique_sorted:
                normalized[key] = unique_sorted
        elif value not in (None, ""):
            normalized[key] = str(value)
    return normalized


def compute_scope_hash(dataset_id: str | None, filters: dict[str, Any] | None) -> str:
    payload = {
        "dataset_id": str(dataset_id or ""),
        "filters": normalize_scope_filters(filters),
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    return f"scope_{digest[:16]}"


def build_financial_scope(
    *,
    dataset_id: str | None = None,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized = normalize_scope_filters(filters)
    scope: dict[str, Any] = {
        "dataset_id": dataset_id,
        "filters": normalized,
        "scope_hash": compute_scope_hash(dataset_id, normalized),
    }
    for key in (*SCOPE_RANGE_KEYS, *SCOPE_DIMENSION_KEYS):
        if key in normalized:
            scope[key] = normalized[key]
        elif key in SCOPE_DIMENSION_KEYS:
            scope[key] = []
        else:
            scope[key] = None
    return scope


def filters_match_scope(left: dict[str, Any] | None, right: dict[str, Any] | None) -> bool:
    return normalize_scope_filters(left) == normalize_scope_filters(right)


def evidence_matches_active_scope(
    item: dict[str, Any] | None,
    *,
    active_filters: dict[str, Any] | None,
    active_scope_hash: str | None = None,
) -> bool:
    """True only when the item was computed under the active financial scope."""
    if not item:
        return False
    item_scope = item.get("scope") if isinstance(item.get("scope"), dict) else {}
    item_hash = item.get("scope_hash") or item_scope.get("scope_hash")
    if active_scope_hash and item_hash:
        return item_hash == active_scope_hash
    item_filters = item_scope.get("filters")
    if item_filters is None and not active_filters:
        return True
    return filters_match_scope(item_filters, active_filters)
