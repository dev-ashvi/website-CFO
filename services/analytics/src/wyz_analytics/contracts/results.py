"""Serializable engine outputs. Keep this independent of Polars for later API/job use."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class Waterfall:
    gross_revenue: float
    discounts: float
    returns_rto_cancellations: float
    net_revenue: float
    product_cogs: float
    gross_margin: float
    cm1_costs: float
    cm1: float
    marketing_spend: float
    cm2: float

    @property
    def gross_margin_pct(self) -> float:
        return 0.0 if self.net_revenue == 0 else self.gross_margin / self.net_revenue

    @property
    def cm1_pct(self) -> float:
        return 0.0 if self.net_revenue == 0 else self.cm1 / self.net_revenue

    @property
    def cm2_pct(self) -> float:
        return 0.0 if self.net_revenue == 0 else self.cm2 / self.net_revenue

    @property
    def marketing_pct(self) -> float:
        return 0.0 if self.net_revenue == 0 else self.marketing_spend / self.net_revenue

    def to_dict(self) -> dict[str, float]:
        payload = asdict(self)
        payload.update(
            {
                "gross_margin_pct": self.gross_margin_pct,
                "cm1_pct": self.cm1_pct,
                "cm2_pct": self.cm2_pct,
                "marketing_pct": self.marketing_pct,
            }
        )
        return payload


@dataclass(frozen=True)
class ReconciliationReport:
    ok: bool
    checks: tuple[dict[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "checks": list(self.checks)}


@dataclass(frozen=True)
class EngineResult:
    engine_id: str
    engine_version: str
    waterfall: Waterfall
    by_channel: tuple[dict[str, Any], ...]
    by_category: tuple[dict[str, Any], ...]
    by_sku: tuple[dict[str, Any], ...]
    by_month: tuple[dict[str, Any], ...]
    reconciliation: ReconciliationReport
    extras: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "waterfall": self.waterfall.to_dict(),
            "by_channel": list(self.by_channel),
            "by_category": list(self.by_category),
            "by_sku": list(self.by_sku),
            "by_month": list(self.by_month),
            "reconciliation": self.reconciliation.to_dict(),
            "extras": self.extras,
        }
