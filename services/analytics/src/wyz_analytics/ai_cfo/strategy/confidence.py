"""Diagnosis vs decision confidence — intentionally separate."""

from __future__ import annotations

from enum import Enum


class DiagnosisConfidence(str, Enum):
    """How confident we are about WHAT IS HAPPENING financially."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INSUFFICIENT = "INSUFFICIENT"


class DecisionConfidence(str, Enum):
    """How confident we are about WHAT ACTION SHOULD BE TAKEN.

    Scenario sensitivity must NOT automatically raise this to HIGH.
    """

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INSUFFICIENT = "INSUFFICIENT"


class RecommendationStrength(str, Enum):
    """Strength of a recommendation posture — not the same as DecisionConfidence."""

    STRONG = "STRONG"
    MODERATE = "MODERATE"
    TENTATIVE = "TENTATIVE"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


_DECISION_RANK = {
    DecisionConfidence.INSUFFICIENT: 0,
    DecisionConfidence.LOW: 1,
    DecisionConfidence.MEDIUM: 2,
    DecisionConfidence.HIGH: 3,
}


def decision_confidence_not_raised_by_scenario(
    base: DecisionConfidence,
    *,
    scenario_present: bool,
) -> DecisionConfidence:
    """Scenario may inform exposure but must not raise decision confidence.

    Phase 2A rule: presence of a ScenarioResult never upgrades DecisionConfidence.
    """
    _ = scenario_present
    return base


def clamp_decision_confidence(
    proposed: DecisionConfidence,
    ceiling: DecisionConfidence,
) -> DecisionConfidence:
    if _DECISION_RANK[proposed] <= _DECISION_RANK[ceiling]:
        return proposed
    return ceiling
