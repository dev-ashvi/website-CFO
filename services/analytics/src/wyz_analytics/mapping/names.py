"""Name normalization and alias lookup for deterministic mapping."""

from __future__ import annotations

import re

from wyz_analytics.schemas.fields import CanonicalSchema, FieldSupply

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_name(name: str) -> str:
    text = str(name or "").strip().lower().replace("%", "pct")
    text = _NON_ALNUM.sub("_", text).strip("_")
    return text


def alias_index(schema: CanonicalSchema) -> dict[str, str]:
    """normalized token → canonical field for mappable fields only."""
    index: dict[str, str] = {}
    for spec in schema.mappable_fields():
        if spec.supply == FieldSupply.ENGINE_CALCULATED:
            continue
        keys = (spec.name, *spec.aliases)
        for key in keys:
            token = normalize_name(key)
            if token and token not in index:
                index[token] = spec.name
    return index
