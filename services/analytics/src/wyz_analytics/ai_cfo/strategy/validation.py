"""Deterministic validation for Phase 2A strategic contracts."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import (
    ActionType,
    evidence_burden_for,
    validate_cfo_action_payload,
)
from wyz_analytics.ai_cfo.strategy.assessment import DecisionThesis, StrategicAssessment
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence, DiagnosisConfidence

_NUMBER_RE = re.compile(r"(?<![A-Za-z_])-?\d[\d,]*(?:\.\d+)?%?")
_EVIDENCE_ID_RE = re.compile(r"^[A-Za-z0-9_.:\-]+$")


@dataclass
class StrategicValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "errors": list(self.errors), "warnings": list(self.warnings)}


def _thesis_has_numeric_facts(thesis: DecisionThesis | None) -> bool:
    if not thesis:
        return False
    blobs = [
        thesis.position_key,
        thesis.next_step_key,
        *thesis.basis_keys,
        *thesis.uncertainty_keys,
        *thesis.monitoring_metric_keys,
    ]
    return any(part and _NUMBER_RE.search(part) for part in blobs)


def validate_strategic_assessment(
    assessment: StrategicAssessment,
    *,
    active_scope_hash: str | None = None,
    known_evidence_ids: set[str] | None = None,
    allowed_actions: list[ActionType] | None = None,
) -> StrategicValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    if assessment.supporting_evidence_ids or assessment.recommendation or assessment.scenario_refs:
        if not assessment.scope_hash:
            errors.append("Grounded StrategicAssessment requires scope_hash.")

    if active_scope_hash and assessment.scope_hash and assessment.scope_hash != active_scope_hash:
        errors.append("StrategicAssessment.scope_hash does not match active FinancialScope.")

    if assessment.diagnosis_confidence and assessment.diagnosis_confidence not in DiagnosisConfidence:
        errors.append("Invalid DiagnosisConfidence.")
    if assessment.decision_confidence and assessment.decision_confidence not in DecisionConfidence:
        errors.append("Invalid DecisionConfidence.")

    for action in assessment.candidate_actions:
        if action not in ActionType:
            errors.append(f"Invalid ActionType: {action}")

    # EXIT / PAUSE must carry highest burden metadata (framework integrity).
    for action in assessment.candidate_actions:
        if action == ActionType.EXIT and evidence_burden_for(action).value != "VERY_STRONG":
            errors.append("EXIT must require VERY_STRONG evidence burden.")
        if action == ActionType.PAUSE and evidence_burden_for(action).value != "VERY_STRONG":
            errors.append("PAUSE must require VERY_STRONG evidence burden.")

    if assessment.recommendation and assessment.recommendation.action_type:
        action = assessment.recommendation.action_type
        pool = allowed_actions if allowed_actions is not None else assessment.candidate_actions
        if pool and action not in pool:
            label = "allowed_actions" if allowed_actions is not None else "candidate_actions"
            errors.append(f"Recommendation action_type must be in {label} when pool exists.")

    # Phase 2A: recommendations must not be silently enabled without a recommendation.
    if assessment.recommendations_enabled and not assessment.recommendation:
        warnings.append("recommendations_enabled is true but recommendation is missing.")

    if known_evidence_ids is not None:
        for eid in assessment.supporting_evidence_ids:
            if eid not in known_evidence_ids:
                errors.append(f"Unknown supporting evidence_id: {eid}")
            if not _EVIDENCE_ID_RE.match(str(eid)):
                errors.append(f"Malformed evidence_id: {eid}")

    for ref in assessment.scenario_refs:
        if not ref.scope_hash:
            errors.append("scenario_ref requires scope_hash.")
        elif active_scope_hash and ref.scope_hash != active_scope_hash:
            errors.append("Cross-scope scenario_ref rejected.")
        elif assessment.scope_hash and ref.scope_hash != assessment.scope_hash:
            errors.append("scenario_ref.scope_hash must match assessment.scope_hash.")

    if _thesis_has_numeric_facts(assessment.decision_thesis):
        errors.append("DecisionThesis must not contain fabricated numeric financial facts.")

    for action in assessment.next_actions:
        errors.extend(validate_cfo_action_payload(action))

    # Unknowns are uncertainty tags — never treated as verified facts.
    for unknown in assessment.unknowns:
        if unknown.value in (assessment.material_drivers or []):
            errors.append(f"Unknown {unknown.value} cannot also be a material_driver.")

    return StrategicValidationResult(ok=not errors, errors=errors, warnings=warnings)
