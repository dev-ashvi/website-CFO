"""Structured CFO signal models."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class CfoSignal:
    signal_type: str
    severity: str
    entity_type: str
    entity: str
    stage: str
    label: str
    evidence: dict[str, Any] = field(default_factory=dict)
    materiality: float = 0.0
    caveats: list[str] = field(default_factory=list)
    filters: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
