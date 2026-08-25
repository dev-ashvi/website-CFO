"""Configurable mapping confidence policy.

LLM self-reported confidence never auto-accepts a mapping by itself.
final_confidence is min(model_confidence, validation_confidence).
"""

from __future__ import annotations

from dataclasses import dataclass

from wyz_analytics.mapping.models import MappingOrigin, MappingStatus


@dataclass(frozen=True)
class ConfidencePolicy:
    auto_accept_min: float = 0.95
    review_min: float = 0.75
    require_validation_for_auto_accept: bool = True
    unvalidated_cap: float = 0.9


def combine_confidence(
    model_confidence: float,
    validation_confidence: float | None,
    policy: ConfidencePolicy | None = None,
) -> float:
    rules = policy or ConfidencePolicy()
    model = max(0.0, min(1.0, float(model_confidence)))
    if validation_confidence is None:
        return min(model, rules.unvalidated_cap)
    return min(model, max(0.0, min(1.0, float(validation_confidence))))


def status_for_confidence(
    final_confidence: float,
    *,
    origin: MappingOrigin,
    missing_required: bool = False,
    rejected: bool = False,
    policy: ConfidencePolicy | None = None,
) -> MappingStatus:
    if origin in {MappingOrigin.USER_CONFIRMED, MappingOrigin.REMEMBERED}:
        return MappingStatus.CONFIRMED
    if rejected or missing_required:
        return MappingStatus.REJECTED if rejected else MappingStatus.USER_CONFIRMATION_REQUIRED
    rules = policy or ConfidencePolicy()
    if origin == MappingOrigin.AI_PROPOSED:
        if final_confidence >= rules.review_min:
            return MappingStatus.REVIEW_RECOMMENDED
        return MappingStatus.USER_CONFIRMATION_REQUIRED
    if final_confidence >= rules.auto_accept_min:
        return MappingStatus.AUTO_ACCEPTED
    if final_confidence >= rules.review_min:
        return MappingStatus.REVIEW_RECOMMENDED
    return MappingStatus.USER_CONFIRMATION_REQUIRED
