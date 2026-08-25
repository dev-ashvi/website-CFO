"""Post-response guard checks for AI CFO output."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.guards.capability import Capability
from wyz_analytics.ai_cfo.guards.matchers import search_affirmative
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.guards.violations import (
    AFFIRMATIVE_SENTIMENT_PATTERNS,
    CAUSAL_INFERENCE_PATTERNS,
    SCENARIO_PROJECTION_PATTERNS,
    STRATEGY_RECOMMENDATION_PATTERNS,
    AdversarialViolation,
)


def _answer_text(answer: dict[str, Any], *, exclude_boundary: bool = False) -> str:
    headline = answer.get("headline") or ""
    if exclude_boundary and headline.strip() == STRATEGY_BOUNDARY_SENTENCE.strip():
        headline = ""
    evidence_text = []
    for item in (answer.get("evidence") or []):
        if isinstance(item, dict):
            seg = " ".join(
                str(part)
                for part in (item.get("metric"), item.get("value"), item.get("interpretation"))
                if part not in (None, "")
            )
            if seg:
                evidence_text.append(seg)
        else:
            evidence_text.append(str(item))
    parts = [
        headline,
        " ".join(evidence_text),
        answer.get("interpretation") or answer.get("drivers") or "",
        answer.get("driver_stage") or "",
        answer.get("caveat") or "",
    ]
    if exclude_boundary:
        parts = [
            part.replace(STRATEGY_BOUNDARY_SENTENCE, "").strip()
            for part in parts
            if part
        ]
    return " ".join(part for part in parts if part)


def detect_output_violations(answer: dict[str, Any], capability: Capability) -> list[AdversarialViolation]:
    """Detect material prohibited behavior in a model-generated answer."""
    exclude_boundary = capability == Capability.STRATEGIC_RECOMMENDATION
    text = _answer_text(answer, exclude_boundary=exclude_boundary)
    violations: list[AdversarialViolation] = []

    if capability in {Capability.UNSUPPORTED_CAUSALITY, Capability.FINANCIAL_INTERPRETATION}:
        for pattern in AFFIRMATIVE_SENTIMENT_PATTERNS:
            if search_affirmative(text, pattern):
                violations.append(
                    AdversarialViolation("customer_sentiment_inference", "Unsupported customer sentiment inference.")
                )
                break
        for pattern in CAUSAL_INFERENCE_PATTERNS:
            if search_affirmative(text, pattern):
                violations.append(
                    AdversarialViolation("unsupported_causal_claim", "Unsupported customer-behavior causation.")
                )
                break

    if capability == Capability.STRATEGIC_RECOMMENDATION:
        for pattern in STRATEGY_RECOMMENDATION_PATTERNS:
            if search_affirmative(text, pattern):
                violations.append(
                    AdversarialViolation("strategic_recommendation", "Forbidden strategic recommendation.")
                )
                break

    if capability == Capability.SCENARIO_REQUEST:
        for pattern in SCENARIO_PROJECTION_PATTERNS:
            if search_affirmative(text, pattern):
                violations.append(
                    AdversarialViolation("scenario_projection", "Forbidden scenario calculation.")
                )
                break

    return violations
