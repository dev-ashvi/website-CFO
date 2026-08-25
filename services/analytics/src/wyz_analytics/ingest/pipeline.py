"""Client-agnostic ingest pipeline around the existing financial engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

import polars as pl

from wyz_analytics.contracts.columns import SourceTables
from wyz_analytics.ingest.classify import CompositeRoleClassifier, RoleClassifier
from wyz_analytics.ingest.loader import load_tabular
from wyz_analytics.ingest.models import FileProfile, RoleClassification
from wyz_analytics.ingest.profiler import profile_frame
from wyz_analytics.mapping.ai_contract import SchemaMappingModel
from wyz_analytics.mapping.confidence import ConfidencePolicy, combine_confidence, status_for_confidence
from wyz_analytics.mapping.diagnostics import mapping_diagnostic, review_reason
from wyz_analytics.mapping.models import (
    ColumnMapping,
    FileMappingResult,
    MappingConfiguration,
    MappingOrigin,
    MappingStatus,
    MethodologySelections,
)
from wyz_analytics.mapping.propose import propose_file_mapping, refresh_required_coverage
from wyz_analytics.schemas.catalogs import schema_for
from wyz_analytics.schemas.roles import ENGINE_ROLES, FileRole
from wyz_analytics.transform.apply import TransformError, apply_mapping
from wyz_analytics.transform import assemble_source_tables
from wyz_analytics.validation.grain import detect_grain
from wyz_analytics.validation.joins import join_coverage
from wyz_analytics.validation.relationships import financial_relationships


@dataclass
class IngestionResult:
    profiles: list[FileProfile]
    classifications: list[RoleClassification]
    file_mappings: list[FileMappingResult]
    mapping_config: MappingConfiguration
    sources: SourceTables | None
    validation: dict[str, Any]
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "profiles": [item.to_dict() for item in self.profiles],
            "classifications": [item.to_dict() for item in self.classifications],
            "file_mappings": [item.to_dict() for item in self.file_mappings],
            "mapping_config": self.mapping_config.to_dict(),
            "validation": self.validation,
            "errors": list(self.errors),
            "ready_for_engine": self.sources is not None and not self.errors,
        }


def ingest_tabular_files(
    paths: Sequence[str | Path],
    *,
    methodology: MethodologySelections | None = None,
    mapping_config: MappingConfiguration | None = None,
    classifier: RoleClassifier | None = None,
    policy: ConfidencePolicy | None = None,
    mapping_model: SchemaMappingModel | None = None,
    tenant_id: str | None = None,
    workspace_id: str | None = None,
) -> IngestionResult:
    loaded: list[tuple[Path, pl.DataFrame, str | None]] = []
    errors: list[str] = []
    for path in paths:
        file_path = Path(path)
        try:
            frame, sheet = load_tabular(file_path)
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))
            continue
        if frame.height == 0:
            errors.append(f"{file_path.name} has no data rows")
            continue
        loaded.append((file_path, frame, sheet))
    return ingest_loaded_tables(
        loaded,
        methodology=methodology,
        mapping_config=mapping_config,
        classifier=classifier,
        policy=policy,
        mapping_model=mapping_model,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        errors=errors,
    )


def ingest_loaded_tables(
    tables: Sequence[tuple[str | Path, pl.DataFrame] | tuple[str | Path, pl.DataFrame, str | None]],
    *,
    methodology: MethodologySelections | None = None,
    mapping_config: MappingConfiguration | None = None,
    classifier: RoleClassifier | None = None,
    policy: ConfidencePolicy | None = None,
    mapping_model: SchemaMappingModel | None = None,
    tenant_id: str | None = None,
    workspace_id: str | None = None,
    errors: list[str] | None = None,
) -> IngestionResult:
    classifier = classifier or CompositeRoleClassifier()
    method = methodology or (mapping_config.methodology if mapping_config else MethodologySelections())
    profiles: list[FileProfile] = []
    classifications: list[RoleClassification] = []
    raw_frames: dict[str, pl.DataFrame] = {}
    errors = list(errors or [])

    for table in tables:
        if len(table) == 2:
            path, frame = table
            sheet = None
        else:
            path, frame, sheet = table
        file_path = Path(path)
        if frame.height == 0:
            errors.append(f"{file_path.name} has no data rows")
            continue
        profile = profile_frame(frame, path=file_path, sheet_name=sheet)
        classification = classifier.classify(profile)
        profiles.append(profile)
        classifications.append(classification)
        raw_frames[str(file_path)] = frame

    stored_by_role = {
        item.file_role: item
        for item in (mapping_config.file_mappings if mapping_config else [])
    }
    file_mappings: list[FileMappingResult] = []
    role_to_path: dict[FileRole, Path] = {}

    for profile, classification in zip(profiles, classifications):
        prior = _prior_mappings(stored_by_role.get(classification.role))
        mapping = propose_file_mapping(
            profile,
            classification,
            policy=policy,
            mapping_model=mapping_model,
            prior_mappings=prior,
        )
        file_mappings.append(mapping)
        if mapping.file_role in {role.value for role in ENGINE_ROLES} and mapping.file_role != FileRole.UNKNOWN.value:
            role = FileRole(mapping.file_role)
            if role in role_to_path:
                errors.append(f"Duplicate classified role {role.value}")
            else:
                role_to_path[role] = Path(profile.path)

    raw_by_role: dict[FileRole, pl.DataFrame] = {}
    mapping_by_role: dict[FileRole, FileMappingResult] = {}
    for mapping in file_mappings:
        if mapping.file_role == FileRole.UNKNOWN.value:
            continue
        role = FileRole(mapping.file_role)
        path = role_to_path.get(role)
        if path is None:
            continue
        raw_by_role[role] = raw_frames[str(path)]
        mapping_by_role[role] = mapping

    validation = _validate_bundle(raw_by_role, mapping_by_role)
    _overlay_join_confidence(mapping_by_role, validation.get("joins", []), policy=policy)
    for mapping in file_mappings:
        refresh_required_coverage(mapping)

    sources = None
    missing_roles = [role.value for role in ENGINE_ROLES if role not in mapping_by_role]
    missing_required = [
        f"{mapping.file_role}:{field}"
        for mapping in file_mappings
        for field in mapping.missing_required_fields
    ]
    if missing_roles:
        errors.append("Missing file roles: " + ", ".join(missing_roles))
    if missing_required:
        errors.append("Missing required mappings: " + ", ".join(missing_required))

    if not missing_roles and not missing_required:
        try:
            sources = _transform_bundle(raw_by_role, mapping_by_role, method)
        except TransformError as exc:
            errors.append(str(exc))

    config = MappingConfiguration(
        tenant_id=tenant_id or (mapping_config.tenant_id if mapping_config else None),
        workspace_id=workspace_id or (mapping_config.workspace_id if mapping_config else None),
        file_mappings=file_mappings,
        methodology=method,
        notes="Generated by ingest; AI proposals are never financial calculations.",
    )
    return IngestionResult(
        profiles=profiles,
        classifications=classifications,
        file_mappings=file_mappings,
        mapping_config=config,
        sources=sources,
        validation=validation,
        errors=errors,
    )


def _prior_mappings(stored: FileMappingResult | None) -> list[ColumnMapping] | None:
    if stored is None:
        return None
    priors: list[ColumnMapping] = []
    for item in stored.mappings:
        origin = item.origin
        if origin not in {MappingOrigin.USER_CONFIRMED, MappingOrigin.REMEMBERED}:
            origin = MappingOrigin.REMEMBERED
        priors.append(
            ColumnMapping(
                source_column=item.source_column,
                canonical_field=item.canonical_field,
                origin=origin,
                status=item.status,
                model_confidence=item.model_confidence,
                validation_confidence=item.validation_confidence,
                final_confidence=item.final_confidence,
                evidence=item.evidence + ("remembered_mapping",) if "remembered_mapping" not in item.evidence else item.evidence,
                alternatives=item.alternatives,
                reason_code=item.reason_code or "remembered_mapping",
            )
        )
    return priors


def _accepted(mapping: FileMappingResult) -> dict[str, str]:
    return mapping.accepted_mapping_dict()


def _source_for(mapping: FileMappingResult, canonical: str) -> str | None:
    for item in mapping.mappings:
        if item.canonical_field == canonical and item.status not in {
            MappingStatus.REJECTED,
        }:
            if item.status == MappingStatus.USER_CONFIRMATION_REQUIRED:
                continue
            return item.source_column
    return None


def _validate_bundle(
    raw_by_role: dict[FileRole, pl.DataFrame],
    mapping_by_role: dict[FileRole, FileMappingResult],
) -> dict[str, Any]:
    grains = {}
    relationships = {}
    for role, frame in raw_by_role.items():
        mapping = mapping_by_role[role]
        accepted = _accepted(mapping)
        grain = detect_grain(frame, accepted)
        mapping.grain = grain
        expected = schema_for(role).expected_grain
        grain["expected_grain"] = expected
        grain["matches_expected"] = grain["estimated_grain"] == expected
        grains[role.value] = grain
        rel = financial_relationships(frame, accepted)
        mapping.validation = {"relationships": rel}
        relationships[role.value] = rel

    joins = []
    if FileRole.ORDER_LINES in raw_by_role and FileRole.SKU_MASTER in raw_by_role:
        left_key = _source_for(mapping_by_role[FileRole.ORDER_LINES], "sku_id")
        right_key = _source_for(mapping_by_role[FileRole.SKU_MASTER], "sku_id")
        if left_key and right_key:
            joins.append(
                join_coverage(
                    raw_by_role[FileRole.ORDER_LINES],
                    raw_by_role[FileRole.SKU_MASTER],
                    left_key=left_key,
                    right_key=right_key,
                    name="order_lines.sku_id→sku_master.sku_id",
                    left_cardinality="many",
                    right_cardinality="one",
                )
            )
    if FileRole.ORDER_LINES in raw_by_role and FileRole.CHANNEL_SETTLEMENTS in raw_by_role:
        left_key = _source_for(mapping_by_role[FileRole.ORDER_LINES], "order_id")
        right_key = _source_for(mapping_by_role[FileRole.CHANNEL_SETTLEMENTS], "order_id")
        if left_key and right_key:
            joins.append(
                join_coverage(
                    raw_by_role[FileRole.ORDER_LINES],
                    raw_by_role[FileRole.CHANNEL_SETTLEMENTS],
                    left_key=left_key,
                    right_key=right_key,
                    name="order_lines.order_id→settlements.order_id",
                    left_cardinality="many",
                    right_cardinality="one",
                )
            )
    return {"grains": grains, "relationships": relationships, "joins": joins}


def _overlay_join_confidence(
    mapping_by_role: dict[FileRole, FileMappingResult],
    joins: list[dict[str, Any]],
    *,
    policy: ConfidencePolicy | None = None,
) -> None:
    lookup = {item["name"]: item for item in joins}
    pairs = [
        (FileRole.ORDER_LINES, "sku_id", "order_lines.sku_id→sku_master.sku_id", "left"),
        (FileRole.SKU_MASTER, "sku_id", "order_lines.sku_id→sku_master.sku_id", "right"),
        (FileRole.ORDER_LINES, "order_id", "order_lines.order_id→settlements.order_id", "left"),
        (FileRole.CHANNEL_SETTLEMENTS, "order_id", "order_lines.order_id→settlements.order_id", "right"),
    ]
    locked = {MappingOrigin.USER_CONFIRMED, MappingOrigin.REMEMBERED}
    for role, field, join_name, side in pairs:
        report = lookup.get(join_name)
        mapping = mapping_by_role.get(role)
        if not report or not mapping:
            continue
        match_pct = float(report.get("match_pct") or 0.0)
        duplicate_keys = int(report.get(f"{side}_duplicate_keys") or 0)
        unique_side = side == "right" and report.get("right_cardinality") == "one"
        for item in mapping.mappings:
            if item.canonical_field != field:
                continue
            validation = match_pct
            if unique_side and duplicate_keys > 0:
                validation = min(validation, 0.4)
            item.validation_confidence = validation
            item.final_confidence = combine_confidence(item.model_confidence, item.validation_confidence, policy)
            rejected = item.validation_confidence < 0.5 and item.origin not in locked
            item.status = status_for_confidence(
                item.final_confidence,
                origin=item.origin,
                rejected=rejected,
                policy=policy,
            )
            detail = review_reason(item)
            if unique_side and duplicate_keys > 0:
                detail = "duplicate_key_grain_failure"
            elif match_pct < 0.5:
                detail = "low_join_coverage"
            mapping.diagnostics.append(mapping_diagnostic(item, detail))


def _transform_bundle(
    raw_by_role: dict[FileRole, pl.DataFrame],
    mapping_by_role: dict[FileRole, FileMappingResult],
    methodology: MethodologySelections,
) -> SourceTables:
    canonical: dict[FileRole, pl.DataFrame] = {}
    for role, frame in raw_by_role.items():
        mapping = mapping_by_role[role]
        accepted = _accepted(mapping)
        if not accepted:
            raise TransformError(f"No accepted mappings for {role.value}")
        canonical[role] = apply_mapping(
            frame,
            accepted,
            schema_for(role),
            date_formats=tuple(methodology.date_formats),
        )
    return assemble_source_tables(canonical)
