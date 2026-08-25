"""Build Phase 2 strategic control-plane artifacts (diagnosis + eligibility; no recommendations)."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType, evidence_burden_for, max_severity
from wyz_analytics.ai_cfo.strategy.assessment import (
    DecisionThesis,
    ScenarioRef,
    empty_strategic_assessment,
)
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence, DiagnosisConfidence
from wyz_analytics.ai_cfo.strategy.diagnosis import build_diagnosis_pack
from wyz_analytics.ai_cfo.strategy.eligibility import (
    burden_met_by_action,
    eligible_action_types,
    evaluate_action_eligibility,
    ineligible_action_types,
    max_eligible_severity,
    overall_decision_confidence_ceiling,
)
from wyz_analytics.ai_cfo.strategy.evidence_requirements import (
    build_strategic_evidence_plan,
    candidate_actions_for_theme,
    classify_decision_theme,
)
from wyz_analytics.ai_cfo.strategy.intent import (
    DecisionType,
    classify_strategic_intent,
)
from wyz_analytics.ai_cfo.strategy.mode import resolve_strategy_mode
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown
from wyz_analytics.ai_cfo.strategy.validation import validate_strategic_assessment


def _thesis_from_pack(pack: Any, eligible: list[ActionType]) -> DecisionThesis | None:
    """Populate thesis preparation material — no final recommendation position."""
    if pack is None:
        return None
    uncertainty_keys = [u.value for u in pack.unknowns]
    basis = []
    if pack.primary_insight:
        basis.append(f"insight:{pack.primary_insight}")
    if pack.driver_stage:
        basis.append(f"driver:{pack.driver_stage}")
    basis.extend([f"evidence:{eid}" for eid in (pack.evidence_ids or [])[:3]])

    next_action = ActionType.INVESTIGATE
    next_key = "investigate_verified_pressures_under_current_scope"
    if ActionType.MONITOR in eligible and pack.decision_type == DecisionType.MONITOR:
        next_action = ActionType.MONITOR
        next_key = "track_core_margin_and_growth_metrics"

    return DecisionThesis(
        position_key="eligibility_prepared_awaiting_strategic_judgment",
        basis_keys=basis[:8],
        uncertainty_keys=uncertainty_keys,
        next_step_action=next_action if next_action in eligible or not eligible else None,
        next_step_key=next_key,
        monitoring_metric_keys=["cm2", "cm2_pct", "net_revenue", "marketing_pct"],
        basis_evidence_ids=list(pack.evidence_ids or [])[:5],
    )


def build_strategic_control_plane(
    message: str,
    *,
    capability_is_strategic: bool,
    financial_scope: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
    diagnosis: Any | None = None,
    diagnosis_confidence: DiagnosisConfidence | None = None,
    supporting_evidence_ids: list[str] | None = None,
    scenario_refs: list[ScenarioRef] | None = None,
    known_evidence_ids: set[str] | None = None,
    strategy_mode: str | None = None,
) -> dict[str, Any]:
    """Construct Phase 2B control-plane artifacts.

    Builds DiagnosisPack + ActionEligibility when context is provided.
    Does NOT select a recommendation (recommendations_enabled=False).
    """
    mode = resolve_strategy_mode(strategy_mode)
    intent = classify_strategic_intent(message, capability_is_strategic=capability_is_strategic)
    scope = financial_scope or (context or {}).get("financial_scope") or {}
    scope_hash = str(scope.get("scope_hash") or "") or None
    dataset_id = scope.get("dataset_id")

    if not intent.is_strategic:
        return {
            "strategic_intent_detected": False,
            "strategy_mode": mode,
            "assessment": None,
            "diagnosis_pack": None,
            "action_eligibility": [],
            "reasoning_contract": None,
            "validation": {"ok": True, "errors": [], "warnings": []},
            "telemetry": {
                "strategy_mode": mode,
                "strategic_intent_detected": False,
                "diagnosis_pack_built": False,
            },
        }

    decision_type = intent.decision_type or DecisionType.DECIDE
    working_context = dict(context or {})
    if financial_scope:
        working_context.setdefault("financial_scope", financial_scope)

    # Merge caller scenario refs + same-scope prior from conversation if present.
    refs = list(scenario_refs or [])
    conv = working_context.get("conversation") or {}
    for turn in conv.get("previous_turns") or []:
        if not isinstance(turn, dict) or not turn.get("same_scope"):
            continue
        spec = turn.get("scenario_spec")
        if isinstance(spec, dict) and spec.get("scope_hash"):
            refs.append(
                ScenarioRef(
                    scope_hash=str(spec.get("scope_hash")),
                    lever=str((spec.get("changes") or [{}])[0].get("lever") or "") or None,
                    operation=str((spec.get("changes") or [{}])[0].get("operation") or "") or None,
                    digest=str(spec.get("digest") or spec.get("spec_digest") or "") or None,
                )
            )
    # Explicit cross-scope refs passed in are filtered inside diagnosis pack.

    pack = build_diagnosis_pack(
        message,
        decision_type=decision_type,
        context=working_context,
        scenario_refs=refs,
    )
    if diagnosis is not None:
        pack.primary_insight = getattr(diagnosis, "insight_type", None) or pack.primary_insight
        pack.driver_stage = getattr(diagnosis, "driver_stage", None) or pack.driver_stage
    if diagnosis_confidence is not None:
        pack.diagnosis_confidence = diagnosis_confidence

    eligibilities = evaluate_action_eligibility(pack, decision_type=decision_type)
    eligible = eligible_action_types(eligibilities)
    ineligible = ineligible_action_types(eligibilities)
    decision_ceiling = overall_decision_confidence_ceiling(
        eligibilities,
        unknowns=list(pack.unknowns),
        scenario_present=bool(pack.scenario_refs),
    )

    theme = pack.theme or classify_decision_theme(message, decision_type)
    evidence_ids = list(supporting_evidence_ids or pack.strategic_supporting_evidence_ids or pack.evidence_ids)[:12]
    all_candidates = candidate_actions_for_theme(theme, decision_type)
    assessment = empty_strategic_assessment(
        decision_type=decision_type,
        decision_question=str(message or "")[:500],
        scope_hash=pack.scope_hash or scope_hash,
        dataset_id=str(dataset_id) if dataset_id else None,
        strategy_mode=mode,
    )
    assessment.subject = pack.subject
    assessment.financial_diagnosis = pack.as_financial_diagnosis_ref()
    assessment.diagnosis_confidence = pack.diagnosis_confidence
    assessment.decision_confidence = decision_ceiling
    assessment.supporting_evidence_ids = evidence_ids[:8]
    assessment.material_drivers = [pack.driver_stage] if pack.driver_stage else []
    # Full decision space; eligibility tracked separately — do not select a recommendation.
    assessment.candidate_actions = list(all_candidates)
    assessment.unknowns = list(pack.unknowns)
    assessment.scenario_refs = list(pack.scenario_refs)
    assessment.decision_thesis = _thesis_from_pack(pack, eligible)
    assessment.assumptions = []
    assessment.risks = [c.value for c in pack.conflicts]
    assessment.monitoring_metrics = ["cm2", "net_revenue", "marketing_pct"]
    assessment.recommendations_enabled = False
    assessment.recommendation = None
    if StrategicUnknown.ATTRIBUTION_LIMITATION in pack.unknowns:
        assessment.assumptions.append("attributed_marketing_is_not_fully_loaded_profitability")

    # Reasoning contract: allowed = eligible; forbidden = ineligible high-severity still listed.
    forbidden = [a for a in ineligible if a in {ActionType.PAUSE, ActionType.EXIT, ActionType.INCREASE}]
    # Also forbid any non-eligible from model choice.
    for a in ineligible:
        if a not in forbidden:
            forbidden.append(a)

    reasoning = StrategicReasoningContract(
        verified_diagnosis=assessment.financial_diagnosis,
        allowed_actions=list(eligible),
        forbidden_actions=forbidden,
        diagnosis_confidence=pack.diagnosis_confidence,
        decision_confidence_ceiling=decision_ceiling,
        unknowns=list(pack.unknowns),
        evidence_ids=evidence_ids[:8],
        scenario_refs=[r.to_dict() for r in pack.scenario_refs],
        recommendations_enabled=False,
    )

    known_ids = known_evidence_ids
    if known_ids is None and evidence_ids:
        known_ids = set(evidence_ids)

    validation = validate_strategic_assessment(
        assessment,
        active_scope_hash=pack.scope_hash or scope_hash,
        known_evidence_ids=known_ids,
    )

    max_sev = max_severity(list(all_candidates))
    max_elig_sev = max_eligible_severity(eligibilities)
    plan = build_strategic_evidence_plan(message, decision_type=decision_type)

    materiality_class = None
    if pack.materiality:
        materiality_class = pack.materiality.severity_class.value

    telemetry = {
        "strategy_mode": mode,
        "strategic_intent_detected": True,
        "decision_type": decision_type.value,
        "decision_theme": theme.value,
        "action_candidates": [a.value for a in all_candidates],
        "eligible_actions": [a.value for a in eligible],
        "ineligible_actions": [a.value for a in ineligible],
        "max_action_severity": max_sev.value if max_sev else None,
        "max_eligible_severity": max_elig_sev.value if max_elig_sev else None,
        "diagnosis_pack_built": True,
        "diagnosis_confidence": pack.diagnosis_confidence.value,
        "decision_confidence": decision_ceiling.value,
        "decision_confidence_ceiling": decision_ceiling.value,
        "recommendation_strength": None,
        "evidence_burden_required": evidence_burden_for(ActionType.EXIT).value,
        "evidence_burden_met_by_action": burden_met_by_action(eligibilities),
        "unknowns_count": len(pack.unknowns),
        "strategic_unknowns": [u.value for u in pack.unknowns],
        "materiality_class": materiality_class,
        "temporal_persistence": pack.temporal_persistence.value,
        "conflicting_evidence_count": len(pack.conflicts),
        "cost_breakdown_forced": bool(plan.force_cost_breakdown),
        "cost_breakdown_reconciliation": (
            pack.cost_context.reconciliation_status if pack.cost_context else None
        ),
        "scenario_ref_available": bool(refs),
        "scenario_ref_scope_match": bool(pack.scenario_refs),
        "strategic_assessment_valid": validation.ok,
        "decision_thesis_present": assessment.decision_thesis is not None,
        "strategy_gate_failures": list(validation.errors),
        "recommendations_enabled": False,
    }

    return {
        "strategic_intent_detected": True,
        "strategy_mode": mode,
        "assessment": assessment,
        "diagnosis_pack": pack,
        "action_eligibility": eligibilities,
        "evidence_plan": plan,
        "reasoning_contract": reasoning,
        "validation": validation.to_dict(),
        "telemetry": telemetry,
    }
