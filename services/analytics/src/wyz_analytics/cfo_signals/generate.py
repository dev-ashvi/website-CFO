"""Generate deterministic CFO signals for a filtered analytical context."""

from __future__ import annotations

from typing import Any

import polars as pl

from wyz_analytics.analytics.classification import (
    CLASS_LABELS,
    NEGATIVE_GROSS_MARGIN,
    POSITIVE_CM1_NEGATIVE_CM2,
    POSITIVE_GM_NEGATIVE_CM1,
    PROFITABLE,
    classify_profitability,
)
from wyz_analytics.cfo_signals.models import CfoSignal
from wyz_analytics.cfo_signals.thresholds import DEFAULT_THRESHOLDS, SignalThresholds
from wyz_analytics.facts.query import execute_query

SIGNAL_LABELS = {
    NEGATIVE_GROSS_MARGIN: "Negative Gross Margin",
    POSITIVE_GM_NEGATIVE_CM1: "Positive GM → Negative CM1",
    POSITIVE_CM1_NEGATIVE_CM2: "Positive CM1 → Negative CM2",
    PROFITABLE: "Profitable through CM2",
    "TOP_GM_CONTRIBUTOR": "Top Gross Margin contributor",
    "TOP_CM1_CONTRIBUTOR": "Top CM1 contributor",
    "TOP_CM2_CONTRIBUTOR": "Top CM2 contributor",
    "NEGATIVE_CM2_CONTRIBUTOR": "Negative CM2 contributor",
    "HIGH_REVENUE_LOW_CM2": "High revenue, weak CM2",
    "HIGH_REVENUE_NEGATIVE_CM2": "High revenue, negative CM2",
    "PRODUCT_COGS_PRESSURE": "Product COGS pressure",
    "CHANNEL_COST_PRESSURE": "Channel / fulfilment cost pressure",
    "MARKETING_PRESSURE": "Attributed marketing pressure",
    "HIGH_GROWTH_MARGIN_COMPRESSION": "High growth with margin compression",
    "HIGH_GROWTH_QUALITY_DETERIORATION": "High growth with quality deterioration",
    "DECLINING_REVENUE_MARGIN_EXPANSION": "Declining revenue with margin expansion",
    "DECLINING_REVENUE_QUALITY_IMPROVEMENT": "Declining revenue with quality improvement",
}

STAGE_MAP = {
    NEGATIVE_GROSS_MARGIN: "PRODUCT",
    POSITIVE_GM_NEGATIVE_CM1: "CHANNEL",
    POSITIVE_CM1_NEGATIVE_CM2: "MARKETING",
    PROFITABLE: "CM2",
}


def _entity_label(row: dict[str, Any], dimension: str) -> str:
    return str(row.get(dimension) or row.get("sku_id") or row.get("_entity") or "Unknown")


def _materiality(row: dict[str, Any], total_net: float, total_cm2: float) -> float:
    net = float(row.get("net_revenue") or 0)
    cm2 = float(row.get("cm2") or 0)
    share = 0.0 if total_net == 0 else abs(net) / abs(total_net)
    cm2_share = 0.0 if total_cm2 == 0 else abs(cm2) / abs(total_cm2)
    return share * 0.6 + cm2_share * 0.4


def _severity(materiality: float, signal_type: str) -> str:
    if signal_type in {NEGATIVE_GROSS_MARGIN, POSITIVE_CM1_NEGATIVE_CM2, "HIGH_REVENUE_NEGATIVE_CM2"}:
        return "high" if materiality >= 0.08 else "medium"
    if materiality >= 0.12:
        return "high"
    if materiality >= 0.05:
        return "medium"
    return "low"


def _profitability_signal(
    row: dict[str, Any],
    *,
    dimension: str,
    filters: dict[str, Any],
    thresholds: SignalThresholds,
    total_net: float,
    total_cm2: float,
    caveats: list[str],
) -> CfoSignal | None:
    stage_class = classify_profitability(row)
    if stage_class == PROFITABLE:
        return None
    net = float(row.get("net_revenue") or 0)
    share = 0.0 if total_net == 0 else net / total_net
    if share < thresholds.min_revenue_share and abs(float(row.get("cm2") or 0)) < thresholds.min_abs_cm2:
        return None
    materiality = _materiality(row, total_net, total_cm2)
    return CfoSignal(
        signal_type=stage_class,
        severity=_severity(materiality, stage_class),
        entity_type=dimension,
        entity=_entity_label(row, dimension),
        stage=STAGE_MAP.get(stage_class, "MARGIN"),
        label=CLASS_LABELS.get(stage_class, SIGNAL_LABELS.get(stage_class, stage_class)),
        evidence={
            "net_revenue": net,
            "gross_margin_pct": row.get("gross_margin_pct"),
            "cm1_pct": row.get("cm1_pct"),
            "marketing_pct": row.get("marketing_pct"),
            "cm2_pct": row.get("cm2_pct"),
            "cm2": row.get("cm2"),
            "revenue_share": share,
        },
        materiality=materiality,
        caveats=caveats,
        filters=filters,
    )


def _contributor_signals(
    rows: list[dict[str, Any]],
    *,
    dimension: str,
    metric: str,
    signal_type: str,
    filters: dict[str, Any],
    thresholds: SignalThresholds,
    total: float,
    caveats: list[str],
    negative_only: bool = False,
) -> list[CfoSignal]:
    ranked = sorted(rows, key=lambda row: float(row.get(metric) or 0), reverse=not negative_only)
    if negative_only:
        ranked = [row for row in ranked if float(row.get(metric) or 0) < 0]
    else:
        ranked = [row for row in ranked if float(row.get(metric) or 0) > 0]
    signals: list[CfoSignal] = []
    for row in ranked[: thresholds.top_contributor_limit]:
        value = float(row.get(metric) or 0)
        share = 0.0 if total == 0 else abs(value) / abs(total)
        if share < thresholds.min_cm2_share and abs(value) < thresholds.min_abs_cm2:
            continue
        materiality = share
        signals.append(
            CfoSignal(
                signal_type=signal_type,
                severity=_severity(materiality, signal_type),
                entity_type=dimension,
                entity=_entity_label(row, dimension),
                stage="CONTRIBUTION",
                label=SIGNAL_LABELS[signal_type],
                evidence={metric: value, "share_of_total": share, "net_revenue": row.get("net_revenue")},
                materiality=materiality,
                caveats=caveats,
                filters=filters,
            )
        )
    return signals


def _summary_pressure_signals(
    summary: dict[str, Any],
    *,
    filters: dict[str, Any],
    caveats: list[str],
    thresholds: SignalThresholds,
) -> list[CfoSignal]:
    signals: list[CfoSignal] = []
    net = float(summary.get("net_revenue") or 0)
    if net <= 0:
        return signals
    gm_pct = float(summary.get("gross_margin_pct") or 0)
    cm1_pct = float(summary.get("cm1_pct") or 0)
    mkt_pct = float(summary.get("marketing_pct") or 0)
    if gm_pct < thresholds.product_cogs_pressure_pct:
        signals.append(
            CfoSignal(
                signal_type="PRODUCT_COGS_PRESSURE",
                severity="medium",
                entity_type="population",
                entity="Filtered population",
                stage="PRODUCT",
                label=SIGNAL_LABELS["PRODUCT_COGS_PRESSURE"],
                evidence={"gross_margin_pct": gm_pct, "net_revenue": net},
                materiality=1.0 - gm_pct,
                caveats=caveats,
                filters=filters,
            )
        )
    if cm1_pct < thresholds.channel_cost_pressure_pct and gm_pct > cm1_pct:
        signals.append(
            CfoSignal(
                signal_type="CHANNEL_COST_PRESSURE",
                severity="medium",
                entity_type="population",
                entity="Filtered population",
                stage="CHANNEL",
                label=SIGNAL_LABELS["CHANNEL_COST_PRESSURE"],
                evidence={"cm1_pct": cm1_pct, "gross_margin_pct": gm_pct},
                materiality=abs(gm_pct - cm1_pct),
                caveats=caveats,
                filters=filters,
            )
        )
    if mkt_pct > thresholds.marketing_pressure_pct:
        signals.append(
            CfoSignal(
                signal_type="MARKETING_PRESSURE",
                severity="high" if mkt_pct > thresholds.marketing_pressure_pct * 1.5 else "medium",
                entity_type="population",
                entity="Filtered population",
                stage="MARKETING",
                label=SIGNAL_LABELS["MARKETING_PRESSURE"],
                evidence={"marketing_pct": mkt_pct, "cm2_pct": summary.get("cm2_pct")},
                materiality=mkt_pct,
                caveats=caveats,
                filters=filters,
            )
        )
    return signals


def _growth_signals(
    facts: pl.DataFrame,
    filters: dict[str, Any],
    caveats: list[str],
) -> list[CfoSignal]:
    month_from = filters.get("month_from")
    month_to = filters.get("month_to")
    if not month_from or not month_to or month_from == month_to:
        return []
    trend = execute_query(
        facts,
        {
            "filters": filters,
            "group_by": ["month"],
            "metrics": ["net_revenue", "gross_margin_pct", "discount_pct", "return_pct"],
            "sort": {"metric": "net_revenue", "direction": "asc"},
        },
    )
    rows = sorted(trend.get("rows") or [], key=lambda row: str(row.get("month")))
    if len(rows) < 2:
        return []
    first, last = rows[0], rows[-1]
    rev_growth = float(last.get("net_revenue") or 0) - float(first.get("net_revenue") or 0)
    if abs(rev_growth) < 1:
        return []
    gm_delta = float(last.get("gross_margin_pct") or 0) - float(first.get("gross_margin_pct") or 0)
    quality_delta = float(last.get("return_pct") or 0) - float(first.get("return_pct") or 0)
    signals: list[CfoSignal] = []
    if rev_growth > 0 and gm_delta < -0.02:
        signals.append(
            CfoSignal(
                signal_type="HIGH_GROWTH_MARGIN_COMPRESSION",
                severity="medium",
                entity_type="population",
                entity="Filtered period",
                stage="MARGIN",
                label=SIGNAL_LABELS["HIGH_GROWTH_MARGIN_COMPRESSION"],
                evidence={"net_revenue_delta": rev_growth, "gross_margin_pct_delta": gm_delta},
                materiality=abs(gm_delta),
                caveats=caveats,
                filters=filters,
            )
        )
    if rev_growth > 0 and quality_delta > 0.01:
        signals.append(
            CfoSignal(
                signal_type="HIGH_GROWTH_QUALITY_DETERIORATION",
                severity="medium",
                entity_type="population",
                entity="Filtered period",
                stage="REVENUE_QUALITY",
                label=SIGNAL_LABELS["HIGH_GROWTH_QUALITY_DETERIORATION"],
                evidence={"return_pct_delta": quality_delta},
                materiality=quality_delta,
                caveats=caveats,
                filters=filters,
            )
        )
    if rev_growth < 0 and gm_delta > 0.02:
        signals.append(
            CfoSignal(
                signal_type="DECLINING_REVENUE_MARGIN_EXPANSION",
                severity="low",
                entity_type="population",
                entity="Filtered period",
                stage="MARGIN",
                label=SIGNAL_LABELS["DECLINING_REVENUE_MARGIN_EXPANSION"],
                evidence={"net_revenue_delta": rev_growth, "gross_margin_pct_delta": gm_delta},
                materiality=abs(gm_delta),
                caveats=caveats,
                filters=filters,
            )
        )
    if rev_growth < 0 and quality_delta < -0.01:
        signals.append(
            CfoSignal(
                signal_type="DECLINING_REVENUE_QUALITY_IMPROVEMENT",
                severity="low",
                entity_type="population",
                entity="Filtered period",
                stage="REVENUE_QUALITY",
                label=SIGNAL_LABELS["DECLINING_REVENUE_QUALITY_IMPROVEMENT"],
                evidence={"return_pct_delta": quality_delta},
                materiality=abs(quality_delta),
                caveats=caveats,
                filters=filters,
            )
        )
    return signals


def generate_cfo_signals(
    facts: pl.DataFrame,
    *,
    filters: dict[str, Any],
    dimension: str = "channel",
    surface: str = "overview",
    thresholds: SignalThresholds | None = None,
    methodology_caveats: list[str] | None = None,
) -> dict[str, Any]:
    cfg = thresholds or DEFAULT_THRESHOLDS
    caveats = list(methodology_caveats or [])
    caveats.append(
        "Channel-level CM2 uses attributed marketing allocation and is not fully-loaded customer profitability."
    )
    breakdown = execute_query(
        facts,
        {
            "filters": filters,
            "group_by": [dimension],
            "metrics": [
                "net_revenue",
                "gross_margin",
                "gross_margin_pct",
                "cm1",
                "cm1_pct",
                "marketing_pct",
                "cm2",
                "cm2_pct",
            ],
            "sort": {"metric": "cm2", "direction": "desc"},
        },
    )
    summary = breakdown.get("summary") or {}
    rows = breakdown.get("rows") or []
    total_net = float(summary.get("net_revenue") or 0)
    total_cm2 = float(summary.get("cm2") or 0)
    total_gm = float(summary.get("gross_margin") or 0)
    total_cm1 = float(summary.get("cm1") or 0)

    signals: list[CfoSignal] = []
    for row in rows:
        sig = _profitability_signal(
            row,
            dimension=dimension,
            filters=filters,
            thresholds=cfg,
            total_net=total_net,
            total_cm2=total_cm2,
            caveats=caveats,
        )
        if sig:
            signals.append(sig)
        net = float(row.get("net_revenue") or 0)
        cm2 = float(row.get("cm2") or 0)
        share = 0.0 if total_net == 0 else net / total_net
        if share >= cfg.min_revenue_share and cm2 < 0:
            signals.append(
                CfoSignal(
                    signal_type="HIGH_REVENUE_NEGATIVE_CM2",
                    severity="high",
                    entity_type=dimension,
                    entity=_entity_label(row, dimension),
                    stage="MARKETING",
                    label=SIGNAL_LABELS["HIGH_REVENUE_NEGATIVE_CM2"],
                    evidence={"net_revenue": net, "cm2": cm2, "revenue_share": share, "cm2_pct": row.get("cm2_pct")},
                    materiality=_materiality(row, total_net, total_cm2),
                    caveats=caveats,
                    filters=filters,
                )
            )
        elif share >= cfg.min_revenue_share and float(row.get("cm2_pct") or 0) < 0.05:
            signals.append(
                CfoSignal(
                    signal_type="HIGH_REVENUE_LOW_CM2",
                    severity="medium",
                    entity_type=dimension,
                    entity=_entity_label(row, dimension),
                    stage="CM2",
                    label=SIGNAL_LABELS["HIGH_REVENUE_LOW_CM2"],
                    evidence={"net_revenue": net, "cm2_pct": row.get("cm2_pct"), "revenue_share": share},
                    materiality=share,
                    caveats=caveats,
                    filters=filters,
                )
            )

    signals.extend(
        _contributor_signals(
            rows,
            dimension=dimension,
            metric="gross_margin",
            signal_type="TOP_GM_CONTRIBUTOR",
            filters=filters,
            thresholds=cfg,
            total=total_gm,
            caveats=caveats,
        )
    )
    signals.extend(
        _contributor_signals(
            rows,
            dimension=dimension,
            metric="cm1",
            signal_type="TOP_CM1_CONTRIBUTOR",
            filters=filters,
            thresholds=cfg,
            total=total_cm1,
            caveats=caveats,
        )
    )
    signals.extend(
        _contributor_signals(
            rows,
            dimension=dimension,
            metric="cm2",
            signal_type="TOP_CM2_CONTRIBUTOR",
            filters=filters,
            thresholds=cfg,
            total=total_cm2,
            caveats=caveats,
        )
    )
    signals.extend(
        _contributor_signals(
            rows,
            dimension=dimension,
            metric="cm2",
            signal_type="NEGATIVE_CM2_CONTRIBUTOR",
            filters=filters,
            thresholds=cfg,
            total=total_cm2,
            caveats=caveats,
            negative_only=True,
        )
    )
    signals.extend(_summary_pressure_signals(summary, filters=filters, caveats=caveats, thresholds=cfg))
    signals.extend(_growth_signals(facts, filters, caveats))

    dedup: dict[str, CfoSignal] = {}
    for signal in signals:
        key = f"{signal.signal_type}:{signal.entity}"
        if key not in dedup or signal.materiality > dedup[key].materiality:
            dedup[key] = signal
    ranked = sorted(dedup.values(), key=lambda item: item.materiality, reverse=True)
    return {
        "signals": [signal.to_dict() for signal in ranked[: cfg.max_ui_signals * 2]],
        "highlighted": [signal.to_dict() for signal in ranked[: cfg.max_ui_signals]],
        "summary": summary,
        "scope": {"filters": filters, "dimension": dimension, "surface": surface},
    }
