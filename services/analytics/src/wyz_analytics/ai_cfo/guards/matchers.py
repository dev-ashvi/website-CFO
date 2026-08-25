"""Negation-aware violation pattern matching for assistant answers."""

from __future__ import annotations

import re

# Phrases indicating denial/refusal in the local context before a matched term.
NEGATION_MARKERS: tuple[str, ...] = (
    "does not establish",
    "do not establish",
    "cannot establish",
    "can't establish",
    "does not prove",
    "do not prove",
    "does not indicate",
    "do not indicate",
    "does not show",
    "do not infer",
    "don't infer",
    "cannot infer",
    "can't infer",
    "cannot be inferred",
    "not establish whether",
    "not establish if",
    "not establish customer",
    "not infer customer",
    "no evidence",
    "without establishing",
    "without inferring",
)

NEGATION_TAIL = re.compile(
    r"\b(?:do not|does not|cannot|can't|not|no|never|without)\s+(?:\w+\s+){0,4}$",
    re.I,
)


def has_negated_local_context(text: str, start: int) -> bool:
    """Return True when the match at ``start`` appears inside a refusal/negation."""
    prefix = text[max(0, start - 96) : start].lower()
    for marker in NEGATION_MARKERS:
        if marker in prefix:
            return True
    return bool(NEGATION_TAIL.search(prefix))


def find_affirmative_match(text: str, pattern: re.Pattern[str]) -> re.Match[str] | None:
    """Find the first pattern match that is not negated/refusal context."""
    for match in pattern.finditer(text or ""):
        if has_negated_local_context(text, match.start()):
            continue
        return match
    return None


def search_affirmative(text: str, pattern: re.Pattern[str]) -> bool:
    return find_affirmative_match(text, pattern) is not None
