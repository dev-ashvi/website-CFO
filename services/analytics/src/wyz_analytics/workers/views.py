"""Dataset/mapping views for the SPA. No financial calculations."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from wyz_analytics.mapping.models import MappingStatus
from wyz_analytics.schemas.catalogs import SCHEMAS_BY_ROLE, schema_for
from wyz_analytics.schemas.fields import FieldSupply
from wyz_analytics.schemas.roles import FileRole

ROLE_LABELS = {
    FileRole.ORDER_LINES.value: "Orders detected",
    FileRole.SKU_MASTER.value: "Product / COGS detected",
    FileRole.CHANNEL_SETTLEMENTS.value: "Channel settlements detected",
    FileRole.MARKETING_SPEND.value: "Marketing spend detected",
    FileRole.UNKNOWN.value: "Unrecognised file",
}

ATTENTION_STATUSES = {
    MappingStatus.REVIEW_RECOMMENDED.value,
    MappingStatus.USER_CONFIRMATION_REQUIRED.value,
    MappingStatus.REJECTED.value,
}


def canonical_fields_catalog() -> dict[str, list[dict[str, str]]]:
    catalog: dict[str, list[dict[str, str]]] = {}
    for role, schema in SCHEMAS_BY_ROLE.items():
        catalog[role.value] = [
            {
                "name": spec.name,
                "description": spec.description,
                "supply": spec.supply.value,
            }
            for spec in schema.mappable_fields()
            if spec.supply in {FieldSupply.REQUIRED_SOURCE, FieldSupply.OPTIONAL_SOURCE}
        ]
    return catalog


def date_span(profile) -> dict[str, str | None]:
    mins = [col.date_min for col in profile.columns if col.date_min]
    maxs = [col.date_max for col in profile.columns if col.date_max]
    return {"date_min": min(mins) if mins else None, "date_max": max(maxs) if maxs else None}


def file_views(ingest) -> list[dict[str, Any]]:
    by_name = {item.filename: item for item in ingest.profiles}
    class_by_name = {Path(p.path).name: c for p, c in zip(ingest.profiles, ingest.classifications)}
    views = []
    for mapping in ingest.file_mappings:
        profile = by_name.get(mapping.source_file) or next(
            (item for item in ingest.profiles if Path(item.path).name == mapping.source_file),
            None,
        )
        classification = class_by_name.get(mapping.source_file)
        span = date_span(profile) if profile else {"date_min": None, "date_max": None}
        views.append(
            {
                "filename": mapping.source_file,
                "file_role": mapping.file_role,
                "label": ROLE_LABELS.get(mapping.file_role, mapping.file_role),
                "role_confidence": mapping.confidence,
                "row_count": profile.row_count if profile else None,
                "date_min": span["date_min"],
                "date_max": span["date_max"],
                "missing_required_fields": list(mapping.missing_required_fields),
                "classification_evidence": list(classification.evidence) if classification else [],
            }
        )
    return views


def mapping_rows(ingest) -> list[dict[str, Any]]:
    rows = []
    for mapping in ingest.file_mappings:
        for item in mapping.mappings:
            rows.append(
                {
                    "source_file": mapping.source_file,
                    "file_role": mapping.file_role,
                    "source_column": item.source_column,
                    "canonical_field": item.canonical_field,
                    "origin": item.origin.value,
                    "status": item.status.value,
                    "model_confidence": item.model_confidence,
                    "validation_confidence": item.validation_confidence,
                    "final_confidence": item.final_confidence,
                    "reason_code": item.reason_code,
                    "alternatives": list(item.alternatives),
                    "needs_attention": item.status.value in ATTENTION_STATUSES,
                }
            )
    return rows


def readiness(ingest) -> dict[str, Any]:
    joins = list(ingest.validation.get("joins") or [])
    grains = ingest.validation.get("grains") or {}
    relationships = ingest.validation.get("relationships") or {}
    missing = [
        f"{mapping.file_role}:{field}"
        for mapping in ingest.file_mappings
        for field in mapping.missing_required_fields
    ]
    grain_warnings = [
        {
            "role": role,
            "estimated_grain": payload.get("estimated_grain"),
            "expected_grain": payload.get("expected_grain"),
            "matches_expected": payload.get("matches_expected"),
        }
        for role, payload in grains.items()
        if payload.get("matches_expected") is False
    ]
    relationship_warnings = [
        item
        for items in relationships.values()
        for item in items
        if not item.get("ok")
    ]
    duplicate_key_issues = [
        {
            "name": item.get("name"),
            "left_duplicate_keys": item.get("left_duplicate_keys"),
            "right_duplicate_keys": item.get("right_duplicate_keys"),
            "unexpected_duplicate_keys": item.get("unexpected_duplicate_keys"),
        }
        for item in joins
        if not item.get("cardinality_ok", True) and int(item.get("unexpected_duplicate_keys") or 0) > 0
    ]
    return {
        "joins": joins,
        "missing_required_fields": missing,
        "grain_warnings": grain_warnings,
        "relationship_warnings": relationship_warnings,
        "duplicate_key_issues": duplicate_key_issues,
        "ingest_errors": list(ingest.errors),
        "ready_for_engine": ingest.sources is not None and not ingest.errors and not missing,
    }


def needs_mapping_review(ingest) -> bool:
    for mapping in ingest.file_mappings:
        if mapping.missing_required_fields:
            return True
        required = set()
        if mapping.file_role != FileRole.UNKNOWN.value:
            required = set(schema_for(FileRole(mapping.file_role)).required_fields())
        for item in mapping.mappings:
            if item.status == MappingStatus.USER_CONFIRMATION_REQUIRED:
                return True
            if item.status == MappingStatus.REJECTED and item.canonical_field in required:
                return True
    return False
