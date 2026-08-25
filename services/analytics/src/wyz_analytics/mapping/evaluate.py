"""Offline evaluation of schema-mapping quality. No live model, no financial math."""

from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl

from wyz_analytics.ingest.classify import HeuristicRoleClassifier
from wyz_analytics.ingest.profiler import profile_frame
from wyz_analytics.mapping.ai_contract import SchemaMappingModel
from wyz_analytics.mapping.fake_model import FakeSchemaMappingModel
from wyz_analytics.mapping.models import MappingStatus
from wyz_analytics.mapping.propose import propose_file_mapping
from wyz_analytics.schemas.catalogs import schema_for
from wyz_analytics.schemas.roles import FileRole


@dataclass
class MappingEvalCase:
    name: str
    difficulty: str
    expected_role: str
    frame: pl.DataFrame
    expected_required: dict[str, str]
    expected_optional: dict[str, str] = field(default_factory=dict)
    expected_unresolved_required: tuple[str, ...] = ()
    never_auto_accept_sources: tuple[str, ...] = ()


@dataclass
class MappingEvalMetrics:
    n_cases: int
    role_accuracy: float
    required_mapping_accuracy: float
    optional_mapping_accuracy: float
    incorrect_auto_accept_rate: float
    review_required_rate: float
    unresolved_required_rate: float
    incorrect_auto_accepts: list[dict] = field(default_factory=list)


def evaluate_mapping_cases(
    cases: list[MappingEvalCase],
    *,
    mapping_model: SchemaMappingModel | None = None,
) -> MappingEvalMetrics:
    model = mapping_model or FakeSchemaMappingModel()
    classifier = HeuristicRoleClassifier()
    role_hits = 0
    required_hits = 0
    required_total = 0
    optional_hits = 0
    optional_total = 0
    auto_accepts = 0
    incorrect_auto = 0
    review_flags = 0
    mapping_count = 0
    unresolved_required = 0
    required_field_slots = 0
    incorrect_details: list[dict] = []

    for case in cases:
        profile = profile_frame(case.frame, path=f"{case.name}.csv")
        classification = classifier.classify(profile)
        role_hits += int(classification.role == case.expected_role)
        result = propose_file_mapping(profile, classification, mapping_model=model)
        accepted = result.accepted_mapping_dict()
        by_canonical = {dest: src for src, dest in accepted.items()}
        schema = schema_for(FileRole(case.expected_role)) if case.expected_role in {r.value for r in FileRole} else None

        for canonical, source in case.expected_required.items():
            required_total += 1
            if by_canonical.get(canonical) == source:
                required_hits += 1
        for canonical, source in case.expected_optional.items():
            optional_total += 1
            if by_canonical.get(canonical) == source:
                optional_hits += 1

        if schema is not None:
            required_field_slots += len(schema.required_fields())
            unresolved_required += len(result.missing_required_fields)

        for item in result.mappings:
            mapping_count += 1
            if item.status in {MappingStatus.REVIEW_RECOMMENDED, MappingStatus.USER_CONFIRMATION_REQUIRED}:
                review_flags += 1
            if item.status != MappingStatus.AUTO_ACCEPTED:
                continue
            auto_accepts += 1
            expected_src = case.expected_required.get(item.canonical_field) or case.expected_optional.get(
                item.canonical_field
            )
            wrong = expected_src is not None and expected_src != item.source_column
            forbidden = item.source_column in case.never_auto_accept_sources
            unresolved = item.canonical_field in case.expected_unresolved_required
            if wrong or forbidden or unresolved:
                incorrect_auto += 1
                incorrect_details.append(
                    {
                        "case": case.name,
                        "source_column": item.source_column,
                        "canonical_field": item.canonical_field,
                    }
                )

    n = max(len(cases), 1)
    return MappingEvalMetrics(
        n_cases=len(cases),
        role_accuracy=role_hits / n,
        required_mapping_accuracy=(required_hits / required_total) if required_total else 1.0,
        optional_mapping_accuracy=(optional_hits / optional_total) if optional_total else 1.0,
        incorrect_auto_accept_rate=(incorrect_auto / auto_accepts) if auto_accepts else 0.0,
        review_required_rate=(review_flags / mapping_count) if mapping_count else 0.0,
        unresolved_required_rate=(unresolved_required / required_field_slots) if required_field_slots else 0.0,
        incorrect_auto_accepts=incorrect_details,
    )
