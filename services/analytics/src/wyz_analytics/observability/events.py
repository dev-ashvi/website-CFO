"""Canonical ObservabilityEvent + ID helpers."""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

EVENT_VERSION = 1


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def new_event_id() -> str:
    return f"evt_{uuid.uuid4().hex[:16]}"


def new_request_id() -> str:
    return f"req_{uuid.uuid4().hex[:16]}"


def new_feedback_id() -> str:
    return f"fb_{uuid.uuid4().hex[:16]}"


@dataclass
class ObservabilityEvent:
    event_name: str
    component: str
    category: str
    severity: str = "INFO"
    event_id: str = field(default_factory=new_event_id)
    event_version: int = EVENT_VERSION
    timestamp: str = field(default_factory=utc_now_iso)
    request_id: str | None = None
    session_id: str | None = None
    conversation_id: str | None = None
    turn_id: str | None = None
    dataset_id: str | None = None
    job_id: str | None = None
    decision_id: str | None = None
    scope_hash: str | None = None
    duration_ms: int | None = None
    attributes: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        # Drop nulls for lean JSON lines.
        return {key: value for key, value in payload.items() if value is not None}
