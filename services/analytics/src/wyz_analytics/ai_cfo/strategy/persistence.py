"""Temporal persistence classification from trend / ChangeEvidence."""

from __future__ import annotations

from enum import Enum
from typing import Any


class TemporalPersistence(str, Enum):
    TEMPORARY = "TEMPORARY"
    PERSISTENT = "PERSISTENT"
    IMPROVING = "IMPROVING"
    DETERIORATING = "DETERIORATING"
    UNKNOWN = "UNKNOWN"


# Need at least this many months of history to claim persistence (not BeautyCo-specific).
_MIN_MONTHS_FOR_PERSISTENCE = 3
_MIN_CONSECUTIVE_WEAK = 3


def classify_temporal_persistence(
    *,
    trend_payload: dict[str, Any] | None = None,
    change_evidence: list[dict[str, Any]] | None = None,
    metric: str = "cm2",
) -> TemporalPersistence:
    """Classify persistence only when sufficient history exists.

    Rules (deterministic):
    - < 3 month rows → UNKNOWN
    - last month weak + prior month not weak → TEMPORARY
    - last 3+ consecutive months weak (metric < 0) → PERSISTENT
    - last change up after weakness → IMPROVING
    - last change down and recent weakness → DETERIORATING
    - otherwise UNKNOWN
    """
    rows = list((trend_payload or {}).get("rows") or [])
    rows = [r for r in rows if isinstance(r, dict) and r.get("month") not in (None, "")]
    rows.sort(key=lambda r: str(r.get("month") or ""))

    if len(rows) < _MIN_MONTHS_FOR_PERSISTENCE:
        _ = change_evidence  # ChangeEvidence alone cannot establish multi-month persistence.
        return TemporalPersistence.UNKNOWN

    values: list[float | None] = []
    for row in rows:
        raw = row.get(metric)
        try:
            values.append(float(raw) if raw is not None else None)
        except (TypeError, ValueError):
            values.append(None)

    def _weak(v: float | None) -> bool:
        return v is not None and v < 0

    trailing = 0
    for v in reversed(values):
        if _weak(v):
            trailing += 1
        else:
            break

    if trailing >= _MIN_CONSECUTIVE_WEAK:
        return TemporalPersistence.PERSISTENT

    if trailing == 1 and len(values) >= 2 and not _weak(values[-2]):
        return TemporalPersistence.TEMPORARY

    last_two = [v for v in values[-2:] if v is not None]
    if len(last_two) == 2:
        delta = last_two[-1] - last_two[-2]
        if delta > 0 and _weak(values[-2]):
            return TemporalPersistence.IMPROVING
        if delta < 0 and (_weak(values[-1]) or _weak(values[-2])):
            return TemporalPersistence.DETERIORATING

    for item in change_evidence or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("metric") or "") != metric:
            continue
        direction = str(item.get("direction") or "").lower()
        if direction == "down":
            return TemporalPersistence.DETERIORATING
        if direction == "up":
            return TemporalPersistence.IMPROVING

    return TemporalPersistence.UNKNOWN
