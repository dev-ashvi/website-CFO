"""Assertion-aware demand/revenue forecast guard for strategic prose."""

from __future__ import annotations

import re

from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown

_TAXONOMY_KEYS = {u.value for u in StrategicUnknown}

# Assertive forecast patterns (prohibited).
_PROHIBITED_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("will_remain_stable", re.compile(r"\b(will remain|will stay)\b.{0,40}\b(stable|unchanged|flat)\b", re.I)),
    ("will_not_affect", re.compile(r"\b(will not|won't|should not)\b.{0,30}\b(affect|hurt|harm|impact)\b", re.I)),
    ("revenue_will", re.compile(r"\b(revenue|demand|sales|orders)\s+will\b", re.I)),
    ("customers_will", re.compile(r"\bcustomers?\s+will\b", re.I)),
    ("percent_forecast", re.compile(r"\b(revenue|demand|sales)\s+will\b.{0,20}\b\d", re.I)),
    ("unaffected_assertion", re.compile(r"\b(should be|will be)\s+unaffected\b", re.I)),
]

# Allowed framing even when revenue/demand words appear.
_ALLOWED_CONTEXT = re.compile(
    r"\b("
    r"do not know|don't know|cannot estimate|can't estimate|uncertain|unknown|"
    r"monitor|watch|track|test whether|see whether|observe whether|"
    r"experiment|controlled test|"
    r"if |assuming |when |holding constant|hold revenue|sensitivity"
    r")\b",
    re.I,
)


def _looks_like_taxonomy_token(text: str) -> bool:
    stripped = str(text or "").strip()
    if not stripped:
        return True
    if stripped.upper() in _TAXONOMY_KEYS:
        return True
    if re.fullmatch(r"[A-Z0-9_]+", stripped):
        return True
    if stripped.startswith(("insight:", "driver:", "evidence:", "conflict:")):
        return True
    return False


def is_prohibited_forecast(text: str | None) -> tuple[bool, str | None]:
    """Return (prohibited, rule_code). Skips taxonomy/metric tokens."""
    if text is None:
        return False, None
    stripped = str(text).strip()
    if not stripped or _looks_like_taxonomy_token(stripped):
        return False, None

    lower = stripped.lower()

    # Explicit uncertainty statements are allowed.
    if re.search(r"\b(do not know|don't know|cannot estimate|can't estimate|not know how)\b", lower):
        return False, None

    # Monitoring / observational language is allowed.
    if re.search(r"\b(monitor|watch|track|observe|test)\b.{0,40}\b(revenue|demand|sales|orders)\b", lower):
        return False, None
    if re.search(r"\b(see|test)\b.{0,20}\b(whether|if)\b.{0,30}\b(demand|revenue|sales|orders)\b", lower):
        return False, None
    if re.search(r"\b(whether|if)\b.{0,20}\b(demand|revenue|sales|orders)\b.{0,30}\b(change|respond|affect|move|shift)\b", lower):
        return False, None

    # Conditional / sensitivity framing is allowed unless it still asserts "will".
    if re.search(r"\b(if|assuming|when|holding constant|hold revenue constant|sensitivity)\b", lower):
        for rule, pattern in _PROHIBITED_PATTERNS:
            if pattern.search(stripped):
                return True, rule
        return False, None

    for rule, pattern in _PROHIBITED_PATTERNS:
        if pattern.search(stripped):
            return True, rule
    return False, None


def scan_strategic_prose_violations(
    *,
    rationale: str | None = None,
    position: str | None = None,
) -> list[tuple[str, str]]:
    """Return [(field, rule_code), ...] for forecast violations in prose fields only."""
    violations: list[tuple[str, str]] = []
    for field, text in (("position", position), ("rationale", rationale)):
        prohibited, rule = is_prohibited_forecast(text)
        if prohibited and rule:
            violations.append((field, rule))
    return violations
