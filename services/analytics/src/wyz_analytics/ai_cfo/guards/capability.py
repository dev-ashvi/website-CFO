"""Deterministic capability classification for AI CFO questions."""

from __future__ import annotations

import re
from enum import Enum
from typing import Any


class Capability(str, Enum):
    FINANCIAL_INTERPRETATION = "FINANCIAL_INTERPRETATION"
    BREAKDOWN_REQUIRED = "BREAKDOWN_REQUIRED"
    TREND_REQUIRED = "TREND_REQUIRED"
    UNSUPPORTED_CAUSALITY = "UNSUPPORTED_CAUSALITY"
    STRATEGIC_RECOMMENDATION = "STRATEGIC_RECOMMENDATION"
    SCENARIO_REQUEST = "SCENARIO_REQUEST"


_SCENARIO_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bwhat happens if\b", re.I),
    re.compile(r"\bwhat if\b", re.I),
    re.compile(r"\bwhat will .{0,40} if\b", re.I),
    re.compile(r"\bif marketing (falls|drops|decreases|reduces|increases|rises)\b", re.I),
    re.compile(r"\bif (cogs|product cogs|cm1 costs?) (falls|drops|decreases|reduces|improves|increases)\b", re.I),
    re.compile(r"\bcm2 (after|with)\b.{0,40}\b(marketing|20\s*%)\b", re.I),
    re.compile(r"\b(simulate|scenario|assume|suppose)\b", re.I),
    re.compile(r"^(what about|how about)\s+(?:only\s+)?\d+(?:\.\d+)?\s*%", re.I),
    re.compile(
        r"^(what about|how about)\s+(increasing|raising|decreasing|reducing|cutting)\s+"
        r"(?:it\s+)?(?:by\s+)?\d+(?:\.\d+)?\s*%",
        re.I,
    ),
    re.compile(r"^make that\s+\d+(?:\.\d+)?\s*%", re.I),
    re.compile(
        r"\bwhat if(?:\s+instead)?\s+i\s+(reduce|cut|decrease|increase|raise)\b",
        re.I,
    ),
)

_STRATEGY_PATTERNS: tuple[re.Pattern[str], ...] = (
    # Legacy V1 stop/continue / cut patterns
    re.compile(r"\bshould we (stop|exit|discontinue|shut down|cut|reduce)\b", re.I),
    re.compile(r"\b(stop|exit|discontinue|shut down) (selling|d2c|channel)\b", re.I),
    re.compile(r"\brecommend (stopping|exiting|discontinuing|cutting|reducing)\b", re.I),
    # Broader founder strategic language (Phase 2A) — causality still wins above.
    re.compile(r"\bshould i\b", re.I),
    re.compile(r"\bshould we\b", re.I),
    re.compile(r"\bwhat should i (fix|do|prioritize|focus|test|monitor|cut|reduce|solve)\b", re.I),
    re.compile(r"\bwhat should we (fix|do|prioritize|focus|test|monitor|try)\b", re.I),
    re.compile(r"\bwhat should management do\b", re.I),
    re.compile(r"\bwhich problem should i\b", re.I),
    re.compile(r"\bwhich option would you (choose|pick|take|prefer)\b", re.I),
    re.compile(r"\bwhat would you do\b", re.I),
    re.compile(r"\bwhat would you recommend\b", re.I),
    re.compile(r"\bwhat do you recommend\b", re.I),
    re.compile(r"\bwhat would you prioritize\b", re.I),
    re.compile(r"\bwould you recommend\b", re.I),
    re.compile(r"\bwhat is the best course of action\b", re.I),
    re.compile(r"\bbest course of action\b", re.I),
    re.compile(r"\bgiven (this|that|these),?\s+what (should|would)\b", re.I),
    re.compile(r"\bif you were (my |our )?cfo\b", re.I),
    re.compile(r"\bwhere would you focus\b", re.I),
    re.compile(r"\bwould you do it\b", re.I),
    re.compile(r"\bworth continuing\b", re.I),
    re.compile(r"\bis .{0,60} worth (continuing|keeping)\b", re.I),
    re.compile(r"\bfocus more on\b", re.I),
    re.compile(r"\bstop selling\b", re.I),
)

_CAUSALITY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bwhy do customers (dislike|hate|avoid|prefer)\b", re.I),
    re.compile(r"\bcustomers? (dislike|hate|love|prefer)\b", re.I),
    re.compile(r"\bcustomer sentiment\b", re.I),
    re.compile(r"\bcustomer (preference|dissatisfaction)\b", re.I),
)

_TREND_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\btrend\b", re.I),
    re.compile(r"\btrending\b", re.I),
    re.compile(r"\bover time\b", re.I),
    re.compile(r"\bmonth over month\b", re.I),
    re.compile(r"\bperiod.{0,20}change\b", re.I),
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
    re.compile(r"\bchanged recently\b", re.I),
)

_BREAKDOWN_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bwhich (sku|skus|channel|channels|category|categories|product|products)\b", re.I),
    re.compile(r"\bdrive(s)? contribution\b", re.I),
    re.compile(r"\bcontributes? (the )?most\b", re.I),
    re.compile(r"\bweakest\b", re.I),
    re.compile(r"\bworst\b", re.I),
    re.compile(r"\bstrongest\b", re.I),
    re.compile(r"\bwhy is margin (weak|low|negative|pressure)\b", re.I),
    re.compile(r"\bmargin (weak|weakness|pressure)\b", re.I),
    re.compile(r"\blargest margin\b", re.I),
    re.compile(r"\bmargin leak\b", re.I),
    re.compile(r"\bproducts causing\b", re.I),
    re.compile(r"\btop .{0,20}contributor\b", re.I),
)


def classify_capability(message: str, analytical: dict[str, Any] | None = None) -> Capability:
    """Rule-based capability classification (no LLM).

    Precedence:
      causality / unsupported domain
      > strategic prescription (may still attach optional sensitivity later)
      > scenario what-if
      > trend / breakdown / interpretation
    """
    text = (message or "").strip()
    lower = text.lower()
    _ = analytical

    for pattern in _CAUSALITY_PATTERNS:
        if pattern.search(text):
            return Capability.UNSUPPORTED_CAUSALITY

    # Strategic "should we" wins over pure scenario so we retain the prescription boundary.
    for pattern in _STRATEGY_PATTERNS:
        if pattern.search(text):
            return Capability.STRATEGIC_RECOMMENDATION

    for pattern in _SCENARIO_PATTERNS:
        if pattern.search(text):
            return Capability.SCENARIO_REQUEST

    for pattern in _TREND_PATTERNS:
        if pattern.search(text):
            return Capability.TREND_REQUIRED

    for pattern in _BREAKDOWN_PATTERNS:
        if pattern.search(text):
            return Capability.BREAKDOWN_REQUIRED

    if any(token in lower for token in ("breakdown", "ranking", "contributor", "sku001", "sku")):
        if any(token in lower for token in ("which", "top", "drive", "weakest", "causing", "products")):
            return Capability.BREAKDOWN_REQUIRED

    return Capability.FINANCIAL_INTERPRETATION
