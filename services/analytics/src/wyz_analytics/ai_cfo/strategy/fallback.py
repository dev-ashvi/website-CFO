"""Deterministic strategic fallback when model output is invalid."""



from __future__ import annotations



from wyz_analytics.ai_cfo.strategy.actions import ActionType

from wyz_analytics.ai_cfo.strategy.assessment import DecisionThesis, StrategicAssessment

from wyz_analytics.ai_cfo.strategy.confidence import (

    DecisionConfidence,

    DiagnosisConfidence,

    RecommendationStrength,

    clamp_decision_confidence,

)

from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack

from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme

from wyz_analytics.ai_cfo.strategy.model_decision import StrategicModelDecision, StrategicThesisOutput

from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract

from wyz_analytics.ai_cfo.strategy.strategic_evidence import select_strategic_supporting_evidence_ids

from wyz_analytics.ai_cfo.strategy.strategic_presentation import theme_fallback_copy





def _supporting_ids(assessment: StrategicAssessment, pack: DiagnosisPack | None) -> list[str]:

    if pack and pack.strategic_supporting_evidence_ids:

        return list(pack.strategic_supporting_evidence_ids)[:5]

    return list(assessment.supporting_evidence_ids or [])[:5]





def build_strategic_fallback_decision(

    *,

    assessment: StrategicAssessment,

    pack: DiagnosisPack | None,

    contract: StrategicReasoningContract,

    envelope: dict | None = None,

) -> StrategicModelDecision:

    """Useful deterministic fallback — theme-aware copy, no internal keys in prose."""

    allowed = list(contract.allowed_actions)

    theme = pack.theme if pack else DecisionTheme.GENERIC

    evidence_ids = _supporting_ids(assessment, pack)

    if not evidence_ids and envelope is not None and pack:

        evidence_ids = select_strategic_supporting_evidence_ids(

            theme=theme,

            envelope=envelope,

            pack_evidence_ids=pack.evidence_ids,

            max_items=5,

        )



    if pack and pack.diagnosis_confidence == DiagnosisConfidence.INSUFFICIENT:

        return StrategicModelDecision(

            selected_action=ActionType.INVESTIGATE if ActionType.INVESTIGATE in allowed else None,

            recommendation_strength=RecommendationStrength.INSUFFICIENT_EVIDENCE,

            decision_confidence=DecisionConfidence.INSUFFICIENT,

            thesis=StrategicThesisOutput(

                position=theme_fallback_copy(theme),

                uncertainty_keys=[u.value for u in (pack.unknowns or [])][:4],

                next_step_action=ActionType.INVESTIGATE if ActionType.INVESTIGATE in allowed else None,

            ),

            rationale=theme_fallback_copy(theme),

            supporting_evidence_ids=evidence_ids,

        )



    action = ActionType.INVESTIGATE

    if ActionType.INVESTIGATE not in allowed:

        action = allowed[0] if allowed else ActionType.INVESTIGATE



    rationale = theme_fallback_copy(theme)

    if pack and pack.conflicts:

        rationale = (

            "There are verified tensions in this view. I'd investigate the drivers "

            "before recommending a stronger move."

        )



    ceiling = contract.decision_confidence_ceiling or DecisionConfidence.LOW

    return StrategicModelDecision(

        selected_action=action,

        recommendation_strength=RecommendationStrength.TENTATIVE,

        decision_confidence=clamp_decision_confidence(DecisionConfidence.LOW, ceiling),

        thesis=StrategicThesisOutput(

            position=rationale,

            why_keys_or_evidence_ids=[f"insight:{pack.primary_insight}"] if pack and pack.primary_insight else [],

            uncertainty_keys=[u.value for u in (pack.unknowns if pack else [])][:4],

            next_step_action=action,

            monitoring_metric_keys=["cm2", "net_revenue", "marketing_pct"],

        ),

        rationale=rationale,

        supporting_evidence_ids=evidence_ids,

    )





def apply_model_decision_to_assessment(

    assessment: StrategicAssessment,

    decision: StrategicModelDecision,

    *,

    final_confidence: DecisionConfidence,

    final_strength: RecommendationStrength,

) -> None:

    """Populate StrategicAssessment + DecisionThesis from validated model decision."""

    from wyz_analytics.ai_cfo.strategy.assessment import StrategicRecommendation

    from wyz_analytics.ai_cfo.strategy.strategic_presentation import resolve_position_text



    thesis_raw = decision.thesis or StrategicThesisOutput()

    position_key = thesis_raw.position

    if position_key:

        position_key = resolve_position_text(position_key, fallback=thesis_raw.position)

    assessment.decision_thesis = DecisionThesis(

        position_key=position_key,

        basis_keys=list(thesis_raw.why_keys_or_evidence_ids)[:8],

        uncertainty_keys=list(thesis_raw.uncertainty_keys)[:8],

        next_step_action=thesis_raw.next_step_action or decision.selected_action,

        next_step_key=None,

        monitoring_metric_keys=list(thesis_raw.monitoring_metric_keys)[:8],

        basis_evidence_ids=list(decision.supporting_evidence_ids)[:5],

    )

    assessment.recommendation = StrategicRecommendation(

        action_type=decision.selected_action,

        subject=assessment.subject,

        strength=final_strength,

        rationale_evidence_ids=list(decision.supporting_evidence_ids)[:5],

        decision_confidence=final_confidence,

    )

    assessment.decision_confidence = final_confidence

    assessment.supporting_evidence_ids = list(decision.supporting_evidence_ids)[:8]

    assessment.recommendations_enabled = True

