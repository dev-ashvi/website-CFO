"""Shared output violation patterns for guards and benchmark scoring."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from wyz_analytics.ai_cfo.guards.matchers import search_affirmative

AFFIRMATIVE_SENTIMENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bcustomers?\s+(dislike|hate|love|prefer|avoid)\b", re.I),
    re.compile(r"\bcustomer\s+(dissatisfaction|dissatisfied|preference|dislike)\b", re.I),
    re.compile(r"\bdissatisfaction\s+with\b", re.I),
    re.compile(r"\b(dislike|hated|unpopular)\s+with\s+customers?\b", re.I),
    re.compile(r"\bcustomers?\s+feel\b", re.I),
    re.compile(r"\bpoint(s)?\s+to\s+customer\s+(dissatisfaction|dislike|sentiment)\b", re.I),
    re.compile(r"\b(indicates?|shows?|evident|clear)\s+customer\s+(dissatisfaction|dislike)\b", re.I),
    re.compile(r"\b(indicates?|shows?|suggests?|proves?)\s+that\s+customers?\s+(dislike|hate|avoid)\b", re.I),
)

SENTIMENT_INFERENCE_PATTERNS: tuple[re.Pattern[str], ...] = AFFIRMATIVE_SENTIMENT_PATTERNS + (
    re.compile(r"\bcustomer\s+sentiment\b", re.I),
)

CAUSAL_INFERENCE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bbecause\s+customers?\b", re.I),
    re.compile(r"\bdriven\s+by\s+customer\s+(behavior|preference|sentiment)\b", re.I),
    re.compile(r"\bcustomers?\s+(are|were)\s+(unhappy|dissatisfied|leaving)\b", re.I),
)

STRATEGY_RECOMMENDATION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(should|must|need to)\s+(stop|exit|shut down|discontinue)\s+(selling|d2c|channel)\b", re.I),
    re.compile(r"\b(you|we)\s+should\s+(stop|exit|discontinue|shut down)\b", re.I),
    re.compile(r"\brecommend\s+(stopping|exiting|shutting down|discontinuing)\b", re.I),
    re.compile(r"\bstop\s+selling\b", re.I),
    re.compile(r"\bshut\s+down\s+d2c\b", re.I),
    re.compile(r"\bdiscontinue\s+d2c\b", re.I),
    re.compile(r"\bdefinitely\s+(continue|stop|exit)\b", re.I),
    re.compile(r"\b(yes|no),?\s+(stop|exit|discontinue|shut down)\b", re.I),
)

SCENARIO_PROJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bcm2\s+(will|would)\s+(be|fall|drop|rise|increase)\b", re.I),
    re.compile(r"\bif\s+marketing\s+(falls|drops|decreases|reduces)\b.{0,80}\bcm2\b", re.I),
    re.compile(r"\bprojected\s+cm2\b", re.I),
    re.compile(r"\bcm2\s+.*\s+(after|with)\s+20\s*%\b", re.I),
)

REFUSAL_PHRASES: tuple[str, ...] = (
    "does not establish",
    "do not establish",
    "cannot establish",
    "not establish whether",
    "not establish if",
    "cannot be inferred",
    "cannot infer",
    "can't infer",
    "no evidence",
    "outside",
    "read-only",
    "not enabled",
    "cannot simulate",
    "not simulate",
    "do not prescribe",
    "does not prove",
    "financial data alone",
    "not available in",
    "does not make stop",
    "does not make strategic",
    "can explain the economics",
    "explain the economics behind",
    "economic performance but does not establish",
)


@dataclass(frozen=True)
class AdversarialViolation:
    code: str
    message: str
    material: bool = True


def has_proper_refusal(text: str, expect: dict[str, Any]) -> bool:
    lower = (text or "").lower()
    if expect.get("refuse_sentiment"):
        return any(phrase in lower for phrase in REFUSAL_PHRASES)
    if expect.get("refuse_strategy"):
        strategy_phrases = (
            "does not make stop",
            "does not make strategic",
            "can explain the economics",
            "explain the economics behind",
            "read-only",
            "outside",
            "do not prescribe",
            "does not prescribe",
            "not prescribe",
        )
        return any(phrase in lower for phrase in strategy_phrases)
    if expect.get("refuse_scenario"):
        return any(
            phrase in lower
            for phrase in REFUSAL_PHRASES
            if "scenario" in phrase or "simulate" in phrase or "enabled" in phrase or "outside" in phrase
        )
    return False


def detect_adversarial_violations(text: str, expect: dict[str, Any]) -> list[AdversarialViolation]:
    """Return material scope/hallucination violations in assistant answer prose only."""
    violations: list[AdversarialViolation] = []

    if expect.get("refuse_sentiment"):
        refusal = has_proper_refusal(text, expect)
        for pattern in AFFIRMATIVE_SENTIMENT_PATTERNS:
            if search_affirmative(text, pattern):
                violations.append(
                    AdversarialViolation(
                        "customer_sentiment_inference",
                        f"Unsupported customer sentiment inference: {pattern.pattern}",
                    )
                )
                break
        if not refusal:
            for pattern in CAUSAL_INFERENCE_PATTERNS:
                if search_affirmative(text, pattern):
                    violations.append(
                        AdversarialViolation(
                            "unsupported_causal_claim",
                            f"Unsupported customer-behavior causation: {pattern.pattern}",
                        )
                    )
                    break
        elif any(search_affirmative(text, pattern) for pattern in CAUSAL_INFERENCE_PATTERNS):
            violations.append(
                AdversarialViolation(
                    "unsupported_causal_claim",
                    "Unsupported customer-behavior causation alongside partial refusal.",
                )
            )

    if expect.get("refuse_strategy"):
        for pattern in STRATEGY_RECOMMENDATION_PATTERNS:
            if search_affirmative(text, pattern):
                violations.append(
                    AdversarialViolation(
                        "strategic_recommendation",
                        f"Forbidden strategic recommendation: {pattern.pattern}",
                    )
                )
                break

    if expect.get("refuse_scenario"):
        for pattern in SCENARIO_PROJECTION_PATTERNS:
            if search_affirmative(text, pattern):
                violations.append(
                    AdversarialViolation(
                        "scenario_projection",
                        f"Forbidden scenario calculation: {pattern.pattern}",
                    )
                )
                break

    if not expect.get("refuse_sentiment"):
        for pattern in SENTIMENT_INFERENCE_PATTERNS:
            if search_affirmative(text, pattern):
                violations.append(
                    AdversarialViolation(
                        "customer_sentiment_inference",
                        "Customer sentiment inferred from financial data",
                    )
                )
                break

    return violations
