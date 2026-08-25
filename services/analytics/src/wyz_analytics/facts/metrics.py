"""Deterministic metric registry for the fact query layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from wyz_analytics.contracts.columns import (
    CM1,
    CM1_COST,
    GROSS_MARGIN,
    GROSS_REVENUE,
    NET_REVENUE,
    PRODUCT_COGS,
    QUANTITY,
)
from wyz_analytics.facts.schema import (
    ALLOCATED_MARKETING,
    DISCOUNT,
    REFUND,
    RETURN_QTY_COL,
    RTO_QTY_COL,
)

MetricKind = Literal["additive", "distinct", "ratio"]


@dataclass(frozen=True)
class MetricDef:
    id: str
    kind: MetricKind
    column: str | None = None
    distinct_column: str | None = None
    numerator: str | None = None
    denominator: str | None = None
    aliases: tuple[str, ...] = ()


METRICS: dict[str, MetricDef] = {}

ADDITIVE = (
    ("gross_revenue", GROSS_REVENUE),
    ("net_revenue", NET_REVENUE),
    ("discount", DISCOUNT),
    ("refund", REFUND),
    ("product_cogs", PRODUCT_COGS),
    ("gross_margin", GROSS_MARGIN),
    ("cm1_cost", CM1_COST),
    ("cm1", CM1),
    ("allocated_marketing", ALLOCATED_MARKETING),
    ("marketing_spend", ALLOCATED_MARKETING),
    ("marketing_cost", ALLOCATED_MARKETING),
    ("cm2", "cm2"),
    ("units", QUANTITY),
    ("units_retained", "units_retained"),
    ("return_qty", RETURN_QTY_COL),
    ("rto_qty", RTO_QTY_COL),
)
for metric_id, column in ADDITIVE:
    METRICS[metric_id] = MetricDef(id=metric_id, kind="additive", column=column)

METRICS["orders"] = MetricDef(id="orders", kind="distinct", distinct_column="order_id")
METRICS["customers"] = MetricDef(id="customers", kind="distinct", distinct_column="customer_id")

RATIOS = (
    ("gross_aov", "gross_revenue", "orders"),
    ("net_aov", "net_revenue", "orders"),
    ("units_per_order", "units", "orders"),
    ("gm_pct", "gross_margin", "net_revenue"),
    ("gross_margin_pct", "gross_margin", "net_revenue"),
    ("cm1_pct", "cm1", "net_revenue"),
    ("cm2_pct", "cm2", "net_revenue"),
    ("marketing_pct", "allocated_marketing", "net_revenue"),
    ("discount_pct", "discount", "gross_revenue"),
    ("return_pct", "return_qty", "units"),
    ("rto_pct", "rto_qty", "units"),
    ("revenue_realisation_pct", "net_revenue", "gross_revenue"),
)
for metric_id, numer, denom in RATIOS:
    METRICS[metric_id] = MetricDef(id=metric_id, kind="ratio", numerator=numer, denominator=denom)

ALLOWED_METRICS = frozenset(METRICS)


def metric_def(metric_id: str) -> MetricDef:
    if metric_id not in METRICS:
        raise KeyError(metric_id)
    return METRICS[metric_id]
