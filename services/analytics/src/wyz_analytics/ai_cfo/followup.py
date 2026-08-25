"""Deterministic follow-up intent and referent resolution for AI CFO V1.

Intent precedence (highest first):
  GUARD (handled in capability) >
  TEMPORAL >
  EXPLICIT DIMENSION RANKING/BREAKDOWN >
  FOLLOW-UP RANKING >
  DRIVER DIAGNOSIS / COMPARISON >
  CURRENT-STATE

Uses conversation semantic metadata (not free-form model arithmetic).
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class FollowUpIntent(str, Enum):
    CURRENT_STATE = "CURRENT_STATE"
    RANKING_TOP = "RANKING_TOP"
    RANKING_BOTTOM = "RANKING_BOTTOM"
    BREAKDOWN = "BREAKDOWN"
    TREND = "TREND"
    COMPARISON = "COMPARISON"
    DRIVER_DIAGNOSIS = "DRIVER_DIAGNOSIS"
    FOLLOWUP_EXPLANATION = "FOLLOWUP_EXPLANATION"


class RankDirection(str, Enum):
    BEST = "BEST"
    WORST = "WORST"


class ComparisonBasis(str, Enum):
    WITHIN_PERIOD = "WITHIN_PERIOD"
    VS_PREV_MONTH = "VS_PREV_MONTH"
    VS_PREV_EQUAL = "VS_PREV_EQUAL"


class IntentSource(str, Enum):
    GUARD = "guard"
    EXPLICIT_USER_TEXT = "explicit_user_text"
    CONVERSATION_FOLLOWUP = "conversation_followup"
    SEMANTIC_MODEL = "semantic_model"


_BOTTOM_PATTERNS = (
    re.compile(r"\bweakest\b", re.I),
    re.compile(r"\bworst\b", re.I),
    re.compile(r"\bleast\b", re.I),
    re.compile(r"\blaggard\b", re.I),
    re.compile(r"\bbottom\b", re.I),
    re.compile(r"\bcontribute[s]? least\b", re.I),
    re.compile(r"\bperforms? worst\b", re.I),
    re.compile(r"\bwhich (one |is )?(the )?weakest\b", re.I),
)
_TOP_EXPLICIT = (
    re.compile(r"\bstrongest\b", re.I),
    re.compile(r"\bbest\b", re.I),
    re.compile(r"\bthe top\b", re.I),
    re.compile(r"\btop skus?\b", re.I),
    re.compile(r"\bleading\b", re.I),
)
_REFERENT_PATTERNS = (
    re.compile(r"\bwhich one\b", re.I),
    re.compile(r"\bwhich is\b", re.I),
    re.compile(r"\bthe (weakest|strongest|worst|best)( one)?\b", re.I),
    re.compile(r"\bwhat about the (weakest|strongest|worst|best)\b", re.I),
    re.compile(r"\bthat one\b", re.I),
)
_WHY_FOLLOWUP = re.compile(r"^(why\??|why is that\??|why so\??)$", re.I)
_MARKETING_SHIFT = re.compile(r"\bwhat about marketing\b", re.I)
_CATEGORY_SHIFT = re.compile(r"\b(and |what about )?categor(y|ies)\b", re.I)

# Explicit dimension ranking — must win over UI explorer dimension / channel signals.
_EXPLICIT_SKU = re.compile(
    r"\b(which|top|weakest|worst|best)?\s*(skus?|products?)\b|"
    r"\b(sku|product)[s]?\s+(drive|driving|contribution|contribute|ranking)\b|"
    r"\b(drive|driving|contribute[s]?)\s+.*\b(sku|product)s?\b",
    re.I,
)
_EXPLICIT_CHANNEL = re.compile(r"\bwhich channels?\b|\bchannel[s]?\s+contribute", re.I)
_EXPLICIT_CATEGORY = re.compile(r"\bwhich categor(y|ies)\b|\bcategor(y|ies)\s+contribute", re.I)

_TREND_PATTERNS = (
    re.compile(r"\bwhat'?s?\s+changed\b", re.I),
    re.compile(r"\bwhat changed\b", re.I),
    re.compile(r"\bwhat improved\b", re.I),
    re.compile(r"\bwhat worsened\b", re.I),
    re.compile(r"\bhow has .{0,40} (moved|changed|improved|worsened)\b", re.I),
    re.compile(r"\bhow did .{0,40} (move|change|improve|worsen)\b", re.I),
    re.compile(r"\bdid .{0,20} improve\b", re.I),
    re.compile(r"\bchanged (this|over the|in this) period\b", re.I),
    re.compile(r"\bvs (last|previous) month\b", re.I),
    re.compile(r"\bvs previous period\b", re.I),
    re.compile(r"\bover (this|the) period\b", re.I),
    re.compile(r"\bhow are things trending\b", re.I),
    re.compile(r"\btrending\b", re.I),
    re.compile(r"\btrend\b", re.I),
    re.compile(r"\bover time\b", re.I),
    re.compile(r"\bmonth over month\b", re.I),
    re.compile(r"\bchanged recently\b", re.I),
)

_DRIVER_COMPARISON = (
    re.compile(r"\bis (it |the problem |this )?.{0,40}\bor\b", re.I),
    re.compile(r"\bproduct economics or marketing\b", re.I),
    re.compile(r"\bcogs or marketing\b", re.I),
    re.compile(r"\bproduct or (channel|marketing)\b", re.I),
    re.compile(r"\bmarketing or product\b", re.I),
    re.compile(r"\bis margin pressure coming from product or", re.I),
)
_DRIVER_PATTERNS = (
    re.compile(r"\bwhat'?s driving\b", re.I),
    re.compile(r"\bwhy is .{0,40} (weak|low|negative|pressur)", re.I),
    re.compile(r"\bis the problem\b", re.I),
    re.compile(r"\bproduct economics or marketing\b", re.I),
)


@dataclass
class FollowUpResolution:
    intent: FollowUpIntent
    dimension: str | None = None
    rank_direction: RankDirection | None = None
    rank_metric: str = "cm2"
    comparison_basis: ComparisonBasis | None = None
    is_followup: bool = False
    referent_valid: bool = False
    referent_invalidated_by_scope: bool = False
    force_tool: str | None = None
    force_tool_args: dict[str, Any] = field(default_factory=dict)
    insight_hint: str | None = None
    explanation: str = ""
    previous_intent: str | None = None
    previous_dimension: str | None = None
    intent_source: str = IntentSource.EXPLICIT_USER_TEXT.value
    driver_comparison: bool = False

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["intent"] = self.intent.value
        payload["rank_direction"] = self.rank_direction.value if self.rank_direction else None
        payload["comparison_basis"] = self.comparison_basis.value if self.comparison_basis else None
        return payload


def _infer_metric(message: str) -> str:
    lower = message.lower()
    if "gross margin" in lower or re.search(r"\bgm\b", lower):
        return "gross_margin"
    if "cm1" in lower:
        return "cm1"
    if "revenue" in lower and "margin" not in lower:
        return "net_revenue"
    return "cm2"


def _explicit_dimension_from_text(message: str) -> str | None:
    """Dimension from question text only — never from UI explorer dimension."""
    if _EXPLICIT_SKU.search(message or ""):
        return "sku"
    if _EXPLICIT_CATEGORY.search(message or ""):
        return "category"
    if _EXPLICIT_CHANNEL.search(message or ""):
        return "channel"
    lower = (message or "").lower()
    if "sku" in lower or "product" in lower:
        return "sku"
    if "categor" in lower:
        return "category"
    if re.search(r"\bchannels?\b", lower) and "which" in lower:
        return "channel"
    return None


def _infer_dimension_from_text(message: str, analytical: dict[str, Any] | None) -> str | None:
    explicit = _explicit_dimension_from_text(message)
    if explicit:
        return explicit
    if analytical and analytical.get("dimension"):
        return str(analytical.get("dimension"))
    return None


def _same_scope_prior(previous_turns: list[dict[str, Any]]) -> dict[str, Any] | None:
    for turn in reversed(list(previous_turns or [])):
        if not isinstance(turn, dict):
            continue
        if turn.get("same_scope") is False:
            continue
        if turn.get("same_scope") is True or turn.get("selected_entities") or turn.get("dimension"):
            return turn
    return None


def _prior_had_ranking(turn: dict[str, Any] | None) -> bool:
    if not turn:
        return False
    intent = str(turn.get("intent") or turn.get("insight_type") or "").upper()
    question = str(turn.get("question") or "").lower()
    if intent in {
        "RANKING_TOP",
        "RANKING_BOTTOM",
        "BREAKDOWN",
        "CONTRIBUTION_LEADER",
        "CONTRIBUTION_LAGGARD",
    }:
        return True
    if any(
        tok in question
        for tok in ("which sku", "which channel", "which categor", "drive margin", "contribute", "product")
    ):
        return True
    return bool(turn.get("dimension") or turn.get("selected_entities"))


def resolve_comparison_basis(message: str) -> ComparisonBasis:
    lower = (message or "").lower()
    if "vs last month" in lower or "versus last month" in lower or "vs previous month" in lower:
        return ComparisonBasis.VS_PREV_MONTH
    if "vs previous period" in lower or "versus previous period" in lower or "vs prior period" in lower:
        return ComparisonBasis.VS_PREV_EQUAL
    return ComparisonBasis.WITHIN_PERIOD


def _ranking_resolution(
    *,
    direction: RankDirection,
    dimension: str,
    metric: str,
    is_followup: bool,
    referent_valid: bool,
    prior: dict[str, Any] | None,
    intent_source: str,
) -> FollowUpResolution:
    sort_dir = "asc" if direction == RankDirection.WORST else "desc"
    return FollowUpResolution(
        intent=FollowUpIntent.RANKING_BOTTOM if direction == RankDirection.WORST else FollowUpIntent.RANKING_TOP,
        dimension=dimension,
        rank_direction=direction,
        rank_metric=metric,
        is_followup=is_followup,
        referent_valid=referent_valid,
        force_tool="get_breakdown",
        force_tool_args={
            "dimension": dimension,
            "sort": {"metric": metric, "direction": sort_dir},
            "limit": 20,
        },
        insight_hint="CONTRIBUTION_LAGGARD" if direction == RankDirection.WORST else "CONTRIBUTION_LEADER",
        previous_intent=str((prior or {}).get("intent") or (prior or {}).get("insight_type") or "") or None,
        previous_dimension=str((prior or {}).get("dimension") or "") or None,
        intent_source=intent_source,
        explanation=(
            f"Ranking {direction.value} on {dimension} {metric}; "
            "force scoped get_breakdown — never reuse opposite-rank or wrong-dimension evidence."
        ),
    )


def resolve_followup(
    message: str,
    *,
    conversation: dict[str, Any] | None = None,
    analytical: dict[str, Any] | None = None,
    previous_turns: list[dict[str, Any]] | None = None,
) -> FollowUpResolution:
    text = (message or "").strip()
    lower = text.lower()
    turns = list(previous_turns or [])
    if conversation and not turns:
        turns = list(conversation.get("previous_turns") or [])
    prior = _same_scope_prior(turns)
    scope_invalidated = bool(turns) and prior is None and any(
        isinstance(t, dict) and t.get("same_scope") is False for t in turns
    )

    metric = _infer_metric(text)
    explicit_dim = _explicit_dimension_from_text(text)

    # 1) TEMPORAL — before ranking / current-state
    if any(p.search(text) for p in _TREND_PATTERNS):
        basis = resolve_comparison_basis(text)
        return FollowUpResolution(
            intent=FollowUpIntent.TREND if "vs" not in lower else FollowUpIntent.COMPARISON,
            dimension=explicit_dim,
            rank_metric=metric,
            comparison_basis=basis,
            force_tool="get_trend",
            force_tool_args={},
            intent_source=IntentSource.EXPLICIT_USER_TEXT.value,
            explanation=f"Temporal question → get_trend with basis={basis.value}.",
        )

    # 2) FOLLOW-UP RANKING (weakest/strongest one) — before generic diagnosis
    bottom = any(p.search(text) for p in _BOTTOM_PATTERNS)
    top_ref = any(p.search(text) for p in _TOP_EXPLICIT)
    referent = any(p.search(text) for p in _REFERENT_PATTERNS) or bool(
        re.search(r"\b(weakest|strongest|worst|best)( one)?\b", text, re.I)
    ) and not explicit_dim

    if bottom or (top_ref and referent) or (referent and (bottom or top_ref or "weakest" in lower or "strongest" in lower)):
        direction = RankDirection.WORST if bottom or "weakest" in lower or "worst" in lower or "least" in lower else RankDirection.BEST
        if scope_invalidated and referent:
            return FollowUpResolution(
                intent=FollowUpIntent.RANKING_BOTTOM if direction == RankDirection.WORST else FollowUpIntent.RANKING_TOP,
                dimension=explicit_dim,
                rank_direction=direction,
                rank_metric=metric,
                is_followup=True,
                referent_valid=False,
                referent_invalidated_by_scope=True,
                insight_hint="INSUFFICIENT_EVIDENCE",
                intent_source=IntentSource.CONVERSATION_FOLLOWUP.value,
                explanation="Prior referent invalidated by scope change.",
            )
        dimension = explicit_dim
        is_followup = False
        referent_valid = False
        if prior and _prior_had_ranking(prior) and (referent or not dimension):
            dimension = str(prior.get("dimension") or explicit_dim or "sku")
            is_followup = True
            referent_valid = True
            source = IntentSource.CONVERSATION_FOLLOWUP.value
        else:
            dimension = dimension or "sku"
            source = IntentSource.EXPLICIT_USER_TEXT.value
        return _ranking_resolution(
            direction=direction,
            dimension=dimension,
            metric=metric,
            is_followup=is_followup,
            referent_valid=referent_valid,
            prior=prior,
            intent_source=source,
        )

    # 3) EXPLICIT DIMENSION RANKING (Which SKUs drive margin?)
    if explicit_dim and (
        re.search(r"\bwhich\b", lower)
        or re.search(r"\bdrive\b|\bdriving\b|\bcontribute\b|\btop\b", lower)
        or re.search(r"\bweakest\b|\bworst\b|\bleast\b", lower)
    ):
        direction = RankDirection.WORST if bottom else RankDirection.BEST
        return _ranking_resolution(
            direction=direction,
            dimension=explicit_dim,
            metric=metric,
            is_followup=False,
            referent_valid=False,
            prior=prior,
            intent_source=IntentSource.EXPLICIT_USER_TEXT.value,
        )

    if _MARKETING_SHIFT.search(text):
        return FollowUpResolution(
            intent=FollowUpIntent.DRIVER_DIAGNOSIS,
            dimension=explicit_dim,
            rank_metric="marketing_pct",
            is_followup=bool(prior),
            insight_hint="MARKETING_PRESSURE",
            intent_source=IntentSource.EXPLICIT_USER_TEXT.value,
            explanation="Follow-up shifts focus to marketing stage.",
        )
    if _CATEGORY_SHIFT.search(text) and prior:
        return _ranking_resolution(
            direction=RankDirection.BEST,
            dimension="category",
            metric=metric,
            is_followup=True,
            referent_valid=True,
            prior=prior,
            intent_source=IntentSource.CONVERSATION_FOLLOWUP.value,
        )

    if _WHY_FOLLOWUP.match(text) and prior:
        return FollowUpResolution(
            intent=FollowUpIntent.FOLLOWUP_EXPLANATION,
            dimension=str(prior.get("dimension") or explicit_dim or "") or None,
            rank_metric=metric,
            is_followup=True,
            referent_valid=True,
            previous_intent=str(prior.get("intent") or prior.get("insight_type") or "") or None,
            previous_dimension=str(prior.get("dimension") or "") or None,
            intent_source=IntentSource.CONVERSATION_FOLLOWUP.value,
            explanation="Why-follow-up reuses prior-turn entities under the same scope.",
        )

    # 4) DRIVER DIAGNOSIS / COMPARISON
    if any(p.search(text) for p in _DRIVER_COMPARISON) or any(p.search(text) for p in _DRIVER_PATTERNS):
        return FollowUpResolution(
            intent=FollowUpIntent.DRIVER_DIAGNOSIS,
            dimension=explicit_dim,
            rank_metric=metric,
            driver_comparison=any(p.search(text) for p in _DRIVER_COMPARISON),
            intent_source=IntentSource.EXPLICIT_USER_TEXT.value,
            explanation="Driver / stage diagnosis question.",
        )

    # 5) CURRENT-STATE
    return FollowUpResolution(
        intent=FollowUpIntent.CURRENT_STATE,
        dimension=explicit_dim,
        rank_metric=metric,
        intent_source=IntentSource.EXPLICIT_USER_TEXT.value,
        explanation="Current-state interpretation.",
    )
