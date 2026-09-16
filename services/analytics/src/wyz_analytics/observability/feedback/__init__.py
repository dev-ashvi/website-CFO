"""AI answer feedback models — identifiers + safe tuning metadata only."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from wyz_analytics.observability.events import new_feedback_id, utc_now_iso

RATINGS = frozenset({"USEFUL", "NOT_USEFUL"})
REASONS = frozenset(
    {
        "WRONG_NUMBERS",
        "WRONG_REASONING",
        "TOO_GENERIC",
        "MISSING_CONTEXT",
        "CONFUSING",
        "OTHER",
    }
)


@dataclass
class AiAnswerFeedback:
    feedback_id: str
    dataset_id: str
    turn_id: str
    rating: str
    created_at: str
    conversation_id: str | None = None
    scope_hash: str | None = None
    request_id: str | None = None
    reason: str | None = None
    answer_source: str | None = None
    decision_theme: str | None = None
    selected_action: str | None = None
    provider: str | None = None
    model: str | None = None

    def to_record(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> AiAnswerFeedback:
        return cls(
            feedback_id=str(payload["feedback_id"]),
            dataset_id=str(payload["dataset_id"]),
            turn_id=str(payload["turn_id"]),
            rating=str(payload["rating"]),
            created_at=str(payload.get("created_at") or utc_now_iso()),
            conversation_id=payload.get("conversation_id"),
            scope_hash=payload.get("scope_hash"),
            request_id=payload.get("request_id"),
            reason=payload.get("reason"),
            answer_source=payload.get("answer_source"),
            decision_theme=payload.get("decision_theme"),
            selected_action=payload.get("selected_action"),
            provider=payload.get("provider"),
            model=payload.get("model"),
        )


def build_feedback_record(
    *,
    dataset_id: str,
    turn_id: str,
    rating: str,
    reason: str | None = None,
    conversation_id: str | None = None,
    scope_hash: str | None = None,
    request_id: str | None = None,
    answer_source: str | None = None,
    decision_theme: str | None = None,
    selected_action: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> AiAnswerFeedback:
    rating_norm = str(rating or "").strip().upper()
    if rating_norm not in RATINGS:
        raise ValueError(f"Invalid rating: {rating}")
    reason_norm = None
    if reason is not None and str(reason).strip():
        reason_norm = str(reason).strip().upper()
        if reason_norm not in REASONS:
            raise ValueError(f"Invalid reason: {reason}")
    if rating_norm == "USEFUL":
        reason_norm = None
    return AiAnswerFeedback(
        feedback_id=new_feedback_id(),
        dataset_id=dataset_id,
        turn_id=str(turn_id).strip(),
        rating=rating_norm,
        created_at=utc_now_iso(),
        conversation_id=conversation_id,
        scope_hash=scope_hash,
        request_id=request_id,
        reason=reason_norm,
        answer_source=answer_source,
        decision_theme=decision_theme,
        selected_action=selected_action,
        provider=provider,
        model=model,
    )
