"""Validate strategic model output against Python-controlled boundaries."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType, evidence_burden_for
from wyz_analytics.ai_cfo.strategy.confidence import (
    DecisionConfidence,
    RecommendationStrength,
    clamp_decision_confidence,
)
from wyz_analytics.ai_cfo.strategy.forecast_guard import scan_strategic_prose_violations
from wyz_analytics.ai_cfo.strategy.model_decision import StrategicModelDecision, allowed_unknown_keys
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown

_NUMBER_RE = re.compile(r"(?<![A-Za-z_])-?\d[\d,]*(?:\.\d+)?%?|₹|\$")
_SENTIMENT_RE = re.compile(r"\b(customers? (hate|love|dislike|prefer)|sentiment)\b", re.I)


@dataclass
class StrategicModelValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    clamped_decision_confidence: DecisionConfidence | None = None
    clamped_strength: RecommendationStrength | None = None
    confidence_clamped: bool = False
    strength_clamped: bool = False
    forecast_violation_field: str | None = None
    forecast_violation_rule: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "errors": list(self.errors),
            "clamped_decision_confidence": (
                self.clamped_decision_confidence.value if self.clamped_decision_confidence else None
            ),
            "clamped_strength": self.clamped_strength.value if self.clamped_strength else None,
            "confidence_clamped": self.confidence_clamped,
            "strength_clamped": self.strength_clamped,
            "forecast_violation_field": self.forecast_violation_field,
            "forecast_violation_rule": self.forecast_violation_rule,
        }


_STRENGTH_RANK = {
    RecommendationStrength.INSUFFICIENT_EVIDENCE: 0,
    RecommendationStrength.TENTATIVE: 1,
    RecommendationStrength.MODERATE: 2,
    RecommendationStrength.STRONG: 3,
}


def strength_ceiling(
    action: ActionType,
    *,
    decision_ceiling: DecisionConfidence,
    unknowns: list[StrategicUnknown],
) -> RecommendationStrength:
    if action in {ActionType.INVESTIGATE, ActionType.MONITOR}:
        return RecommendationStrength.STRONG
    if StrategicUnknown.PRICE_ELASTICITY in unknowns and action == ActionType.INCREASE:
        return RecommendationStrength.INSUFFICIENT_EVIDENCE
    if StrategicUnknown.DEMAND_RESPONSE in unknowns and action in {
        ActionType.REDUCE,
        ActionType.PAUSE,
        ActionType.EXIT,
        ActionType.INCREASE,
    }:
        return RecommendationStrength.TENTATIVE
    if decision_ceiling == DecisionConfidence.INSUFFICIENT:
        return RecommendationStrength.INSUFFICIENT_EVIDENCE
    if decision_ceiling == DecisionConfidence.LOW:
        return RecommendationStrength.TENTATIVE
    if action in {ActionType.PAUSE, ActionType.EXIT}:
        return RecommendationStrength.MODERATE
    return RecommendationStrength.MODERATE


def clamp_recommendation_strength(
    proposed: RecommendationStrength,
    ceiling: RecommendationStrength,
) -> RecommendationStrength:
    if _STRENGTH_RANK[proposed] <= _STRENGTH_RANK[ceiling]:
        return proposed
    return ceiling


def validate_strategic_model_decision(
    decision: StrategicModelDecision | None,
    *,
    contract: StrategicReasoningContract,
    known_evidence_ids: set[str] | None = None,
    allowed_scenario_digests: set[str] | None = None,
    allowed_reason_keys: set[str] | None = None,
    allowed_change_my_view_keys: set[str] | None = None,
    allowed_tradeoff_keys: set[str] | None = None,
    allowed_priority_candidate_ids: set[str] | None = None,
    require_priority_candidate: bool = False,
) -> StrategicModelValidationResult:
    errors: list[str] = []
    forecast_field: str | None = None
    forecast_rule: str | None = None

    if decision is None:
        return StrategicModelValidationResult(ok=False, errors=["missing_strategic_model_decision"])

    allowed = set(contract.allowed_actions)
    if not decision.selected_action:
        errors.append("selected_action required")
    elif decision.selected_action not in allowed:
        errors.append(f"selected_action {decision.selected_action.value} not in allowed_actions")
    if decision.selected_action and decision.selected_action in set(contract.forbidden_actions):
        errors.append(f"selected_action {decision.selected_action.value} is forbidden")

    allowed_unknown = allowed_unknown_keys(list(contract.unknowns))
    thesis = decision.thesis

    prose_blobs: list[str] = []
    if decision.rationale:
        prose_blobs.append(decision.rationale)
    if thesis and thesis.position:
        prose_blobs.append(thesis.position)

    for blob in prose_blobs:
        if _NUMBER_RE.search(blob):
            errors.append("numeric_claim_in_strategic_prose")
            break
        if _SENTIMENT_RE.search(blob):
            errors.append("unsupported_customer_sentiment")
            break

    forecast_hits = scan_strategic_prose_violations(
        rationale=decision.rationale,
        position=thesis.position if thesis else None,
    )
    if forecast_hits:
        field_name, rule = forecast_hits[0]
        forecast_field = field_name
        forecast_rule = rule
        errors.append(f"demand_or_revenue_forecast:{field_name}")

    if thesis:
        for key in thesis.uncertainty_keys:
            if key and key not in allowed_unknown and key not in {"NONE"}:
                try:
                    StrategicUnknown(key)
                except ValueError:
                    errors.append(f"unsupported_uncertainty:{key}")

    catalog_ids = set(contract.evidence_ids or [])
    if known_evidence_ids is not None:
        catalog_ids = known_evidence_ids
    for eid in decision.supporting_evidence_ids:
        if catalog_ids and eid not in catalog_ids:
            errors.append(f"unknown_evidence_id:{eid}")

    if decision.scenario_ref_digest and allowed_scenario_digests is not None:
        if decision.scenario_ref_digest not in allowed_scenario_digests:
            errors.append("stale_or_cross_scope_scenario_ref")

    if decision.primary_reason_key and allowed_reason_keys is not None:
        if decision.primary_reason_key not in allowed_reason_keys:
            errors.append(f"unsupported_primary_reason_key:{decision.primary_reason_key}")
    for key in decision.change_my_view_keys:
        if allowed_change_my_view_keys is not None and key not in allowed_change_my_view_keys:
            errors.append(f"unsupported_change_my_view_key:{key}")
    for key in decision.tradeoff_keys:
        if allowed_tradeoff_keys is not None and key not in allowed_tradeoff_keys:
            errors.append(f"unsupported_tradeoff_key:{key}")

    if require_priority_candidate or allowed_priority_candidate_ids is not None:
        pid = decision.priority_candidate_id
        if require_priority_candidate and not pid:
            errors.append("priority_candidate_required")
        elif pid and allowed_priority_candidate_ids is not None and pid not in allowed_priority_candidate_ids:
            errors.append(f"invalid_priority_candidate:{pid}")

    if decision.selected_action and decision.supporting_evidence_ids == []:
        burden = evidence_burden_for(decision.selected_action)
        if burden.value not in {"MINIMAL"}:
            errors.append("supporting_evidence_required_for_burden")

    ceiling = contract.decision_confidence_ceiling or DecisionConfidence.MEDIUM
    proposed_conf = decision.decision_confidence or DecisionConfidence.MEDIUM
    final_conf = clamp_decision_confidence(proposed_conf, ceiling)
    conf_clamped = final_conf != proposed_conf

    strength_ceiling_val = strength_ceiling(
        decision.selected_action or ActionType.INVESTIGATE,
        decision_ceiling=ceiling,
        unknowns=list(contract.unknowns),
    )
    proposed_strength = decision.recommendation_strength or RecommendationStrength.MODERATE
    final_strength = clamp_recommendation_strength(proposed_strength, strength_ceiling_val)
    strength_clamped = final_strength != proposed_strength

    return StrategicModelValidationResult(
        ok=not errors,
        errors=errors,
        clamped_decision_confidence=final_conf,
        clamped_strength=final_strength,
        confidence_clamped=conf_clamped,
        strength_clamped=strength_clamped,
        forecast_violation_field=forecast_field,
        forecast_violation_rule=forecast_rule,
    )
