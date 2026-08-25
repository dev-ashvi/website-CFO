"""Persist engine-produced analysis results. No financial recalculation."""

from __future__ import annotations

from typing import Any

from wyz_analytics.analytics.enrichment import build_explorer_analytics
from wyz_analytics.contracts.results import EngineResult
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.workers.jobs import utc_now


def build_analysis_result(
    *,
    job,
    dataset: dict[str, Any],
    engine_result: EngineResult,
    sources,
    readiness: dict[str, Any],
    methodology: dict[str, Any] | None,
    lines=None,
    facts_uri: str | None = None,
) -> dict[str, Any]:
    fact_lines = lines if lines is not None else sources.order_lines
    orders = int(fact_lines["order_id"].n_unique()) if "order_id" in fact_lines.columns else None
    customers = int(fact_lines["customer_id"].n_unique()) if "customer_id" in fact_lines.columns else None
    units = float(fact_lines["quantity"].sum()) if "quantity" in fact_lines.columns else None
    recon = engine_result.reconciliation.to_dict()
    failed = [check["name"] for check in recon.get("checks") or [] if not check.get("ok")]
    waterfall = engine_result.waterfall.to_dict()
    limitations = []
    if readiness.get("grain_warnings"):
        limitations.append("grain_mismatch")
    if readiness.get("relationship_warnings"):
        limitations.append("relationship_warnings")
    if any(not item.get("ok") for item in readiness.get("joins") or []):
        limitations.append("join_coverage")
    lineage = {
        "workspace_id": job.workspace_id,
        "dataset_id": job.dataset_id,
        "dataset_version": job.dataset_version,
        "mapping_version": job.mapping_version,
        "engine_version": engine_result.engine_version,
        "engine_id": engine_result.engine_id,
        "job_id": job.job_id,
        "result_id": f"res_{job.job_id}",
        "facts_uri": facts_uri,
    }
    company = {
        **waterfall,
        "orders": orders,
        "units": units,
        "customers": customers,
    }
    explorers = build_explorer_analytics(
        engine_result,
        lines=fact_lines,
        sources=sources,
    )
    explorers["company"]["customers"] = customers
    explorers["company"]["orders"] = orders
    explorers["company"]["units"] = units
    return {
        "result_id": lineage["result_id"],
        "job_id": job.job_id,
        "workspace_id": job.workspace_id,
        "dataset_id": job.dataset_id,
        "dataset_version": job.dataset_version,
        "mapping_version": job.mapping_version,
        "engine_id": engine_result.engine_id,
        "engine_version": engine_result.engine_version,
        "created_at": utc_now(),
        "company": company,
        "waterfall": waterfall,
        "orders": orders,
        "units": units,
        "customers": customers,
        "validation": readiness,
        "reconciliation": {
            "ok": recon.get("ok"),
            "failed_checks": failed,
            "check_count": len(recon.get("checks") or []),
            "checks": recon.get("checks") or [],
        },
        "reconciled": bool(recon.get("ok")),
        "limitations": limitations,
        "by_channel": list(engine_result.by_channel),
        "by_category": list(engine_result.by_category),
        "by_sku": list(engine_result.by_sku),
        "by_month": list(engine_result.by_month),
        "by_channel_month": list(engine_result.extras.get("by_channel_month") or []),
        "by_category_month": list(engine_result.extras.get("by_category_month") or []),
        "explorers": explorers,
        "methodology": methodology or {},
        "lineage": lineage,
        "facts_uri": facts_uri,
        "dataset_name": dataset.get("name"),
    }
