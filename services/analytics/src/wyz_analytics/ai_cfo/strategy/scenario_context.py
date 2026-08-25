"""Resolve lean scenario refs into same-scope mechanical context for RECONSIDER.

Conversation memory stays lean (latest_scenario_ref only). During an active
RECONSIDER turn, Python re-simulates under current FinancialScope — never trusts
client-provided scenario numbers.
"""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.scenario.compare import present_scenario_comparisons
from wyz_analytics.ai_cfo.scenario.engine import simulate_scenario
from wyz_analytics.ai_cfo.scenario.spec import (
    HOLD_CONSTANT_ASSUMPTION,
    ScenarioChange,
    ScenarioLever,
    ScenarioOperation,
    ScenarioSpec,
    validate_scenario_spec,
)
from wyz_analytics.ai_cfo.strategy.thread import ScenarioThreadRef, StrategicDecisionThread


def _signed_percent(ref: ScenarioThreadRef) -> float | None:
    if ref.percentage is None:
        return None
    try:
        mag = abs(float(ref.percentage))
    except (TypeError, ValueError):
        return None
    direction = str(ref.direction or "").upper()
    if direction in {"DECREASE", "DOWN", "CUT", "REDUCE"}:
        return -mag
    if direction in {"INCREASE", "UP", "RAISE"}:
        return mag
    # Default marketing cuts are decreases when direction missing but percentage set.
    return -mag


def spec_from_scenario_thread_ref(
    ref: ScenarioThreadRef,
    *,
    scope_hash: str,
    dataset_id: str | None = None,
) -> ScenarioSpec | None:
    """Rebuild a ScenarioSpec from lean thread ref — no stored result values."""
    if not ref.lever or ref.percentage is None:
        return None
    try:
        lever = ScenarioLever(str(ref.lever))
    except ValueError:
        return None
    signed = _signed_percent(ref)
    if signed is None:
        return None
    return validate_scenario_spec(
        ScenarioSpec(
            scope_hash=scope_hash,
            dataset_id=dataset_id,
            changes=[
                ScenarioChange(
                    lever=lever,
                    operation=ScenarioOperation.PERCENT_CHANGE,
                    value=signed,
                    unit="PERCENT",
                )
            ],
            assumptions=[HOLD_CONSTANT_ASSUMPTION],
            parse_source="DETERMINISTIC",
        )
    )


def _effect_direction(absolute_change: float | None, metric: str) -> str:
    if absolute_change is None:
        return "UNKNOWN"
    # Cost/spend reductions are "IMPROVES" for contribution framing when marketing falls.
    if metric in {"allocated_marketing", "marketing", "product_cogs", "cm1_cost"}:
        if absolute_change < 0:
            return "DECREASES"
        if absolute_change > 0:
            return "INCREASES"
        return "UNCHANGED"
    if absolute_change > 0:
        return "IMPROVES"
    if absolute_change < 0:
        return "WORSENS"
    return "UNCHANGED"


def build_strategic_scenario_context(
    *,
    ref: ScenarioThreadRef,
    result: dict[str, Any],
) -> dict[str, Any]:
    """Compact structured scenario delta for model + presentation (CALCULATED_SCENARIO)."""
    comparisons = present_scenario_comparisons(result) if result.get("ok") else []
    effects: list[dict[str, Any]] = []
    for row in comparisons[:8]:
        metric = str(row.get("metric") or "")
        if not metric:
            continue
        abs_chg = row.get("absolute_change")
        try:
            abs_f = float(abs_chg) if abs_chg is not None else None
        except (TypeError, ValueError):
            abs_f = None
        effects.append(
            {
                "metric_key": metric,
                "baseline_evidence_id": f"scenario_baseline:{metric}",
                "scenario_evidence_id": f"scenario:{metric}",
                "direction": _effect_direction(abs_f, metric),
                "delta_kind": "ABSOLUTE" if metric.endswith("_pct") is False else "POINTS",
                # Presentation-only fields (composer may use; model prompt strips numbers).
                "display": row.get("display"),
                "baseline_value": row.get("baseline_value"),
                "scenario_value": row.get("scenario_value"),
                "absolute_change": row.get("absolute_change"),
            }
        )
    return {
        "scenario_ref": ref.scenario_ref,
        "scope_hash": ref.scope_hash,
        "lever": ref.lever,
        "direction": ref.direction,
        "percentage": ref.percentage,
        "mechanical_effects": effects,
        "assumptions": [HOLD_CONSTANT_ASSUMPTION],
        "provenance": "CALCULATED_SCENARIO",
        "ok": bool(result.get("ok")),
    }


def model_facing_scenario_context(full: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip numeric display values for the strategic model payload."""
    if not isinstance(full, dict):
        return None
    effects = []
    for item in full.get("mechanical_effects") or []:
        if not isinstance(item, dict):
            continue
        effects.append(
            {
                "metric_key": item.get("metric_key"),
                "baseline_evidence_id": item.get("baseline_evidence_id"),
                "scenario_evidence_id": item.get("scenario_evidence_id"),
                "direction": item.get("direction"),
                "delta_kind": item.get("delta_kind"),
            }
        )
    return {
        "type": "SCENARIO",
        "scenario_ref": full.get("scenario_ref"),
        "scope_hash": full.get("scope_hash"),
        "lever": full.get("lever"),
        "direction": full.get("direction"),
        "percentage": full.get("percentage"),
        "mechanical_effects": effects,
        "assumptions": list(full.get("assumptions") or [])[:2],
        "provenance": "CALCULATED_SCENARIO",
    }


def scenario_evidence_rows(full: dict[str, Any] | None, *, scope_hash: str) -> list[dict[str, Any]]:
    """Founder-facing evidence rows from resolved scenario context (Python-owned numbers)."""
    if not isinstance(full, dict):
        return []
    rows: list[dict[str, Any]] = []
    for item in full.get("mechanical_effects") or []:
        if not isinstance(item, dict):
            continue
        metric = item.get("metric_key")
        if not metric:
            continue
        rows.append(
            {
                "evidence_id": item.get("scenario_evidence_id") or f"scenario:{metric}",
                "metric": metric,
                "value": item.get("scenario_value"),
                "from_value": item.get("baseline_value"),
                "to_value": item.get("scenario_value"),
                "absolute_change": item.get("absolute_change"),
                "unit": "scenario_change",
                "scope_hash": scope_hash,
                "source": "scenario_engine",
                "provenance": "CALCULATED_SCENARIO",
                "baseline_provenance": "BASELINE_VERIFIED",
                "scenario_provenance": "SCENARIO_CALCULATED",
                "display": item.get("display"),
                "semantic_roles": ["SCENARIO_CALCULATED", "CALCULATED_SCENARIO"],
            }
        )
    return rows


def resolve_scenario_context_for_reconsider(
    thread: StrategicDecisionThread,
    *,
    tools: Any,
    financial_scope: dict[str, Any],
) -> dict[str, Any] | None:
    """Re-simulate lean same-scope ref under CURRENT scope. Cross-scope → None."""
    ref = thread.latest_scenario_ref
    if ref is None:
        return None
    scope_hash = str(financial_scope.get("scope_hash") or "")
    if not scope_hash:
        return None
    if thread.scope_hash and thread.scope_hash != scope_hash:
        return None
    if ref.scope_hash and ref.scope_hash != scope_hash:
        return None
    spec = spec_from_scenario_thread_ref(
        ref,
        scope_hash=scope_hash,
        dataset_id=financial_scope.get("dataset_id"),
    )
    if spec is None or not spec.valid:
        return None
    result = simulate_scenario(tools, spec, financial_scope=financial_scope)
    if not result.get("ok"):
        return None
    # Force active scope onto result.
    result["scope_hash"] = scope_hash
    return build_strategic_scenario_context(ref=ref, result=result)
