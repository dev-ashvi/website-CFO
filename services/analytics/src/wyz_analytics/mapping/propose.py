"""Build a FileMappingResult: deterministic first, AI only for remaining gaps."""

from __future__ import annotations

import logging
from copy import deepcopy

from wyz_analytics.ingest.models import FileProfile, RoleClassification
from wyz_analytics.mapping.ai_contract import NullSchemaMappingModel, SchemaMappingModel
from wyz_analytics.mapping.confidence import ConfidencePolicy, combine_confidence, status_for_confidence
from wyz_analytics.mapping.context import build_schema_mapping_request
from wyz_analytics.mapping.deterministic import propose_deterministic_mappings, type_validation_confidence
from wyz_analytics.mapping.diagnostics import mapping_diagnostic, review_reason
from wyz_analytics.mapping.models import ColumnMapping, FileMappingResult, MappingOrigin, MappingStatus
from wyz_analytics.schemas.catalogs import schema_for
from wyz_analytics.schemas.fields import CanonicalSchema
from wyz_analytics.schemas.roles import FileRole

logger = logging.getLogger("wyz_analytics.mapping")

LOCKED_ORIGINS = {MappingOrigin.USER_CONFIRMED, MappingOrigin.REMEMBERED}


def propose_file_mapping(
    profile: FileProfile,
    classification: RoleClassification,
    *,
    mapping_model: SchemaMappingModel | None = None,
    ai_proposer: SchemaMappingModel | None = None,
    prior_mappings: list[ColumnMapping] | None = None,
    policy: ConfidencePolicy | None = None,
) -> FileMappingResult:
    rules = policy or ConfidencePolicy()
    model = mapping_model or ai_proposer or NullSchemaMappingModel()
    role = FileRole(classification.role) if classification.role in {item.value for item in FileRole} else FileRole.UNKNOWN
    if role is FileRole.UNKNOWN:
        return FileMappingResult(
            source_file=profile.filename,
            file_role=FileRole.UNKNOWN.value,
            confidence=classification.confidence,
            unmapped_source_columns=profile.column_names(),
            missing_required_fields=[],
            role_evidence=list(classification.evidence),
            alternative_roles=list(classification.alternatives),
            diagnostics=[{"detail": "unknown_file_role", "origin": "classifier"}],
        )

    schema = schema_for(role)
    profile_by_name = {col.name: col for col in profile.columns}
    diagnostics: list[dict] = []
    claimed: dict[str, ColumnMapping] = {}
    locked_sources: dict[str, ColumnMapping] = {}

    for prior in prior_mappings or []:
        item = deepcopy(prior)
        if item.origin not in LOCKED_ORIGINS:
            item.origin = MappingOrigin.REMEMBERED
        _apply_validation_and_status(item, profile_by_name, schema, rules, locked=True)
        claimed[item.canonical_field] = item
        locked_sources[item.source_column] = item
        diagnostics.append(mapping_diagnostic(item, review_reason(item)))

    for det in propose_deterministic_mappings(profile, schema):
        locked_field = claimed.get(det.canonical_field)
        locked_source = locked_sources.get(det.source_column)
        if locked_source is not None:
            if locked_source.canonical_field != det.canonical_field:
                diagnostics.append(
                    {
                        "canonical_field": det.canonical_field,
                        "source_column": det.source_column,
                        "origin": MappingOrigin.DETERMINISTIC.value,
                        "reason_code": "skipped_locked_source",
                        "detail": "user_or_remembered_mapping_not_overwritten",
                    }
                )
            continue
        if locked_field is not None and locked_field.origin in LOCKED_ORIGINS:
            diagnostics.append(
                mapping_diagnostic(
                    locked_field,
                    "deterministic_skipped_locked_canonical_field",
                )
            )
            if det.source_column != locked_field.source_column:
                locked_field.alternatives = tuple(
                    dict.fromkeys((*locked_field.alternatives, det.source_column))
                )
            continue
        _apply_validation_and_status(det, profile_by_name, schema, rules, locked=False)
        claimed[det.canonical_field] = det
        diagnostics.append(mapping_diagnostic(det, review_reason(det)))
        logger.info(
            "mapped %s -> %s origin=%s final=%.3f status=%s reason=%s",
            det.source_column,
            det.canonical_field,
            det.origin.value,
            det.final_confidence,
            det.status.value,
            det.reason_code,
        )

    mappings = list(claimed.values())
    request = build_schema_mapping_request(
        profile,
        schema,
        file_role=role.value,
        claimed=mappings,
    )
    if request.unresolved_canonical_fields and request.unresolved_source_columns:
        response = model.propose(request)
        claimed_sources = {item.source_column for item in mappings}
        allowed_fields = {field.name for field in request.unresolved_canonical_fields}
        for proposal in response.mappings:
            if proposal.source_column not in profile_by_name:
                continue
            if proposal.source_column in claimed_sources or proposal.source_column in locked_sources:
                continue
            if proposal.canonical_field not in allowed_fields:
                continue
            existing = claimed.get(proposal.canonical_field)
            if existing is not None and existing.origin in LOCKED_ORIGINS:
                continue
            if existing is not None and existing.status == MappingStatus.AUTO_ACCEPTED:
                continue
            if existing is not None and (
                existing.status == MappingStatus.USER_CONFIRMATION_REQUIRED
                or "ambiguous_source_columns" in existing.evidence
            ):
                existing.alternatives = tuple(
                    dict.fromkeys((*existing.alternatives, proposal.source_column))
                )
                diagnostics.append(
                    {
                        "canonical_field": proposal.canonical_field,
                        "source_column": proposal.source_column,
                        "origin": MappingOrigin.AI_PROPOSED.value,
                        "reason_code": "ai_did_not_override_ambiguity",
                        "model_confidence": proposal.model_confidence,
                        "detail": "deterministic_ambiguity_remains_user_confirmation",
                    }
                )
                continue
            ai_item = ColumnMapping(
                source_column=proposal.source_column,
                canonical_field=proposal.canonical_field,
                origin=MappingOrigin.AI_PROPOSED,
                model_confidence=proposal.model_confidence,
                reason_code=proposal.reason_code,
                alternatives=proposal.alternatives,
                evidence=(proposal.reason_code, "ai_unresolved_gap"),
            )
            _apply_validation_and_status(ai_item, profile_by_name, schema, rules, locked=False)
            claimed[ai_item.canonical_field] = ai_item
            claimed_sources.add(ai_item.source_column)
            mappings.append(ai_item)
            diagnostics.append(mapping_diagnostic(ai_item, review_reason(ai_item)))
            logger.info(
                "mapped %s -> %s origin=%s final=%.3f status=%s reason=%s",
                ai_item.source_column,
                ai_item.canonical_field,
                ai_item.origin.value,
                ai_item.final_confidence,
                ai_item.status.value,
                ai_item.reason_code,
            )

    mappings = list(claimed.values())
    mapped_sources = {item.source_column for item in mappings}
    required = set(schema.required_fields())
    mapped_required = {
        item.canonical_field
        for item in mappings
        if item.canonical_field in required and _counts_as_mapped(item)
    }
    missing = sorted(required - mapped_required)
    unmapped = [name for name in profile.column_names() if name not in mapped_sources]
    file_confidence = min(
        classification.confidence,
        min((item.final_confidence for item in mappings), default=0.0) if mappings else 0.0,
    )
    if missing:
        file_confidence = min(file_confidence, 0.6)

    return FileMappingResult(
        source_file=profile.filename,
        file_role=role.value,
        confidence=round(file_confidence, 4),
        mappings=mappings,
        unmapped_source_columns=unmapped,
        missing_required_fields=missing,
        role_evidence=list(classification.evidence),
        alternative_roles=list(classification.alternatives),
        diagnostics=diagnostics,
    )


def refresh_required_coverage(mapping: FileMappingResult) -> None:
    if mapping.file_role == FileRole.UNKNOWN.value:
        return
    schema = schema_for(FileRole(mapping.file_role))
    required = set(schema.required_fields())
    mapped = {
        item.canonical_field
        for item in mapping.mappings
        if item.canonical_field in required and _counts_as_mapped(item)
    }
    mapping.missing_required_fields = sorted(required - mapped)


def _counts_as_mapped(item: ColumnMapping) -> bool:
    if item.origin in LOCKED_ORIGINS:
        return True
    return item.status not in {MappingStatus.REJECTED, MappingStatus.USER_CONFIRMATION_REQUIRED}


def _apply_validation_and_status(
    item: ColumnMapping,
    profile_by_name: dict,
    schema: CanonicalSchema,
    rules: ConfidencePolicy,
    *,
    locked: bool,
) -> None:
    column = profile_by_name.get(item.source_column)
    try:
        spec = schema.field(item.canonical_field)
    except KeyError:
        item.validation_confidence = 0.0
        item.final_confidence = 0.0
        item.status = MappingStatus.REJECTED if not locked else MappingStatus.CONFIRMED
        return
    type_conf = type_validation_confidence(column.inferred_type, spec.dtype) if column else 0.5
    if "ambiguous_source_columns" in item.evidence:
        type_conf = min(type_conf, 0.4)
    item.validation_confidence = type_conf
    item.final_confidence = combine_confidence(item.model_confidence, item.validation_confidence, rules)
    failed_type = type_conf < 0.5 and not locked
    item.status = status_for_confidence(
        item.final_confidence,
        origin=item.origin,
        rejected=failed_type,
        policy=rules,
    )
    if "ambiguous_source_columns" in item.evidence and not locked:
        item.status = MappingStatus.USER_CONFIRMATION_REQUIRED
    if not item.reason_code:
        item.reason_code = item.evidence[0] if item.evidence else "unspecified"
