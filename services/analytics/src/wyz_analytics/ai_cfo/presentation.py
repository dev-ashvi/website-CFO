"""Canonical metric presentation for AI CFO user-facing surfaces.

Storage semantics follow the fact-layer MetricDef registry:
  - kind=ratio → stored as 0–1 fraction (never display as already-percent)
  - kind=additive currency → INR absolute
  - kind=distinct / units → counts

Display conversion uses explicit metadata, not `_pct` name heuristics alone.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from wyz_analytics.facts.metrics import METRICS, MetricDef

FormatType = Literal["currency", "percentage", "count", "ratio", "number", "text"]
StorageKind = Literal["ratio_0_1", "percent_0_100", "absolute", "count", "text"]


@dataclass(frozen=True)
class MetricPresentation:
    key: str
    label: str
    format_type: FormatType
    storage: StorageKind
    description: str = ""
    """Multiply raw value before percentage display when storage is ratio_0_1."""
    percentage_scale: float = 1.0


_LABELS: dict[str, tuple[str, str]] = {
    "gross_revenue": ("Gross Revenue", "Gross merchandise / list revenue"),
    "net_revenue": ("Net Revenue", "Revenue after discounts, returns, and refunds"),
    "discount": ("Discount", "Discount amount"),
    "refund": ("Refund", "Refund amount"),
    "product_cogs": ("Product COGS", "Product cost of goods sold"),
    "gross_margin": ("Gross Margin", "Net revenue minus product COGS"),
    "gm_pct": ("Gross Margin %", "Gross margin as a share of net revenue"),
    "gross_margin_pct": ("Gross Margin %", "Gross margin as a share of net revenue"),
    "cm1_cost": ("CM1 Costs", "Selling, fulfilment, and channel costs to CM1"),
    "cm1": ("CM1", "Contribution after channel/fulfilment costs"),
    "cm1_pct": ("CM1 Margin", "CM1 as a share of net revenue"),
    "allocated_marketing": ("Attributed Marketing Spend", "Marketing allocated under active attribution"),
    "marketing_spend": ("Attributed Marketing Spend", "Marketing allocated under active attribution"),
    "marketing_cost": ("Attributed Marketing Spend", "Marketing allocated under active attribution"),
    "marketing_pct": ("Marketing % of Net Revenue", "Attributed marketing as a share of net revenue"),
    "cm2": ("CM2", "Contribution after attributed marketing"),
    "cm2_pct": ("CM2 Margin", "CM2 as a share of net revenue"),
    "orders": ("Orders", "Distinct order count"),
    "customers": ("Customers", "Distinct customer count"),
    "units": ("Units", "Units sold"),
    "units_retained": ("Units Retained", "Units retained after returns"),
    "return_qty": ("Return Qty", "Returned units"),
    "rto_qty": ("RTO Qty", "Return-to-origin units"),
    "gross_aov": ("Gross AOV", "Gross revenue per order"),
    "net_aov": ("Net AOV", "Net revenue per order"),
    "units_per_order": ("Units per Order", "Average units per order"),
    "discount_pct": ("Discount %", "Discount as a share of gross revenue"),
    "return_pct": ("Return %", "Return quantity as a share of units"),
    "rto_pct": ("RTO %", "RTO quantity as a share of units"),
    "revenue_realisation_pct": ("Revenue Realisation %", "Net revenue as a share of gross revenue"),
}


def _presentation_for_def(defn: MetricDef) -> MetricPresentation:
    label, description = _LABELS.get(defn.id, (defn.id.replace("_", " ").title(), ""))
    if defn.kind == "ratio":
        # AOV / units_per_order are ratios but not percentage displays.
        if defn.id in {"gross_aov", "net_aov"}:
            return MetricPresentation(
                key=defn.id,
                label=label,
                format_type="currency",
                storage="absolute",
                description=description,
            )
        if defn.id == "units_per_order":
            return MetricPresentation(
                key=defn.id,
                label=label,
                format_type="ratio",
                storage="absolute",
                description=description,
            )
        return MetricPresentation(
            key=defn.id,
            label=label,
            format_type="percentage",
            storage="ratio_0_1",
            description=description,
            percentage_scale=100.0,
        )
    if defn.kind == "distinct" or defn.id in {"units", "units_retained", "return_qty", "rto_qty"}:
        return MetricPresentation(
            key=defn.id,
            label=label,
            format_type="count",
            storage="count",
            description=description,
        )
    return MetricPresentation(
        key=defn.id,
        label=label,
        format_type="currency",
        storage="absolute",
        description=description,
    )


METRIC_PRESENTATION: dict[str, MetricPresentation] = {
    metric_id: _presentation_for_def(defn) for metric_id, defn in METRICS.items()
}

# Evidence-only metrics that appear in signals/enrichment but are not fact MetricDefs.
METRIC_PRESENTATION["share_of_total"] = MetricPresentation(
    key="share_of_total",
    label="Share of Total",
    format_type="percentage",
    storage="ratio_0_1",
    percentage_scale=100.0,
    description="Entity contribution share of the selected metric total (stored 0–1).",
)


def get_metric_presentation(metric_key: str | None) -> MetricPresentation:
    key = str(metric_key or "").strip()
    if key in METRIC_PRESENTATION:
        return METRIC_PRESENTATION[key]
    # Unknown keys: prefer safe currency for non-_pct, ratio→% for registry-backed aliases.
    if key.endswith("_pct"):
        return MetricPresentation(
            key=key,
            label=key.replace("_", " ").title(),
            format_type="percentage",
            storage="ratio_0_1",
            percentage_scale=100.0,
            description="Unregistered ratio metric; treated as 0–1 like fact-layer ratios.",
        )
    return MetricPresentation(
        key=key or "value",
        label=(key or "Value").replace("_", " ").title(),
        format_type="currency" if key else "text",
        storage="absolute" if key else "text",
    )


def format_inr_compact(value: float) -> str:
    """Indian compact currency. Matches frontend formatInrCompact (₹… Cr / L / rounded)."""
    if value != value:  # NaN
        return "—"
    n = float(value)
    abs_n = abs(n)
    if abs_n >= 1e7:
        return f"₹{(n / 1e7):.2f} Cr"
    if abs_n >= 1e5:
        return f"₹{(n / 1e5):.1f} L"
    rounded = int(round(n))
    # Matches Intl en-IN via sign embedded after ₹ for negatives (₹-1,408).
    body = _indian_group(abs(rounded))
    if rounded < 0:
        return f"₹-{body}"
    return f"₹{body}"


def _indian_group(n: int) -> str:
    s = str(n)
    if len(s) <= 3:
        return s
    last3 = s[-3:]
    rest = s[:-3]
    parts: list[str] = []
    while rest:
        parts.append(rest[-2:] if len(rest) > 2 else rest)
        rest = rest[:-2] if len(rest) > 2 else ""
    return ",".join(reversed(parts)) + "," + last3


def format_percentage(value: float, *, decimals: int = 1) -> str:
    if value != value:
        return "—"
    return f"{float(value):.{decimals}f}%"


def format_count(value: float) -> str:
    if value != value:
        return "—"
    return _indian_group(int(round(float(value))))


# Metrics where an increase has a defined economic reading (registry-backed, not heuristics).
_ECONOMIC_ON_INCREASE: dict[str, str] = {
    "cm2": "IMPROVED",
    "cm2_pct": "IMPROVED",
    "cm1": "IMPROVED",
    "cm1_pct": "IMPROVED",
    "gross_margin": "IMPROVED",
    "gross_margin_pct": "IMPROVED",
    "gm_pct": "IMPROVED",
    "net_revenue": "IMPROVED",
    "gross_revenue": "IMPROVED",
    "return_pct": "DETERIORATED",
    "rto_pct": "DETERIORATED",
    "discount_pct": "DETERIORATED",
    "refund": "DETERIORATED",
}


def economic_direction_for_metric(metric_key: str | None, movement: str) -> str:
    """Optional economic reading. UNKNOWN when the registry does not define one."""
    key = str(metric_key or "")
    move = str(movement or "").upper()
    if move == "FLAT":
        return "NEUTRAL"
    on_up = _ECONOMIC_ON_INCREASE.get(key)
    if on_up is None:
        return "UNKNOWN"
    if move == "INCREASE":
        return on_up
    if move == "DECREASE":
        if on_up == "IMPROVED":
            return "DETERIORATED"
        if on_up == "DETERIORATED":
            return "IMPROVED"
        return "UNKNOWN"
    return "UNKNOWN"


_MONTH_ABBR = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def format_period_label(period: str | None) -> str:
    """Format canonical month keys (YYYY-MM) for CFO UI. Never truncates."""
    text = str(period or "").strip()
    if not text:
        return "—"
    # YYYY-MM or YYYY-MM-DD
    parts = text.split("-")
    if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
        year = parts[0]
        month_i = int(parts[1])
        if 1 <= month_i <= 12:
            return f"{_MONTH_ABBR[month_i - 1]} {year}"
    return text


def format_comparison_period_label(
    from_period: str | None,
    to_period: str | None,
    *,
    basis: str | None = None,
) -> str:
    """Single comparison line for temporal answers."""
    _ = basis
    return f"{format_period_label(from_period)} → {format_period_label(to_period)}"


def _movement_direction(delta: float, *, eps: float = 1e-12) -> str:
    if abs(delta) <= eps:
        return "FLAT"
    return "INCREASE" if delta > 0 else "DECREASE"


def _currency_display_delta(from_value: float, to_value: float, raw_delta: float) -> float:
    """Presentation-only delta.

    Rule: when endpoints and delta are all in the compact-INR band (< ₹1L),
    derive display_delta from round(to) − round(from) so the visible arrow
    and change line stay consistent. Otherwise format the raw deterministic delta.
    Raw ChangeEvidence.absolute_change is never mutated.
    """
    band = 1e5
    if max(abs(from_value), abs(to_value), abs(raw_delta)) < band:
        return float(round(to_value) - round(from_value))
    return float(raw_delta)


def format_signed_delta(
    metric_key: str | None,
    *,
    from_value: float,
    to_value: float,
    raw_delta: float,
) -> dict[str, Any]:
    """Format a change delta using registry semantics (pp for percentage ratios)."""
    meta = get_metric_presentation(metric_key)
    movement = _movement_direction(raw_delta)

    if meta.format_type == "percentage":
        # Ratio storage 0–1 → percentage points; already-percent → point delta as-is.
        if meta.storage == "ratio_0_1":
            pp = raw_delta * meta.percentage_scale
        else:
            pp = raw_delta
        pp_rounded = round(pp, 1)
        sign = "+" if pp_rounded > 0 else ""
        formatted = f"{sign}{pp_rounded:.1f} pp"
        return {
            "formatted": formatted,
            "delta_format_type": "percentage_points",
            "display_delta": pp_rounded,
            "movement_direction": movement,
            "economic_direction": economic_direction_for_metric(metric_key, movement),
        }

    if meta.format_type == "currency":
        display_delta = _currency_display_delta(from_value, to_value, raw_delta)
        body = format_inr_compact(abs(display_delta))
        if display_delta > 0:
            formatted = f"+{body}"
        elif display_delta < 0:
            # format_inr_compact already embeds ₹- for negatives when passed negative;
            # we pass abs and prefix.
            formatted = f"-{body}"
        else:
            formatted = body
        return {
            "formatted": formatted,
            "delta_format_type": "currency",
            "display_delta": display_delta,
            "movement_direction": movement,
            "economic_direction": economic_direction_for_metric(metric_key, movement),
        }

    if meta.format_type == "count":
        display_delta = int(round(to_value) - round(from_value))
        sign = "+" if display_delta > 0 else ""
        formatted = f"{sign}{format_count(abs(display_delta))}" if display_delta != 0 else format_count(0)
        if display_delta < 0:
            formatted = f"-{format_count(abs(display_delta))}"
        return {
            "formatted": formatted,
            "delta_format_type": "count",
            "display_delta": float(display_delta),
            "movement_direction": movement,
            "economic_direction": economic_direction_for_metric(metric_key, movement),
        }

    # ratio / number
    sign = "+" if raw_delta > 0 else ""
    formatted = f"{sign}{raw_delta:.2f}"
    return {
        "formatted": formatted,
        "delta_format_type": meta.format_type,
        "display_delta": raw_delta,
        "movement_direction": movement,
        "economic_direction": economic_direction_for_metric(metric_key, movement),
    }


def present_change_evidence(
    *,
    metric: str,
    from_period: str,
    to_period: str,
    from_value: float,
    to_value: float,
    absolute_change: float,
    basis: str | None = None,
    evidence_id: str | None = None,
    scope_hash: str | None = None,
    percentage_change: float | None = None,
    direction: str | None = None,
) -> dict[str, Any]:
    """Build presentation payload for ChangeEvidence without mutating raw values."""
    meta = get_metric_presentation(metric)
    from_disp = format_metric_value(metric, from_value)
    to_disp = format_metric_value(metric, to_value)
    delta_disp = format_signed_delta(
        metric,
        from_value=from_value,
        to_value=to_value,
        raw_delta=absolute_change,
    )
    from_label = format_period_label(from_period)
    to_label = format_period_label(to_period)
    comparison_label = format_comparison_period_label(from_period, to_period, basis=basis)
    delta_format = delta_disp["delta_format_type"]
    display = {
        "kind": "temporal_change",
        "label": meta.label,
        "formatted_from": from_disp["formatted"],
        "formatted_to": to_disp["formatted"],
        "formatted_range": f"{from_disp['formatted']} → {to_disp['formatted']}",
        "formatted_delta": delta_disp["formatted"],
        "formatted_value": f"{from_disp['formatted']} → {to_disp['formatted']}",
        "format_type": meta.format_type,
        "delta_format_type": delta_format,
        "movement_direction": delta_disp["movement_direction"],
        "economic_direction": delta_disp["economic_direction"],
        "from_period_label": from_label,
        "to_period_label": to_label,
        "comparison_label": comparison_label,
        "context": None,
    }
    return {
        "evidence_id": evidence_id or f"change:{from_period}:{to_period}:{metric}",
        "metric": metric,
        "value": absolute_change,
        "unit": "change",
        "from_value": from_value,
        "to_value": to_value,
        "from_period": from_period,
        "to_period": to_period,
        "absolute_change": absolute_change,
        "percentage_change": percentage_change,
        "direction": direction,
        "display_delta": delta_disp["display_delta"],
        "scope_hash": scope_hash,
        "source": "change_evidence",
        "semantic_roles": ["OBSERVATION"],
        "scope": {"dimension": "month", "dimension_value": None},
        "display": display,
        "interpretation": f"{meta.label} moved from {from_label} to {to_label}.",
    }


def format_metric_value(metric_key: str | None, value: Any) -> dict[str, Any]:
    """Return display payload for a metric value using registry metadata."""
    meta = get_metric_presentation(metric_key)
    if value is None:
        return {
            "label": meta.label,
            "formatted": "—",
            "format_type": meta.format_type,
            "storage": meta.storage,
            "description": meta.description,
        }
    try:
        raw = float(value)
    except (TypeError, ValueError):
        return {
            "label": meta.label,
            "formatted": str(value),
            "format_type": "text",
            "storage": meta.storage,
            "description": meta.description,
        }

    if meta.format_type == "percentage":
        display_num = raw * meta.percentage_scale if meta.storage == "ratio_0_1" else raw
        # Guard against accidental double-scaling if a value is already ~percent-like
        # AND registry says percent_0_100 — scale stays 1. Never auto-detect from magnitude.
        formatted = format_percentage(display_num)
    elif meta.format_type == "currency":
        formatted = format_inr_compact(raw)
    elif meta.format_type == "count":
        formatted = format_count(raw)
    elif meta.format_type == "ratio":
        formatted = f"{raw:.2f}"
    else:
        formatted = f"{raw:.4g}"

    return {
        "label": meta.label,
        "formatted": formatted,
        "format_type": meta.format_type,
        "storage": meta.storage,
        "description": meta.description,
        "display_numeric": (
            raw * meta.percentage_scale if meta.format_type == "percentage" and meta.storage == "ratio_0_1" else raw
        ),
    }


def display_entity_name(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text or text.lower() in {"filtered population", "the active segment", "population"}:
        return "This view"
    return text


def present_evidence_item(item: dict[str, Any], *, include_raw: bool = True) -> dict[str, Any]:
    """Attach user-facing display fields while preserving internal evidence fields."""
    metric = item.get("metric")
    presented = format_metric_value(str(metric) if metric is not None else None, item.get("value"))
    entity = display_entity_name(item.get("entity") or (item.get("scope") or {}).get("dimension_value"))
    context_bits: list[str] = []
    if entity != "This view":
        context_bits.append(entity)
    display = {
        "label": presented["label"],
        "formatted_value": presented["formatted"],
        "context": " · ".join(context_bits) if context_bits else None,
        "format_type": presented["format_type"],
    }
    out = dict(item)
    out["display"] = display
    # User-facing interpretation never echoes raw metric keys.
    if entity != "This view":
        out["interpretation"] = f"{presented['label']} for {entity}."
    else:
        out["interpretation"] = f"Verified {presented['label']} for this view."
    if not include_raw:
        out.pop("value", None)
    return out


def evidence_identity(item: dict[str, Any]) -> tuple[Any, ...]:
    """Canonical identity for presentational dedupe (not value-only)."""
    if not isinstance(item, dict):
        return ("non_dict", str(item))
    eid = item.get("evidence_id")
    if eid:
        return ("id", str(eid))
    scope = item.get("scope") or {}
    return (
        "key",
        str(item.get("scope_hash") or scope.get("scope_hash") or ""),
        str(item.get("entity") or scope.get("dimension_value") or ""),
        str(item.get("metric") or ""),
        item.get("value"),
    )


def dedupe_evidence_items(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Drop duplicate presentational evidence rows by canonical identity."""
    out: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for item in items or []:
        if not isinstance(item, dict):
            continue
        key = evidence_identity(item)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def registry_snapshot() -> list[dict[str, Any]]:
    """Debug/test helper: explicit presentation metadata for all registered metrics."""
    rows = []
    for key in sorted(METRIC_PRESENTATION):
        meta = METRIC_PRESENTATION[key]
        defn: MetricDef | None = METRICS.get(key)
        rows.append(
            {
                "key": meta.key,
                "label": meta.label,
                "format_type": meta.format_type,
                "storage": meta.storage,
                "percentage_scale": meta.percentage_scale,
                "metric_kind": defn.kind if defn else None,
                "description": meta.description,
            }
        )
    return rows

