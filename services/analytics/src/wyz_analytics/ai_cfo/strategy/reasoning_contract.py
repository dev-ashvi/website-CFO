"""Future GPT-OSS strategic reasoning boundary (prepared in 2A, not activated)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.assessment import FinancialDiagnosisRef
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence, DiagnosisConfidence
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


@dataclass
class StrategicReasoningContract:
    """What Python will provide to the model in later phases.

    Model may choose among allowed_actions only.
    Python validates selection against ceilings and evidence.
    """

    verified_diagnosis: FinancialDiagnosisRef | None = None
    allowed_actions: list[ActionType] = field(default_factory=list)
    forbidden_actions: list[ActionType] = field(default_factory=list)
    diagnosis_confidence: DiagnosisConfidence | None = None
    decision_confidence_ceiling: DecisionConfidence | None = None
    unknowns: list[StrategicUnknown] = field(default_factory=list)
    evidence_ids: list[str] = field(default_factory=list)
    scenario_refs: list[dict[str, Any]] = field(default_factory=list)
    recommendations_enabled: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "verified_diagnosis": self.verified_diagnosis.to_dict() if self.verified_diagnosis else None,
            "allowed_actions": [a.value for a in self.allowed_actions],
            "forbidden_actions": [a.value for a in self.forbidden_actions],
            "diagnosis_confidence": self.diagnosis_confidence.value if self.diagnosis_confidence else None,
            "decision_confidence_ceiling": (
                self.decision_confidence_ceiling.value if self.decision_confidence_ceiling else None
            ),
            "unknowns": [u.value for u in self.unknowns],
            "evidence_ids": list(self.evidence_ids),
            "scenario_refs": list(self.scenario_refs),
            "recommendations_enabled": bool(self.recommendations_enabled),
        }
