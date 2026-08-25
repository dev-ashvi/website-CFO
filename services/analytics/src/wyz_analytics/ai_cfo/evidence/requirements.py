"""Reusable evidence requirement registry for AI CFO."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.followup import (
    FollowUpIntent,
    RankDirection,
    resolve_followup,
)

CONTRIBUTOR_SIGNAL_TYPES = frozenset(
    {
        "TOP_CM2_CONTRIBUTOR",
        "TOP_CM1_CONTRIBUTOR",
        "TOP_GM_CONTRIBUTOR",
        "NEGATIVE_CM2_CONTRIBUTOR",
        "HIGH_REVENUE_NEGATIVE_CM2",
        "HIGH_REVENUE_LOW_CM2",
        "positive_cm1_negative_cm2",
        "positive_gm_negative_cm1",
        "negative_gross_margin",
    }
)

PROFITABILITY_SIGNAL_TYPES = frozenset(
    {
        "positive_cm1_negative_cm2",
        "positive_gm_negative_cm1",
        "negative_gross_margin",
        "HIGH_REVENUE_NEGATIVE_CM2",
        "HIGH_REVENUE_LOW_CM2",
    }
)

PRESSURE_SIGNAL_TYPES = frozenset(
    {
        "PRODUCT_COGS_PRESSURE",
        "CHANNEL_COST_PRESSURE",
        "MARKETING_PRESSURE",
    }
)


@dataclass
class EvidenceRequirement:
    intent: str
    requires_tool: bool = False
    required_tool: str | None = None
    required_tool_args: dict[str, Any] | None = None
    allowed_tools: list[str] = field(
        default_factory=lambda: [
            "get_current_financial_view",
            "get_cfo_signals",
            "get_breakdown",
            "get_trend",
            "get_cost_breakdown",
        ]
    )
    forbidden_inference: list[str] = field(default_factory=list)
    explanation: str = ""
    ranking_metric: str = "cm2"
    dimension: str | None = None


def _signals(context: dict[str, Any]) -> list[dict[str, Any]]:
    return list(context.get("signals") or [])


def _signals_for_dimension(context: dict[str, Any], dimension: str) -> list[dict[str, Any]]:
    return [signal for signal in _signals(context) if str(signal.get("entity_type") or "") == dimension]


def _signal_has_metric(signal: dict[str, Any], metric: str) -> bool:
    evidence = signal.get("evidence") or {}
    return evidence.get(metric) is not None


def _top_contributor_present(context: dict[str, Any], dimension: str, metric: str) -> bool:
    if metric == "cm2":
        key = "TOP_CM2_CONTRIBUTOR"
    elif metric == "cm1":
        key = "TOP_CM1_CONTRIBUTOR"
    elif metric == "gross_margin":
        key = "TOP_GM_CONTRIBUTOR"
    else:
        key = f"TOP_{metric.upper()}_CONTRIBUTOR"
    return any(
        signal.get("signal_type") == key
        and signal.get("entity_type") == dimension
        and _signal_has_metric(signal, metric)
        for signal in _signals(context)
    )


def _infer_dimension(message: str, analytical: dict[str, Any], context: dict[str, Any]) -> str:
    explicit = str(context.get("dimension") or analytical.get("dimension") or "")
    if explicit:
        return explicit
    lower = message.lower()
    if "sku" in lower or "product" in lower:
        return "sku"
    if "category" in lower or "subcategory" in lower:
        return "category"
    if "channel" in lower:
        return "channel"
    return "channel"


def _infer_ranking_metric(message: str) -> str:
    lower = message.lower()
    if "gross margin" in lower or re.search(r"\bgm\b", lower):
        return "gross_margin"
    if "cm1" in lower or "channel cost" in lower or "fulfilment" in lower:
        return "cm1"
    return "cm2"


def resolve_evidence_requirement(
    *,
    message: str,
    analytical: dict[str, Any],
    context: dict[str, Any],
    capability: Capability | None = None,
) -> EvidenceRequirement:
    """Determine whether deterministic tool retrieval is required before model interpretation."""
    cap = capability or classify_capability(message, analytical)
    followup = context.get("followup")
    if isinstance(followup, dict):
        resolution = followup
    else:
        resolution = resolve_followup(
            message,
            conversation=context.get("conversation"),
            analytical=analytical,
        ).to_dict()

    dimension = (
        resolution.get("dimension")
        or _infer_dimension(message, analytical, context)
    )
    metric = resolution.get("rank_metric") or _infer_ranking_metric(message)
    signals = _signals(context)
    rank_direction = resolution.get("rank_direction")

    req = EvidenceRequirement(
        intent="current_summary",
        dimension=dimension,
        ranking_metric=metric,
        explanation="aggregate context sufficient.",
    )

    if cap in {Capability.UNSUPPORTED_CAUSALITY, Capability.SCENARIO_REQUEST}:
        req.intent = "scope_control"
        req.requires_tool = False
        req.explanation = "scope-control question; tools optional."
        if cap == Capability.UNSUPPORTED_CAUSALITY:
            req.forbidden_inference.append("customer sentiment / dislike from financial data")
        if cap == Capability.SCENARIO_REQUEST:
            req.forbidden_inference.append("scenario CM2 projection")
        return req

    if cap == Capability.STRATEGIC_RECOMMENDATION:
        from wyz_analytics.ai_cfo.strategy.evidence_requirements import build_strategic_evidence_plan
        from wyz_analytics.ai_cfo.strategy.intent import classify_decision_type

        decision_type = classify_decision_type(message)
        plan = build_strategic_evidence_plan(message, decision_type=decision_type)
        req.intent = "strategic_diagnosis"
        req.forbidden_inference.append("strategic stop/continue recommendation")
        req.explanation = (
            plan.explanation
            or "filtered summary + signals for economics explanation; no prescription."
        )
        if plan.force_cost_breakdown:
            if context.get("forced_evidence", {}).get("get_cost_breakdown"):
                req.requires_tool = False
                req.explanation = "tool not required — scoped cost breakdown already retrieved."
                return req
            req.requires_tool = True
            req.required_tool = "get_cost_breakdown"
            req.required_tool_args = {}
            req.explanation = plan.explanation or "strategic product-cost question requires get_cost_breakdown."
            return req
        if plan.force_trend and not context.get("forced_evidence", {}).get("get_trend"):
            req.requires_tool = True
            req.required_tool = "get_trend"
            req.required_tool_args = {
                "metrics": [
                    "net_revenue",
                    "gross_margin",
                    "cm1",
                    "allocated_marketing",
                    "marketing_pct",
                    "cm2",
                    "cm2_pct",
                ]
            }
            req.explanation = plan.explanation or "exit-themed strategic question requires get_trend."
            return req
        if plan.force_breakdown and not context.get("forced_evidence", {}).get("get_breakdown"):
            req.requires_tool = True
            req.required_tool = "get_breakdown"
            req.required_tool_args = {
                "dimension": plan.breakdown_dimension or dimension,
                "sort": {"metric": "cm2", "direction": "asc"},
                "limit": 20,
            }
            req.explanation = plan.explanation or "exit-themed strategic question requires peer breakdown."
            return req
        req.requires_tool = False
        return req

    if (
        cap == Capability.TREND_REQUIRED
        or resolution.get("intent") in {FollowUpIntent.TREND.value, FollowUpIntent.COMPARISON.value}
    ):
        req.intent = "trend_change"
        if context.get("forced_evidence", {}).get("get_trend"):
            req.requires_tool = False
            req.explanation = "tool not required — trend evidence already retrieved."
            return req
        req.requires_tool = True
        req.required_tool = "get_trend"
        req.required_tool_args = {
            "metrics": [
                "net_revenue",
                "gross_margin",
                "gross_margin_pct",
                "cm1",
                "cm1_pct",
                "allocated_marketing",
                "marketing_pct",
                "cm2",
                "cm2_pct",
            ]
        }
        req.explanation = "trend/change question requires get_trend under active filters."
        return req

    # Ranking bottom/top follow-ups must force sorted breakdown — never reuse TOP signals for WORST.
    # First-turn channel/category "contributes most" may reuse existing TOP contributor signals.
    if resolution.get("intent") == FollowUpIntent.RANKING_BOTTOM.value or (
        resolution.get("intent") == FollowUpIntent.RANKING_TOP.value
        and (
            resolution.get("is_followup")
            or resolution.get("referent_valid")
            or dimension == "sku"
        )
    ):
        sort_dir = "asc" if rank_direction == RankDirection.WORST.value else "desc"
        req.intent = f"{dimension}_ranking_{str(rank_direction or 'BEST').lower()}"
        req.requires_tool = True
        req.required_tool = "get_breakdown"
        req.required_tool_args = {
            "dimension": dimension,
            "sort": {"metric": metric, "direction": sort_dir},
            "limit": 20,
        }
        req.explanation = (
            f"{dimension} {rank_direction or 'BEST'} ranking requires sorted get_breakdown; "
            "opposite-rank contributor signals are not reusable."
        )
        return req

    if resolution.get("intent") == FollowUpIntent.RANKING_TOP.value and dimension in {
        "channel",
        "category",
    }:
        # Align with BREAKDOWN_REQUIRED short-circuit for explorer-dimension rankings.
        if _top_contributor_present(context, dimension, metric):
            req.intent = f"{dimension}_ranking"
            req.requires_tool = False
            req.explanation = (
                f"tool not required — TOP_{metric.upper()}_CONTRIBUTOR {dimension} evidence already in context signals."
            )
            return req
        req.intent = f"{dimension}_ranking"
        req.requires_tool = True
        req.required_tool = "get_breakdown"
        req.required_tool_args = {
            "dimension": dimension,
            "sort": {"metric": metric, "direction": "desc"},
            "limit": 20,
        }
        req.explanation = f"{dimension} {metric} ranking not in initial context; requires get_breakdown({dimension})."
        return req

    if cap == Capability.BREAKDOWN_REQUIRED:
        req.intent = f"{dimension}_ranking"
        lower = message.lower()
        if "margin leak" in lower or "largest margin" in lower:
            leak_signals = [
                signal for signal in signals if signal.get("signal_type") in PRESSURE_SIGNAL_TYPES.union(CONTRIBUTOR_SIGNAL_TYPES)
            ]
            if leak_signals:
                req.requires_tool = False
                req.explanation = "tool not required — margin leak / contributor signals already in context."
                return req
            req.requires_tool = True
            req.required_tool = "get_cfo_signals"
            req.required_tool_args = {"dimension": dimension}
            req.explanation = "margin leak question without leak signals; requires get_cfo_signals or breakdown."
            return req

        if dimension == "category":
            weak = [
                signal
                for signal in _signals_for_dimension(context, "category")
                if signal.get("signal_type")
                in PROFITABILITY_SIGNAL_TYPES.union({"NEGATIVE_CM2_CONTRIBUTOR", "HIGH_REVENUE_LOW_CM2"})
            ]
            if weak:
                req.requires_tool = False
                req.explanation = "tool not required — category weakness/contribution evidence already in CFO signals."
                return req

        # Do not short-circuit on TOP contributors when the question asks for weakest/worst.
        if rank_direction != RankDirection.WORST.value and _top_contributor_present(context, dimension, metric):
            req.requires_tool = False
            req.explanation = (
                f"tool not required — TOP_{metric.upper()}_CONTRIBUTOR {dimension} evidence already in context signals."
            )
            return req

        if dimension == "sku" and rank_direction != RankDirection.WORST.value:
            ranked = [signal for signal in _signals_for_dimension(context, "sku") if _signal_has_metric(signal, metric)]
            if len(ranked) >= 2:
                req.requires_tool = False
                req.explanation = f"tool not required — {len(ranked)} SKU {metric} signal rows already in context."
                return req

        sort_dir = "asc" if rank_direction == RankDirection.WORST.value else "desc"
        req.requires_tool = True
        req.required_tool = "get_breakdown"
        req.required_tool_args = {
            "dimension": dimension,
            "sort": {"metric": metric, "direction": sort_dir},
            "limit": 20,
        }
        req.explanation = f"{dimension} {metric} ranking not in initial context; requires get_breakdown({dimension})."
        return req

    # FINANCIAL_INTERPRETATION — summary + signals usually sufficient
    req.intent = "current_summary"
    req.requires_tool = False
    req.explanation = "Company filtered summary + CFO signals sufficient for stage-level interpretation."
    return req


def collect_verified_numbers(context: dict[str, Any]) -> set[float]:
    """Numbers explicitly available in initial verified context (summary + signal evidence)."""
    verified: set[float] = set()
    summary = context.get("summary") or {}
    for key, value in summary.items():
        if value is None:
            continue
        try:
            num = float(value)
        except (TypeError, ValueError):
            continue
        verified.add(num)
        if key.endswith("_pct"):
            verified.add(num * 100)
    for signal in _signals(context):
        evidence = signal.get("evidence") or {}
        for value in evidence.values():
            try:
                verified.add(float(value))
            except (TypeError, ValueError):
                continue
    return verified
