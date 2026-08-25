"""Founder-facing presentation for strategic keys and structured sections."""

from __future__ import annotations

import re
from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.assessment import DecisionSubject
from wyz_analytics.ai_cfo.strategy.decision_frame import PrioritizeCandidate
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme
from wyz_analytics.ai_cfo.strategy.strategic_semantic import resolve_change_my_view_keys, resolve_reason_key
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown

_INTERNAL_KEY_RE = re.compile(r"^[a-z0-9_]+$")
_MARKDOWN_RE = re.compile(r"[#*_`]|^\s*[-*]\s+", re.M)

_POSITION_KEY_COPY: dict[str, str] = {
    "investigate_driver_before_stronger_action": (
        "I'd investigate the verified drivers before recommending a stronger move."
    ),
    "insufficient_evidence_for_stronger_recommendation": (
        "I don't have enough evidence in this view to make a stronger recommendation yet."
    ),
    "eligibility_prepared_awaiting_strategic_judgment": (
        "I've verified the economics in this view and am ready to reason about next steps."
    ),
    "consider_controlled_experiment_among_eligible": (
        "A controlled experiment is worth considering among the eligible options."
    ),
    "investigate_verified_pressures_under_current_scope": (
        "I'd investigate the verified pressures in the current view first."
    ),
    "track_core_margin_and_growth_metrics": (
        "I'd track core margin and growth metrics before acting."
    ),
    "complete_diagnosis_before_recommendation": (
        "I'd complete the diagnosis before making a stronger recommendation."
    ),
    "controlled_reduction_test": (
        "I'd test a controlled reduction before making a broad cut."
    ),
    "optimize_marketing_pressure": "I'd optimize verified marketing pressure before cutting broadly.",
    "investigate_marketing_drivers": "I'd investigate which marketing drivers are least productive first.",
    "maintain_with_monitoring": "I'd maintain current spend while monitoring margin response closely.",
    "channel_exit_caution": "I wouldn't exit from this evidence alone without deeper driver isolation.",
    "channel_exit_hold": "I wouldn't exit this channel from the current evidence alone.",
    "price_investigate_first": (
        "I wouldn't make a broad price increase yet; first establish whether pricing is actually the constraint."
    ),
    "prioritize_material_pressure": "I'd focus on the most material verified pressure first.",
}

_THEME_UNCERTAINTY_COPY: dict[DecisionTheme, dict[str, str]] = {
    DecisionTheme.MARKETING: {
        StrategicUnknown.DEMAND_RESPONSE.value: (
            "We do not know how demand responds if acquisition spend changes."
        ),
        StrategicUnknown.CAC_LTV.value: "We do not know whether CAC/LTV supports the current spend level.",
        StrategicUnknown.ATTRIBUTION_LIMITATION.value: (
            "Attributed marketing CM2 is not fully-loaded profitability."
        ),
        StrategicUnknown.TEMPORAL_STABILITY.value: "We do not know whether marketing pressure is persistent yet.",
    },
    DecisionTheme.CHANNEL_EXIT: {
        StrategicUnknown.RETENTION.value: (
            "We do not know customer retention or migration if the channel is paused or exited."
        ),
        StrategicUnknown.OPERATIONAL_FEASIBILITY.value: (
            "Operational consequences of pausing or exiting the channel are not verified here."
        ),
        StrategicUnknown.TEMPORAL_STABILITY.value: "We do not know whether channel weakness is persistent yet.",
        StrategicUnknown.DATA_COMPLETENESS.value: (
            "Strategic channel value beyond contribution economics is not fully captured."
        ),
        StrategicUnknown.COMPETITIVE_RESPONSE.value: (
            "Competitive response to channel changes is not established in this data."
        ),
        StrategicUnknown.DEMAND_RESPONSE.value: (
            "If marketing is a driver, demand response to spend changes remains unknown."
        ),
    },
    DecisionTheme.PRICE: {
        StrategicUnknown.PRICE_ELASTICITY.value: (
            "We cannot estimate the demand response to a price change from margin data alone."
        ),
        StrategicUnknown.DEMAND_RESPONSE.value: "Volume response to pricing is not observable from margin evidence.",
        StrategicUnknown.COMPETITIVE_RESPONSE.value: "Competitive response to a price move is not established here.",
    },
    DecisionTheme.PRIORITIZE: {
        StrategicUnknown.TEMPORAL_STABILITY.value: "Relative persistence across pressures is not fully established.",
        StrategicUnknown.DATA_COMPLETENESS.value: "Some verified pressures may not yet be fully isolated.",
    },
}

_FALLBACK_BY_THEME: dict[DecisionTheme, str] = {
    DecisionTheme.MARKETING: (
        "I can see verified pressure from attributed marketing, but I don't have enough reliable "
        "strategic reasoning to recommend a larger change yet. I'd investigate where that spend is "
        "least productive before making a broad cut."
    ),
    DecisionTheme.CHANNEL_EXIT: (
        "I wouldn't make an exit decision from the current evidence alone. I'd compare channel economics "
        "with peers and isolate whether weakness is channel-wide or concentrated first."
    ),
    DecisionTheme.SKU_EXIT: (
        "I wouldn't exit this line from the current evidence alone. I'd isolate whether the weakness "
        "is persistent, material, and concentrated before considering exit."
    ),
    DecisionTheme.PRICE: (
        "I wouldn't make a broad price increase from this evidence alone because we don't know the demand response."
    ),
    DecisionTheme.PRIORITIZE: (
        "I can't reliably rank these pressures yet because the verified evidence isn't clear enough."
    ),
    DecisionTheme.PRODUCT_COST: (
        "I can see verified cost pressure, but I'd investigate which cost components are driving it "
        "before recommending a stronger cut."
    ),
    DecisionTheme.GENERIC: (
        "I can see verified financial signals here, but I don't have enough reliable strategic "
        "reasoning to recommend a stronger action yet. I'd investigate the driver first."
    ),
}

_METRIC_LABELS: dict[str, str] = {
    "cm2": "CM2",
    "cm2_pct": "CM2 margin",
    "cm1": "CM1",
    "cm1_pct": "CM1 margin",
    "net_revenue": "Net revenue",
    "allocated_marketing": "attributed marketing spend",
    "marketing": "attributed marketing spend",
    "marketing_pct": "Marketing % of net revenue",
    "gross_margin": "Gross margin",
    "gross_margin_pct": "Gross margin %",
    "orders": "Orders",
    "product_cogs": "product COGS",
    "cm1_cost": "CM1 costs",
}

# Snake_case tokens that must never appear in founder-facing prose.
_INTERNAL_TOKEN_LABELS: dict[str, str] = {
    **_METRIC_LABELS,
    "investigate_driver_before_stronger_action": "investigating the verified drivers first",
    "controlled_reduction_test": "a controlled reduction test",
    "channel_exit_peer_comparison": "peer-channel comparison",
    "channel_exit_caution": "caution on exit",
    "optimize_marketing_pressure": "optimizing marketing pressure",
    "demand_response": "demand response",
    "cac_ltv": "CAC/LTV",
    "hold_revenue_constant": "holding revenue constant",
    "mechanical_cm2_sensitivity": "mechanical CM2 sensitivity",
}

_SNAKE_TOKEN_RE = re.compile(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")
_PROSE_FIELDS = (
    "direct_answer",
    "why",
    "next_step",
    "therefore",
    "what_this_changes",
    "what_it_doesnt_tell_us",
    "new_evidence_summary",
    "interpretation",
    "headline",
)


def resolve_metric_label(key: str | None) -> str:
    """Map internal metric keys to founder-facing labels. Never returns the raw key."""
    if not key:
        return "the verified metric"
    k = str(key).strip().lower()
    if k in _METRIC_LABELS:
        return _METRIC_LABELS[k]
    if k in _INTERNAL_TOKEN_LABELS:
        return _INTERNAL_TOKEN_LABELS[k]
    # Safe fallback — never echo snake_case identifiers.
    return "the verified metric"


def resolve_scenario_effect_text(
    mechanical_effects: list[dict[str, Any]] | None,
    *,
    lever: str | None = None,
) -> tuple[str | None, str]:
    """Deterministic founder-facing prose for CALCULATED_SCENARIO mechanical effects.

    Returns (what_this_changes, what_it_doesnt_tell_us).
    Never embeds raw metric keys. Never claims observed demand response.
    """
    effects = [e for e in (mechanical_effects or []) if isinstance(e, dict)]
    improves: list[str] = []
    decreases: list[str] = []
    for item in effects:
        metric = str(item.get("metric_key") or "").strip()
        if not metric:
            continue
        label = resolve_metric_label(metric)
        direction = str(item.get("direction") or "").upper()
        if direction == "IMPROVES":
            improves.append(label)
        elif direction == "DECREASES" and metric in {
            "allocated_marketing",
            "marketing",
            "product_cogs",
            "cm1_cost",
        }:
            decreases.append(label)
        elif direction == "IMPROVES" or direction == "DECREASES":
            improves.append(label)

    # Prefer CM2 / CM2 margin language when present.
    cm_labels = [x for x in improves if x in {"CM2", "CM2 margin"}]
    other_improves = [x for x in improves if x not in cm_labels]
    spend_down = decreases[:1]

    what_changes = None
    if cm_labels or spend_down or other_improves:
        parts: list[str] = []
        if spend_down and cm_labels:
            parts.append(
                f"Under the sensitivity, lower {spend_down[0]} mechanically improves "
                f"{' and '.join(cm_labels[:2])} while revenue is held constant."
            )
        elif cm_labels:
            parts.append(
                f"Under the sensitivity, {' and '.join(cm_labels[:2])} improve mechanically "
                "while revenue is held constant."
            )
        elif spend_down:
            parts.append(
                f"Under the sensitivity, {spend_down[0]} falls while revenue is held constant."
            )
        elif other_improves:
            parts.append(
                f"Under the sensitivity, {' and '.join(other_improves[:2])} move favorably "
                "while revenue is held constant."
            )
        what_changes = " ".join(parts)

    what_doesnt = (
        "It does not show how revenue, orders, CAC/LTV, or customer demand would respond to the cut."
        if (lever or "").upper() in {"MARKETING_SPEND", "MARKETING", ""}
        else "It does not show how real-world demand or operations would respond outside this sensitivity."
    )
    return what_changes, what_doesnt


def sanitize_founder_prose(text: str | None) -> str | None:
    """Replace unresolved internal snake_case tokens in founder-facing prose."""
    if text is None:
        return None
    raw = str(text)
    if not raw.strip():
        return None

    unresolved: list[str] = []

    def _repl(match: re.Match[str]) -> str:
        token = match.group(0)
        if token in _INTERNAL_TOKEN_LABELS:
            return _INTERNAL_TOKEN_LABELS[token]
        # Unknown internal-looking key — never leak.
        unresolved.append(token)
        return "the verified factor"

    cleaned = _SNAKE_TOKEN_RE.sub(_repl, raw)
    # Collapse accidental double spaces from replacements.
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned or None


def sanitize_strategic_presentation_fields(
    body: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Sanitize founder-facing strategic fields. Returns (body, telemetry)."""
    out = dict(body)
    unresolved: list[str] = []
    resolved_count = 0

    def _scan(value: str) -> str:
        nonlocal resolved_count
        before_tokens = set(_SNAKE_TOKEN_RE.findall(value))
        cleaned = sanitize_founder_prose(value) or value
        after_tokens = set(_SNAKE_TOKEN_RE.findall(cleaned))
        fixed = before_tokens - after_tokens
        resolved_count += len(fixed)
        still = [t for t in after_tokens if "_" in t]
        unresolved.extend(still)
        return cleaned

    for field in _PROSE_FIELDS:
        if isinstance(out.get(field), str):
            out[field] = _scan(out[field])

    for list_field in ("uncertainty", "what_would_change_my_view", "monitoring"):
        items = out.get(list_field)
        if not isinstance(items, list):
            continue
        cleaned_list: list[Any] = []
        for item in items:
            if isinstance(item, str):
                # Monitoring labels should already be resolved; still sanitize.
                cleaned_list.append(_scan(item))
            else:
                cleaned_list.append(item)
        out[list_field] = cleaned_list

    telem = {
        "strategic_presentation_keys_resolved": resolved_count,
        "strategic_presentation_unresolved_keys": list(dict.fromkeys(unresolved))[:8],
    }
    return out, telem


def contains_unresolved_internal_keys(text: str | None) -> bool:
    """True if founder-facing text still contains snake_case internal tokens."""
    if not text:
        return False
    return bool(_SNAKE_TOKEN_RE.search(str(text)))


def is_internal_template_key(text: str | None) -> bool:
    if not text:
        return False
    stripped = str(text).strip()
    if " " in stripped or stripped.endswith("."):
        return False
    return bool(_INTERNAL_KEY_RE.match(stripped)) and len(stripped) > 12


def strip_markdown_leakage(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = _MARKDOWN_RE.sub("", str(text))
    return cleaned.strip() or None


def resolve_position_text(text: str | None, *, fallback: str | None = None) -> str | None:
    if not text:
        return fallback
    stripped = str(text).strip()
    if not stripped:
        return fallback
    if stripped in _POSITION_KEY_COPY:
        return _POSITION_KEY_COPY[stripped]
    if is_internal_template_key(stripped):
        return fallback or "I'd investigate the verified drivers before recommending a stronger move."
    return stripped


def resolve_monitoring_labels(keys: list[str] | None, *, theme: DecisionTheme | None = None) -> list[str]:
    if not keys:
        defaults = {
            DecisionTheme.MARKETING: ["CM1", "Marketing % of net revenue", "CM2", "Net revenue"],
            DecisionTheme.CHANNEL_EXIT: ["Net revenue", "CM2 margin", "Marketing % of net revenue"],
            DecisionTheme.PRICE: ["Gross margin %", "CM1 margin", "CM2 margin", "Orders"],
            DecisionTheme.PRIORITIZE: ["CM2", "Net revenue", "Marketing % of net revenue"],
            DecisionTheme.PRODUCT_COST: ["Gross margin %", "CM1", "CM2"],
        }
        return list(defaults.get(theme or DecisionTheme.GENERIC, ["CM2", "Net revenue"]))
    labels: list[str] = []
    for key in keys[:6]:
        k = str(key).strip().lower()
        labels.append(resolve_metric_label(k))
    return labels


def theme_fallback_copy(theme: DecisionTheme | None) -> str:
    return _FALLBACK_BY_THEME.get(theme or DecisionTheme.GENERIC, _FALLBACK_BY_THEME[DecisionTheme.GENERIC])


def _uncertainty_items(keys: list[str], *, theme: DecisionTheme | None = None) -> list[str]:
    if not keys:
        return []
    theme_map = _THEME_UNCERTAINTY_COPY.get(theme or DecisionTheme.GENERIC, {})
    parts: list[str] = []
    for key in keys[:4]:
        text = theme_map.get(key)
        if text and text not in parts:
            parts.append(text)
    if parts:
        return parts
    if StrategicUnknown.PRICE_ELASTICITY.value in keys:
        return [_THEME_UNCERTAINTY_COPY[DecisionTheme.PRICE][StrategicUnknown.PRICE_ELASTICITY.value]]
    return ["Some strategic unknowns remain in the current evidence."]


def build_strategic_presentation(
    *,
    headline: str,
    rationale: str | None,
    why_fallback: str | None,
    primary_reason_key: str | None,
    uncertainty_keys: list[str],
    tradeoff_keys: list[str] | None,
    change_my_view_keys: list[str] | None,
    next_action: ActionType | None,
    monitoring_keys: list[str] | None,
    theme: DecisionTheme | None = None,
    subject: DecisionSubject | None = None,
    priority_candidate: PrioritizeCandidate | None = None,
    evidence_sections: list[dict[str, Any]] | None = None,
    semantic_variant: str | None = None,
    evidence_gaps: list[str] | None = None,
    next_step_override: str | None = None,
) -> dict[str, Any]:
    """Structured strategic body for frontend — no markdown syntax."""
    from wyz_analytics.ai_cfo.strategy.action_semantics import resolve_strategic_next_step

    reason_snippet = resolve_reason_key(primary_reason_key)
    why = strip_markdown_leakage(
        (rationale or "").strip() or reason_snippet or (why_fallback or "").strip() or None
    )
    uncertainty = _uncertainty_items(uncertainty_keys, theme=theme)
    if tradeoff_keys and not uncertainty:
        uncertainty = [str(k).replace("_", " ") for k in tradeoff_keys[:2]]
    if evidence_gaps and theme == DecisionTheme.CHANNEL_EXIT:
        if "multi_channel_comparison_unavailable" in evidence_gaps:
            gap_text = "Peer-channel comparison is unavailable in this pinned scope."
            if gap_text not in uncertainty:
                uncertainty.append(gap_text)
    change_view = resolve_change_my_view_keys(change_my_view_keys)
    if next_step_override:
        next_step = next_step_override
    else:
        next_step, _ = resolve_strategic_next_step(
            decision_theme=theme,
            selected_action=next_action,
            subject=subject,
            priority_candidate=priority_candidate,
        )
    monitoring = resolve_monitoring_labels(monitoring_keys, theme=theme)
    body: dict[str, Any] = {
        "direct_answer": strip_markdown_leakage(headline),
        "evidence_sections": list(evidence_sections or []),
        "why": why,
        "next_step": next_step,
        "uncertainty": uncertainty,
        "monitoring": monitoring,
        "semantic_variant": semantic_variant,
    }
    if change_view:
        body["what_would_change_my_view"] = change_view
    return body


def resolve_strategic_headline(
    *,
    position: str | None,
    rationale: str | None,
    selected_action: ActionType | None,
    theme: DecisionTheme | None = None,
    fallback_used: bool = False,
    subject: DecisionSubject | None = None,
    priority_candidate: PrioritizeCandidate | None = None,
    primary_reason_key: str | None = None,
) -> tuple[str, str | None]:
    """Return (headline, semantic_variant) using theme×action realization."""
    from wyz_analytics.ai_cfo.strategy.action_semantics import resolve_strategic_position

    headline, variant = resolve_strategic_position(
        decision_theme=theme,
        selected_action=selected_action,
        subject=subject,
        primary_reason_key=primary_reason_key,
        priority_candidate=priority_candidate,
        position_key_or_text=position or rationale,
        fallback_used=fallback_used,
    )
    return (headline[:500], variant)
