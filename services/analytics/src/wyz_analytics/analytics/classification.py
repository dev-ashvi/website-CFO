"""Profitability classification for margin explorer."""

from __future__ import annotations

from typing import Any


NEGATIVE_GROSS_MARGIN = "negative_gross_margin"
POSITIVE_GM_NEGATIVE_CM1 = "positive_gm_negative_cm1"
POSITIVE_CM1_NEGATIVE_CM2 = "positive_cm1_negative_cm2"
PROFITABLE = "profitable"


CLASS_LABELS = {
    NEGATIVE_GROSS_MARGIN: "Negative Gross Margin — product economics are negative",
    POSITIVE_GM_NEGATIVE_CM1: "Positive GM / Negative CM1 — product margin lost in variable channel costs",
    POSITIVE_CM1_NEGATIVE_CM2: "Positive CM1 / Negative CM2 — acquisition spend exceeds contribution",
    PROFITABLE: "Profitable through CM2",
}


def classify_profitability(row: dict[str, Any]) -> str:
    gm = float(row.get("gross_margin") or 0)
    cm1 = float(row.get("cm1") or 0)
    cm2 = float(row.get("cm2") or 0)
    if gm < 0:
        return NEGATIVE_GROSS_MARGIN
    if cm1 < 0:
        return POSITIVE_GM_NEGATIVE_CM1
    if cm2 < 0:
        return POSITIVE_CM1_NEGATIVE_CM2
    return PROFITABLE
