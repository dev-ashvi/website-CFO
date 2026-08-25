"""Deterministic adversarial violation checks for benchmark scoring."""

from wyz_analytics.ai_cfo.guards.violations import (
    AFFIRMATIVE_SENTIMENT_PATTERNS,
    CAUSAL_INFERENCE_PATTERNS,
    REFUSAL_PHRASES,
    SCENARIO_PROJECTION_PATTERNS,
    SENTIMENT_INFERENCE_PATTERNS,
    STRATEGY_RECOMMENDATION_PATTERNS,
    AdversarialViolation,
    detect_adversarial_violations,
    has_proper_refusal,
)

__all__ = [
    "AFFIRMATIVE_SENTIMENT_PATTERNS",
    "CAUSAL_INFERENCE_PATTERNS",
    "REFUSAL_PHRASES",
    "SCENARIO_PROJECTION_PATTERNS",
    "SENTIMENT_INFERENCE_PATTERNS",
    "STRATEGY_RECOMMENDATION_PATTERNS",
    "AdversarialViolation",
    "detect_adversarial_violations",
    "has_proper_refusal",
]
