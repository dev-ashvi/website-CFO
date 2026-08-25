"""Compact mapping context. Never send whole files to a model."""

from __future__ import annotations

from wyz_analytics.ingest.models import FileProfile
from wyz_analytics.mapping.ai_contract import (
    CompactCanonicalField,
    CompactColumn,
    ConfirmedMappingHint,
    SchemaMappingRequest,
)
from wyz_analytics.mapping.models import ColumnMapping, MappingStatus
from wyz_analytics.schemas.fields import CanonicalSchema, FieldSupply

MAX_SAMPLES = 3
MAX_SAMPLE_CHARS = 32
MAX_CONFIRMED_HINTS = 12
MAX_DESCRIPTION = 160


def _sample_strings(values: list) -> tuple[str, ...]:
    out: list[str] = []
    for value in values:
        text = str(value)
        if len(text) > MAX_SAMPLE_CHARS:
            text = text[: MAX_SAMPLE_CHARS - 1] + "…"
        out.append(text)
        if len(out) >= MAX_SAMPLES:
            break
    return tuple(out)


def build_schema_mapping_request(
    profile: FileProfile,
    schema: CanonicalSchema,
    *,
    file_role: str,
    claimed: list[ColumnMapping],
) -> SchemaMappingRequest:
    claimed_sources = {item.source_column for item in claimed if item.status != MappingStatus.REJECTED}
    claimed_fields = {
        item.canonical_field
        for item in claimed
        if item.status not in {MappingStatus.REJECTED, MappingStatus.USER_CONFIRMATION_REQUIRED}
    }
    ambiguous_fields = {
        item.canonical_field
        for item in claimed
        if item.status == MappingStatus.USER_CONFIRMATION_REQUIRED
    }
    unresolved_fields = [
        spec
        for spec in schema.mappable_fields()
        if spec.supply != FieldSupply.ENGINE_CALCULATED
        and (spec.name not in claimed_fields or spec.name in ambiguous_fields)
    ]
    unresolved_names = [col.name for col in profile.columns if col.name not in claimed_sources]
    neighbour_index = {col.name: i for i, col in enumerate(profile.columns)}

    compact_cols: list[CompactColumn] = []
    for col in profile.columns:
        if col.name not in unresolved_names:
            continue
        idx = neighbour_index[col.name]
        nearby = tuple(
            profile.columns[j].name
            for j in range(max(0, idx - 2), min(len(profile.columns), idx + 3))
            if j != idx
        )
        compact_cols.append(
            CompactColumn(
                name=col.name,
                inferred_type=col.inferred_type,
                unique_pct=round(col.unique_pct, 4),
                null_pct=round(col.null_pct, 4),
                n_unique=col.n_unique,
                likely_identifier=col.likely_identifier,
                likely_amount=col.likely_amount,
                numeric_min=col.numeric_min,
                numeric_max=col.numeric_max,
                samples=_sample_strings(col.sample_values),
                neighbours=nearby,
            )
        )

    confirmed = [
        ConfirmedMappingHint(item.source_column, item.canonical_field, item.origin.value)
        for item in claimed
        if item.status in {MappingStatus.AUTO_ACCEPTED, MappingStatus.CONFIRMED}
    ][:MAX_CONFIRMED_HINTS]

    return SchemaMappingRequest(
        file_role=file_role,
        schema_description=schema.description,
        unresolved_source_columns=compact_cols,
        unresolved_canonical_fields=[
            CompactCanonicalField(
                name=spec.name,
                dtype=spec.dtype.value,
                supply=spec.supply.value,
                description=spec.description[:MAX_DESCRIPTION],
            )
            for spec in unresolved_fields
        ],
        confirmed_mappings=confirmed,
    )
