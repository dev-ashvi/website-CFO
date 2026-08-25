"""Deterministic period-change evidence for temporal AI CFO questions.

Python owns all arithmetic. The model never computes deltas from snapshots.
Presentation formatting lives in presentation.present_change_evidence and does
not mutate raw ChangeEvidence values.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from wyz_analytics.ai_cfo.followup import ComparisonBasis
from wyz_analytics.ai_cfo.presentation import (
    format_comparison_period_label,
    format_period_label,
    get_metric_presentation,
    present_change_evidence,
)
from wyz_analytics.ai_cfo.semantic_contract import InsightType


CHANGE_METRICS = ("cm2", "cm2_pct", "net_revenue", "cm1", "cm1_pct", "gross_margin_pct", "marketing_pct")

USER_METHODOLOGY = (
    "Changes are calculated from verified monthly financial data within the active view."
)
CM2_ATTRIBUTION_CAVEAT = (
    "CM2 includes attributed marketing allocation and should not be treated as fully-loaded profitability."
)


@dataclass(frozen=True)
class ChangeEvidence:
    metric: str
    from_period: str
    to_period: str
    from_value: float
    to_value: float
    absolute_change: float
    percentage_change: float | None
    direction: str  # up | down | flat
    scope_hash: str
    basis: str
    evidence_id: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _month_key(row: dict[str, Any]) -> str:
    return str(row.get("month") or "")


def _sorted_months(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        [row for row in rows if isinstance(row, dict) and _month_key(row)],
        key=_month_key,
    )


def _meaningful(row: dict[str, Any]) -> bool:
    net = float(row.get("net_revenue") or 0)
    return abs(net) > 1.0 or any(row.get(m) is not None for m in CHANGE_METRICS)


def _pct_change(from_value: float, to_value: float) -> float | None:
    if from_value == 0:
        return None
    return (to_value - from_value) / abs(from_value)


def _direction(delta: float, *, eps: float = 1e-9) -> str:
    if abs(delta) <= eps:
        return "flat"
    return "up" if delta > 0 else "down"


def _pair_for_basis(
    rows: list[dict[str, Any]],
    basis: ComparisonBasis,
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    months = [row for row in _sorted_months(rows) if _meaningful(row)]
    if len(months) < 2:
        return None
    if basis == ComparisonBasis.VS_PREV_MONTH:
        return months[-2], months[-1]
    if basis == ComparisonBasis.VS_PREV_EQUAL:
        return months[-2], months[-1]
    return months[0], months[-1]


def build_change_evidence_from_trend(
    trend_payload: dict[str, Any],
    *,
    scope_hash: str,
    basis: ComparisonBasis = ComparisonBasis.WITHIN_PERIOD,
    metrics: tuple[str, ...] = CHANGE_METRICS,
) -> list[ChangeEvidence]:
    rows = list((trend_payload or {}).get("rows") or [])
    pair = _pair_for_basis(rows, basis)
    if not pair:
        return []
    start, end = pair
    from_period = _month_key(start)
    to_period = _month_key(end)
    out: list[ChangeEvidence] = []
    for metric in metrics:
        if metric not in start and metric not in end:
            continue
        try:
            from_value = float(start.get(metric) or 0)
            to_value = float(end.get(metric) or 0)
        except (TypeError, ValueError):
            continue
        delta = to_value - from_value
        out.append(
            ChangeEvidence(
                metric=metric,
                from_period=from_period,
                to_period=to_period,
                from_value=from_value,
                to_value=to_value,
                absolute_change=delta,
                percentage_change=_pct_change(from_value, to_value),
                direction=_direction(delta),
                scope_hash=scope_hash,
                basis=basis.value,
                evidence_id=f"change:{basis.value}:{from_period}:{to_period}:{metric}",
            )
        )
    return out


def classify_change_insight(changes: list[ChangeEvidence], primary: ChangeEvidence | None) -> InsightType:
    if not primary:
        return InsightType.INSUFFICIENT_EVIDENCE
    metric = primary.metric
    direction = primary.direction
    if metric in {"cm2", "cm2_pct", "cm1", "cm1_pct", "gross_margin", "gross_margin_pct", "gm_pct"}:
        if direction == "up":
            return InsightType.MARGIN_IMPROVEMENT
        if direction == "down":
            return InsightType.MARGIN_DETERIORATION
        return InsightType.MIXED_CHANGE
    if metric == "net_revenue":
        if direction == "up":
            cm2 = next((c for c in changes if c.metric in {"cm2", "cm2_pct"}), None)
            if cm2 and cm2.direction == "down":
                return InsightType.GROWTH_WITH_MARGIN_COMPRESSION
            return InsightType.REVENUE_GROWTH
        if direction == "down":
            return InsightType.REVENUE_DECLINE
        return InsightType.MIXED_CHANGE
    if direction == "up":
        return InsightType.REVENUE_GROWTH
    if direction == "down":
        return InsightType.REVENUE_DECLINE
    ups = sum(1 for c in changes if c.direction == "up")
    downs = sum(1 for c in changes if c.direction == "down")
    if ups and downs:
        return InsightType.MIXED_CHANGE
    return InsightType.MIXED_CHANGE


def select_primary_change(changes: list[ChangeEvidence]) -> ChangeEvidence | None:
    if not changes:
        return None
    priority = ["cm2", "cm2_pct", "cm1", "cm1_pct", "net_revenue", "gross_margin_pct", "marketing_pct"]

    def score(item: ChangeEvidence) -> tuple[int, float]:
        try:
            prio = priority.index(item.metric)
        except ValueError:
            prio = 99
        material = abs(item.absolute_change)
        flat_penalty = 0 if item.direction != "flat" else -1
        return (flat_penalty, -prio, material)

    ranked = sorted(changes, key=score, reverse=True)
    for item in ranked:
        if item.direction != "flat":
            return item
    return ranked[0]


def change_to_evidence_item(change: ChangeEvidence) -> dict[str, Any]:
    """Map ChangeEvidence → user-facing evidence item (metric label, not period label)."""
    return present_change_evidence(
        metric=change.metric,
        from_period=change.from_period,
        to_period=change.to_period,
        from_value=change.from_value,
        to_value=change.to_value,
        absolute_change=change.absolute_change,
        basis=change.basis,
        evidence_id=change.evidence_id,
        scope_hash=change.scope_hash,
        percentage_change=change.percentage_change,
        direction=change.direction,
    )


def _needs_cm2_caveat(evidence: list[dict[str, Any]]) -> bool:
    return any(str(item.get("metric") or "") in {"cm2", "cm2_pct", "marketing_pct"} for item in evidence)


def compose_temporal_answer(
    *,
    changes: list[ChangeEvidence],
    primary: ChangeEvidence | None,
    insight: InsightType,
    context: dict[str, Any],
    tool_calls: list[dict[str, Any]] | None = None,
    basis: ComparisonBasis,
) -> dict[str, Any]:
    if not primary:
        answer = {
            "headline": "Comparable period history is not available for this view.",
            "evidence": [],
            "driver_stage": "UNKNOWN",
            "interpretation": (
                "A period comparison needs at least two meaningful months of verified data "
                "in the active view."
            ),
            "drivers": "UNKNOWN",
            "caveat": None,
            "methodology": USER_METHODOLOGY,
            "comparison": None,
            "context_version": (context.get("meta") or {}).get("context_version"),
            "tool_calls": list(tool_calls or []),
            "change_evidence": [],
        }
        answer["telemetry"] = {
            "answer_source": "deterministic_temporal",
            "answer_mode": "semantic",
            "semantic": {
                "resolved_insight_type": InsightType.INSUFFICIENT_EVIDENCE.value,
                "deterministic_insight_override": True,
                "selected_evidence_ids": [],
            },
            "response_validation": {
                "valid": True,
                "violations": [],
                "model_interpretation_used": False,
                "deterministic_interpretation_used": True,
                "numeric_claims_generated": 0,
                "evidence_items_used": 0,
            },
        }
        return answer

    evidence = [change_to_evidence_item(primary)]
    for item in changes:
        if item.evidence_id == primary.evidence_id:
            continue
        if len(evidence) >= 3:
            break
        if item.direction != "flat":
            evidence.append(change_to_evidence_item(item))

    label = get_metric_presentation(primary.metric).label
    from_label = format_period_label(primary.from_period)
    to_label = format_period_label(primary.to_period)
    comparison = {
        "from_period": primary.from_period,
        "to_period": primary.to_period,
        "label": format_comparison_period_label(primary.from_period, primary.to_period, basis=basis.value),
        "basis": basis.value,
    }

    if insight == InsightType.MARGIN_IMPROVEMENT:
        headline = f"{label} improved over the compared periods."
        interpretation = f"Verified {label} rose from {from_label} to {to_label}."
    elif insight == InsightType.MARGIN_DETERIORATION:
        headline = f"{label} deteriorated over the compared periods."
        interpretation = f"Verified {label} fell from {from_label} to {to_label}."
    elif insight == InsightType.GROWTH_WITH_MARGIN_COMPRESSION:
        headline = "Revenue grew while CM2 margin compressed."
        interpretation = (
            f"Verified net revenue rose from {from_label} to {to_label}, "
            "while CM2 margin weakened over the same comparison."
        )
    elif insight == InsightType.REVENUE_GROWTH:
        headline = "Net revenue grew over the compared periods."
        interpretation = f"Verified net revenue rose from {from_label} to {to_label}."
    elif insight == InsightType.REVENUE_DECLINE:
        headline = "Net revenue declined over the compared periods."
        interpretation = f"Verified net revenue fell from {from_label} to {to_label}."
    elif insight == InsightType.MIXED_CHANGE:
        headline = "Performance was mixed across the compared periods."
        interpretation = (
            f"Verified metrics moved in mixed directions from {from_label} to {to_label}."
        )
    else:
        headline = "Verified metrics moved over the compared periods."
        interpretation = f"Verified {label} moved from {from_label} to {to_label}."

    methodology = USER_METHODOLOGY
    caveat = CM2_ATTRIBUTION_CAVEAT if _needs_cm2_caveat(evidence) else None
    if caveat:
        methodology = f"{USER_METHODOLOGY} {caveat}"

    answer = {
        "headline": headline,
        "evidence": evidence,
        "driver_stage": "UNKNOWN",
        "interpretation": interpretation,
        "drivers": "UNKNOWN",
        "caveat": caveat,
        "methodology": methodology,
        "comparison": comparison,
        "context_version": (context.get("meta") or {}).get("context_version"),
        "tool_calls": list(tool_calls or []),
        "change_evidence": [c.to_dict() for c in changes],
    }
    answer["telemetry"] = {
        "answer_source": "deterministic_temporal",
        "answer_mode": "semantic",
        "semantic": {
            "resolved_insight_type": insight.value,
            "deterministic_insight_override": True,
            "selected_evidence_ids": [item.get("evidence_id") for item in evidence],
        },
        "response_validation": {
            "valid": True,
            "violations": [],
            "model_interpretation_used": False,
            "deterministic_interpretation_used": True,
            "numeric_claims_generated": len(evidence),
            "evidence_items_used": len(evidence),
        },
    }
    return answer
