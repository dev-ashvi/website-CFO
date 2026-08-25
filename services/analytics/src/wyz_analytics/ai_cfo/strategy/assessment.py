"""StrategicAssessment, DecisionThesis, and related lean contracts."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType, CfoAction
from wyz_analytics.ai_cfo.strategy.confidence import (
    DecisionConfidence,
    DiagnosisConfidence,
    RecommendationStrength,
)
from wyz_analytics.ai_cfo.strategy.intent import DecisionType
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


@dataclass
class DecisionSubject:
    entity: str | None = None
    dimension: str | None = None  # channel | category | sku | population | None

    def to_dict(self) -> dict[str, Any]:
        return {"entity": self.entity, "dimension": self.dimension}


@dataclass
class FinancialDiagnosisRef:
    """Semantic diagnosis pointers — not raw financial values."""

    driver_stage: str | None = None
    insight_type: str | None = None
    summary_key: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DecisionThesis:
    """Internal reasoning skeleton: position / basis / uncertainty / next / monitor.

    Fields are semantic keys or short non-numeric statements — not fabricated facts.
    """

    position_key: str | None = None
    basis_keys: list[str] = field(default_factory=list)
    uncertainty_keys: list[str] = field(default_factory=list)
    next_step_action: ActionType | None = None
    next_step_key: str | None = None
    monitoring_metric_keys: list[str] = field(default_factory=list)
    # Optional evidence / action refs (IDs only)
    basis_evidence_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "position_key": self.position_key,
            "basis_keys": list(self.basis_keys),
            "uncertainty_keys": list(self.uncertainty_keys),
            "next_step_action": self.next_step_action.value if self.next_step_action else None,
            "next_step_key": self.next_step_key,
            "monitoring_metric_keys": list(self.monitoring_metric_keys),
            "basis_evidence_ids": list(self.basis_evidence_ids),
        }

    @staticmethod
    def from_dict(raw: dict[str, Any] | None) -> DecisionThesis | None:
        if not isinstance(raw, dict):
            return None
        next_action = None
        if raw.get("next_step_action"):
            try:
                next_action = ActionType(str(raw["next_step_action"]))
            except ValueError:
                next_action = None
        return DecisionThesis(
            position_key=_clip(raw.get("position_key"), 120),
            basis_keys=[_clip(x, 80) for x in (raw.get("basis_keys") or []) if x][:8],
            uncertainty_keys=[_clip(x, 80) for x in (raw.get("uncertainty_keys") or []) if x][:8],
            next_step_action=next_action,
            next_step_key=_clip(raw.get("next_step_key"), 120),
            monitoring_metric_keys=[_clip(x, 40) for x in (raw.get("monitoring_metric_keys") or []) if x][:8],
            basis_evidence_ids=[str(x) for x in (raw.get("basis_evidence_ids") or []) if x][:5],
        )


@dataclass
class StrategicRecommendation:
    """Typed recommendation slot — not activated for free recommendations in Phase 2A."""

    action_type: ActionType | None = None
    subject: DecisionSubject | None = None
    strength: RecommendationStrength | None = None
    rationale_evidence_ids: list[str] = field(default_factory=list)
    decision_confidence: DecisionConfidence | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_type": self.action_type.value if self.action_type else None,
            "subject": self.subject.to_dict() if self.subject else None,
            "strength": self.strength.value if self.strength else None,
            "rationale_evidence_ids": list(self.rationale_evidence_ids),
            "decision_confidence": self.decision_confidence.value if self.decision_confidence else None,
        }


@dataclass
class ScenarioRef:
    scope_hash: str
    lever: str | None = None
    operation: str | None = None
    value: float | None = None
    digest: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class StrategicAssessment:
    """Separate from InsightType — what we should consider doing about the diagnosis."""

    decision_type: DecisionType | None = None
    decision_question: str | None = None
    subject: DecisionSubject | None = None
    financial_diagnosis: FinancialDiagnosisRef | None = None
    diagnosis_confidence: DiagnosisConfidence | None = None
    decision_confidence: DecisionConfidence | None = None
    supporting_evidence_ids: list[str] = field(default_factory=list)
    material_drivers: list[str] = field(default_factory=list)
    candidate_actions: list[ActionType] = field(default_factory=list)
    recommendation: StrategicRecommendation | None = None
    decision_thesis: DecisionThesis | None = None
    assumptions: list[str] = field(default_factory=list)
    unknowns: list[StrategicUnknown] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    scenario_refs: list[ScenarioRef] = field(default_factory=list)
    next_actions: list[CfoAction] = field(default_factory=list)
    monitoring_metrics: list[str] = field(default_factory=list)
    scope_hash: str | None = None
    dataset_id: str | None = None
    # Control-plane metadata for 2A
    recommendations_enabled: bool = False
    strategy_mode: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_type": self.decision_type.value if self.decision_type else None,
            "decision_question": self.decision_question,
            "subject": self.subject.to_dict() if self.subject else None,
            "financial_diagnosis": self.financial_diagnosis.to_dict() if self.financial_diagnosis else None,
            "diagnosis_confidence": self.diagnosis_confidence.value if self.diagnosis_confidence else None,
            "decision_confidence": self.decision_confidence.value if self.decision_confidence else None,
            "supporting_evidence_ids": list(self.supporting_evidence_ids),
            "material_drivers": list(self.material_drivers),
            "candidate_actions": [a.value for a in self.candidate_actions],
            "recommendation": self.recommendation.to_dict() if self.recommendation else None,
            "decision_thesis": self.decision_thesis.to_dict() if self.decision_thesis else None,
            "assumptions": list(self.assumptions),
            "unknowns": [u.value for u in self.unknowns],
            "risks": list(self.risks),
            "scenario_refs": [r.to_dict() for r in self.scenario_refs],
            "next_actions": [a.to_dict() for a in self.next_actions],
            "monitoring_metrics": list(self.monitoring_metrics),
            "scope_hash": self.scope_hash,
            "dataset_id": self.dataset_id,
            "recommendations_enabled": bool(self.recommendations_enabled),
            "strategy_mode": self.strategy_mode,
        }

    def lean_conversation_dict(self) -> dict[str, Any]:
        """Bounded strategic memory for conversation turns — no prose blobs."""
        return {
            "decision_type": self.decision_type.value if self.decision_type else None,
            "subject": self.subject.to_dict() if self.subject else None,
            "prior_recommendation_action": (
                self.recommendation.action_type.value
                if self.recommendation and self.recommendation.action_type
                else None
            ),
            "recommendation_strength": (
                self.recommendation.strength.value
                if self.recommendation and self.recommendation.strength
                else None
            ),
            "diagnosis_confidence": self.diagnosis_confidence.value if self.diagnosis_confidence else None,
            "decision_confidence": self.decision_confidence.value if self.decision_confidence else None,
            "scenario_ref_digest": (self.scenario_refs[0].digest if self.scenario_refs else None),
            "unknowns": [u.value for u in self.unknowns][:6],
            "scope_hash": self.scope_hash,
        }


def empty_strategic_assessment(
    *,
    decision_type: DecisionType | None = None,
    decision_question: str | None = None,
    scope_hash: str | None = None,
    dataset_id: str | None = None,
    strategy_mode: str | None = None,
) -> StrategicAssessment:
    return StrategicAssessment(
        decision_type=decision_type,
        decision_question=decision_question,
        scope_hash=scope_hash,
        dataset_id=dataset_id,
        strategy_mode=strategy_mode,
        recommendations_enabled=False,
    )


def _clip(value: Any, max_len: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:max_len] if text else None
