"""Deterministic scenario engine.

Reuses canonical Revenue & Margin identities from the fact / line-economics layer:

  gross_margin = net_revenue − product_cogs
  cm1          = gross_margin − cm1_cost
  cm2          = cm1 − allocated_marketing
  *_pct        = metric / net_revenue

Baseline additive metrics come from execute_query under the active FinancialScope.
Scenario values are recomputed from those identities after applying lever changes.
No second formula set; no LLM arithmetic.
"""

from __future__ import annotations

import time
from copy import deepcopy
from typing import Any

from wyz_analytics.ai_cfo.scenario.spec import (
    HOLD_CONSTANT_ASSUMPTION,
    ScenarioChange,
    ScenarioLever,
    ScenarioOperation,
    ScenarioSpec,
)
from wyz_analytics.ai_cfo.tools import AiCfoTools

# Explicit dependency map (production engine semantics).
# Upstream metrics are held constant unless a lever mutates them.
LEVER_DOWNSTREAM: dict[ScenarioLever, tuple[str, ...]] = {
    ScenarioLever.MARKETING_SPEND: (
        "allocated_marketing",
        "marketing_pct",
        "cm2",
        "cm2_pct",
    ),
    ScenarioLever.PRODUCT_COGS: (
        "product_cogs",
        "gross_margin",
        "gross_margin_pct",
        "cm1",
        "cm1_pct",
        "cm2",
        "cm2_pct",
    ),
    ScenarioLever.CM1_COSTS: (
        "cm1_cost",
        "cm1",
        "cm1_pct",
        "cm2",
        "cm2_pct",
    ),
}

BASELINE_METRICS = (
    "net_revenue",
    "product_cogs",
    "gross_margin",
    "gross_margin_pct",
    "cm1_cost",
    "cm1",
    "cm1_pct",
    "allocated_marketing",
    "marketing_pct",
    "cm2",
    "cm2_pct",
)

# Provenance tags
PROVENANCE_BASELINE = "BASELINE_VERIFIED"
PROVENANCE_SCENARIO = "SCENARIO_CALCULATED"


def _f(summary: dict[str, Any], key: str) -> float:
    raw = summary.get(key)
    if raw is None:
        return 0.0
    return float(raw)


def _ratio(numer: float, denom: float) -> float | None:
    if abs(denom) < 1e-12:
        return None
    return numer / denom


def _apply_change(baseline_value: float, change: ScenarioChange) -> float:
    if change.operation == ScenarioOperation.PERCENT_CHANGE:
        return baseline_value * (1.0 + float(change.value) / 100.0)
    if change.operation == ScenarioOperation.ABSOLUTE_CHANGE:
        return baseline_value + float(change.value)
    if change.operation == ScenarioOperation.SET_VALUE:
        return float(change.value)
    raise ValueError(f"Unsupported operation {change.operation}")


def _recompute_identities(state: dict[str, float | None]) -> dict[str, float | None]:
    """Apply canonical waterfall identities. Mutates/returns state."""
    net = float(state.get("net_revenue") or 0.0)
    product_cogs = float(state.get("product_cogs") or 0.0)
    cm1_cost = float(state.get("cm1_cost") or 0.0)
    marketing = float(state.get("allocated_marketing") or 0.0)

    # Canonical: GM = NR − Product COGS; CM1 = GM − CM1 cost; CM2 = CM1 − marketing
    gross_margin = net - product_cogs
    cm1 = gross_margin - cm1_cost
    cm2 = cm1 - marketing

    state["product_cogs"] = product_cogs
    state["gross_margin"] = gross_margin
    state["cm1_cost"] = cm1_cost
    state["cm1"] = cm1
    state["allocated_marketing"] = marketing
    state["cm2"] = cm2
    state["gross_margin_pct"] = _ratio(gross_margin, net)
    state["cm1_pct"] = _ratio(cm1, net)
    state["marketing_pct"] = _ratio(marketing, net)
    state["cm2_pct"] = _ratio(cm2, net)
    state["net_revenue"] = net
    return state


def _load_baseline(tools: AiCfoTools) -> dict[str, float | None]:
    view = tools.get_current_financial_view()
    summary = dict(view.get("summary") or {})
    # Ensure COGS / CM1 cost are present (may not be in default tool metrics).
    missing = [m for m in ("product_cogs", "cm1_cost") if summary.get(m) is None]
    if missing:
        from wyz_analytics.facts.query import execute_query

        extra = execute_query(
            tools.facts,
            {"filters": tools.active_filters, "metrics": list(BASELINE_METRICS)},
        )
        summary.update(extra.get("summary") or {})

    baseline: dict[str, float | None] = {}
    for key in BASELINE_METRICS:
        raw = summary.get(key)
        baseline[key] = None if raw is None else float(raw)
    # Re-derive ratios from additive facts so baseline is internally consistent.
    return _recompute_identities(baseline)


def _metrics_for_spec(spec: ScenarioSpec) -> list[str]:
    keys: list[str] = ["net_revenue"]
    for change in spec.changes:
        lever = change.lever
        if lever == ScenarioLever.MARKETING_SPEND:
            # Hold CM1 visible so CM2 = CM1 − marketing remains checkable.
            keys.extend(("cm1", "cm1_pct", "allocated_marketing", "marketing_pct", "cm2", "cm2_pct"))
        elif lever == ScenarioLever.PRODUCT_COGS:
            keys.extend(
                (
                    "product_cogs",
                    "gross_margin",
                    "gross_margin_pct",
                    "cm1_cost",
                    "cm1",
                    "cm1_pct",
                    "allocated_marketing",
                    "cm2",
                    "cm2_pct",
                )
            )
        elif lever == ScenarioLever.CM1_COSTS:
            keys.extend(
                (
                    "gross_margin",
                    "cm1_cost",
                    "cm1",
                    "cm1_pct",
                    "allocated_marketing",
                    "cm2",
                    "cm2_pct",
                )
            )
        else:
            keys.extend(LEVER_DOWNSTREAM.get(lever, ()))
    seen: set[str] = set()
    ordered: list[str] = []
    for key in keys:
        if key not in seen:
            seen.add(key)
            ordered.append(key)
    return ordered


def simulate_scenario(
    tools: AiCfoTools,
    spec: ScenarioSpec,
    *,
    financial_scope: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run a scope-bound sensitivity. Returns ScenarioResult dict."""
    started = time.perf_counter()
    scope = financial_scope or tools.financial_scope or {}
    scope_hash = str(spec.scope_hash or scope.get("scope_hash") or "")

    if not spec.valid:
        return {
            "ok": False,
            "error": "; ".join(spec.parse_errors) or "Invalid ScenarioSpec",
            "baseline": {},
            "scenario": {},
            "deltas": [],
            "assumptions": list(spec.assumptions) or [HOLD_CONSTANT_ASSUMPTION],
            "scope": scope,
            "scope_hash": scope_hash,
            "spec": spec.to_dict(),
            "provenance": {},
            "dependency_path": [],
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }

    baseline = _load_baseline(tools)
    state = deepcopy(baseline)

    dependency_path: list[str] = []
    for change in spec.changes:
        lever = change.lever
        if lever == ScenarioLever.MARKETING_SPEND:
            before = float(state.get("allocated_marketing") or 0.0)
            state["allocated_marketing"] = _apply_change(before, change)
            dependency_path.append("allocated_marketing→cm2")
        elif lever == ScenarioLever.PRODUCT_COGS:
            before = float(state.get("product_cogs") or 0.0)
            state["product_cogs"] = _apply_change(before, change)
            dependency_path.append("product_cogs→gross_margin→cm1→cm2")
        elif lever == ScenarioLever.CM1_COSTS:
            before = float(state.get("cm1_cost") or 0.0)
            state["cm1_cost"] = _apply_change(before, change)
            dependency_path.append("cm1_cost→cm1→cm2")
        else:
            return {
                "ok": False,
                "error": f"Lever {lever.value} is not supported for deterministic sensitivity.",
                "baseline": baseline,
                "scenario": {},
                "deltas": [],
                "assumptions": list(spec.assumptions),
                "scope": scope,
                "scope_hash": scope_hash,
                "spec": spec.to_dict(),
                "provenance": {},
                "dependency_path": [],
                "latency_ms": int((time.perf_counter() - started) * 1000),
            }
        _recompute_identities(state)

    relevant = _metrics_for_spec(spec)
    # Reject negative spend/cost outcomes (input safety — no silent clamp).
    for cost_key in ("allocated_marketing", "product_cogs", "cm1_cost"):
        if float(state.get(cost_key) or 0.0) < -1e-9:
            return {
                "ok": False,
                "error": "Scenario would produce negative spend or cost, which is not supported.",
                "refusal_code": "NEGATIVE_VALUE",
                "baseline": {k: baseline.get(k) for k in relevant},
                "scenario": {},
                "baseline_full": dict(baseline),
                "scenario_full": {},
                "deltas": [],
                "assumptions": list(spec.assumptions) or [HOLD_CONSTANT_ASSUMPTION],
                "scope": {
                    "dataset_id": scope.get("dataset_id"),
                    "filters": scope.get("filters") or tools.active_filters,
                    "scope_hash": scope_hash,
                },
                "scope_hash": scope_hash,
                "spec": spec.to_dict(),
                "provenance": {},
                "dependency_path": dependency_path,
                "latency_ms": int((time.perf_counter() - started) * 1000),
            }

    baseline_out = {k: baseline.get(k) for k in relevant}
    scenario_out = {k: state.get(k) for k in relevant}

    deltas: list[dict[str, Any]] = []
    provenance: dict[str, dict[str, Any]] = {}
    for metric in relevant:
        b = baseline_out.get(metric)
        s = scenario_out.get(metric)
        if b is None and s is None:
            continue
        bv = float(b or 0.0)
        sv = float(s or 0.0)
        abs_change = sv - bv
        rel = None if abs(bv) < 1e-12 else abs_change / abs(bv)
        touched = any(metric in LEVER_DOWNSTREAM.get(c.lever, ()) for c in spec.changes)
        # net_revenue always baseline-verified (held constant)
        if metric == "net_revenue" or not touched:
            tag = PROVENANCE_BASELINE
        else:
            tag = PROVENANCE_SCENARIO if abs(abs_change) > 1e-12 or touched else PROVENANCE_BASELINE
        if metric in {"allocated_marketing", "product_cogs", "cm1_cost"} and touched:
            tag = PROVENANCE_SCENARIO
        if metric in {"cm2", "cm2_pct", "cm1", "cm1_pct", "gross_margin", "gross_margin_pct", "marketing_pct"} and touched:
            tag = PROVENANCE_SCENARIO
        deltas.append(
            {
                "metric": metric,
                "baseline_value": bv,
                "scenario_value": sv,
                "absolute_change": abs_change,
                "relative_change": rel,
                "provenance": tag,
            }
        )
        provenance[metric] = {
            "tag": tag,
            "baseline_source": "execute_query.summary",
            "scope_hash": scope_hash,
            "dependency_path": list(dependency_path),
            "spec_changes": [c.to_dict() for c in spec.changes],
        }

    assumptions = list(spec.assumptions) or [HOLD_CONSTANT_ASSUMPTION]
    if HOLD_CONSTANT_ASSUMPTION not in assumptions:
        assumptions.insert(0, HOLD_CONSTANT_ASSUMPTION)

    return {
        "ok": True,
        "error": None,
        "baseline": baseline_out,
        "scenario": scenario_out,
        # Full snapshots for invariant tests (includes held-constant metrics).
        "baseline_full": {k: baseline.get(k) for k in BASELINE_METRICS},
        "scenario_full": {k: state.get(k) for k in BASELINE_METRICS},
        "deltas": deltas,
        "assumptions": assumptions,
        "scope": {
            "dataset_id": scope.get("dataset_id"),
            "filters": scope.get("filters") or tools.active_filters,
            "scope_hash": scope_hash,
        },
        "scope_hash": scope_hash,
        "spec": spec.to_dict(),
        "provenance": provenance,
        "dependency_path": dependency_path,
        "latency_ms": int((time.perf_counter() - started) * 1000),
        "scenario_engine_used": "deterministic_identity_recompute",
    }
