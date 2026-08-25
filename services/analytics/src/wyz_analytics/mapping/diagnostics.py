"""Structured mapping diagnostics. Never include raw datasets or long sample lists."""

from __future__ import annotations

from typing import Any

from wyz_analytics.mapping.models import ColumnMapping, MappingStatus


def mapping_diagnostic(item: ColumnMapping, detail: str) -> dict[str, Any]:
    return {
        "canonical_field": item.canonical_field,
        "source_column": item.source_column,
        "origin": item.origin.value,
        "reason_code": item.reason_code,
        "model_confidence": item.model_confidence,
        "validation_confidence": item.validation_confidence,
        "final_confidence": item.final_confidence,
        "status": item.status.value,
        "detail": detail,
    }


def review_reason(item: ColumnMapping) -> str:
    if item.origin.value in {"user_confirmed", "remembered_mapping"}:
        if item.validation_confidence is not None and item.validation_confidence < 0.5:
            return "user_confirmed_kept_validation_contradiction"
        return "user_or_remembered_authority"
    if item.status == MappingStatus.REJECTED:
        return "validation_failed"
    if item.status == MappingStatus.USER_CONFIRMATION_REQUIRED:
        if "ambiguous_source_columns" in item.evidence:
            return "ambiguous_source_columns"
        return "confidence_below_review_threshold"
    if item.status == MappingStatus.REVIEW_RECOMMENDED:
        if item.origin.value == "ai_proposed":
            return "ai_proposal_requires_review"
        return "below_auto_accept_threshold"
    return "accepted"
