"""Decision monitoring specification derived from Phase 2C/2D strategic semantics."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.decisions.models import DecisionMonitoringSpec
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme
from wyz_analytics.ai_cfo.strategy.strategic_semantic import change_my_view_keys_for_theme

_DEFAULT_METRICS_BY_THEME: dict[str, list[str]] = {
    "MARKETING": ["cm2", "cm2_pct", "net_revenue", "orders", "marketing_pct"],
    "CHANNEL_EXIT": ["cm2", "cm2_pct", "net_revenue", "cm1_pct"],
    "SKU_EXIT": ["cm2", "cm2_pct", "net_revenue"],
    "PRICE": ["cm2_pct", "net_revenue", "orders", "gross_margin_pct"],
    "PRODUCT_COST": ["cm1", "cm1_pct", "product_cogs", "gross_margin_pct"],
    "PRIORITIZE": ["cm2", "net_revenue", "marketing_pct", "cm1_pct"],
    "GENERIC": ["cm2", "cm2_pct", "net_revenue"],
}


def _theme_enum(theme: str | None) -> DecisionTheme | None:
    if not theme:
        return None
    try:
        return DecisionTheme(str(theme))
    except ValueError:
        return DecisionTheme.GENERIC


def build_monitoring_spec(
    *,
    decision_id: str,
    decision_theme: str | None,
    monitoring_metric_keys: list[str] | None = None,
    change_my_view_keys: list[str] | None = None,
    minimum_comparable_periods: int = 1,
) -> DecisionMonitoringSpec:
    theme = _theme_enum(decision_theme)
    defaults = _DEFAULT_METRICS_BY_THEME.get(
        (decision_theme or "GENERIC").upper(),
        _DEFAULT_METRICS_BY_THEME["GENERIC"],
    )
    metrics = [str(x) for x in (monitoring_metric_keys or []) if x][:12]
    if not metrics:
        metrics = list(defaults)

    cmv = [str(x) for x in (change_my_view_keys or []) if x][:8]
    if not cmv and theme is not None:
        cmv = change_my_view_keys_for_theme(theme)[:4]

    flags = ["verified_aggregates_required", "same_scope_hash", "scenario_not_observed_outcome"]
    return DecisionMonitoringSpec(
        decision_id=decision_id,
        metric_keys=metrics,
        change_condition_keys=cmv,
        minimum_comparable_periods=max(1, int(minimum_comparable_periods)),
        required_evidence_flags=flags,
    )


def monitoring_spec_from_thread_or_payload(
    *,
    decision_id: str,
    decision_theme: str | None,
    thread: Any | None = None,
    payload: dict[str, Any] | None = None,
) -> DecisionMonitoringSpec:
    payload = payload if isinstance(payload, dict) else {}
    monitor_keys = None
    cmv_keys = None
    if thread is not None:
        monitor_keys = list(getattr(thread, "monitoring_metric_keys", None) or [])
        cmv_keys = list(getattr(thread, "change_my_view_keys", None) or [])
    if payload.get("monitoring_metric_keys"):
        monitor_keys = list(payload["monitoring_metric_keys"])
    if payload.get("change_my_view_keys"):
        cmv_keys = list(payload["change_my_view_keys"])
    return build_monitoring_spec(
        decision_id=decision_id,
        decision_theme=decision_theme or (getattr(thread, "decision_theme", None) if thread else None),
        monitoring_metric_keys=monitor_keys,
        change_my_view_keys=cmv_keys,
    )
