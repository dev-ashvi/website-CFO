"""Growth analytics from persisted monthly series."""

from __future__ import annotations

from typing import Any


def _growth(current: float | None, previous: float | None) -> dict[str, Any]:
    if current is None or previous is None:
        return {"available": False}
    delta = float(current) - float(previous)
    pct = None if previous == 0 else delta / float(previous)
    return {"available": True, "current": float(current), "previous": float(previous), "delta": delta, "pct": pct}


def enrich_monthly_growth(by_month: tuple[dict[str, Any], ...] | list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows = [dict(item) for item in by_month]
    rows.sort(key=lambda item: str(item.get("order_month") or item.get("month") or ""))
    enriched: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        prev = rows[index - 1] if index > 0 else None
        payload = dict(row)
        payload["month"] = row.get("order_month") or row.get("month")
        payload["growth"] = {
            "net_revenue": _growth(row.get("net_revenue"), prev.get("net_revenue") if prev else None),
            "orders": _growth(row.get("orders"), prev.get("orders") if prev else None),
            "customers": _growth(row.get("customers"), prev.get("customers") if prev else None),
            "units": _growth(row.get("units"), prev.get("units") if prev else None),
            "aov": _growth(row.get("aov"), prev.get("aov") if prev else None),
        }
        enriched.append(payload)

    yoy_available = False
    if len(rows) >= 13:
        months = [str(item.get("order_month") or item.get("month") or "") for item in rows]
        yoy_available = any(
            f"{int(month[:4]) - 1}{month[4:]}" in months
            for month in months
            if len(month) >= 7 and month[4] == "-"
        )

    meta = {
        "mom_available": len(rows) >= 2,
        "yoy_available": yoy_available,
        "month_count": len(rows),
    }
    return enriched, meta


def growth_for_dimension_rows(
    rows: list[dict[str, Any]],
    month_slices: list[dict[str, Any]],
    entity_key: str,
) -> list[dict[str, Any]]:
    by_entity: dict[str, list[dict[str, Any]]] = {}
    for item in month_slices:
        entity = item.get(entity_key)
        if entity is None:
            continue
        by_entity.setdefault(str(entity), []).append(dict(item))

    updated = []
    for row in rows:
        entity = str(row.get("_entity") or row.get(entity_key) or "")
        history = sorted(by_entity.get(entity, []), key=lambda item: str(item.get("order_month") or ""))
        growth = {"available": False, "reason": "insufficient_monthly_history"}
        if len(history) >= 2:
            current = history[-1]
            previous = history[-2]
            delta = float(current.get("net_revenue") or 0) - float(previous.get("net_revenue") or 0)
            pct = _growth(current.get("net_revenue"), previous.get("net_revenue"))
            growth = {
                "available": True,
                "period": {
                    "current": current.get("order_month"),
                    "previous": previous.get("order_month"),
                },
                "net_revenue": pct,
                "contribution_delta": delta,
            }
        payload = dict(row)
        payload["growth"] = growth
        updated.append(payload)
    return updated
