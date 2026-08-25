"""Deterministic validation for structured AI CFO answers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from wyz_analytics.ai_cfo.answer_contract import (
    UNSTRUCTURED_PLACEHOLDER_HEADLINE,
    build_markdown,
    normalize_driver_stage,
)
from wyz_analytics.ai_cfo.deterministic_answer import build_deterministic_cfo_answer
from wyz_analytics.ai_cfo.evidence.envelope import envelope_evidence_index
from wyz_analytics.ai_cfo.guards.capability import Capability


@dataclass
class ValidationResult:
    valid: bool
    violations: list[str]
    normalized_answer: dict[str, Any]
    numeric_claim_count: int
    evidence_items_used: int


def normalize_structured_answer(answer: dict[str, Any]) -> dict[str, Any]:
    headline = str(answer.get("headline") or "").strip() or "Verified financial interpretation."
    evidence = answer.get("evidence") or []
    if isinstance(evidence, str):
        evidence = [evidence]
    normalized_items = []
    for item in list(evidence)[:20]:
        if isinstance(item, dict):
            normalized_items.append(
                {
                    "evidence_id": item.get("evidence_id"),
                    "metric": item.get("metric"),
                    "value": item.get("value"),
                    "unit": item.get("unit"),
                    "scope": item.get("scope") or {},
                    "interpretation": item.get("interpretation") or "",
                }
            )
        else:
            normalized_items.append({"metric": None, "value": None, "unit": None, "scope": {}, "interpretation": str(item)})

    driver_stage = normalize_driver_stage(
        answer.get("driver_stage") or answer.get("drivers") or answer.get("driver")
    ).value
    interpretation = str(answer.get("interpretation") or answer.get("drivers") or "").strip()
    caveat = answer.get("caveat")

    normalized = {
        "headline": headline,
        "evidence": normalized_items,
        "driver_stage": driver_stage,
        "interpretation": interpretation,
        "caveat": caveat if caveat else None,
        "tool_calls": list(answer.get("tool_calls") or []),
        "context_version": answer.get("context_version"),
        "telemetry": dict(answer.get("telemetry") or {}),
    }
    normalized["drivers"] = driver_stage
    normalized["markdown"] = build_markdown(normalized)
    return normalized


def validate_structured_answer(
    answer: dict[str, Any],
    *,
    envelope: dict[str, Any],
    context: dict[str, Any],
) -> ValidationResult:
    normalized = normalize_structured_answer(answer)
    violations: list[str] = []
    claim_budget = envelope.get("claim_budget") or {}
    max_evidence = int(claim_budget.get("evidence_items_max") or 3)
    max_numeric = int(claim_budget.get("numeric_claims_max") or 3)
    evidence_items = normalized.get("evidence") or []
    evidence_count = len(evidence_items)

    if answer.get("parse_warning") or normalized.get("headline") == UNSTRUCTURED_PLACEHOLDER_HEADLINE:
        violations.append("malformed_schema:unstructured_or_non_json_answer")

    if evidence_count > max_evidence:
        violations.append(f"evidence_count_exceeds_budget:{evidence_count}>{max_evidence}")

    numeric_claim_count = _count_numeric_claims(normalized)
    if numeric_claim_count > max_numeric:
        violations.append(f"numeric_claim_count_exceeds_budget:{numeric_claim_count}>{max_numeric}")

    allowed_stages = set(envelope.get("allowed_driver_stages") or [])
    if normalized.get("driver_stage") not in allowed_stages:
        violations.append("driver_stage_not_allowed")

    evidence_index = envelope_evidence_index(envelope)
    active_filters = context.get("filters") or {}
    for idx, item in enumerate(evidence_items):
        metric = item.get("metric")
        value = item.get("value")
        scope = item.get("scope") or {}
        if metric is None or value is None:
            continue
        matches = evidence_index.get(str(metric), [])
        if not matches:
            violations.append(f"evidence_{idx}_metric_not_in_envelope:{metric}")
            continue
        if not _value_supported(value, matches):
            violations.append(f"evidence_{idx}_value_not_verified:{metric}={value}")
        if not _scope_supported(scope, active_filters, matches):
            violations.append(f"evidence_{idx}_scope_mismatch")

    text = " ".join(
        [
            normalized.get("headline") or "",
            normalized.get("interpretation") or "",
            " ".join(str(item.get("interpretation") or "") for item in evidence_items if isinstance(item, dict)),
        ]
    ).lower()
    if _uses_margin_pressure_language(text):
        if not _has_margin_pressure_support(envelope):
            violations.append("margin_pressure_language_without_support")
    if _uses_attribution_language(text):
        if not normalized.get("caveat"):
            violations.append("attribution_caveat_required")

    return ValidationResult(
        valid=not violations,
        violations=violations,
        normalized_answer=normalized,
        numeric_claim_count=numeric_claim_count,
        evidence_items_used=evidence_count,
    )


def build_deterministic_fallback(
    *,
    envelope: dict[str, Any],
    context: dict[str, Any],
    reason: list[str],
    answer_source: str = "deterministic_fallback",
    tool_calls: list[dict[str, Any]] | None = None,
    capability: Capability | str | None = None,
    message: str = "",
) -> dict[str, Any]:
    return build_deterministic_cfo_answer(
        envelope=envelope,
        context=context,
        capability=capability,
        tool_calls=tool_calls,
        reason=reason,
        message=message,
        answer_source=answer_source,
    )


def _count_numeric_claims(answer: dict[str, Any]) -> int:
    """Count distinct numeric values across the entire structured answer.

    Evidence item values count once each. Numbers in headline, interpretation,
    and caveat are counted only if they don't match an evidence value (avoids
    penalising the model for restating an evidence figure in prose).
    """
    evidence_values: set[str] = set()
    count = 0
    for item in answer.get("evidence") or []:
        if isinstance(item, dict) and item.get("value") is not None:
            count += 1
            evidence_values.add(_normalize_number_str(item["value"]))

    prose = " ".join(
        filter(None, [answer.get("headline"), answer.get("interpretation"), answer.get("caveat")])
    )
    for match in re.finditer(r"(?<![A-Za-z])-?\d[\d,]*(?:\.\d+)?%?", prose):
        raw = match.group()
        token = raw.rstrip("%")
        # Skip trivially small ordinal / count numbers (1-digit) that aren't financial
        stripped = token.lstrip("-").replace(",", "")
        if len(stripped) == 1 and "." not in token:
            continue
        if _normalize_number_str(token) not in evidence_values:
            count += 1
    return count


def _normalize_number_str(value: Any) -> str:
    """Normalise a numeric value to a canonical string for deduplication."""
    try:
        return f"{float(str(value).replace(',', '')):.6g}"
    except (TypeError, ValueError):
        return str(value)


def _value_supported(value: Any, matches: list[dict[str, Any]]) -> bool:
    try:
        target = float(value)
    except (TypeError, ValueError):
        return False
    for match in matches:
        try:
            candidate = float(match.get("value"))
        except (TypeError, ValueError):
            continue
        if abs(target - candidate) <= max(1.0, abs(candidate) * 0.08):
            return True
    return False


def _scope_supported(scope: dict[str, Any], filters: dict[str, Any], matches: list[dict[str, Any]]) -> bool:
    if not scope:
        return True
    scope_filters = scope.get("filters") or {}
    for key, vals in scope_filters.items():
        if vals and filters.get(key) != vals:
            return False
    dim = scope.get("dimension")
    dim_value = scope.get("dimension_value")
    if dim and dim_value:
        for match in matches:
            ms = match.get("scope") or {}
            if str(ms.get("dimension")) == str(dim) and str(ms.get("dimension_value")) == str(dim_value):
                return True
        return False
    return True


def _uses_margin_pressure_language(text: str) -> bool:
    return any(phrase in text for phrase in ("margin leak", "weak economics", "margin pressure", "leak source"))


def _has_margin_pressure_support(envelope: dict[str, Any]) -> bool:
    for item in (envelope.get("verified_signals") or []):
        roles = set(item.get("semantic_roles") or [])
        if roles.intersection({"MARGIN_PRESSURE", "NEGATIVE_CONTRIBUTOR"}):
            return True
        if str(item.get("metric")) == "cm2":
            try:
                if float(item.get("value")) < 0:
                    return True
            except (TypeError, ValueError):
                continue
    for item in (envelope.get("verified_facts") or []):
        roles = set(item.get("semantic_roles") or [])
        if roles.intersection({"MARGIN_PRESSURE", "NEGATIVE_CONTRIBUTOR"}):
            return True
        if str(item.get("metric")) == "cm2":
            try:
                if float(item.get("value")) < 0:
                    return True
            except (TypeError, ValueError):
                continue
    return False


def _uses_attribution_language(text: str) -> bool:
    return any(phrase in text for phrase in ("attributed marketing", "allocation", "fully-loaded", "fully loaded"))
