"""Phase 2 strategic control plane (contracts + diagnosis eligibility in 2B).

Python owns eligibility boundaries, severity, evidence burden, and confidence ceilings.
GPT-OSS will later exercise judgment inside those boundaries — not yet in 2B.
"""

from __future__ import annotations

from wyz_analytics.ai_cfo.strategy.actions import (
    ActionSeverity,
    ActionType,
    CfoAction,
    CfoActionType,
    EvidenceBurden,
    action_metadata,
    action_severity,
    evidence_burden_for,
    severity_rank,
)
from wyz_analytics.ai_cfo.strategy.assessment import (
    DecisionSubject,
    DecisionThesis,
    FinancialDiagnosisRef,
    StrategicAssessment,
    StrategicRecommendation,
    empty_strategic_assessment,
)
from wyz_analytics.ai_cfo.strategy.confidence import (
    DecisionConfidence,
    DiagnosisConfidence,
    RecommendationStrength,
    decision_confidence_not_raised_by_scenario,
)
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack, build_diagnosis_pack
from wyz_analytics.ai_cfo.strategy.eligibility import ActionEligibility, evaluate_action_eligibility
from wyz_analytics.ai_cfo.strategy.intent import (
    DecisionType,
    classify_decision_type,
    classify_strategic_intent,
)
from wyz_analytics.ai_cfo.strategy.mode import (
    STRATEGY_MODE_V1_BOUNDARY,
    STRATEGY_MODE_V2_PARTNER,
    is_v2_partner_mode,
    resolve_strategy_mode,
)
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown
from wyz_analytics.ai_cfo.strategy.validation import (
    StrategicValidationResult,
    validate_strategic_assessment,
)

__all__ = [
    "ActionEligibility",
    "ActionSeverity",
    "ActionType",
    "CfoAction",
    "CfoActionType",
    "DecisionConfidence",
    "DecisionSubject",
    "DecisionThesis",
    "DecisionType",
    "DiagnosisConfidence",
    "DiagnosisPack",
    "EvidenceBurden",
    "FinancialDiagnosisRef",
    "RecommendationStrength",
    "STRATEGY_MODE_V1_BOUNDARY",
    "STRATEGY_MODE_V2_PARTNER",
    "StrategicAssessment",
    "StrategicReasoningContract",
    "StrategicRecommendation",
    "StrategicUnknown",
    "StrategicValidationResult",
    "action_metadata",
    "action_severity",
    "build_diagnosis_pack",
    "build_strategic_control_plane",
    "classify_decision_type",
    "classify_strategic_intent",
    "decision_confidence_not_raised_by_scenario",
    "empty_strategic_assessment",
    "evaluate_action_eligibility",
    "evidence_burden_for",
    "is_v2_partner_mode",
    "resolve_strategy_mode",
    "severity_rank",
    "validate_strategic_assessment",
]
