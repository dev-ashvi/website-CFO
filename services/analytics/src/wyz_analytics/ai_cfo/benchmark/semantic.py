"""BeautyCo benchmark-specific semantic attribution checks (evaluator only)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SemanticViolation:
    code: str
    message: str


def _signals(context: dict[str, Any]) -> list[dict[str, Any]]:
    return list(context.get("signals") or [])


def _top_cm2_entities(context: dict[str, Any]) -> set[str]:
    entities: set[str] = set()
    for signal in _signals(context):
        if signal.get("signal_type") == "TOP_CM2_CONTRIBUTOR":
            entity = str(signal.get("entity") or "").strip()
            if entity:
                entities.add(entity.lower())
    return entities


def _pressure_entities(context: dict[str, Any]) -> set[str]:
    pressure_types = {
        "PRODUCT_COGS_PRESSURE",
        "CHANNEL_COST_PRESSURE",
        "MARKETING_PRESSURE",
        "NEGATIVE_CM2_CONTRIBUTOR",
        "HIGH_REVENUE_NEGATIVE_CM2",
        "HIGH_REVENUE_LOW_CM2",
        "positive_cm1_negative_cm2",
    }
    entities: set[str] = set()
    for signal in _signals(context):
        if signal.get("signal_type") in pressure_types:
            entity = str(signal.get("entity") or "").strip()
            if entity and entity.lower() != "filtered population":
                entities.add(entity.lower())
    return entities


def detect_beautyco_semantic_violations(
    case_id: str,
    text: str,
    context: dict[str, Any],
) -> list[SemanticViolation]:
    """
    Benchmark-only semantic checks for clearly incorrect BeautyCo attribution.

    Production guards remain generic; these checks apply only during benchmark scoring.
    """
    violations: list[SemanticViolation] = []
    lower = (text or "").lower()
    summary = context.get("summary") or {}
    cm2 = summary.get("cm2")
    cm2_pct = summary.get("cm2_pct")

    if case_id == "Q1":
        company_cm2_positive = cm2 is not None and float(cm2) > 0
        if company_cm2_positive and any(
            phrase in lower
            for phrase in (
                "cm2 is weak",
                "cm2 weakness",
                "weak cm2",
                "negative cm2",
                "cm2 is negative",
                "cm2 deterioration",
                "cm2 is deteriorating",
            )
        ):
            violations.append(
                SemanticViolation(
                    "incorrect_company_cm2_framing",
                    "Company CM2 is positive in verified context but answer frames CM2 as weak/negative.",
                )
            )

        if re.search(
            r"marketing spend.{0,80}(primary|main|principal).{0,40}(driver|reason|cause).{0,40}cm2",
            lower,
        ) or re.search(
            r"(primary|main|principal).{0,20}(driver|reason|cause).{0,40}cm2.{0,80}marketing spend",
            lower,
        ):
            violations.append(
                SemanticViolation(
                    "unsupported_marketing_primary_cm2_driver",
                    "Answer claims marketing spend is the primary company CM2 driver without verified support.",
                )
            )

        top_cm2 = _top_cm2_entities(context)
        for entity in top_cm2:
            if entity in lower and re.search(
                rf"{re.escape(entity)}.{{0,80}}(weak|negative|deteriorat|drag|leak)",
                lower,
            ):
                violations.append(
                    SemanticViolation(
                        "top_cm2_contributor_mischaracterized",
                        f"Top CM2 contributor '{entity}' mischaracterized as weak/leaking.",
                    )
                )
                break

    if case_id == "Q4":
        leak_terms = ("margin leak", "leak source", "biggest leak", "largest leak", "leaking margin")
        if not any(term in lower for term in leak_terms):
            return violations

        top_cm2 = _top_cm2_entities(context)
        pressure = _pressure_entities(context)
        for entity in top_cm2:
            if entity in lower and entity not in pressure:
                if any(term in lower for term in leak_terms):
                    violations.append(
                        SemanticViolation(
                            "strong_contributor_called_leak",
                            f"Channel '{entity}' is a verified TOP_CM2 contributor but labeled a margin leak.",
                        )
                    )
                    break

        if cm2_pct is not None and float(cm2_pct) > 0.1 and "margin leak" in lower:
            if top_cm2 and not pressure.intersection(top_cm2):
                violations.append(
                    SemanticViolation(
                        "margin_leak_without_pressure_signal",
                        "Margin leak language used without verified pressure/negative contributor signals on cited entities.",
                    )
                )

    return violations
