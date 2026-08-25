"""Deterministic exact / alias column mapping."""

from __future__ import annotations

from wyz_analytics.ingest.models import FileProfile
from wyz_analytics.mapping.models import ColumnMapping, MappingOrigin, MappingStatus
from wyz_analytics.mapping.names import alias_index, normalize_name
from wyz_analytics.schemas.fields import CanonicalSchema, FieldDtype


_TYPE_COMPAT = {
    FieldDtype.UTF8: {"utf8", "int", "float", "date", "bool"},
    FieldDtype.FLOAT: {"float", "int"},
    FieldDtype.INT: {"int", "float"},
    FieldDtype.DATE: {"date", "utf8"},
    FieldDtype.BOOL: {"bool", "int", "utf8"},
}


def propose_deterministic_mappings(profile: FileProfile, schema: CanonicalSchema) -> list[ColumnMapping]:
    index = alias_index(schema)
    profile_by_name = {col.name: col for col in profile.columns}
    claimed: dict[str, ColumnMapping] = {}
    collisions: dict[str, list[str]] = {}

    for column in profile.columns:
        token = normalize_name(column.name)
        canonical = index.get(token)
        if not canonical:
            continue
        spec = schema.field(canonical)
        exact = token == normalize_name(spec.name)
        model = 0.99 if exact else 0.92
        compatible = column.inferred_type in _TYPE_COMPAT[spec.dtype]
        if not compatible:
            model *= 0.6
        mapping = ColumnMapping(
            source_column=column.name,
            canonical_field=canonical,
            origin=MappingOrigin.DETERMINISTIC,
            status=MappingStatus.PROPOSED,
            model_confidence=round(model, 4),
            evidence=(
                "exact_name" if exact else f"alias:{token}",
                f"type:{column.inferred_type}",
            ),
        )
        existing = claimed.get(canonical)
        if existing is None:
            claimed[canonical] = mapping
            continue
        collisions.setdefault(canonical, [existing.source_column]).append(column.name)
        if mapping.model_confidence > existing.model_confidence:
            mapping.alternatives = (existing.source_column,)
            claimed[canonical] = mapping
        else:
            existing.alternatives = existing.alternatives + (column.name,)

    for canonical, sources in collisions.items():
        mapping = claimed[canonical]
        mapping.model_confidence = round(min(mapping.model_confidence, 0.7), 4)
        mapping.evidence = mapping.evidence + ("ambiguous_source_columns",)
        mapping.alternatives = tuple(col for col in sources if col != mapping.source_column)

    for mapping in claimed.values():
        if not mapping.reason_code:
            mapping.reason_code = "exact_name" if "exact_name" in mapping.evidence else "alias"
    del profile_by_name
    return list(claimed.values())


def type_validation_confidence(inferred_type: str, dtype: FieldDtype) -> float:
    if inferred_type in _TYPE_COMPAT[dtype]:
        return 0.98
    return 0.35
