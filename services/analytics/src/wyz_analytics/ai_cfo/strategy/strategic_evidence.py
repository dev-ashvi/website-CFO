"""Theme-aware strategic evidence selection — separate from generic envelope ordering."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme

# Preferred metrics / signal roles by decision theme (semantic routing only).
_THEME_METRIC_PRIORITY: dict[DecisionTheme, list[str]] = {
    DecisionTheme.MARKETING: [
        "cm1",
        "cm1_pct",
        "allocated_marketing",
        "marketing_pct",
        "cm2",
        "cm2_pct",
        "gross_margin",
        "gross_margin_pct",
    ],
    DecisionTheme.CHANNEL_EXIT: [
        "cm1",
        "cm1_pct",
        "cm2",
        "cm2_pct",
        "net_revenue",
        "allocated_marketing",
        "marketing_pct",
    ],
    DecisionTheme.SKU_EXIT: [
        "cm2",
        "cm2_pct",
        "cm1",
        "cm1_pct",
        "net_revenue",
    ],
    DecisionTheme.PRICE: [
        "gross_margin",
        "gross_margin_pct",
        "cm1",
        "cm1_pct",
        "cm2",
        "cm2_pct",
    ],
    DecisionTheme.PRODUCT_COST: [
        "gross_margin",
        "gross_margin_pct",
        "cm1",
        "cm1_pct",
        "cm2",
    ],
    DecisionTheme.PRIORITIZE: [
        "cm2",
        "cm2_pct",
        "allocated_marketing",
        "marketing_pct",
        "cm1",
        "cm1_pct",
        "net_revenue",
    ],
    DecisionTheme.GENERIC: [
        "cm2",
        "cm2_pct",
        "cm1",
        "cm1_pct",
        "net_revenue",
        "allocated_marketing",
    ],
}

_THEME_SIGNAL_ROLES: dict[DecisionTheme, set[str]] = {
    DecisionTheme.MARKETING: {"MARGIN_PRESSURE", "COST_CONCENTRATION", "NEGATIVE_CONTRIBUTOR"},
    DecisionTheme.CHANNEL_EXIT: {"MARGIN_PRESSURE", "NEGATIVE_CONTRIBUTOR", "TOP_CONTRIBUTOR"},
    DecisionTheme.SKU_EXIT: {"NEGATIVE_CONTRIBUTOR", "MARGIN_PRESSURE"},
    DecisionTheme.PRICE: {"MARGIN_PRESSURE", "COST_CONCENTRATION", "NEGATIVE_CONTRIBUTOR"},
    DecisionTheme.PRODUCT_COST: {"COST_CONCENTRATION", "MARGIN_PRESSURE"},
    DecisionTheme.PRIORITIZE: {"MARGIN_PRESSURE", "NEGATIVE_CONTRIBUTOR", "COST_CONCENTRATION", "TOP_CONTRIBUTOR"},
}

# Metrics that are usually not strategic for marketing/channel margin decisions.
_GENERIC_LOW_PRIORITY = frozenset(
    {
        "gross_revenue",
        "discount",
        "refund",
        "discount_pct",
        "refund_pct",
        "orders",
        "units",
    }
)


def _index_envelope(envelope: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    if not envelope:
        return index
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in envelope.get(section) or []:
            if isinstance(item, dict) and item.get("evidence_id"):
                index[str(item["evidence_id"])] = item
    return index


def select_strategic_supporting_evidence_ids(
    *,
    theme: DecisionTheme | None,
    envelope: dict[str, Any] | None,
    pack_evidence_ids: list[str] | None = None,
    max_items: int = 6,
) -> list[str]:
    """Pick the smallest material evidence set for strategic display and model catalog."""
    theme = theme or DecisionTheme.GENERIC
    index = _index_envelope(envelope)
    if not index:
        return list(pack_evidence_ids or [])[:max_items]

    priority_metrics = _THEME_METRIC_PRIORITY.get(theme, _THEME_METRIC_PRIORITY[DecisionTheme.GENERIC])
    signal_roles = _THEME_SIGNAL_ROLES.get(theme, set())

    selected: list[str] = []
    seen: set[str] = set()

    def _add(eid: str) -> None:
        if eid in seen or eid not in index:
            return
        seen.add(eid)
        selected.append(eid)

    # 1) Theme-priority summary metrics
    for metric in priority_metrics:
        for eid, item in index.items():
            if str(item.get("metric") or "") == metric:
                _add(eid)
                if len(selected) >= max_items:
                    return selected[:max_items]

    # 2) Theme-relevant signals
    for eid, item in index.items():
        roles = set(item.get("semantic_roles") or [])
        st = str(item.get("signal_type") or "")
        if roles.intersection(signal_roles) or any(token in st for token in ("MARKETING", "CM2", "COGS", "MARGIN")):
            _add(eid)
            if len(selected) >= max_items:
                return selected[:max_items]

    # 3) Pack evidence ids in order (skip generic low-priority unless nothing else)
    for eid in pack_evidence_ids or []:
        item = index.get(str(eid))
        if not item:
            continue
        metric = str(item.get("metric") or "")
        if metric in _GENERIC_LOW_PRIORITY and theme in {
            DecisionTheme.MARKETING,
            DecisionTheme.CHANNEL_EXIT,
            DecisionTheme.PRIORITIZE,
        }:
            continue
        _add(str(eid))
        if len(selected) >= max_items:
            return selected[:max_items]

    # 4) Any remaining non-generic metrics from index
    for eid, item in index.items():
        metric = str(item.get("metric") or "")
        if metric in _GENERIC_LOW_PRIORITY:
            continue
        _add(eid)
        if len(selected) >= max_items:
            break

    return selected[:max_items]
