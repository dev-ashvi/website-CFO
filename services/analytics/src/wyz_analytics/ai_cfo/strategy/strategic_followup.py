"""Deterministic strategic follow-up classification and resolution (Phase 2D).

Classify BEFORE normal strategic intent. Conversation memory is decision context
only — never financial authority.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme, classify_decision_theme
from wyz_analytics.ai_cfo.strategy.intent import classify_decision_type
from wyz_analytics.ai_cfo.strategy.thread import (
    StrategicDecisionThread,
    resolve_active_thread,
)


class StrategicFollowupType(str, Enum):
    WHY = "WHY"
    CHANGE_MY_VIEW = "CHANGE_MY_VIEW"
    MONITOR = "MONITOR"
    NEXT_STEP = "NEXT_STEP"
    RECONSIDER = "RECONSIDER"
    SCENARIO = "SCENARIO"
    COMPARE_PREVIOUS = "COMPARE_PREVIOUS"
    CLARIFY = "CLARIFY"
    NONE = "NONE"


class FollowupContextSource(str, Enum):
    ACTIVE_THREAD = "ACTIVE_THREAD"
    HISTORICAL_THREAD = "HISTORICAL_THREAD"
    NONE = "NONE"


_WHY = (
    re.compile(r"^why\??$", re.I),
    re.compile(r"^why (do you think|is|would|did|should) (that|so|you)\b", re.I),
    re.compile(r"^why (that|so)\??$", re.I),
    re.compile(r"\bwhy (do you|would you) (think|say|recommend)\b", re.I),
    re.compile(r"^why not\??$", re.I),
)

_CMV = (
    re.compile(r"\bwhat would change your (view|mind|recommendation)\b", re.I),
    re.compile(r"\bwhat would make you change your mind\b", re.I),
    re.compile(r"\bwhat would change that\b", re.I),
)

_MONITOR = (
    re.compile(r"\bwhat should i (monitor|watch|track)\b", re.I),
    re.compile(r"\bwhat should we (monitor|watch|track)\b", re.I),
    re.compile(r"\bwhat would you (monitor|watch)\b", re.I),
)

_NEXT = (
    re.compile(r"\bwhat should i do next\b", re.I),
    re.compile(r"\bokay,? what do i do now\b", re.I),
    re.compile(r"\bwhat('s| is) the next step\b", re.I),
    re.compile(r"\bwhat do i do (next|now)\b", re.I),
)

_RECONSIDER = (
    re.compile(r"\bdoes that change your (recommendation|view|mind)\b", re.I),
    re.compile(r"\bdo you still think\b", re.I),
    re.compile(r"\bwould you still\b", re.I),
    re.compile(r"\bgiven that,? would you\b", re.I),
    re.compile(r"\bstill (avoid|recommend|cut|exit)\b", re.I),
)

_SCENARIO = (
    re.compile(r"\bwhat if\b", re.I),
    re.compile(r"\bwhat happens if\b", re.I),
    re.compile(r"^(what about|how about)\s+\d+(?:\.\d+)?\s*%", re.I),
    re.compile(
        r"^(what about|how about)\s+(increasing|raising|decreasing|reducing|cutting)\s+(?:it\s+)?\d+",
        re.I,
    ),
)

_COMPARE = (
    re.compile(r"\bcompared to (before|earlier|previously)\b", re.I),
    re.compile(r"\bhow does that compare\b", re.I),
)

_THEME_OVERRIDE = re.compile(
    r"\bwhat about\s+(product cogs|product cost|cogs|pricing|prices?|marketing|acquisition)\b",
    re.I,
)
_SUBJECT_OVERRIDE = re.compile(
    r"\bwhat about\s+(amazon|d2c|q[- ]?commerce|modern trade|general trade|website)\b.{0,20}\b(instead)?",
    re.I,
)
_PRONOUN_CUT = re.compile(
    r"\bwhat if i (cut|reduce|decrease|increase|raise)\s+it\s+(\d+(?:\.\d+)?)\s*%",
    re.I,
)
_TEMPORAL_EXPLICIT = re.compile(
    r"\b(what changed|what'?s?\s+changed|changed recently|over time|trend|month over month)\b",
    re.I,
)


@dataclass
class StrategicFollowupResolution:
    followup_type: StrategicFollowupType
    thread_id: str | None = None
    context_source: FollowupContextSource = FollowupContextSource.NONE
    scope_match: bool = False
    decision_theme: str | None = None
    subject: dict[str, Any] | None = None
    prior_action: str | None = None
    prior_position: str | None = None
    scenario_context: dict[str, Any] | None = None
    thread: StrategicDecisionThread | None = None
    historical_thread: StrategicDecisionThread | None = None
    force_new_strategic: bool = False
    enriched_scenario_message: str | None = None
    cross_scope_block: bool = False
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "followup_type": self.followup_type.value,
            "thread_id": self.thread_id,
            "context_source": self.context_source.value,
            "scope_match": self.scope_match,
            "decision_theme": self.decision_theme,
            "subject": self.subject,
            "prior_action": self.prior_action,
            "prior_position": self.prior_position,
            "scenario_context": self.scenario_context,
            "force_new_strategic": self.force_new_strategic,
            "cross_scope_block": self.cross_scope_block,
            "reason": self.reason,
        }


def classify_strategic_followup_type(question: str) -> StrategicFollowupType:
    """Surface follow-up taxonomy (contextual gating applied in resolve)."""
    text = (question or "").strip()
    if not text:
        return StrategicFollowupType.NONE
    if _TEMPORAL_EXPLICIT.search(text):
        # Explicit temporal wins at routing — not a strategic follow-up type.
        return StrategicFollowupType.NONE
    for pattern in _RECONSIDER:
        if pattern.search(text):
            return StrategicFollowupType.RECONSIDER
    for pattern in _CMV:
        if pattern.search(text):
            return StrategicFollowupType.CHANGE_MY_VIEW
    for pattern in _MONITOR:
        if pattern.search(text):
            return StrategicFollowupType.MONITOR
    for pattern in _NEXT:
        if pattern.search(text):
            return StrategicFollowupType.NEXT_STEP
    for pattern in _COMPARE:
        if pattern.search(text):
            return StrategicFollowupType.COMPARE_PREVIOUS
    for pattern in _SCENARIO:
        if pattern.search(text):
            return StrategicFollowupType.SCENARIO
    for pattern in _WHY:
        if pattern.search(text):
            return StrategicFollowupType.WHY
    if re.match(r"^why not\b", text, re.I):
        return StrategicFollowupType.CLARIFY
    return StrategicFollowupType.NONE


def _explicit_theme_or_subject_override(question: str, thread: StrategicDecisionThread) -> bool:
    text = (question or "").strip()
    if _THEME_OVERRIDE.search(text) or _SUBJECT_OVERRIDE.search(text):
        return True
    decision_type = classify_decision_type(text)
    theme = classify_decision_theme(text, decision_type)
    thread_theme = str(thread.decision_theme or "")
    # New decide-style question with a different concrete theme.
    if decision_type and theme not in {
        DecisionTheme.GENERIC,
        DecisionTheme.MONITOR,
        DecisionTheme.EXPERIMENT,
    }:
        if thread_theme and theme.value != thread_theme:
            # Avoid treating "what should I monitor" as theme override (MONITOR theme).
            if theme == DecisionTheme.MONITOR:
                return False
            return True
    return False


def _theme_to_scenario_lever(theme: str | None) -> str | None:
    mapping = {
        DecisionTheme.MARKETING.value: "marketing",
        DecisionTheme.PRODUCT_COST.value: "product cogs",
    }
    return mapping.get(str(theme or ""))


def enrich_scenario_message_from_thread(question: str, thread: StrategicDecisionThread) -> str | None:
    """Resolve unambiguous 'it' → lever from ACTIVE thread. Never expands unsupported levers."""
    text = (question or "").strip()
    m = _PRONOUN_CUT.search(text)
    if not m:
        return None
    direction = m.group(1).lower()
    pct = m.group(2)
    lever_word = _theme_to_scenario_lever(thread.decision_theme)
    if lever_word is None:
        # PRICE / CHANNEL etc. — do not approximate; leave message unchanged.
        return None
    verb = direction
    return f"What if I {verb} {lever_word} {pct}%?"


def resolve_strategic_followup(
    question: str,
    *,
    current_scope_hash: str,
    conversation: dict[str, Any] | None,
) -> StrategicFollowupResolution:
    """Resolve follow-up against lean thread memory under current scope."""
    ftype = classify_strategic_followup_type(question)
    active, historical = resolve_active_thread(conversation, current_scope_hash=current_scope_hash)

    empty = StrategicFollowupResolution(followup_type=StrategicFollowupType.NONE)

    if ftype == StrategicFollowupType.NONE:
        if active and _explicit_theme_or_subject_override(question, active):
            return StrategicFollowupResolution(
                followup_type=StrategicFollowupType.NONE,
                thread_id=active.thread_id,
                context_source=FollowupContextSource.ACTIVE_THREAD,
                scope_match=True,
                decision_theme=active.decision_theme,
                subject=active.subject,
                prior_action=active.selected_action,
                force_new_strategic=True,
                reason="explicit_theme_or_subject_override",
            )
        return empty

    # No active same-scope thread: do not invent strategic context for WHY / CMV / NEXT / RECONSIDER.
    if active is None:
        if ftype in {
            StrategicFollowupType.WHY,
            StrategicFollowupType.CHANGE_MY_VIEW,
            StrategicFollowupType.NEXT_STEP,
            StrategicFollowupType.RECONSIDER,
            StrategicFollowupType.COMPARE_PREVIOUS,
            StrategicFollowupType.CLARIFY,
        }:
            if historical is not None and ftype == StrategicFollowupType.WHY:
                return StrategicFollowupResolution(
                    followup_type=ftype,
                    thread_id=historical.thread_id,
                    context_source=FollowupContextSource.HISTORICAL_THREAD,
                    scope_match=False,
                    decision_theme=historical.decision_theme,
                    prior_action=historical.selected_action,
                    historical_thread=historical,
                    cross_scope_block=True,
                    reason="cross_scope_why",
                )
            return StrategicFollowupResolution(
                followup_type=StrategicFollowupType.NONE,
                context_source=FollowupContextSource.NONE,
                reason="no_active_thread",
            )
        # MONITOR / SCENARIO without thread → fall through to normal routing.
        if ftype in {StrategicFollowupType.MONITOR, StrategicFollowupType.SCENARIO}:
            return StrategicFollowupResolution(
                followup_type=StrategicFollowupType.NONE,
                reason="no_active_thread_for_optional_followup",
            )
        return empty

    # Active thread — check overrides before continuing follow-up.
    if _explicit_theme_or_subject_override(question, active):
        return StrategicFollowupResolution(
            followup_type=StrategicFollowupType.NONE,
            thread_id=active.thread_id,
            context_source=FollowupContextSource.ACTIVE_THREAD,
            scope_match=True,
            force_new_strategic=True,
            reason="explicit_theme_or_subject_override",
        )

    scenario_ctx = None
    if active.latest_scenario_ref and active.latest_scenario_ref.scope_hash == current_scope_hash:
        scenario_ctx = active.latest_scenario_ref.to_dict()

    enriched = None
    if ftype == StrategicFollowupType.SCENARIO:
        enriched = enrich_scenario_message_from_thread(question, active)

    return StrategicFollowupResolution(
        followup_type=ftype,
        thread_id=active.thread_id,
        context_source=FollowupContextSource.ACTIVE_THREAD,
        scope_match=True,
        decision_theme=active.decision_theme,
        subject=active.subject,
        prior_action=active.selected_action,
        prior_position=active.current_position,
        scenario_context=scenario_ctx,
        thread=active,
        enriched_scenario_message=enriched,
    )


def thread_telemetry(resolution: StrategicFollowupResolution) -> dict[str, Any]:
    thread = resolution.thread or resolution.historical_thread
    scenario = resolution.scenario_context or (
        thread.latest_scenario_ref.to_dict() if thread and thread.latest_scenario_ref else None
    )
    return {
        "strategic_thread_present": bool(thread),
        "strategic_thread_id": resolution.thread_id or (thread.thread_id if thread else None),
        "strategic_thread_status": (
            thread.status.value if thread else None
        ),
        "strategic_thread_scope_match": resolution.scope_match,
        "strategic_followup_detected": resolution.followup_type != StrategicFollowupType.NONE
        or resolution.force_new_strategic
        or resolution.cross_scope_block,
        "strategic_followup_type": (
            resolution.followup_type.value
            if resolution.followup_type != StrategicFollowupType.NONE
            else ("NEW_STRATEGIC" if resolution.force_new_strategic else None)
        ),
        "strategic_followup_source": resolution.context_source.value,
        "strategic_previous_action": resolution.prior_action,
        "strategic_thread_scenario_present": bool(scenario),
        "strategic_thread_scenario_scope_match": bool(
            scenario and scenario.get("scope_hash") and resolution.scope_match
        ),
        "conversation_context_used": resolution.context_source != FollowupContextSource.NONE,
    }
