"""Deterministic ScenarioAnswerComposer — Python owns all numbers."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.presentation import format_inr_compact
from wyz_analytics.ai_cfo.scenario.compare import present_scenario_comparisons
from wyz_analytics.ai_cfo.scenario.spec import (
    HOLD_CONSTANT_ASSUMPTION,
    SUPPORTED_LEVERS_UX,
    ScenarioLever,
    methodology_for_spec,
)


_LEVER_DISPLAY = {
    "MARKETING_SPEND": "attributed marketing",
    "PRODUCT_COGS": "Product COGS",
    "CM1_COSTS": "CM1 costs",
}


def _cm2_pair(result: dict[str, Any]) -> tuple[float | None, float | None]:
    baseline = result.get("baseline") or {}
    scenario = result.get("scenario") or {}
    # Prefer full snapshots when present (invariant / complete state).
    full_b = result.get("baseline_full") or baseline
    full_s = result.get("scenario_full") or scenario
    if full_b.get("cm2") is None or full_s.get("cm2") is None:
        return None, None
    return float(full_b["cm2"]), float(full_s["cm2"])


def _headline(spec: dict[str, Any], result: dict[str, Any]) -> str:
    changes = spec.get("changes") or []
    cm2_b, cm2_s = _cm2_pair(result)
    if len(changes) == 1 and str(changes[0].get("operation")) == "PERCENT_CHANGE" and cm2_b is not None and cm2_s is not None:
        change = changes[0]
        lever = str(change.get("lever") or "")
        pct = abs(float(change.get("value") or 0))
        reducing = float(change.get("value") or 0) < 0
        action = "reduction" if reducing else "increase"
        name = _LEVER_DISPLAY.get(lever, lever.lower().replace("_", " "))
        verb = "raises" if cm2_s > cm2_b + 1e-9 else ("reduces" if cm2_s < cm2_b - 1e-9 else "leaves")
        if verb == "leaves":
            return (
                f"A {pct:.0f}% {action} in {name} leaves CM2 at "
                f"{format_inr_compact(cm2_s)} in this sensitivity."
            )
        return (
            f"A {pct:.0f}% {action} in {name} {verb} CM2 from "
            f"{format_inr_compact(cm2_b)} to {format_inr_compact(cm2_s)} in this sensitivity."
        )

    # Multi-lever / absolute / set — still deterministic, still value-anchored when possible.
    if cm2_b is not None and cm2_s is not None:
        verb = "raises" if cm2_s > cm2_b + 1e-9 else "reduces"
        return (
            f"This sensitivity {verb} CM2 from {format_inr_compact(cm2_b)} "
            f"to {format_inr_compact(cm2_s)} under the stated lever changes."
        )
    return "Verified contribution metrics move under the stated sensitivity assumptions."


def _interpretation(spec: dict[str, Any], result: dict[str, Any]) -> str:
    levers = {str(c.get("lever")) for c in (spec.get("changes") or [])}
    cm2_b, cm2_s = _cm2_pair(result)
    cm2_up = cm2_s is not None and cm2_b is not None and cm2_s > cm2_b + 1e-9
    cm2_down = cm2_s is not None and cm2_b is not None and cm2_s < cm2_b - 1e-9
    if ScenarioLever.MARKETING_SPEND.value in levers and cm2_up:
        return "CM2 improves because attributed marketing cost falls while other inputs are held constant."
    if ScenarioLever.MARKETING_SPEND.value in levers and cm2_down:
        return "CM2 declines because attributed marketing cost rises while other inputs are held constant."
    if ScenarioLever.PRODUCT_COGS.value in levers:
        return (
            "Gross margin, CM1, and CM2 move because product COGS changes while revenue and "
            "other operating inputs are held constant."
        )
    if ScenarioLever.CM1_COSTS.value in levers:
        return (
            "CM1 and CM2 move because channel/fulfilment costs change while revenue and "
            "other operating inputs are held constant."
        )
    return "Downstream contribution metrics are recomputed from canonical identities under held-constant inputs."


def _refusal_headline(refusal_code: str | None, errors: list[str]) -> str:
    code = str(refusal_code or "")
    if code == "UNSUPPORTED_REVENUE":
        return "Revenue-response scenarios are not supported in AI CFO V1.1."
    if code == "COMPOSITE_UNSUPPORTED":
        return "This composite scenario is not supported in AI CFO V1.1."
    if code == "REDUCTION_OVER_100":
        return "Percentage reductions greater than 100% are not supported in AI CFO V1.1."
    if code == "INCREASE_OVER_BOUND":
        return "This percentage increase exceeds the V1.1 scenario input limit."
    if code == "MALFORMED_PERCENT":
        return "Could not parse a numeric percentage for this scenario."
    if code == "NEGATIVE_VALUE":
        return "Negative cost or spend scenarios are not supported in AI CFO V1.1."
    if code == "UNSUPPORTED_LEVER":
        if errors and "Headcount" in errors[0]:
            return "Headcount scenarios are not supported in AI CFO V1.1."
        return "This scenario lever is not supported in AI CFO V1.1."
    if code == "DEMAND_RESPONSE":
        return "This scenario requires a demand-response assumption that AI CFO V1.1 does not model."
    return "This what-if cannot be calculated safely with AI CFO V1.1."


def compose_scenario_answer(
    result: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
    strategic_prefix: bool = False,
) -> dict[str, Any]:
    """Compose a structured AI CFO answer from ScenarioResult. No model numbers."""
    _ = context
    comparisons = present_scenario_comparisons(result)
    spec = result.get("spec") or {}
    assumptions = [HOLD_CONSTANT_ASSUMPTION]
    methodology = methodology_for_spec(spec) if result.get("ok") else SUPPORTED_LEVERS_UX

    if not result.get("ok"):
        refusal_code = spec.get("refusal_code") or result.get("refusal_code")
        errors = list(spec.get("parse_errors") or [])
        if result.get("error"):
            errors = errors or [str(result.get("error"))]
        headline = _refusal_headline(refusal_code, errors)
        interpretation = (errors[0] if errors else SUPPORTED_LEVERS_UX)
        if SUPPORTED_LEVERS_UX not in interpretation and refusal_code in {
            "UNSUPPORTED_REVENUE",
            "COMPOSITE_UNSUPPORTED",
            "UNSUPPORTED_LEVER",
            "UNPARSED",
        }:
            interpretation = f"{interpretation} {SUPPORTED_LEVERS_UX}".strip()
        return {
            "headline": headline,
            "evidence": [],
            "scenario_comparisons": [],
            "driver_stage": "UNKNOWN",
            "interpretation": interpretation,
            "drivers": "UNKNOWN",
            "caveat": None,
            "methodology": methodology if methodology != interpretation else SUPPORTED_LEVERS_UX,
            "assumptions": [],
            "answer_kind": "SCENARIO",
            "scenario_label": "WHAT-IF",
            "tool_calls": list(tool_calls or []),
            "markdown": f"**{headline}**\n\n{interpretation}",
            "telemetry": {
                "answer_source": "deterministic_scenario_refusal",
                "resolved_intent": "SCENARIO",
                "scenario_parse_source": spec.get("parse_source") or "FAILED",
                "scenario_engine_used": False,
                "provider_calls": 0,
                "refusal_code": refusal_code,
            },
        }

    headline = _headline(spec, result)
    if strategic_prefix:
        headline = (
            "AI CFO does not make the strategic decision, but I can show the verified sensitivity. "
            + headline
        )
    interpretation = _interpretation(spec, result)

    evidence: list[dict[str, Any]] = []
    for row in comparisons:
        evidence.append(
            {
                "evidence_id": f"scenario:{row['metric']}",
                "metric": row["metric"],
                "value": row["scenario_value"],
                "from_value": row["baseline_value"],
                "to_value": row["scenario_value"],
                "absolute_change": row["absolute_change"],
                "unit": "scenario_change",
                "scope_hash": result.get("scope_hash"),
                "source": "scenario_engine",
                "provenance": row.get("provenance"),
                "baseline_provenance": "BASELINE_VERIFIED",
                "scenario_provenance": "SCENARIO_CALCULATED",
                "display": row.get("display"),
                "semantic_roles": ["SCENARIO_CALCULATED"],
            }
        )

    first = (spec.get("changes") or [{}])[0]
    lever = first.get("lever")
    operation = first.get("operation")
    percentage = abs(float(first.get("value"))) if first.get("operation") == "PERCENT_CHANGE" and first.get("value") is not None else None

    lines = [f"**{headline}**", "", "WHAT-IF SCENARIO", "Compared with current view", ""]
    for row in comparisons:
        display = row.get("display") or {}
        lines.append(display.get("label") or row["metric"])
        lines.append(display.get("formatted_range") or "")
        if display.get("formatted_delta"):
            lines.append(display["formatted_delta"])
        lines.append("")
    lines.append(interpretation)
    lines.append("")
    lines.append(f"ASSUMPTIONS: {assumptions[0]}")
    lines.append(f"METHODOLOGY: {methodology}")

    return {
        "headline": headline,
        "evidence": evidence,
        "scenario_comparisons": comparisons,
        "comparison": {"label": "Compared with current view", "kind": "scenario"},
        "driver_stage": "MARKETING" if lever == "MARKETING_SPEND" else "UNKNOWN",
        "interpretation": interpretation,
        "drivers": "SCENARIO",
        "caveat": None,
        "methodology": methodology,
        "assumptions": assumptions,
        "answer_kind": "SCENARIO",
        "scenario_label": "WHAT-IF",
        "scenario_result": {
            "baseline": result.get("baseline"),
            "scenario": result.get("scenario"),
            "baseline_full": result.get("baseline_full"),
            "scenario_full": result.get("scenario_full"),
            "scope_hash": result.get("scope_hash"),
            "dependency_path": result.get("dependency_path"),
            "spec": spec,
            "provenance": result.get("provenance"),
        },
        "tool_calls": list(tool_calls or [{"tool": "get_current_financial_view", "arguments": {}}]),
        "markdown": "\n".join(lines),
        "telemetry": {
            "answer_source": "deterministic_scenario",
            "resolved_intent": "SCENARIO",
            "scenario_parse_source": spec.get("parse_source"),
            "scenario_lever": lever,
            "scenario_levers": [c.get("lever") for c in (spec.get("changes") or [])],
            "scenario_operation": operation,
            "scenario_percentage": percentage,
            "scenario_change_count": len(spec.get("changes") or []),
            "scope_hash": result.get("scope_hash"),
            "baseline_source": "execute_query.summary",
            "scenario_engine_used": result.get("scenario_engine_used") or True,
            "baseline_metric_count": len(result.get("baseline_full") or result.get("baseline") or {}),
            "scenario_metric_count": len(result.get("scenario_full") or result.get("scenario") or {}),
            "scenario_latency_ms": result.get("latency_ms"),
            "provider_calls": 0,
        },
    }
