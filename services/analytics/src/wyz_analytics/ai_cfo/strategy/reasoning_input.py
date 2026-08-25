"""Build StrategicReasoningContract model input from DiagnosisPack + eligibility."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType, action_metadata, action_severity, evidence_burden_for
from wyz_analytics.ai_cfo.strategy.assessment import StrategicAssessment
from wyz_analytics.ai_cfo.strategy.decision_evidence import StrategicDecisionEvidencePack
from wyz_analytics.ai_cfo.strategy.decision_frame import DecisionFrame
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack
from wyz_analytics.ai_cfo.strategy.eligibility import ActionEligibility
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract


def _evidence_catalog(envelope: dict[str, Any] | None, allowed_ids: set[str]) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    if not envelope:
        return catalog
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in envelope.get(section) or []:
            if not isinstance(item, dict):
                continue
            eid = str(item.get("evidence_id") or "")
            if not eid or (allowed_ids and eid not in allowed_ids):
                continue
            roles = list(item.get("semantic_roles") or [])
            scope = item.get("scope") or {}
            catalog.append(
                {
                    "evidence_id": eid,
                    "semantic_role": roles[0] if roles else None,
                    "entity": item.get("entity") or scope.get("dimension_value"),
                    "metric_label_or_key": str(item.get("metric") or "")[:60] or None,
                    "provenance": item.get("provenance") or item.get("source"),
                }
            )
            if len(catalog) >= 24:
                return catalog
    return catalog


def build_strategic_model_input(
    *,
    message: str,
    assessment: StrategicAssessment,
    pack: DiagnosisPack,
    eligibilities: list[ActionEligibility],
    contract: StrategicReasoningContract,
    envelope: dict[str, Any] | None = None,
    decision_frame: DecisionFrame | None = None,
    decision_evidence: StrategicDecisionEvidencePack | None = None,
    conversation_context: dict[str, Any] | None = None,
    scenario_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compact strategic reasoning payload for the model — no raw filters or row dumps."""
    pack_ids = set(pack.strategic_supporting_evidence_ids or pack.evidence_ids or [])
    decision_ids = set(decision_evidence.all_ids() if decision_evidence else [])
    allowed_ids = set(contract.evidence_ids or []) | pack_ids | decision_ids

    action_meta: dict[str, Any] = {}
    for action in contract.allowed_actions:
        meta = action_metadata(action)
        action_meta[action.value] = {
            "severity": action_severity(action).value,
            "evidence_burden": evidence_burden_for(action).value,
            "reversible": meta.get("reversible"),
        }

    scenario_refs = []
    for ref in pack.scenario_refs or []:
        scenario_refs.append(
            {
                "scenario_id": ref.digest or f"{ref.lever}:{ref.operation}",
                "lever": ref.lever,
                "operation": ref.operation,
                "assumption_keys": ["hold_revenue_constant"],
                "scope_hash": ref.scope_hash,
            }
        )

    materiality = pack.materiality.to_dict() if pack.materiality else None
    frame_payload = decision_frame.to_dict() if decision_frame else None
    decision_block = None
    if decision_frame:
        decision_block = {
            "type": decision_frame.decision_type.value if decision_frame.decision_type else None,
            "theme": decision_frame.decision_theme.value,
            "subject": decision_frame.subject.to_dict() if decision_frame.subject else None,
            "objective": decision_frame.decision_objective,
            "reasoning_dimensions": decision_frame.reasoning_dimensions,
            "persistence_state": decision_frame.persistence_state.value,
            "constraints": decision_frame.decision_specific_constraints,
            "prioritize_candidates": [c.to_dict() for c in decision_frame.prioritize_candidates],
            "allowed_reason_keys": decision_frame.allowed_reason_keys,
            "allowed_change_my_view_keys": decision_frame.allowed_change_my_view_keys,
        }

    catalog = _evidence_catalog(envelope, allowed_ids)
    # Attach mechanical scenario evidence IDs for RECONSIDER (no numeric values).
    if isinstance(scenario_context, dict):
        for effect in scenario_context.get("mechanical_effects") or []:
            if not isinstance(effect, dict):
                continue
            eid = effect.get("scenario_evidence_id")
            if not eid:
                continue
            catalog.append(
                {
                    "evidence_id": eid,
                    "semantic_role": "CALCULATED_SCENARIO",
                    "entity": None,
                    "metric_label_or_key": effect.get("metric_key"),
                    "provenance": "CALCULATED_SCENARIO",
                    "direction": effect.get("direction"),
                }
            )

    prior_position = None
    if isinstance(conversation_context, dict):
        prior_position = conversation_context.get("prior_position") or {
            "selected_action": conversation_context.get("previous_action"),
            "strength": conversation_context.get("previous_strength"),
            "confidence": conversation_context.get("previous_confidence"),
            "position_key": conversation_context.get("previous_position_key"),
            "unknowns": conversation_context.get("unknowns") or [],
        }

    return {
        "decision_type": assessment.decision_type.value if assessment.decision_type else None,
        "normalized_question": str(message or "")[:500],
        "subject": assessment.subject.to_dict() if assessment.subject else None,
        "decision": decision_block,
        "decision_frame": frame_payload,
        "decision_evidence": decision_evidence.to_dict() if decision_evidence else None,
        "diagnosis": {
            "insight_type": pack.primary_insight,
            "driver_stage": pack.driver_stage,
            "diagnosis_confidence": (
                contract.diagnosis_confidence.value if contract.diagnosis_confidence else None
            ),
            "materiality": materiality,
            "temporal_persistence": pack.temporal_persistence.value,
            "conflicts": [c.value for c in pack.conflicts],
            "limitations": list(pack.limitations or [])[:6],
        },
        "allowed_actions": [a.value for a in contract.allowed_actions],
        "forbidden_actions": [a.value for a in contract.forbidden_actions],
        "action_metadata": action_meta,
        "unknowns": [u.value for u in contract.unknowns],
        "decision_confidence_ceiling": (
            contract.decision_confidence_ceiling.value if contract.decision_confidence_ceiling else None
        ),
        "evidence_catalog": catalog[:28],
        "scenario_refs": scenario_refs,
        "material_drivers": list(assessment.material_drivers or []),
        "conversation_context": conversation_context,
        "scenario_context": scenario_context,
        "prior_position": prior_position,
        "new_evidence": scenario_context if scenario_context else None,
    }
