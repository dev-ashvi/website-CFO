"""Action eligibility — what MAY be considered, not what SHOULD be done."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import (
    ActionType,
    EvidenceBurden,
    evidence_burden_for,
    max_severity,
)
from wyz_analytics.ai_cfo.strategy.confidence import (
    DecisionConfidence,
    DiagnosisConfidence,
    clamp_decision_confidence,
    decision_confidence_not_raised_by_scenario,
)
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack
from wyz_analytics.ai_cfo.strategy.evidence_requirements import (
    DecisionTheme,
    EvidenceFlag,
    candidate_actions_for_theme,
    lookup_requirement,
)
from wyz_analytics.ai_cfo.strategy.intent import DecisionType
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


@dataclass
class ActionEligibility:
    action_type: ActionType
    eligible: bool
    burden_required: EvidenceBurden
    burden_met: bool
    evidence_ids: list[str] = field(default_factory=list)
    missing_requirements: list[str] = field(default_factory=list)
    relevant_unknowns: list[StrategicUnknown] = field(default_factory=list)
    decision_confidence_ceiling: DecisionConfidence = DecisionConfidence.LOW
    reason_code: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_type": self.action_type.value,
            "eligible": self.eligible,
            "burden_required": self.burden_required.value,
            "burden_met": self.burden_met,
            "evidence_ids": list(self.evidence_ids),
            "missing_requirements": list(self.missing_requirements),
            "relevant_unknowns": [u.value for u in self.relevant_unknowns],
            "decision_confidence_ceiling": self.decision_confidence_ceiling.value,
            "reason_code": self.reason_code,
        }


def _ceiling_for_action(
    action: ActionType,
    *,
    unknowns: list[StrategicUnknown],
    diagnosis_confidence: DiagnosisConfidence,
    conflicts_count: int,
) -> DecisionConfidence:
    """Per-action decision confidence ceiling (not a recommendation)."""
    # Low-risk actions can have high decision confidence when diagnosis is solid.
    if action in {ActionType.INVESTIGATE, ActionType.MONITOR}:
        if diagnosis_confidence == DiagnosisConfidence.HIGH:
            base = DecisionConfidence.HIGH
        elif diagnosis_confidence == DiagnosisConfidence.MEDIUM:
            base = DecisionConfidence.MEDIUM
        elif diagnosis_confidence == DiagnosisConfidence.LOW:
            base = DecisionConfidence.LOW
        else:
            base = DecisionConfidence.INSUFFICIENT
        return base

    if StrategicUnknown.PRICE_ELASTICITY in unknowns and action in {
        ActionType.INCREASE,
        ActionType.OPTIMIZE,
        ActionType.REDUCE,
    }:
        return DecisionConfidence.INSUFFICIENT

    if StrategicUnknown.DEMAND_RESPONSE in unknowns and action in {
        ActionType.REDUCE,
        ActionType.PAUSE,
        ActionType.EXIT,
        ActionType.INCREASE,
        ActionType.REALLOCATE,
    }:
        base = DecisionConfidence.LOW
    elif StrategicUnknown.DEMAND_RESPONSE in unknowns and action == ActionType.EXPERIMENT:
        base = DecisionConfidence.MEDIUM
    else:
        base = DecisionConfidence.MEDIUM

    if action in {ActionType.PAUSE, ActionType.EXIT}:
        base = DecisionConfidence.LOW

    if conflicts_count >= 1 and action in {ActionType.REDUCE, ActionType.PAUSE, ActionType.EXIT}:
        base = clamp_decision_confidence(base, DecisionConfidence.LOW)

    if diagnosis_confidence == DiagnosisConfidence.INSUFFICIENT:
        return DecisionConfidence.INSUFFICIENT
    if diagnosis_confidence == DiagnosisConfidence.LOW:
        return clamp_decision_confidence(base, DecisionConfidence.LOW)
    return base


def evaluate_action_eligibility(
    pack: DiagnosisPack,
    *,
    decision_type: DecisionType | None,
) -> list[ActionEligibility]:
    theme = pack.theme or DecisionTheme.GENERIC
    candidates = candidate_actions_for_theme(theme, decision_type)
    results: list[ActionEligibility] = []

    for action in candidates:
        req = lookup_requirement(theme, action)
        burden = evidence_burden_for(action)
        missing: list[str] = []
        if req is None:
            missing.append("NO_REQUIREMENT_DEFINED")
            results.append(
                ActionEligibility(
                    action_type=action,
                    eligible=False,
                    burden_required=burden,
                    burden_met=False,
                    missing_requirements=missing,
                    reason_code="NO_REQUIREMENT",
                )
            )
            continue

        for flag in req.required_flags:
            if flag not in pack.evidence_flags:
                missing.append(flag.value)

        # Hard rule: CM2 alone cannot qualify EXIT / PAUSE.
        if action in {ActionType.EXIT, ActionType.PAUSE}:
            if EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES not in pack.evidence_flags:
                if "HAS_MULTI_INDEPENDENT_SOURCES" not in missing:
                    missing.append("HAS_MULTI_INDEPENDENT_SOURCES")
            if EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION not in pack.evidence_flags:
                if "HAS_NEGATIVE_CONTRIBUTION" not in missing:
                    missing.append("HAS_NEGATIVE_CONTRIBUTION")
            # Explicit: having only HAS_CM2 without multi-source is insufficient.
            only_cm2 = (
                EvidenceFlag.HAS_CM2 in pack.evidence_flags
                and EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES not in pack.evidence_flags
            )
            if only_cm2 and "CM2_ALONE_INSUFFICIENT" not in missing:
                missing.append("CM2_ALONE_INSUFFICIENT")

        if pack.empty_scope or pack.diagnosis_confidence == DiagnosisConfidence.INSUFFICIENT:
            if action not in {ActionType.INVESTIGATE, ActionType.MONITOR}:
                missing.append("INSUFFICIENT_DIAGNOSIS")
            if action in {ActionType.INVESTIGATE, ActionType.MONITOR} and EvidenceFlag.HAS_SCOPE not in pack.evidence_flags:
                missing.append("HAS_SCOPE")

        # Low materiality blocks high-impact actions.
        if pack.materiality and pack.materiality.is_low and action in {
            ActionType.PAUSE,
            ActionType.EXIT,
            ActionType.REDUCE,
        }:
            if EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS not in pack.evidence_flags:
                if "HAS_MATERIALITY_MEDIUM_PLUS" not in missing:
                    missing.append("HAS_MATERIALITY_MEDIUM_PLUS")

        burden_met = not missing
        eligible = burden_met and not pack.empty_scope
        # INVESTIGATE/MONITOR may remain eligible with thin evidence if scope exists.
        if action in {ActionType.INVESTIGATE, ActionType.MONITOR} and EvidenceFlag.HAS_SCOPE in pack.evidence_flags:
            soft_missing = [m for m in missing if m not in {"HAS_CM2", "HAS_MARKETING_METRIC", "HAS_GROSS_MARGIN"}]
            if action == ActionType.MONITOR:
                eligible = EvidenceFlag.HAS_SCOPE in pack.evidence_flags
                burden_met = eligible
                missing = [] if eligible else missing
            elif action == ActionType.INVESTIGATE and EvidenceFlag.HAS_CM2 in pack.evidence_flags:
                eligible = True
                burden_met = True
                missing = soft_missing  # keep informational? clear for eligible
                missing = []

        if pack.empty_scope and action not in {ActionType.INVESTIGATE, ActionType.MONITOR}:
            eligible = False

        ceiling = _ceiling_for_action(
            action,
            unknowns=list(pack.unknowns),
            diagnosis_confidence=pack.diagnosis_confidence,
            conflicts_count=len(pack.conflicts),
        )
        # Scenario must not raise ceiling.
        ceiling = decision_confidence_not_raised_by_scenario(
            ceiling,
            scenario_present=bool(pack.scenario_refs),
        )

        reason = "ELIGIBLE" if eligible else ("MISSING_" + ",".join(missing[:4]) if missing else "INELIGIBLE")
        results.append(
            ActionEligibility(
                action_type=action,
                eligible=eligible,
                burden_required=burden,
                burden_met=burden_met,
                evidence_ids=list(pack.evidence_ids)[:8],
                missing_requirements=missing,
                relevant_unknowns=list(req.relevant_unknowns) or list(pack.unknowns)[:4],
                decision_confidence_ceiling=ceiling,
                reason_code=reason[:120],
            )
        )
    return results


def overall_decision_confidence_ceiling(
    eligibilities: list[ActionEligibility],
    *,
    unknowns: list[StrategicUnknown],
    scenario_present: bool,
) -> DecisionConfidence:
    """Ceiling across the decision — max among eligible action ceilings, then unknown caps.

    Not raised by scenario. Not a selected recommendation confidence.
    """
    eligible = [e for e in eligibilities if e.eligible]
    if not eligible:
        base = DecisionConfidence.INSUFFICIENT
    else:
        order = [
            DecisionConfidence.INSUFFICIENT,
            DecisionConfidence.LOW,
            DecisionConfidence.MEDIUM,
            DecisionConfidence.HIGH,
        ]
        base = max((e.decision_confidence_ceiling for e in eligible), key=lambda c: order.index(c))

    if StrategicUnknown.PRICE_ELASTICITY in unknowns:
        base = clamp_decision_confidence(base, DecisionConfidence.INSUFFICIENT)
    elif StrategicUnknown.DEMAND_RESPONSE in unknowns:
        # Allow MEDIUM only when an eligible low-severity action carries MEDIUM ceiling.
        low_sev_ok = any(
            e.eligible and e.action_type in {ActionType.INVESTIGATE, ActionType.MONITOR, ActionType.EXPERIMENT}
            for e in eligibilities
        )
        cap = DecisionConfidence.MEDIUM if low_sev_ok else DecisionConfidence.LOW
        base = clamp_decision_confidence(base, cap)

    return decision_confidence_not_raised_by_scenario(base, scenario_present=scenario_present)


def eligible_action_types(eligibilities: list[ActionEligibility]) -> list[ActionType]:
    return [e.action_type for e in eligibilities if e.eligible]


def ineligible_action_types(eligibilities: list[ActionEligibility]) -> list[ActionType]:
    return [e.action_type for e in eligibilities if not e.eligible]


def max_eligible_severity(eligibilities: list[ActionEligibility]):
    actions = eligible_action_types(eligibilities)
    return max_severity(actions)


def burden_met_by_action(eligibilities: list[ActionEligibility]) -> dict[str, bool]:
    return {e.action_type.value: e.burden_met for e in eligibilities}
