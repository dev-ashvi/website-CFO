"""Serializable profiler / classifier payloads."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class ColumnProfile:
    name: str
    inferred_type: str
    null_pct: float
    unique_pct: float
    n_unique: int
    sample_values: list[Any]
    numeric_min: float | None = None
    numeric_max: float | None = None
    numeric_mean: float | None = None
    date_min: str | None = None
    date_max: str | None = None
    likely_identifier: bool = False
    likely_amount: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class FileProfile:
    filename: str
    path: str
    row_count: int
    column_count: int
    columns: list[ColumnProfile]
    sheet_name: str | None = None
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "path": self.path,
            "sheet_name": self.sheet_name,
            "row_count": self.row_count,
            "column_count": self.column_count,
            "columns": [col.to_dict() for col in self.columns],
            "errors": list(self.errors),
        }

    def column_names(self) -> list[str]:
        return [col.name for col in self.columns]


@dataclass
class RoleClassification:
    role: str
    confidence: float
    evidence: list[str]
    alternatives: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "confidence": self.confidence,
            "evidence": list(self.evidence),
            "alternatives": list(self.alternatives),
        }
