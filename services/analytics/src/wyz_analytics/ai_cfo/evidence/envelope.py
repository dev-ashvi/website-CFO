"""Deterministic EvidenceEnvelope for AI CFO turns."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.answer_contract import DriverStage, resolve_claim_budget
from wyz_analytics.ai_cfo.financial_scope import (
    build_financial_scope,
    evidence_matches_active_scope,
    normalize_scope_filters,
)

SIGNAL_ROLE_MAP: dict[str, str] = {
    "TOP_CM2_CONTRIBUTOR": "TOP_CONTRIBUTOR",
    "TOP_CM1_CONTRIBUTOR": "TOP_CONTRIBUTOR",
    "TOP_GM_CONTRIBUTOR": "TOP_CONTRIBUTOR",
    "NEGATIVE_CM2_CONTRIBUTOR": "NEGATIVE_CONTRIBUTOR",
    "HIGH_REVENUE_NEGATIVE_CM2": "MARGIN_PRESSURE",
    "HIGH_REVENUE_LOW_CM2": "MARGIN_PRESSURE",
    "positive_cm1_negative_cm2": "MARGIN_PRESSURE",
    "positive_gm_negative_cm1": "MARGIN_PRESSURE",
    "negative_gross_margin": "MARGIN_PRESSURE",
    "MARKETING_PRESSURE": "COST_CONCENTRATION",
    "CHANNEL_COST_PRESSURE": "COST_CONCENTRATION",
    "PRODUCT_COGS_PRESSURE": "COST_CONCENTRATION",
}


def build_evidence_envelope(message: str, context: dict[str, Any]) -> dict[str, Any]:
    budget = resolve_claim_budget(message)
    summary = context.get("summary") or {}
    financial_scope = context.get("financial_scope") or build_financial_scope(
        dataset_id=(context.get("meta") or {}).get("dataset_id"),
        filters=context.get("filters") or {},
    )
    filters = normalize_scope_filters(financial_scope.get("filters") or context.get("filters") or {})
    scope_hash = str(financial_scope.get("scope_hash") or "")
    dataset_id = financial_scope.get("dataset_id") or (context.get("meta") or {}).get("dataset_id")
    dimension = str(context.get("dimension") or "channel")

    def _stamp(item: dict[str, Any]) -> dict[str, Any]:
        scope = dict(item.get("scope") or {})
        scope["dataset_id"] = dataset_id
        scope["filters"] = dict(filters)
        scope["scope_hash"] = scope_hash
        item["scope"] = scope
        item["dataset_id"] = dataset_id
        item["scope_hash"] = scope_hash
        return item

    facts = []
    for key, value in summary.items():
        if value is None:
            continue
        facts.append(
            _stamp(
                {
                    "evidence_id": f"summary:{key}",
                    "metric": key,
                    "value": value,
                    "unit": "%" if key.endswith("_pct") else "INR",
                    "scope": {"filters": filters, "dimension": dimension},
                    "source": "current_financial_view",
                    "semantic_roles": [],
                }
            )
        )

    signals = []
    for signal in (context.get("signals") or [])[:12]:
        role = SIGNAL_ROLE_MAP.get(str(signal.get("signal_type") or ""), "OBSERVATION")
        evidence = signal.get("evidence") or {}
        entity_type = str(signal.get("entity_type") or dimension)
        entity = str(signal.get("entity") or "")
        for metric, value in evidence.items():
            if value is None:
                continue
            signals.append(
                _stamp(
                    {
                        "evidence_id": f"signal:{signal.get('signal_type')}:{entity_type}:{entity}:{metric}",
                        "metric": metric,
                        "value": value,
                        "unit": "%" if str(metric).endswith("_pct") else "INR",
                        "scope": {
                            "filters": filters,
                            "dimension": entity_type,
                            "dimension_value": entity,
                        },
                        "source": "cfo_signal",
                        "semantic_roles": [role],
                        "entity": entity,
                        "signal_type": signal.get("signal_type"),
                        "stage": signal.get("stage"),
                    }
                )
            )

    tool_results = []
    for tool_name, payload in (context.get("forced_evidence") or {}).items():
        if not isinstance(payload, dict):
            continue
        # Scoped cost breakdown: component evidence (VERIFIED_FACT provenance).
        if tool_name == "get_cost_breakdown":
            recon = payload.get("reconciliation") or {}
            recon_status = str(recon.get("status") or "")
            for section_key, block in (
                ("product_cogs", payload.get("product_cogs") or {}),
                ("cm1_costs", payload.get("cm1_costs") or {}),
            ):
                total = block.get("total")
                if total is not None:
                    tool_results.append(
                        _stamp(
                            {
                                "evidence_id": f"cost:{section_key}:total",
                                "metric": f"{section_key}_total",
                                "value": total,
                                "unit": "INR",
                                "scope": {"filters": filters, "dimension": dimension},
                                "source": "get_cost_breakdown",
                                "semantic_roles": ["COST_COMPONENT"],
                                "provenance": "VERIFIED_FACT",
                                "reconciliation_status": recon_status or None,
                            }
                        )
                    )
                for row in block.get("components") or []:
                    if not isinstance(row, dict) or row.get("value") is None:
                        continue
                    key = str(row.get("key") or "")
                    if not key:
                        continue
                    tool_results.append(
                        _stamp(
                            {
                                "evidence_id": f"cost:{section_key}:{key}",
                                "metric": key,
                                "value": row.get("value"),
                                "unit": "INR",
                                "scope": {"filters": filters, "dimension": dimension},
                                "source": "get_cost_breakdown",
                                "semantic_roles": ["COST_COMPONENT"],
                                "provenance": "VERIFIED_FACT",
                                "reconciliation_status": recon_status or None,
                            }
                        )
                    )
            continue
        rows = payload.get("rows") or []
        for index, row in enumerate(rows[:30]):
            if not isinstance(row, dict):
                continue
            row_dim = None
            row_val = None
            for dim in ("channel", "category", "subcategory", "sku", "region", "platform", "month"):
                if dim in row and row.get(dim) not in (None, ""):
                    row_dim = dim
                    row_val = row.get(dim)
                    break
            for metric, value in row.items():
                if metric in {"channel", "category", "subcategory", "sku", "region", "platform", "month"}:
                    continue
                if value is None:
                    continue
                tool_results.append(
                    _stamp(
                        {
                            "evidence_id": f"tool:{tool_name}:{index}:{metric}",
                            "metric": metric,
                            "value": value,
                            "unit": "%" if str(metric).endswith("_pct") else "INR",
                            "scope": {
                                "filters": filters,
                                "dimension": row_dim or dimension,
                                "dimension_value": row_val,
                            },
                            "source": tool_name,
                            "semantic_roles": [],
                            "entity": row_val,
                        }
                    )
                )

    def _in_scope(item: dict[str, Any]) -> bool:
        return evidence_matches_active_scope(
            item, active_filters=filters, active_scope_hash=scope_hash
        )

    facts = [item for item in facts if _in_scope(item)]
    signals = [item for item in signals if _in_scope(item)]
    tool_results = [item for item in tool_results if _in_scope(item)]

    current_scope = {
        "dataset_id": dataset_id,
        "filters": filters,
        "surface": context.get("surface"),
        "dimension": dimension,
        "period": context.get("period"),
        "scope_hash": scope_hash,
    }
    return {
        "current_scope": current_scope,
        "scope_hash": scope_hash,
        "allowed_metrics": sorted({item["metric"] for item in facts + signals + tool_results}),
        "verified_facts": facts,
        "verified_signals": signals,
        "tool_results": tool_results,
        "methodology_caveats": list(context.get("caveats") or []),
        "allowed_driver_stages": [stage.value for stage in DriverStage],
        "claim_budget": {
            "evidence_items_max": budget.evidence_items_max,
            "numeric_claims_max": budget.numeric_claims_max,
            "mode": budget.mode,
        },
    }


def envelope_evidence_index(envelope: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = {}
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in envelope.get(section) or []:
            metric = str(item.get("metric") or "")
            if not metric:
                continue
            index.setdefault(metric, []).append(item)
    return index
