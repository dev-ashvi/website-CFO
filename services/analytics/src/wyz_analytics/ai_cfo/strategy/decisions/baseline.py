"""Server-side baseline capture from canonical verified aggregates."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.decisions.models import (
    DecisionBaselineSnapshot,
    MetricObservation,
    new_snapshot_id,
)

# Metrics we may legitimately snapshot for monitoring comparisons.
_BASELINE_METRIC_UNITS: dict[str, str] = {
    "net_revenue": "INR",
    "gross_revenue": "INR",
    "orders": "count",
    "units": "count",
    "cm1": "INR",
    "cm1_pct": "ratio",
    "cm2": "INR",
    "cm2_pct": "ratio",
    "allocated_marketing": "INR",
    "marketing_pct": "ratio",
    "gross_margin": "INR",
    "gross_margin_pct": "ratio",
    "product_cogs": "INR",
}


def capture_baseline_snapshot(
    *,
    decision_id: str,
    dataset_id: str,
    scope_hash: str,
    summary: dict[str, Any] | None,
    metric_keys: list[str] | None,
    observation_period: str | None,
    evidence_refs: list[str] | None = None,
    client_metric_values: dict[str, Any] | None = None,
) -> DecisionBaselineSnapshot:
    """Build baseline from server summary only.

    ``client_metric_values`` is accepted only so callers can prove rejection —
    values from the client are never stored.
    """
    _ = client_metric_values  # Explicitly ignored — never trust client financials.
    summary = summary if isinstance(summary, dict) else {}
    keys = [k for k in (metric_keys or []) if k in _BASELINE_METRIC_UNITS][:12]
    if not keys:
        keys = ["cm2", "cm2_pct", "net_revenue", "marketing_pct"]

    observations: list[MetricObservation] = []
    refs: list[str] = list(evidence_refs or [])[:24]
    for key in keys:
        raw = summary.get(key)
        try:
            value = float(raw) if raw is not None else None
        except (TypeError, ValueError):
            value = None
        eid = f"summary:{key}"
        if eid not in refs:
            refs.append(eid)
        observations.append(
            MetricObservation(
                metric_key=key,
                value=value,
                unit=_BASELINE_METRIC_UNITS.get(key),
                scope_hash=scope_hash,
                period=observation_period,
                provenance="VERIFIED_AGGREGATE",
                evidence_id=eid,
            )
        )

    return DecisionBaselineSnapshot(
        snapshot_id=new_snapshot_id(),
        decision_id=decision_id,
        dataset_id=dataset_id,
        scope_hash=scope_hash,
        evidence_refs=refs[:24],
        metric_observations=observations,
        observation_period=observation_period,
    )


def observations_from_summary(
    *,
    summary: dict[str, Any] | None,
    metric_keys: list[str],
    scope_hash: str,
    period: str | None,
) -> list[MetricObservation]:
    summary = summary if isinstance(summary, dict) else {}
    out: list[MetricObservation] = []
    for key in metric_keys[:12]:
        if key not in _BASELINE_METRIC_UNITS and key not in summary:
            continue
        raw = summary.get(key)
        try:
            value = float(raw) if raw is not None else None
        except (TypeError, ValueError):
            value = None
        out.append(
            MetricObservation(
                metric_key=key,
                value=value,
                unit=_BASELINE_METRIC_UNITS.get(key),
                scope_hash=scope_hash,
                period=period,
                provenance="VERIFIED_AGGREGATE",
                evidence_id=f"summary:{key}",
            )
        )
    return out
