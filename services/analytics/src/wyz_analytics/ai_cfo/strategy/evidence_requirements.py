"""Strategic evidence requirement registry (eligibility inputs, not recommendations)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.intent import DecisionType, extract_subject_hint
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


class DecisionTheme(str, Enum):
    MARKETING = "MARKETING"
    CHANNEL_EXIT = "CHANNEL_EXIT"
    SKU_EXIT = "SKU_EXIT"
    PRICE = "PRICE"
    PRODUCT_COST = "PRODUCT_COST"
    PRIORITIZE = "PRIORITIZE"
    MONITOR = "MONITOR"
    EXPERIMENT = "EXPERIMENT"
    GENERIC = "GENERIC"


class EvidenceFlag(str, Enum):
    """Semantic evidence flags — presence checked against envelope/signals/tools."""

    HAS_SCOPE = "HAS_SCOPE"
    HAS_CM1 = "HAS_CM1"
    HAS_CM2 = "HAS_CM2"
    HAS_CM1_CM2_RELATION = "HAS_CM1_CM2_RELATION"
    HAS_MARKETING_METRIC = "HAS_MARKETING_METRIC"
    HAS_MARKETING_PRESSURE = "HAS_MARKETING_PRESSURE"
    HAS_NEGATIVE_CONTRIBUTION = "HAS_NEGATIVE_CONTRIBUTION"
    HAS_MATERIALITY_MEDIUM_PLUS = "HAS_MATERIALITY_MEDIUM_PLUS"
    HAS_PEER_RANKING = "HAS_PEER_RANKING"
    HAS_PERSISTENCE_PERSISTENT = "HAS_PERSISTENCE_PERSISTENT"
    HAS_COST_BREAKDOWN = "HAS_COST_BREAKDOWN"
    HAS_COST_RECON_OK = "HAS_COST_RECON_OK"
    HAS_GROSS_MARGIN = "HAS_GROSS_MARGIN"
    HAS_TREND = "HAS_TREND"
    HAS_VERIFIED_SIGNAL = "HAS_VERIFIED_SIGNAL"
    HAS_MULTI_INDEPENDENT_SOURCES = "HAS_MULTI_INDEPENDENT_SOURCES"
    # Channel EXIT requires multi-channel comparison — not available inside a single-channel filter.
    HAS_MULTI_CHANNEL_COMPARISON = "HAS_MULTI_CHANNEL_COMPARISON"


@dataclass(frozen=True)
class StrategicEvidenceRequirement:
    """What must be present for a given action under a theme."""

    theme: DecisionTheme
    action: ActionType
    required_flags: frozenset[EvidenceFlag]
    helpful_flags: frozenset[EvidenceFlag] = frozenset()
    relevant_unknowns: frozenset[StrategicUnknown] = frozenset()
    notes: str = ""


@dataclass
class StrategicEvidencePlan:
    """What tools to force for a strategic turn (before eligibility)."""

    theme: DecisionTheme
    force_cost_breakdown: bool = False
    force_trend: bool = False
    force_breakdown: bool = False
    breakdown_dimension: str | None = None
    relevant_unknowns: list[StrategicUnknown] = field(default_factory=list)
    explanation: str = ""


def classify_decision_theme(message: str, decision_type: DecisionType | None) -> DecisionTheme:
    text = (message or "").lower()
    if decision_type == DecisionType.PRIORITIZE or "fix first" in text or "prioritize" in text:
        return DecisionTheme.PRIORITIZE
    if decision_type == DecisionType.MONITOR or "monitor" in text:
        return DecisionTheme.MONITOR
    if decision_type == DecisionType.EXPERIMENT or re.search(r"\bwhat should i test\b", text):
        return DecisionTheme.EXPERIMENT
    if any(tok in text for tok in ("price", "pricing", "increase prices", "raise prices")):
        return DecisionTheme.PRICE
    if any(
        tok in text
        for tok in (
            "product cost",
            "reduce product costs",
            "cut costs",
            "cogs",
            "product economics",
            "where should i cut costs",
        )
    ):
        return DecisionTheme.PRODUCT_COST
    if any(tok in text for tok in ("stop selling", "exit", "discontinue", "shut down")):
        subject = extract_subject_hint(message)
        if subject.get("dimension") == "sku" or "sku" in text:
            return DecisionTheme.SKU_EXIT
        return DecisionTheme.CHANNEL_EXIT
    if any(tok in text for tok in ("cut marketing", "reduce marketing", "marketing spend", "acquisition")):
        return DecisionTheme.MARKETING
    if "marketing" in text and any(tok in text for tok in ("cut", "reduce", "lower")):
        return DecisionTheme.MARKETING
    return DecisionTheme.GENERIC


def build_strategic_evidence_plan(
    message: str,
    *,
    decision_type: DecisionType | None,
    filters: dict[str, Any] | None = None,
) -> StrategicEvidencePlan:
    theme = classify_decision_theme(message, decision_type)
    plan = StrategicEvidencePlan(theme=theme)
    active_filters = filters if isinstance(filters, dict) else {}

    if theme == DecisionTheme.PRODUCT_COST:
        plan.force_cost_breakdown = True
        plan.explanation = "product-cost strategic question requires scoped cost breakdown."
    elif theme == DecisionTheme.PRIORITIZE:
        plan.force_breakdown = True
        plan.breakdown_dimension = "channel"
        if "cost" in (message or "").lower():
            plan.force_cost_breakdown = True
        plan.explanation = "prioritization requires material pressure candidates within current scope."
    elif theme in {DecisionTheme.CHANNEL_EXIT, DecisionTheme.SKU_EXIT}:
        plan.force_trend = True
        plan.force_breakdown = True
        if theme == DecisionTheme.SKU_EXIT:
            plan.breakdown_dimension = "sku"
        elif active_filters.get("channel"):
            plan.breakdown_dimension = "category"
        else:
            plan.breakdown_dimension = "channel"
        plan.explanation = "exit-themed decisions require trend + peer/concentration context."
    elif theme == DecisionTheme.MARKETING:
        plan.force_trend = False
        plan.explanation = "marketing decisions use current-scope CM1/CM2 + marketing metrics/signals."
    elif theme == DecisionTheme.PRICE:
        plan.explanation = "price decisions use margin stages; elasticity remains unknown."

    from wyz_analytics.ai_cfo.strategy.uncertainty import resolve_theme_unknowns

    plan.relevant_unknowns = resolve_theme_unknowns(theme)
    return plan


def _req(
    theme: DecisionTheme,
    action: ActionType,
    required: set[EvidenceFlag],
    helpful: set[EvidenceFlag] | None = None,
    unknowns: set[StrategicUnknown] | None = None,
    notes: str = "",
) -> StrategicEvidenceRequirement:
    return StrategicEvidenceRequirement(
        theme=theme,
        action=action,
        required_flags=frozenset(required),
        helpful_flags=frozenset(helpful or set()),
        relevant_unknowns=frozenset(unknowns or set()),
        notes=notes,
    )


# Base low-severity actions: scope + some financial fact.
_BASE_INVESTIGATE = {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_CM2}
_BASE_MONITOR = {EvidenceFlag.HAS_SCOPE}
_BASE_EXPERIMENT = {
    EvidenceFlag.HAS_SCOPE,
    EvidenceFlag.HAS_CM1_CM2_RELATION,
}
_BASE_OPTIMIZE = {
    EvidenceFlag.HAS_SCOPE,
    EvidenceFlag.HAS_CM1_CM2_RELATION,
    EvidenceFlag.HAS_VERIFIED_SIGNAL,
}

# Registry entries (theme, action) — incomplete themes fall back to GENERIC rules.
_REGISTRY: list[StrategicEvidenceRequirement] = []


def _register_marketing() -> None:
    theme = DecisionTheme.MARKETING
    unknowns = {StrategicUnknown.DEMAND_RESPONSE, StrategicUnknown.ATTRIBUTION_LIMITATION}
    _REGISTRY.extend(
        [
            _req(theme, ActionType.INVESTIGATE, _BASE_INVESTIGATE | {EvidenceFlag.HAS_MARKETING_METRIC}, unknowns=unknowns),
            _req(theme, ActionType.MONITOR, _BASE_MONITOR | {EvidenceFlag.HAS_MARKETING_METRIC}, unknowns=unknowns),
            _req(
                theme,
                ActionType.EXPERIMENT,
                _BASE_EXPERIMENT | {EvidenceFlag.HAS_MARKETING_METRIC},
                helpful={EvidenceFlag.HAS_TREND},
                unknowns=unknowns,
            ),
            _req(
                theme,
                ActionType.OPTIMIZE,
                _BASE_OPTIMIZE | {EvidenceFlag.HAS_MARKETING_METRIC, EvidenceFlag.HAS_MARKETING_PRESSURE},
                unknowns=unknowns,
            ),
            _req(
                theme,
                ActionType.REDUCE,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_MARKETING_METRIC,
                    EvidenceFlag.HAS_CM1_CM2_RELATION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                },
                helpful={EvidenceFlag.HAS_TREND, EvidenceFlag.HAS_MARKETING_PRESSURE},
                unknowns=unknowns,
                notes="REDUCE requires material marketing pressure; demand response remains unknown.",
            ),
            _req(
                theme,
                ActionType.MAINTAIN,
                {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_CM2},
                unknowns=unknowns,
            ),
            _req(
                theme,
                ActionType.PAUSE,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_MARKETING_METRIC,
                    EvidenceFlag.HAS_CM1_CM2_RELATION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                    EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                    EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
                },
                unknowns=unknowns,
            ),
            _req(
                theme,
                ActionType.EXIT,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                    EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                    EvidenceFlag.HAS_PEER_RANKING,
                    EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
                },
                unknowns=unknowns,
                notes="CM2 alone never satisfies EXIT.",
            ),
            _req(theme, ActionType.INCREASE, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_MARKETING_METRIC}, unknowns=unknowns),
            _req(theme, ActionType.REALLOCATE, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_MARKETING_METRIC, EvidenceFlag.HAS_CM2}, unknowns=unknowns),
        ]
    )


def _register_channel_exit() -> None:
    theme = DecisionTheme.CHANNEL_EXIT
    unknowns = {
        StrategicUnknown.DEMAND_RESPONSE,
        StrategicUnknown.RETENTION,
        StrategicUnknown.OPERATIONAL_FEASIBILITY,
    }
    _REGISTRY.extend(
        [
            _req(theme, ActionType.INVESTIGATE, _BASE_INVESTIGATE, unknowns=unknowns),
            _req(theme, ActionType.MONITOR, _BASE_MONITOR | {EvidenceFlag.HAS_CM2}, unknowns=unknowns),
            _req(theme, ActionType.EXPERIMENT, _BASE_EXPERIMENT, helpful={EvidenceFlag.HAS_TREND}, unknowns=unknowns),
            _req(theme, ActionType.OPTIMIZE, _BASE_OPTIMIZE, unknowns=unknowns),
            _req(
                theme,
                ActionType.REDUCE,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_CM1_CM2_RELATION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                },
                unknowns=unknowns,
            ),
            _req(theme, ActionType.MAINTAIN, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_CM2}, unknowns=unknowns),
            _req(
                theme,
                ActionType.PAUSE,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                    EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                    EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
                },
                unknowns=unknowns,
            ),
            _req(
                theme,
                ActionType.EXIT,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                    EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                    EvidenceFlag.HAS_PEER_RANKING,
                    EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
                    EvidenceFlag.HAS_TREND,
                    EvidenceFlag.HAS_MULTI_CHANNEL_COMPARISON,
                },
                unknowns=unknowns,
                notes="Channel EXIT requires multi-channel comparison; CM2 alone insufficient.",
            ),
        ]
    )


def _register_sku_exit() -> None:
    theme = DecisionTheme.SKU_EXIT
    unknowns = {
        StrategicUnknown.CUSTOMER_SENTIMENT,
        StrategicUnknown.OPERATIONAL_FEASIBILITY,
        StrategicUnknown.RETENTION,
    }
    _REGISTRY.extend(
        [
            _req(theme, ActionType.INVESTIGATE, _BASE_INVESTIGATE, unknowns=unknowns),
            _req(theme, ActionType.MONITOR, _BASE_MONITOR | {EvidenceFlag.HAS_CM2}, unknowns=unknowns),
            _req(theme, ActionType.EXPERIMENT, _BASE_EXPERIMENT, unknowns=unknowns),
            _req(theme, ActionType.OPTIMIZE, _BASE_OPTIMIZE, unknowns=unknowns),
            _req(
                theme,
                ActionType.REDUCE,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                },
                unknowns=unknowns,
            ),
            _req(
                theme,
                ActionType.PAUSE,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                    EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                    EvidenceFlag.HAS_PEER_RANKING,
                },
                unknowns=unknowns,
            ),
            _req(
                theme,
                ActionType.EXIT,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                    EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                    EvidenceFlag.HAS_PEER_RANKING,
                    EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
                    EvidenceFlag.HAS_TREND,
                },
                unknowns=unknowns,
                notes="SKU EXIT is architecturally possible with VERY_STRONG burden; not permanently banned.",
            ),
        ]
    )


def _register_price() -> None:
    theme = DecisionTheme.PRICE
    unknowns = {StrategicUnknown.PRICE_ELASTICITY}
    _REGISTRY.extend(
        [
            _req(theme, ActionType.INVESTIGATE, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_GROSS_MARGIN}, unknowns=unknowns),
            _req(theme, ActionType.MONITOR, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_GROSS_MARGIN}, unknowns=unknowns),
            _req(theme, ActionType.EXPERIMENT, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_GROSS_MARGIN, EvidenceFlag.HAS_CM1}, unknowns=unknowns),
            # INCREASE must NOT become eligible merely from weak margins.
            _req(
                theme,
                ActionType.INCREASE,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_GROSS_MARGIN,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                    EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
                    # Intentionally impossible without elasticity evidence flag we never set in 2B.
                    EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                },
                unknowns=unknowns,
                notes="Price INCREASE not eligible without elasticity; financial pressure alone insufficient.",
            ),
            _req(theme, ActionType.OPTIMIZE, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_GROSS_MARGIN}, unknowns=unknowns),
            _req(theme, ActionType.MAINTAIN, {EvidenceFlag.HAS_SCOPE}, unknowns=unknowns),
        ]
    )


def _register_product_cost() -> None:
    theme = DecisionTheme.PRODUCT_COST
    unknowns = {StrategicUnknown.OPERATIONAL_FEASIBILITY}
    _REGISTRY.extend(
        [
            _req(theme, ActionType.INVESTIGATE, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_COST_BREAKDOWN}, unknowns=unknowns),
            _req(theme, ActionType.MONITOR, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_COST_BREAKDOWN}, unknowns=unknowns),
            _req(
                theme,
                ActionType.OPTIMIZE,
                {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_COST_BREAKDOWN, EvidenceFlag.HAS_COST_RECON_OK},
                unknowns=unknowns,
            ),
            _req(
                theme,
                ActionType.REDUCE,
                {
                    EvidenceFlag.HAS_SCOPE,
                    EvidenceFlag.HAS_COST_BREAKDOWN,
                    EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                },
                unknowns=unknowns,
            ),
            _req(theme, ActionType.EXPERIMENT, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_COST_BREAKDOWN}, unknowns=unknowns),
        ]
    )


def _register_generic() -> None:
    theme = DecisionTheme.GENERIC
    for action, flags in (
        (ActionType.INVESTIGATE, _BASE_INVESTIGATE),
        (ActionType.MONITOR, _BASE_MONITOR),
        (ActionType.EXPERIMENT, _BASE_EXPERIMENT),
        (ActionType.OPTIMIZE, _BASE_OPTIMIZE),
        (ActionType.REDUCE, _BASE_OPTIMIZE | {EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS}),
        (ActionType.MAINTAIN, {EvidenceFlag.HAS_SCOPE, EvidenceFlag.HAS_CM2}),
        (
            ActionType.PAUSE,
            {
                EvidenceFlag.HAS_SCOPE,
                EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
                EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
            },
        ),
        (
            ActionType.EXIT,
            {
                EvidenceFlag.HAS_SCOPE,
                EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION,
                EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS,
                EvidenceFlag.HAS_PERSISTENCE_PERSISTENT,
                EvidenceFlag.HAS_PEER_RANKING,
                EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES,
            },
        ),
    ):
        _REGISTRY.append(_req(theme, action, flags))


def _register_prioritize_monitor_experiment() -> None:
    for theme in (DecisionTheme.PRIORITIZE, DecisionTheme.MONITOR, DecisionTheme.EXPERIMENT):
        _REGISTRY.append(_req(theme, ActionType.INVESTIGATE, _BASE_INVESTIGATE))
        _REGISTRY.append(_req(theme, ActionType.MONITOR, _BASE_MONITOR | {EvidenceFlag.HAS_CM2}))
        _REGISTRY.append(_req(theme, ActionType.EXPERIMENT, _BASE_EXPERIMENT))
        _REGISTRY.append(_req(theme, ActionType.OPTIMIZE, _BASE_OPTIMIZE))


_register_marketing()
_register_channel_exit()
_register_sku_exit()
_register_price()
_register_product_cost()
_register_generic()
_register_prioritize_monitor_experiment()


def lookup_requirement(theme: DecisionTheme, action: ActionType) -> StrategicEvidenceRequirement | None:
    for item in _REGISTRY:
        if item.theme == theme and item.action == action:
            return item
    if theme != DecisionTheme.GENERIC:
        return lookup_requirement(DecisionTheme.GENERIC, action)
    return None


def candidate_actions_for_theme(theme: DecisionTheme, decision_type: DecisionType | None) -> list[ActionType]:
    if decision_type == DecisionType.MONITOR or theme == DecisionTheme.MONITOR:
        return [ActionType.MONITOR, ActionType.INVESTIGATE]
    if decision_type == DecisionType.EXPERIMENT or theme == DecisionTheme.EXPERIMENT:
        return [ActionType.EXPERIMENT, ActionType.INVESTIGATE, ActionType.MONITOR]
    if decision_type == DecisionType.PRIORITIZE or theme == DecisionTheme.PRIORITIZE:
        return [ActionType.INVESTIGATE, ActionType.OPTIMIZE, ActionType.MONITOR, ActionType.EXPERIMENT]
    if theme == DecisionTheme.PRICE:
        return [
            ActionType.INVESTIGATE,
            ActionType.MONITOR,
            ActionType.EXPERIMENT,
            ActionType.OPTIMIZE,
            ActionType.MAINTAIN,
            ActionType.INCREASE,
        ]
    if theme == DecisionTheme.PRODUCT_COST:
        return [
            ActionType.INVESTIGATE,
            ActionType.MONITOR,
            ActionType.EXPERIMENT,
            ActionType.OPTIMIZE,
            ActionType.REDUCE,
        ]
    if theme in {DecisionTheme.CHANNEL_EXIT, DecisionTheme.SKU_EXIT}:
        return [
            ActionType.INVESTIGATE,
            ActionType.MONITOR,
            ActionType.EXPERIMENT,
            ActionType.OPTIMIZE,
            ActionType.REDUCE,
            ActionType.MAINTAIN,
            ActionType.PAUSE,
            ActionType.EXIT,
        ]
    # MARKETING / GENERIC DECIDE
    return [
        ActionType.INVESTIGATE,
        ActionType.MONITOR,
        ActionType.EXPERIMENT,
        ActionType.OPTIMIZE,
        ActionType.REDUCE,
        ActionType.MAINTAIN,
        ActionType.PAUSE,
        ActionType.EXIT,
    ]
