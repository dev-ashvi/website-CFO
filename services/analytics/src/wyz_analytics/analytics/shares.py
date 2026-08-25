"""Share and mix analytics from engine dimensional rows."""

from __future__ import annotations

from typing import Any


def enrich_dimension_rows(rows: list[dict[str, Any]], entity_key: str) -> list[dict[str, Any]]:
    totals = {
        "net_revenue": sum(float(row.get("net_revenue") or 0) for row in rows),
        "orders": sum(float(row.get("orders") or 0) for row in rows),
        "units": sum(float(row.get("units") or 0) for row in rows),
        "customers": sum(float(row.get("customers") or 0) for row in rows),
    }
    enriched = []
    for row in rows:
        entity = row.get(entity_key)
        net = float(row.get("net_revenue") or 0)
        payload = dict(row)
        payload["_entity"] = entity
        payload["net_aov"] = row.get("aov")
        payload["gross_aov"] = None if not row.get("orders") else float(row.get("gross_revenue") or 0) / float(row["orders"])
        payload["units_per_order"] = None if not row.get("orders") else float(row.get("units") or 0) / float(row["orders"])
        payload["revenue_share"] = None if totals["net_revenue"] == 0 else net / totals["net_revenue"]
        payload["order_share"] = None if totals["orders"] == 0 else float(row.get("orders") or 0) / totals["orders"]
        payload["unit_share"] = None if totals["units"] == 0 else float(row.get("units") or 0) / totals["units"]
        payload["customer_share"] = None if totals["customers"] == 0 else float(row.get("customers") or 0) / totals["customers"]
        enriched.append(payload)
    return enriched


def mix_shares(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "revenue": [{"entity": row.get("_entity"), "share": row.get("revenue_share")} for row in rows if row.get("revenue_share") is not None],
        "orders": [{"entity": row.get("_entity"), "share": row.get("order_share")} for row in rows if row.get("order_share") is not None],
        "units": [{"entity": row.get("_entity"), "share": row.get("unit_share")} for row in rows if row.get("unit_share") is not None],
        "customers": [{"entity": row.get("_entity"), "share": row.get("customer_share")} for row in rows if row.get("customer_share") is not None],
    }
