"""Before/after scenario presentation using the metric presentation registry."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.presentation import (
    economic_direction_for_metric,
    format_metric_value,
    format_signed_delta,
    get_metric_presentation,
)

# Preferred display order for scenario cards.
_DISPLAY_ORDER = (
    "allocated_marketing",
    "product_cogs",
    "cm1_cost",
    "gross_margin",
    "gross_margin_pct",
    "cm1",
    "cm1_pct",
    "marketing_pct",
    "cm2",
    "cm2_pct",
)


def _movement(delta: float) -> str:
    if abs(delta) <= 1e-12:
        return "FLAT"
    return "INCREASE" if delta > 0 else "DECREASE"


def present_scenario_comparisons(result: dict[str, Any]) -> list[dict[str, Any]]:
    """Build ScenarioComparison rows with registry formatting (pp for margins)."""
    rows: list[dict[str, Any]] = []
    deltas = {d["metric"]: d for d in (result.get("deltas") or []) if isinstance(d, dict)}

    # Primary lever metrics first, then affected contribution metrics.
    ordered_keys = [k for k in _DISPLAY_ORDER if k in deltas]
    for key in deltas:
        if key not in ordered_keys and key != "net_revenue":
            ordered_keys.append(key)

    # Skip unchanged held-constant metrics except when they are the lever target.
    lever_metrics = set()
    for change in (result.get("spec") or {}).get("changes") or []:
        lever = str(change.get("lever") or "")
        if lever == "MARKETING_SPEND":
            lever_metrics.add("allocated_marketing")
        elif lever == "PRODUCT_COGS":
            lever_metrics.add("product_cogs")
        elif lever == "CM1_COSTS":
            lever_metrics.add("cm1_cost")

    for metric in ordered_keys:
        delta = deltas[metric]
        baseline = float(delta.get("baseline_value") or 0.0)
        scenario = float(delta.get("scenario_value") or 0.0)
        abs_change = float(delta.get("absolute_change") or (scenario - baseline))
        if metric not in lever_metrics and abs(abs_change) <= 1e-12:
            continue
        # Prefer showing lever + CM2 / margin impacts; drop noisy flat intermediates.
        if (
            metric not in lever_metrics
            and metric not in {"cm2", "cm2_pct", "marketing_pct", "cm1", "cm1_pct", "gross_margin", "gross_margin_pct"}
            and abs(abs_change) <= 1e-12
        ):
            continue

        meta = get_metric_presentation(metric)
        from_disp = format_metric_value(metric, baseline)
        to_disp = format_metric_value(metric, scenario)
        delta_disp = format_signed_delta(
            metric,
            from_value=baseline,
            to_value=scenario,
            raw_delta=abs_change,
        )
        movement = _movement(abs_change)
        rows.append(
            {
                "metric": metric,
                "baseline_value": baseline,
                "scenario_value": scenario,
                "absolute_change": abs_change,
                "relative_change": delta.get("relative_change"),
                "economic_direction": economic_direction_for_metric(metric, movement),
                "provenance": delta.get("provenance"),
                "display": {
                    "kind": "scenario_change",
                    "label": meta.label,
                    "formatted_from": from_disp["formatted"],
                    "formatted_to": to_disp["formatted"],
                    "formatted_range": f"{from_disp['formatted']} → {to_disp['formatted']}",
                    "formatted_delta": delta_disp["formatted"],
                    "format_type": meta.format_type,
                    "delta_format_type": delta_disp["delta_format_type"],
                    "movement_direction": delta_disp["movement_direction"],
                    "economic_direction": delta_disp["economic_direction"],
                    "provenance_label": delta.get("provenance"),
                },
            }
        )
    return rows
