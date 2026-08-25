"""Verified strategic conflicts — preserve tension, do not collapse to good/bad."""

from __future__ import annotations

from enum import Enum
from typing import Any


class StrategicConflict(str, Enum):
    GROWTH_VS_MARGIN = "GROWTH_VS_MARGIN"
    ENTITY_VS_PARENT = "ENTITY_VS_PARENT"
    SHORT_TERM_VS_LONG_TERM = "SHORT_TERM_VS_LONG_TERM"


def detect_strategic_conflicts(
    *,
    summary: dict[str, Any] | None,
    signals: list[dict[str, Any]] | None = None,
    change_evidence: list[dict[str, Any]] | None = None,
    trend_payload: dict[str, Any] | None = None,
) -> list[StrategicConflict]:
    """Return only conflicts supported by verified numbers / signals."""
    conflicts: list[StrategicConflict] = []
    summary = summary or {}

    net = summary.get("net_revenue")
    cm2 = summary.get("cm2")
    cm2_pct = summary.get("cm2_pct")

    # Growth vs margin: revenue healthy/growing while CM2 weak/deteriorating.
    revenue_up = False
    cm2_down = False
    for item in change_evidence or []:
        if not isinstance(item, dict):
            continue
        metric = str(item.get("metric") or "")
        direction = str(item.get("direction") or "").lower()
        if metric == "net_revenue" and direction == "up":
            revenue_up = True
        if metric in {"cm2", "cm2_pct"} and direction == "down":
            cm2_down = True

    if not revenue_up and trend_payload:
        rows = sorted(
            [r for r in (trend_payload.get("rows") or []) if isinstance(r, dict)],
            key=lambda r: str(r.get("month") or ""),
        )
        if len(rows) >= 2:
            try:
                r0 = float(rows[-2].get("net_revenue")) if rows[-2].get("net_revenue") is not None else None
                r1 = float(rows[-1].get("net_revenue")) if rows[-1].get("net_revenue") is not None else None
                c0 = float(rows[-2].get("cm2")) if rows[-2].get("cm2") is not None else None
                c1 = float(rows[-1].get("cm2")) if rows[-1].get("cm2") is not None else None
            except (TypeError, ValueError):
                r0 = r1 = c0 = c1 = None
            if r0 is not None and r1 is not None and r1 > r0:
                revenue_up = True
            if c0 is not None and c1 is not None and c1 < c0:
                cm2_down = True

    if revenue_up and (cm2_down or (cm2 is not None and float(cm2) < 0)):
        conflicts.append(StrategicConflict.GROWTH_VS_MARGIN)
    elif net is not None and float(net) > 0 and cm2 is not None and float(cm2) < 0 and (
        cm2_pct is not None and float(cm2_pct) < 0
    ):
        # Strong top-line with negative CM2 under current scope — soft growth/margin tension.
        conflicts.append(StrategicConflict.GROWTH_VS_MARGIN)

    # Entity vs parent: negative contributor entity while population/parent still positive signals exist.
    has_negative_entity = False
    has_positive_parentish = False
    for signal in signals or []:
        if not isinstance(signal, dict):
            continue
        st = str(signal.get("signal_type") or "")
        if st in {"NEGATIVE_CM2_CONTRIBUTOR", "HIGH_REVENUE_NEGATIVE_CM2", "positive_cm1_negative_cm2"}:
            if signal.get("entity_type") in {"sku", "category", "channel"}:
                has_negative_entity = True
        if st in {"TOP_CM2_CONTRIBUTOR", "TOP_CM1_CONTRIBUTOR"}:
            has_positive_parentish = True
    if has_negative_entity and has_positive_parentish:
        conflicts.append(StrategicConflict.ENTITY_VS_PARENT)

    # Short vs long: temporary weakness vs deteriorating multi-period
    directions = [
        str(item.get("direction") or "").lower()
        for item in (change_evidence or [])
        if isinstance(item, dict) and str(item.get("metric") or "") in {"cm2", "cm2_pct"}
    ]
    if "up" in directions and "down" in directions:
        conflicts.append(StrategicConflict.SHORT_TERM_VS_LONG_TERM)

    # Dedupe preserve order
    seen: set[StrategicConflict] = set()
    out: list[StrategicConflict] = []
    for item in conflicts:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out
