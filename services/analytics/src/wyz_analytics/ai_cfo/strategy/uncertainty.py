"""Bounded strategic uncertainty taxonomy."""

from __future__ import annotations

from enum import Enum
from typing import Any


class StrategicUnknown(str, Enum):
    """Known-unknown categories that cap decision confidence.

    Presence of an enum value does NOT imply we can estimate it.
    """

    DEMAND_RESPONSE = "DEMAND_RESPONSE"
    PRICE_ELASTICITY = "PRICE_ELASTICITY"
    CUSTOMER_SENTIMENT = "CUSTOMER_SENTIMENT"
    CAC_LTV = "CAC_LTV"
    RETENTION = "RETENTION"
    COMPETITIVE_RESPONSE = "COMPETITIVE_RESPONSE"
    OPERATIONAL_FEASIBILITY = "OPERATIONAL_FEASIBILITY"
    ATTRIBUTION_LIMITATION = "ATTRIBUTION_LIMITATION"
    DATA_COMPLETENESS = "DATA_COMPLETENESS"
    TEMPORAL_STABILITY = "TEMPORAL_STABILITY"


_THEME_UNKNOWNS: dict[str, list[StrategicUnknown]] = {
    "MARKETING": [
        StrategicUnknown.DEMAND_RESPONSE,
        StrategicUnknown.CAC_LTV,
        StrategicUnknown.ATTRIBUTION_LIMITATION,
        StrategicUnknown.TEMPORAL_STABILITY,
    ],
    "CHANNEL_EXIT": [
        StrategicUnknown.RETENTION,
        StrategicUnknown.OPERATIONAL_FEASIBILITY,
        StrategicUnknown.TEMPORAL_STABILITY,
        StrategicUnknown.DATA_COMPLETENESS,
        StrategicUnknown.COMPETITIVE_RESPONSE,
    ],
    "SKU_EXIT": [
        StrategicUnknown.OPERATIONAL_FEASIBILITY,
        StrategicUnknown.RETENTION,
        StrategicUnknown.DATA_COMPLETENESS,
        StrategicUnknown.TEMPORAL_STABILITY,
    ],
    "PRICE": [
        StrategicUnknown.PRICE_ELASTICITY,
        StrategicUnknown.DEMAND_RESPONSE,
        StrategicUnknown.COMPETITIVE_RESPONSE,
    ],
    "PRODUCT_COST": [
        StrategicUnknown.OPERATIONAL_FEASIBILITY,
        StrategicUnknown.TEMPORAL_STABILITY,
    ],
    "PRIORITIZE": [
        StrategicUnknown.TEMPORAL_STABILITY,
        StrategicUnknown.DATA_COMPLETENESS,
    ],
    "GENERIC": [StrategicUnknown.DATA_COMPLETENESS],
}


def resolve_theme_unknowns(
    theme: Any,
    *,
    pack: Any | None = None,
    message: str | None = None,
) -> list[StrategicUnknown]:
    """Theme-specific unknowns — avoids cross-theme contamination."""
    theme_key = getattr(theme, "value", theme)
    theme_key = str(theme_key or "GENERIC").upper()
    base = list(_THEME_UNKNOWNS.get(theme_key, _THEME_UNKNOWNS["GENERIC"]))
    if pack is None:
        return _dedupe(base)

    flags = getattr(pack, "evidence_flags", None) or set()
    from wyz_analytics.ai_cfo.strategy.evidence_requirements import EvidenceFlag

    if theme_key == "MARKETING" and EvidenceFlag.HAS_MARKETING_METRIC in flags:
        if StrategicUnknown.ATTRIBUTION_LIMITATION not in base:
            base.append(StrategicUnknown.ATTRIBUTION_LIMITATION)
    if theme_key == "CHANNEL_EXIT":
        driver = getattr(pack, "driver_stage", None)
        if driver == "MARKETING" and StrategicUnknown.DEMAND_RESPONSE not in base:
            base.append(StrategicUnknown.DEMAND_RESPONSE)
    return _dedupe(base)


def infer_unknowns_for_question(message: str) -> list[StrategicUnknown]:
    """Lightweight message-only unknown hints — do not use for strategic pack assembly."""
    text = (message or "").lower()
    unknowns: list[StrategicUnknown] = []
    if any(token in text for token in ("price", "pricing", "increase prices", "raise prices")):
        unknowns.append(StrategicUnknown.PRICE_ELASTICITY)
    if any(token in text for token in ("cut marketing", "reduce marketing", "marketing spend", "acquisition")):
        unknowns.append(StrategicUnknown.DEMAND_RESPONSE)
    return _dedupe(unknowns)


def _dedupe(items: list[StrategicUnknown]) -> list[StrategicUnknown]:
    seen: set[StrategicUnknown] = set()
    out: list[StrategicUnknown] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out
