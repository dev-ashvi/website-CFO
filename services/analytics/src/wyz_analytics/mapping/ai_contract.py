"""Provider-neutral schema mapping model. No financial calculations."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Protocol

from wyz_analytics.mapping.models import MappingOrigin


@dataclass(frozen=True)
class CompactColumn:
    name: str
    inferred_type: str
    unique_pct: float
    null_pct: float
    n_unique: int
    likely_identifier: bool
    likely_amount: bool
    numeric_min: float | None = None
    numeric_max: float | None = None
    samples: tuple[str, ...] = ()
    neighbours: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CompactCanonicalField:
    name: str
    dtype: str
    supply: str
    description: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ConfirmedMappingHint:
    source_column: str
    canonical_field: str
    origin: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SchemaMappingRequest:
    file_role: str
    schema_description: str
    unresolved_source_columns: list[CompactColumn] = field(default_factory=list)
    unresolved_canonical_fields: list[CompactCanonicalField] = field(default_factory=list)
    confirmed_mappings: list[ConfirmedMappingHint] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_role": self.file_role,
            "schema_description": self.schema_description,
            "unresolved_source_columns": [item.to_dict() for item in self.unresolved_source_columns],
            "unresolved_canonical_fields": [item.to_dict() for item in self.unresolved_canonical_fields],
            "confirmed_mappings": [item.to_dict() for item in self.confirmed_mappings],
        }


@dataclass
class SchemaMappingProposal:
    source_column: str
    canonical_field: str
    model_confidence: float
    reason_code: str
    alternatives: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_column": self.source_column,
            "canonical_field": self.canonical_field,
            "model_confidence": self.model_confidence,
            "reason_code": self.reason_code,
            "alternatives": list(self.alternatives),
        }


@dataclass
class SchemaMappingResponse:
    mappings: list[SchemaMappingProposal] = field(default_factory=list)
    unmapped_source_columns: list[str] = field(default_factory=list)
    unresolved_required_fields: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "mappings": [item.to_dict() for item in self.mappings],
            "unmapped_source_columns": list(self.unmapped_source_columns),
            "unresolved_required_fields": list(self.unresolved_required_fields),
        }


class SchemaMappingModel(Protocol):
    """LLM or fake mapper. Must return SchemaMappingResponse, never financial numbers."""

    origin: MappingOrigin

    def propose(self, request: SchemaMappingRequest) -> SchemaMappingResponse:
        ...


class NullSchemaMappingModel:
    origin = MappingOrigin.AI_PROPOSED

    def propose(self, request: SchemaMappingRequest) -> SchemaMappingResponse:
        return SchemaMappingResponse(
            unmapped_source_columns=[col.name for col in request.unresolved_source_columns],
            unresolved_required_fields=[
                field.name for field in request.unresolved_canonical_fields if field.supply == "required_source"
            ],
        )


# Backward-compatible name used by earlier ingestion code.
NullAiMappingProposer = NullSchemaMappingModel
MappingProposer = SchemaMappingModel
