"""Configurable materiality thresholds for CFO signals."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SignalThresholds:
    min_revenue_share: float = 0.02
    min_abs_cm2: float = 50_000.0
    min_cm2_share: float = 0.05
    min_net_revenue: float = 100_000.0
    top_contributor_limit: int = 3
    max_ui_signals: int = 5
    product_cogs_pressure_pct: float = 0.55
    channel_cost_pressure_pct: float = 0.35
    marketing_pressure_pct: float = 0.25


DEFAULT_THRESHOLDS = SignalThresholds()
