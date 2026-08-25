"""Strategic model output contract (Phase 2C) — judgment, not financial numbers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.json_parse import try_parse_structured_json
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence, RecommendationStrength
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


@dataclass
class StrategicThesisOutput:
    position: str | None = None
    why_keys_or_evidence_ids: list[str] = field(default_factory=list)
    uncertainty_keys: list[str] = field(default_factory=list)
    next_step_action: ActionType | None = None
    monitoring_metric_keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "position": self.position,
            "why_keys_or_evidence_ids": list(self.why_keys_or_evidence_ids),
            "uncertainty_keys": list(self.uncertainty_keys),
            "next_step_action": self.next_step_action.value if self.next_step_action else None,
            "monitoring_metric_keys": list(self.monitoring_metric_keys),
        }


@dataclass
class StrategicModelDecision:
    selected_action: ActionType | None = None
    recommendation_strength: RecommendationStrength | None = None
    decision_confidence: DecisionConfidence | None = None
    thesis: StrategicThesisOutput | None = None
    supporting_evidence_ids: list[str] = field(default_factory=list)
    tradeoff_keys: list[str] = field(default_factory=list)
    primary_reason_key: str | None = None
    change_my_view_keys: list[str] = field(default_factory=list)
    priority_candidate_id: str | None = None
    rationale: str | None = None
    optional_alternative_action: ActionType | None = None
    scenario_ref_digest: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "selected_action": self.selected_action.value if self.selected_action else None,
            "recommendation_strength": (
                self.recommendation_strength.value if self.recommendation_strength else None
            ),
            "decision_confidence": self.decision_confidence.value if self.decision_confidence else None,
            "thesis": self.thesis.to_dict() if self.thesis else None,
            "supporting_evidence_ids": list(self.supporting_evidence_ids),
            "tradeoff_keys": list(self.tradeoff_keys),
            "primary_reason_key": self.primary_reason_key,
            "change_my_view_keys": list(self.change_my_view_keys),
            "priority_candidate_id": self.priority_candidate_id,
            "rationale": self.rationale,
            "optional_alternative_action": (
                self.optional_alternative_action.value if self.optional_alternative_action else None
            ),
            "scenario_ref_digest": self.scenario_ref_digest,
        }


def _parse_action(raw: Any) -> ActionType | None:
    if raw is None:
        return None
    try:
        return ActionType(str(raw).strip().upper())
    except ValueError:
        return None


def _parse_strength(raw: Any) -> RecommendationStrength | None:
    if raw is None:
        return None
    try:
        return RecommendationStrength(str(raw).strip().upper())
    except ValueError:
        return None


def _parse_decision_confidence(raw: Any) -> DecisionConfidence | None:
    if raw is None:
        return None
    try:
        return DecisionConfidence(str(raw).strip().upper())
    except ValueError:
        return None


def parse_strategic_model_decision(raw: Any) -> StrategicModelDecision | None:
    """Parse provider/fake strategic JSON into StrategicModelDecision."""
    if isinstance(raw, StrategicModelDecision):
        return raw
    payload: dict[str, Any] | None
    if isinstance(raw, dict):
        payload = raw.get("strategic") if isinstance(raw.get("strategic"), dict) else raw
    else:
        payload = try_parse_structured_json(raw)
    if not isinstance(payload, dict):
        return None
    payload = {k: v for k, v in payload.items() if not str(k).startswith("_")}

    thesis_raw = payload.get("thesis") if isinstance(payload.get("thesis"), dict) else {}
    thesis = StrategicThesisOutput(
        position=_clip_str(
            thesis_raw.get("position")
            or payload.get("position")
            or payload.get("position_key"),
            400,
        ),
        why_keys_or_evidence_ids=_clip_list(
            thesis_raw.get("why_keys_or_evidence_ids")
            or thesis_raw.get("basis_keys")
            or payload.get("why_keys_or_evidence_ids"),
            8,
        ),
        uncertainty_keys=_clip_list(
            thesis_raw.get("uncertainty_keys") or payload.get("uncertainty_keys") or payload.get("unknowns"),
            8,
        ),
        next_step_action=_parse_action(
            thesis_raw.get("next_step_action") or payload.get("next_step_action") or payload.get("next")
        ),
        monitoring_metric_keys=_clip_list(
            thesis_raw.get("monitoring_metric_keys")
            or payload.get("monitoring_metric_keys")
            or payload.get("monitor"),
            8,
        ),
    )

    return StrategicModelDecision(
        selected_action=_parse_action(payload.get("selected_action") or payload.get("action")),
        recommendation_strength=_parse_strength(
            payload.get("recommendation_strength") or payload.get("strength")
        ),
        decision_confidence=_parse_decision_confidence(
            payload.get("decision_confidence") or payload.get("confidence")
        ),
        thesis=thesis,
        supporting_evidence_ids=_clip_list(
            payload.get("supporting_evidence_ids") or payload.get("evidence"),
            8,
        ),
        tradeoff_keys=_clip_list(payload.get("tradeoff_keys"), 6),
        primary_reason_key=_clip_str(payload.get("primary_reason_key"), 80),
        change_my_view_keys=_clip_list(payload.get("change_my_view_keys") or payload.get("change_view"), 4),
        priority_candidate_id=_clip_str(
            payload.get("priority_candidate_id") or payload.get("priority") or payload.get("priority_id"),
            80,
        ),
        rationale=_clip_str(payload.get("rationale") or payload.get("reason"), 400),
        optional_alternative_action=_parse_action(payload.get("optional_alternative_action")),
        scenario_ref_digest=_clip_str(payload.get("scenario_ref_digest"), 80),
    )


def _clip_str(value: Any, max_len: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:max_len] if text else None


def _clip_list(value: Any, max_items: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if item is None:
            continue
        text = str(item).strip()
        if text:
            out.append(text[:120])
        if len(out) >= max_items:
            break
    return out


def allowed_unknown_keys(unknowns: list[StrategicUnknown]) -> set[str]:
    return {u.value for u in unknowns}
