"""Controlled semantic contract for AI CFO V1.

Model selects verified evidence IDs + InsightType + driver_stage.
Python owns headlines, interpretation templates, numbers, and safety.

Modes:
  semantic (default) — insight_type enum, no prose
  semantic_prose — deprecated free-form interpretation (debug only)
  legacy_full_answer — deprecated full financial JSON answer
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from wyz_analytics.ai_cfo.answer_contract import DriverStage, normalize_driver_stage
from wyz_analytics.ai_cfo.financial_scope import evidence_matches_active_scope

SEMANTIC_CONTRACT_VERSION = "v1_controlled_semantic"
ANSWER_MODE_SEMANTIC = "semantic"
ANSWER_MODE_SEMANTIC_PROSE = "semantic_prose"
ANSWER_MODE_LEGACY = "legacy_full_answer"

_NUMBER_RE = re.compile(r"(?<![A-Za-z_])-?\d[\d,]*(?:\.\d+)?%?")

_PRESSURE_ROLES = frozenset({"MARGIN_PRESSURE", "NEGATIVE_CONTRIBUTOR"})
_TOP_ROLES = frozenset({"TOP_CONTRIBUTOR"})
_COST_ROLES = frozenset({"COST_CONCENTRATION"})


class InsightType(str, Enum):
    CONTRIBUTION_LEADER = "CONTRIBUTION_LEADER"
    CONTRIBUTION_LAGGARD = "CONTRIBUTION_LAGGARD"
    MARGIN_PRESSURE = "MARGIN_PRESSURE"
    NEGATIVE_CONTRIBUTOR = "NEGATIVE_CONTRIBUTOR"
    PRODUCT_COST_PRESSURE = "PRODUCT_COST_PRESSURE"
    CHANNEL_COST_PRESSURE = "CHANNEL_COST_PRESSURE"
    MARKETING_PRESSURE = "MARKETING_PRESSURE"
    REVENUE_QUALITY_PRESSURE = "REVENUE_QUALITY_PRESSURE"
    POSITIVE_CM1_NEGATIVE_CM2 = "POSITIVE_CM1_NEGATIVE_CM2"
    GROWTH_DRIVER = "GROWTH_DRIVER"
    GROWTH_WITH_MARGIN_COMPRESSION = "GROWTH_WITH_MARGIN_COMPRESSION"
    MIXED_ECONOMICS = "MIXED_ECONOMICS"
    NEUTRAL_OBSERVATION = "NEUTRAL_OBSERVATION"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    # Temporal / change (computed from verified trend rows)
    MARGIN_IMPROVEMENT = "MARGIN_IMPROVEMENT"
    MARGIN_DETERIORATION = "MARGIN_DETERIORATION"
    REVENUE_GROWTH = "REVENUE_GROWTH"
    REVENUE_DECLINE = "REVENUE_DECLINE"
    MIXED_CHANGE = "MIXED_CHANGE"


def resolve_answer_mode(explicit: str | None = None) -> str:
    raw = (explicit or os.environ.get("WYZ_AI_CFO_ANSWER_MODE") or ANSWER_MODE_SEMANTIC).strip().lower()
    if raw in {"legacy", "legacy_full_answer", "full", "full_answer"}:
        return ANSWER_MODE_LEGACY
    if raw in {"semantic_prose", "prose"}:
        return ANSWER_MODE_SEMANTIC_PROSE
    return ANSWER_MODE_SEMANTIC


def normalize_insight_type(raw: Any) -> InsightType | None:
    if raw is None or raw == "":
        return None
    text = str(raw).strip().upper().replace(" ", "_").replace("-", "_")
    aliases = {
        "TOP_CONTRIBUTOR": InsightType.CONTRIBUTION_LEADER.value,
        "TOP_CM2_CONTRIBUTOR": InsightType.CONTRIBUTION_LEADER.value,
        "TOP_CM1_CONTRIBUTOR": InsightType.CONTRIBUTION_LEADER.value,
        "TOP_GM_CONTRIBUTOR": InsightType.CONTRIBUTION_LEADER.value,
        "LEADER": InsightType.CONTRIBUTION_LEADER.value,
        "LAGGARD": InsightType.CONTRIBUTION_LAGGARD.value,
        "PRESSURE": InsightType.MARGIN_PRESSURE.value,
        "MARGIN_LEAK": InsightType.MARGIN_PRESSURE.value,
        "COST_CONCENTRATION": InsightType.MIXED_ECONOMICS.value,
        "PRODUCT_COGS_PRESSURE": InsightType.PRODUCT_COST_PRESSURE.value,
        "CHANNEL_COST": InsightType.CHANNEL_COST_PRESSURE.value,
        "MARKETING": InsightType.MARKETING_PRESSURE.value,
        "POSITIVE_CM1_NEGATIVE_CM2": InsightType.POSITIVE_CM1_NEGATIVE_CM2.value,
        "MIXED": InsightType.MIXED_ECONOMICS.value,
        "NEUTRAL": InsightType.NEUTRAL_OBSERVATION.value,
        "INSUFFICIENT": InsightType.INSUFFICIENT_EVIDENCE.value,
        "MARGIN_UP": InsightType.MARGIN_IMPROVEMENT.value,
        "MARGIN_DOWN": InsightType.MARGIN_DETERIORATION.value,
        "REVENUE_UP": InsightType.REVENUE_GROWTH.value,
        "REVENUE_DOWN": InsightType.REVENUE_DECLINE.value,
        "MIXED_CHANGE": InsightType.MIXED_CHANGE.value,
    }
    canonical = aliases.get(text, text)
    try:
        return InsightType(canonical)
    except ValueError:
        return None


@dataclass
class SemanticOutput:
    driver_stage: str = DriverStage.UNKNOWN.value
    insight_type: str | None = None
    evidence_ids: list[str] = field(default_factory=list)
    interpretation: str = ""  # prose mode / legacy only
    comparison_type: str | None = None
    confidence: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)
    parse_ok: bool = False
    parse_errors: list[str] = field(default_factory=list)
    contains_numbers: bool = False


@dataclass
class EvidenceSelectionResult:
    selected_ids: list[str]
    selected_items: list[dict[str, Any]]
    invalid_ids: list[str]
    truncated: bool
    deterministic_selection_used: bool
    role_stage_mismatch: bool = False


@dataclass
class InsightValidationResult:
    insight_type: InsightType
    model_insight_valid: bool
    deterministic_insight_override: bool
    reason: str | None = None


@dataclass
class DriverValidationResult:
    driver_stage: str
    model_driver_valid: bool
    deterministic_driver_override: bool
    reason: str | None = None


def looks_like_semantic_contract(obj: dict[str, Any]) -> bool:
    if not obj:
        return False
    if "evidence_ids" in obj:
        return True
    if "insight_type" in obj and "driver_stage" in obj:
        return True
    if "interpretation" in obj and "driver_stage" in obj and "evidence" not in obj and "headline" not in obj:
        return True
    return False


def parse_semantic_output(raw: Any) -> SemanticOutput:
    if isinstance(raw, SemanticOutput):
        return raw
    if not isinstance(raw, dict):
        return SemanticOutput(parse_ok=False, parse_errors=["non_object_semantic_payload"])

    if "headline" in raw and "evidence" in raw and "evidence_ids" not in raw and "insight_type" not in raw:
        return SemanticOutput(
            driver_stage=normalize_driver_stage(raw.get("driver_stage") or raw.get("drivers")).value,
            interpretation=str(raw.get("interpretation") or "").strip(),
            raw=raw,
            parse_ok=False,
            parse_errors=["legacy_full_answer_payload"],
        )

    prose = str(raw.get("interpretation") or "") + str(raw.get("headline") or "")
    contains_numbers = bool(_NUMBER_RE.search(prose))

    ids_raw = raw.get("evidence_ids") or []
    if isinstance(ids_raw, str):
        ids_raw = [ids_raw]
    evidence_ids = [str(item).strip() for item in ids_raw if str(item).strip()]

    insight = normalize_insight_type(raw.get("insight_type") or raw.get("insight"))
    confidence = raw.get("confidence")
    if confidence is not None:
        confidence = str(confidence).strip().upper()
        if confidence not in {"HIGH", "MEDIUM", "LOW"}:
            confidence = None

    comparison = raw.get("comparison_type")
    if comparison is not None:
        comparison = str(comparison).strip() or None

    errors: list[str] = []
    mode = resolve_answer_mode()
    if mode == ANSWER_MODE_SEMANTIC:
        if not evidence_ids and insight is None and not raw.get("driver_stage"):
            errors.append("missing_semantic_fields")
        if contains_numbers:
            errors.append("semantic_payload_contains_numbers")
        if raw.get("interpretation") and str(raw.get("interpretation")).strip():
            errors.append("unexpected_interpretation_prose")

    parse_ok = looks_like_semantic_contract(raw) or bool(evidence_ids) or insight is not None
    if "missing_semantic_fields" in errors:
        parse_ok = False

    return SemanticOutput(
        driver_stage=normalize_driver_stage(raw.get("driver_stage") or raw.get("drivers")).value,
        insight_type=insight.value if insight else None,
        evidence_ids=evidence_ids,
        interpretation=str(raw.get("interpretation") or "").strip(),
        comparison_type=comparison,
        confidence=confidence,
        raw=dict(raw),
        parse_ok=parse_ok,
        parse_errors=errors,
        contains_numbers=contains_numbers,
    )


def envelope_item_index(envelope: dict[str, Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in envelope.get(section) or []:
            eid = str(item.get("evidence_id") or "").strip()
            if eid:
                index[eid] = {**item, "_section": section}
    return index


def validate_evidence_selection(
    *,
    evidence_ids: list[str],
    envelope: dict[str, Any],
    context: dict[str, Any],
    driver_stage: str = DriverStage.UNKNOWN.value,
    max_items: int = 3,
) -> EvidenceSelectionResult:
    index = envelope_item_index(envelope)
    active_filters = (envelope.get("current_scope") or {}).get("filters") or context.get("filters") or {}
    active_hash = envelope.get("scope_hash") or (context.get("financial_scope") or {}).get("scope_hash")
    selected: list[dict[str, Any]] = []
    invalid: list[str] = []
    truncated = False

    for eid in evidence_ids:
        if len(selected) >= max_items:
            truncated = True
            break
        item = index.get(eid)
        if item is None:
            invalid.append(eid)
            continue
        if not evidence_matches_active_scope(
            item, active_filters=active_filters, active_scope_hash=active_hash
        ):
            invalid.append(eid)
            continue
        if item.get("_section") == "tool_results" and not envelope.get("tool_results"):
            invalid.append(eid)
            continue
        selected.append(item)

    deterministic_used = False
    if not selected:
        deterministic_used = True
        selected = _deterministic_pick(envelope, max_items=max_items)

    cleaned = [{k: v for k, v in item.items() if k != "_section"} for item in selected[:max_items]]
    mismatch = False
    stage = normalize_driver_stage(driver_stage).value
    if stage == DriverStage.MARKETING.value and cleaned:
        roles, signals, _stages, _metrics = _evidence_features(cleaned)
        if roles and roles <= _TOP_ROLES and not roles.intersection(_PRESSURE_ROLES | _COST_ROLES):
            if "MARKETING_PRESSURE" not in signals and "positive_cm1_negative_cm2" not in signals:
                mismatch = True
    return EvidenceSelectionResult(
        selected_ids=[str(item.get("evidence_id")) for item in cleaned if item.get("evidence_id")],
        selected_items=cleaned,
        invalid_ids=invalid,
        truncated=truncated,
        deterministic_selection_used=deterministic_used,
        role_stage_mismatch=mismatch,
    )


@dataclass
class InterpretationResult:
    """Legacy prose-mode interpretation validation (debug path only)."""

    text: str
    model_interpretation_used: bool
    deterministic_interpretation_used: bool
    violations: list[str] = field(default_factory=list)


def validate_interpretation(
    text: str,
    *,
    capability: Any = None,
    deterministic_fallback: str = "",
) -> InterpretationResult:
    """Prose-mode safety net. Controlled semantic mode does not use model prose."""
    from wyz_analytics.ai_cfo.guards.capability import Capability

    prose = (text or "").strip()
    violations: list[str] = []
    if _NUMBER_RE.search(prose):
        violations.append("interpretation_contains_numbers")
    cap = capability
    if isinstance(capability, str):
        try:
            cap = Capability(capability)
        except ValueError:
            cap = None
    if cap == Capability.UNSUPPORTED_CAUSALITY:
        violations.append("sentiment_or_causality")
    if cap == Capability.SCENARIO_REQUEST:
        violations.append("scenario_language")
    if cap == Capability.STRATEGIC_RECOMMENDATION and any(
        token in prose.lower() for token in ("stop selling", "should we", "recommend")
    ):
        violations.append("strategic_prescription")
    if violations or not prose:
        return InterpretationResult(
            text=deterministic_fallback or prose,
            model_interpretation_used=False,
            deterministic_interpretation_used=True,
            violations=violations,
        )
    return InterpretationResult(
        text=prose,
        model_interpretation_used=True,
        deterministic_interpretation_used=False,
        violations=[],
    )


def validate_insight_type(
    *,
    insight_type: InsightType | str | None,
    items: list[dict[str, Any]],
    envelope: dict[str, Any] | None = None,
) -> InsightValidationResult:
    requested = normalize_insight_type(insight_type) if not isinstance(insight_type, InsightType) else insight_type
    if requested and insight_supported_by_evidence(requested, items):
        return InsightValidationResult(
            insight_type=requested,
            model_insight_valid=True,
            deterministic_insight_override=False,
        )
    derived = derive_insight_type(items, envelope or {})
    reason = "unsupported_insight_type" if requested else "missing_insight_type"
    return InsightValidationResult(
        insight_type=derived,
        model_insight_valid=False,
        deterministic_insight_override=True,
        reason=reason,
    )


def validate_driver_stage(
    *,
    driver_stage: str | None,
    items: list[dict[str, Any]],
    insight_type: InsightType | None = None,
) -> DriverValidationResult:
    requested = normalize_driver_stage(driver_stage).value
    if driver_stage_supported_by_evidence(requested, items, insight_type=insight_type):
        return DriverValidationResult(
            driver_stage=requested,
            model_driver_valid=True,
            deterministic_driver_override=False,
        )
    derived = derive_driver_stage(items, insight_type=insight_type)
    return DriverValidationResult(
        driver_stage=derived,
        model_driver_valid=False,
        deterministic_driver_override=True,
        reason="unsupported_driver_stage",
    )


def insight_supported_by_evidence(insight: InsightType, items: list[dict[str, Any]]) -> bool:
    roles, signals, stages, metrics = _evidence_features(items)

    if insight == InsightType.CONTRIBUTION_LEADER:
        return bool(roles.intersection(_TOP_ROLES)) or any(s.startswith("TOP_") for s in signals) or any(
            "tool:" in str(i.get("evidence_id") or "") for i in items
        )
    if insight == InsightType.CONTRIBUTION_LAGGARD:
        return (
            bool(roles.intersection(_PRESSURE_ROLES))
            or any("NEGATIVE_CM2" in s for s in signals)
            or any("tool:" in str(i.get("evidence_id") or "") for i in items)
            or any(str(i.get("source") or "") == "get_breakdown" for i in items)
        )
    if insight == InsightType.MARGIN_PRESSURE:
        # TOP_CONTRIBUTOR alone never qualifies; COST_CONCENTRATION alone never qualifies.
        return bool(roles.intersection(_PRESSURE_ROLES)) or any(
            s in {"HIGH_REVENUE_NEGATIVE_CM2", "HIGH_REVENUE_LOW_CM2", "negative_gross_margin"} for s in signals
        )
    if insight == InsightType.NEGATIVE_CONTRIBUTOR:
        return "NEGATIVE_CONTRIBUTOR" in roles or any("NEGATIVE_CM2" in s for s in signals)
    if insight == InsightType.PRODUCT_COST_PRESSURE:
        return (
            "PRODUCT_COGS_PRESSURE" in signals
            or "negative_gross_margin" in signals
            or ("PRODUCT" in stages and bool(roles.intersection(_PRESSURE_ROLES | _COST_ROLES)))
        )
    if insight == InsightType.CHANNEL_COST_PRESSURE:
        return (
            "CHANNEL_COST_PRESSURE" in signals
            or "positive_gm_negative_cm1" in signals
            or ("CHANNEL" in stages and bool(roles.intersection(_PRESSURE_ROLES | _COST_ROLES)))
        )
    if insight == InsightType.MARKETING_PRESSURE:
        # TOP_CONTRIBUTOR alone is never enough.
        if roles and roles <= _TOP_ROLES and not roles.intersection(_PRESSURE_ROLES | _COST_ROLES):
            return False
        return (
            "MARKETING_PRESSURE" in signals
            or "positive_cm1_negative_cm2" in signals
            or (
                "MARKETING" in stages
                and bool(roles.intersection(_PRESSURE_ROLES | _COST_ROLES))
            )
        )
    if insight == InsightType.POSITIVE_CM1_NEGATIVE_CM2:
        return "positive_cm1_negative_cm2" in signals
    if insight == InsightType.REVENUE_QUALITY_PRESSURE:
        return any(m in metrics for m in ("discount_pct", "return_pct", "rto_pct", "revenue_realisation_pct")) or (
            DriverStage.REVENUE_QUALITY.value in stages
        )
    if insight == InsightType.GROWTH_DRIVER:
        return any("GROWTH" in s and "COMPRESSION" not in s and "DETERIORATION" not in s for s in signals)
    if insight == InsightType.GROWTH_WITH_MARGIN_COMPRESSION:
        return any("COMPRESSION" in s or "DETERIORATION" in s for s in signals)
    if insight in {InsightType.MIXED_ECONOMICS, InsightType.NEUTRAL_OBSERVATION}:
        return bool(items)
    if insight == InsightType.INSUFFICIENT_EVIDENCE:
        return not items
    if insight in {
        InsightType.MARGIN_IMPROVEMENT,
        InsightType.MARGIN_DETERIORATION,
        InsightType.REVENUE_GROWTH,
        InsightType.REVENUE_DECLINE,
        InsightType.MIXED_CHANGE,
    }:
        return any(
            str(i.get("source") or "") in {"change_evidence", "get_trend"}
            or str(i.get("evidence_id") or "").startswith("change:")
            for i in items
        )
    return False


def driver_stage_supported_by_evidence(
    stage: str,
    items: list[dict[str, Any]],
    *,
    insight_type: InsightType | None = None,
) -> bool:
    roles, signals, stages, metrics = _evidence_features(items)
    stage = normalize_driver_stage(stage).value

    if stage in {DriverStage.MIXED.value, DriverStage.UNKNOWN.value}:
        return True
    if stage == DriverStage.MARKETING.value:
        # TOP_CM2 leader alone cannot force MARKETING driver.
        if insight_type == InsightType.CONTRIBUTION_LEADER and roles <= _TOP_ROLES:
            return False
        if roles and roles <= _TOP_ROLES and not roles.intersection(_PRESSURE_ROLES | _COST_ROLES):
            if "MARKETING_PRESSURE" not in signals and "positive_cm1_negative_cm2" not in signals:
                return False
        return (
            "MARKETING_PRESSURE" in signals
            or "positive_cm1_negative_cm2" in signals
            or "MARKETING" in stages
            or (
                bool(metrics.intersection({"allocated_marketing", "marketing_pct"}))
                and bool(roles.intersection(_PRESSURE_ROLES | _COST_ROLES))
            )
            or insight_type
            in {InsightType.MARKETING_PRESSURE, InsightType.POSITIVE_CM1_NEGATIVE_CM2}
        )
    if stage == DriverStage.PRODUCT.value:
        return (
            "PRODUCT_COGS_PRESSURE" in signals
            or "negative_gross_margin" in signals
            or "PRODUCT" in stages
            or bool(metrics.intersection({"gross_margin", "gross_margin_pct", "product_cogs"}))
            or insight_type == InsightType.PRODUCT_COST_PRESSURE
        )
    if stage == DriverStage.CHANNEL.value:
        return (
            "CHANNEL_COST_PRESSURE" in signals
            or "positive_gm_negative_cm1" in signals
            or "CHANNEL" in stages
            or bool(metrics.intersection({"cm1", "cm1_pct"}))
            or insight_type == InsightType.CHANNEL_COST_PRESSURE
        )
    if stage == DriverStage.REVENUE_QUALITY.value:
        return any(m in metrics for m in ("discount_pct", "return_pct", "rto_pct", "revenue_realisation_pct")) or (
            DriverStage.REVENUE_QUALITY.value in stages
        )
    return True


def derive_insight_type(items: list[dict[str, Any]], envelope: dict[str, Any] | None = None) -> InsightType:
    if not items and not (envelope or {}).get("verified_facts"):
        return InsightType.INSUFFICIENT_EVIDENCE
    roles, signals, _stages, _metrics = _evidence_features(items)

    if "positive_cm1_negative_cm2" in signals:
        return InsightType.POSITIVE_CM1_NEGATIVE_CM2
    if "MARKETING_PRESSURE" in signals:
        return InsightType.MARKETING_PRESSURE
    if "PRODUCT_COGS_PRESSURE" in signals or "negative_gross_margin" in signals:
        return InsightType.PRODUCT_COST_PRESSURE
    if "CHANNEL_COST_PRESSURE" in signals or "positive_gm_negative_cm1" in signals:
        return InsightType.CHANNEL_COST_PRESSURE
    if any("COMPRESSION" in s or "DETERIORATION" in s for s in signals):
        return InsightType.GROWTH_WITH_MARGIN_COMPRESSION
    if roles.intersection(_PRESSURE_ROLES) or any(
        s in {"HIGH_REVENUE_NEGATIVE_CM2", "HIGH_REVENUE_LOW_CM2"} for s in signals
    ):
        return InsightType.MARGIN_PRESSURE
    if "NEGATIVE_CONTRIBUTOR" in roles:
        return InsightType.NEGATIVE_CONTRIBUTOR
    if roles.intersection(_TOP_ROLES) or any(s.startswith("TOP_") for s in signals):
        return InsightType.CONTRIBUTION_LEADER
    if any("tool:" in str(i.get("evidence_id") or "") for i in items):
        return InsightType.CONTRIBUTION_LEADER
    if items:
        return InsightType.MIXED_ECONOMICS
    return InsightType.NEUTRAL_OBSERVATION


def derive_driver_stage(
    items: list[dict[str, Any]],
    *,
    insight_type: InsightType | None = None,
) -> str:
    if insight_type in {InsightType.MARKETING_PRESSURE, InsightType.POSITIVE_CM1_NEGATIVE_CM2}:
        return DriverStage.MARKETING.value
    if insight_type == InsightType.PRODUCT_COST_PRESSURE:
        return DriverStage.PRODUCT.value
    if insight_type == InsightType.CHANNEL_COST_PRESSURE:
        return DriverStage.CHANNEL.value
    if insight_type == InsightType.REVENUE_QUALITY_PRESSURE:
        return DriverStage.REVENUE_QUALITY.value
    if insight_type == InsightType.CONTRIBUTION_LEADER:
        return DriverStage.MIXED.value

    _roles, signals, stages, _metrics = _evidence_features(items)
    if "MARKETING_PRESSURE" in signals or "positive_cm1_negative_cm2" in signals or "MARKETING" in stages:
        return DriverStage.MARKETING.value
    if "PRODUCT_COGS_PRESSURE" in signals or "negative_gross_margin" in signals or "PRODUCT" in stages:
        return DriverStage.PRODUCT.value
    if "CHANNEL_COST_PRESSURE" in signals or "positive_gm_negative_cm1" in signals or "CHANNEL" in stages:
        return DriverStage.CHANNEL.value
    if items:
        return DriverStage.MIXED.value
    return DriverStage.UNKNOWN.value


def _evidence_features(
    items: list[dict[str, Any]],
) -> tuple[set[str], set[str], set[str], set[str]]:
    roles: set[str] = set()
    signals: set[str] = set()
    stages: set[str] = set()
    metrics: set[str] = set()
    for item in items:
        roles.update(str(r) for r in (item.get("semantic_roles") or []))
        st = str(item.get("signal_type") or "").strip()
        if st:
            signals.add(st)
        stage = normalize_driver_stage(item.get("stage")).value
        if stage != DriverStage.UNKNOWN.value:
            stages.add(stage)
        metric = str(item.get("metric") or "").strip()
        if metric:
            metrics.add(metric)
    return roles, signals, stages, metrics


def _scope_ok(scope: dict[str, Any], active_filters: dict[str, Any], *, active_scope_hash: str | None = None) -> bool:
    return evidence_matches_active_scope(
        {"scope": scope},
        active_filters=active_filters,
        active_scope_hash=active_scope_hash,
    )


def _deterministic_pick(envelope: dict[str, Any], *, max_items: int) -> list[dict[str, Any]]:
    picked: list[dict[str, Any]] = []
    seen: set[str] = set()
    active_filters = (envelope.get("current_scope") or {}).get("filters") or {}
    active_hash = envelope.get("scope_hash")

    def add(item: dict[str, Any] | None) -> None:
        if not item or item.get("value") is None:
            return
        if not evidence_matches_active_scope(
            item, active_filters=active_filters, active_scope_hash=active_hash
        ):
            return
        eid = str(item.get("evidence_id") or "")
        if eid and eid in seen:
            return
        if eid:
            seen.add(eid)
        picked.append(item)

    for item in envelope.get("verified_signals") or []:
        roles = set(item.get("semantic_roles") or [])
        if roles.intersection(_PRESSURE_ROLES | _COST_ROLES | _TOP_ROLES):
            add(item)
        if len(picked) >= max_items:
            return picked[:max_items]
    for item in envelope.get("tool_results") or []:
        add(item)
        if len(picked) >= max_items:
            return picked[:max_items]
    for item in envelope.get("verified_facts") or []:
        add(item)
        if len(picked) >= max_items:
            return picked[:max_items]
    return picked[:max_items]
