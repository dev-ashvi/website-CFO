"""Strategic intent and DecisionType classification."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any


class DecisionType(str, Enum):
    DIAGNOSE = "DIAGNOSE"
    DECIDE = "DECIDE"
    COMPARE_OPTIONS = "COMPARE_OPTIONS"
    PRIORITIZE = "PRIORITIZE"
    EXPERIMENT = "EXPERIMENT"
    MONITOR = "MONITOR"


# Broader founder strategic language (capability layer also expanded).
# Precedence vs causality/scenario is enforced in classify_capability.
_DECIDE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bshould (i|we)\b", re.I),
    re.compile(r"\bwould you (do it|recommend|cut|reduce|stop|exit)\b", re.I),
    re.compile(r"\bwhat would you do\b", re.I),
    re.compile(r"\bif you were (my |our )?cfo\b", re.I),
    re.compile(r"\bworth continuing\b", re.I),
    re.compile(r"\bis .{0,60} worth (continuing|keeping|selling)\b", re.I),
    re.compile(r"\bfocus more on\b", re.I),
    re.compile(r"\bstop selling\b", re.I),
    re.compile(r"\brecommend (stopping|exiting|cutting|reducing)\b", re.I),
)

_PRIORITIZE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bwhat should i fix first\b", re.I),
    re.compile(r"\bwhich problem should i (solve|fix|tackle) first\b", re.I),
    re.compile(r"\bwhere would you focus\b", re.I),
    re.compile(r"\bwhat should i (prioritize|focus on)\b", re.I),
    re.compile(r"\bpriority\b", re.I),
)

_MONITOR_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bwhat should i monitor\b", re.I),
    re.compile(r"\bwhat would you monitor\b", re.I),
    re.compile(r"\bwhat should we (track|watch)\b", re.I),
    re.compile(r"\bmonitoring plan\b", re.I),
)

_EXPERIMENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bwhat should i test\b", re.I),
    re.compile(r"\bwhat would you test\b", re.I),
    re.compile(r"\bwhat should we (try|experiment)\b", re.I),
    re.compile(r"\bcontrolled (test|experiment|reduction)\b", re.I),
)

_COMPARE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bmarketing or product\b", re.I),
    re.compile(r"\bproduct (economics )?or marketing\b", re.I),
    re.compile(r"\bwhich (problem|issue) matters more\b", re.I),
)


@dataclass(frozen=True)
class StrategicIntent:
    is_strategic: bool
    decision_type: DecisionType | None
    matched_pattern: str | None = None


def classify_decision_type(message: str) -> DecisionType | None:
    text = (message or "").strip()
    if not text:
        return None
    for pattern in _MONITOR_PATTERNS:
        if pattern.search(text):
            return DecisionType.MONITOR
    for pattern in _EXPERIMENT_PATTERNS:
        if pattern.search(text):
            return DecisionType.EXPERIMENT
    for pattern in _PRIORITIZE_PATTERNS:
        if pattern.search(text):
            return DecisionType.PRIORITIZE
    for pattern in _COMPARE_PATTERNS:
        if pattern.search(text):
            return DecisionType.COMPARE_OPTIONS
    for pattern in _DECIDE_PATTERNS:
        if pattern.search(text):
            return DecisionType.DECIDE
    return None


def classify_strategic_intent(message: str, *, capability_is_strategic: bool = False) -> StrategicIntent:
    """Return decision taxonomy when strategic capability (or local detect) fires."""
    decision = classify_decision_type(message)
    if capability_is_strategic:
        return StrategicIntent(
            is_strategic=True,
            decision_type=decision or DecisionType.DECIDE,
            matched_pattern="capability",
        )
    if decision is not None:
        return StrategicIntent(is_strategic=True, decision_type=decision, matched_pattern=decision.value)
    return StrategicIntent(is_strategic=False, decision_type=None)


def extract_subject_hint(message: str, analytical: dict[str, Any] | None = None) -> dict[str, str | None]:
    """Best-effort subject hint from message tokens (not filter authority)."""
    text = (message or "").lower()
    _ = analytical
    if "d2c" in text:
        return {"entity": "D2C Website", "dimension": "channel"}
    if "amazon" in text:
        return {"entity": "Amazon", "dimension": "channel"}
    if "skincare" in text:
        return {"entity": "Skincare", "dimension": "category"}
    if "sku" in text:
        match = re.search(r"\bsku\s*0*([0-9]+)\b", text, re.I)
        if match:
            return {"entity": f"SKU{match.group(1).zfill(3)}", "dimension": "sku"}
    return {"entity": None, "dimension": None}
