"""Serialize mapping configuration without financial calculations."""

from __future__ import annotations

from pathlib import Path

from wyz_analytics.mapping.models import (
    ColumnMapping,
    FileMappingResult,
    MappingConfiguration,
    MappingOrigin,
    MappingStatus,
    MethodologySelections,
)


def mapping_config_from_dict(payload: dict | None) -> MappingConfiguration | None:
    if not payload:
        return None
    methodology_raw = payload.get("methodology") or {}
    methodology = MethodologySelections(
        platform_to_channel=dict(methodology_raw.get("platform_to_channel") or {}),
        cancelled_status_value=methodology_raw.get("cancelled_status_value") or "Cancelled",
        all_categories_token=methodology_raw.get("all_categories_token") or "All Categories",
        date_formats=tuple(methodology_raw.get("date_formats") or MethodologySelections().date_formats),
    )
    file_mappings = []
    for item in payload.get("file_mappings") or []:
        mappings = [
            ColumnMapping(
                source_column=row["source_column"],
                canonical_field=row["canonical_field"],
                origin=MappingOrigin(row.get("origin") or MappingOrigin.DETERMINISTIC.value),
                status=MappingStatus(row.get("status") or MappingStatus.PROPOSED.value),
                model_confidence=float(row.get("model_confidence") or 0.0),
                validation_confidence=row.get("validation_confidence"),
                final_confidence=float(row.get("final_confidence") or 0.0),
                evidence=tuple(row.get("evidence") or ()),
                alternatives=tuple(row.get("alternatives") or ()),
                reason_code=str(row.get("reason_code") or ""),
            )
            for row in item.get("mappings") or []
        ]
        file_mappings.append(
            FileMappingResult(
                source_file=item.get("source_file") or "",
                file_role=item.get("file_role") or "",
                confidence=float(item.get("confidence") or 0.0),
                mappings=mappings,
                unmapped_source_columns=list(item.get("unmapped_source_columns") or []),
                missing_required_fields=list(item.get("missing_required_fields") or []),
                role_evidence=list(item.get("role_evidence") or []),
                alternative_roles=list(item.get("alternative_roles") or []),
                grain=dict(item.get("grain") or {}),
                validation=dict(item.get("validation") or {}),
                diagnostics=list(item.get("diagnostics") or []),
            )
        )
    return MappingConfiguration(
        tenant_id=payload.get("tenant_id"),
        workspace_id=payload.get("workspace_id"),
        source_type=payload.get("source_type") or "commerce_finance",
        mapping_version=payload.get("mapping_version") or "v1",
        file_mappings=file_mappings,
        derived_fields=dict(payload.get("derived_fields") or {}),
        methodology=methodology,
        created_at=payload.get("created_at") or "",
        notes=payload.get("notes") or "",
    )


def merge_confirmations(existing: list[dict[str, str]], incoming: list[dict[str, str]]) -> list[dict[str, str]]:
    merged = {(item["source_file"], item["source_column"]): item for item in existing}
    for item in incoming:
        merged[(item["source_file"], item["source_column"])] = item
    return list(merged.values())


def apply_confirmations(
    file_mappings: list[FileMappingResult],
    confirmations: list[dict[str, str]],
) -> list[FileMappingResult]:
    for item in confirmations:
        source_file = item["source_file"]
        source_column = item["source_column"]
        canonical_field = item["canonical_field"]
        for mapping in file_mappings:
            names = {mapping.source_file, Path(mapping.source_file).name}
            if source_file not in names:
                continue
            mapping.mappings = [
                row
                for row in mapping.mappings
                if row.source_column != source_column and row.canonical_field != canonical_field
            ]
            mapping.mappings.append(
                ColumnMapping(
                    source_column=source_column,
                    canonical_field=canonical_field,
                    origin=MappingOrigin.USER_CONFIRMED,
                    status=MappingStatus.CONFIRMED,
                    model_confidence=1.0,
                    validation_confidence=1.0,
                    final_confidence=1.0,
                    evidence=("user_confirmed",),
                    reason_code="user_confirmed",
                )
            )
    return file_mappings
