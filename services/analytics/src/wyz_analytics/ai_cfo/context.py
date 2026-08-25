"""Build compact Financial Intelligence Context for AI CFO."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def build_context_hash(payload: dict[str, Any]) -> str:
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    return f"ctx_{digest[:16]}"


def build_financial_intelligence_context(
    *,
    lineage: dict[str, Any],
    analytical: dict[str, Any],
    summary: dict[str, Any],
    signals: list[dict[str, Any]],
    reconciliation: dict[str, Any] | None = None,
    methodology: dict[str, Any] | None = None,
) -> dict[str, Any]:
    period = {
        "month_from": analytical.get("filters", {}).get("month_from"),
        "month_to": analytical.get("filters", {}).get("month_to"),
    }
    caveats = [
        "Financial metrics are computed by the deterministic WYZ engine and query layer.",
        "Channel-level CM2 uses attributed marketing allocation and should not be treated as fully-loaded profitability.",
    ]
    if methodology:
        if methodology.get("platform_to_channel"):
            caveats.append("Marketing spend is allocated using the active platform-to-channel attribution map.")
    recon = reconciliation or {}
    ctx = {
        "meta": {
            "workspace_id": lineage.get("workspace_id"),
            "dataset_id": lineage.get("dataset_id"),
            "dataset_version": lineage.get("dataset_version"),
            "analysis_job_id": lineage.get("job_id"),
            "engine_version": lineage.get("engine_version"),
            "mapping_version": lineage.get("mapping_version"),
            "reconciled": bool(recon.get("ok")),
        },
        "period": period,
        "filters": analytical.get("filters") or {},
        "surface": analytical.get("surface"),
        "dimension": analytical.get("dimension"),
        "metric": analytical.get("metric"),
        "summary": summary,
        "signals": signals[:8],
        "caveats": caveats,
    }
    ctx["financial_scope"] = {
        "dataset_id": lineage.get("dataset_id"),
        "filters": ctx["filters"],
    }
    ctx["meta"]["context_version"] = build_context_hash(
        {
            "lineage": ctx["meta"],
            "period": period,
            "filters": ctx["filters"],
            "surface": ctx["surface"],
            "dimension": ctx["dimension"],
        }
    )
    return ctx
