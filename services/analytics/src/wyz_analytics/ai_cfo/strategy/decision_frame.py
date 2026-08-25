"""DecisionFrame — describes what must be reasoned about; never selects a recommendation."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.strategy.assessment import DecisionSubject, StrategicAssessment
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme
from wyz_analytics.ai_cfo.strategy.intent import DecisionType
from wyz_analytics.ai_cfo.strategy.persistence import TemporalPersistence
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown, resolve_theme_unknowns


@dataclass
class PrioritizeCandidate:
    """Verified pressure candidate — model chooses priority; Python does not rank."""

    candidate_id: str
    theme: DecisionTheme
    materiality: str
    diagnosis_confidence: str
    evidence_ids: list[str] = field(default_factory=list)
    driver_stage: str | None = None
    label: str | None = None
    presentation_label: str | None = None
    subject: DecisionSubject | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "theme": self.theme.value,
            "label": self.presentation_label or self.label or _priority_label(self.theme),
            "presentation_label": self.presentation_label or self.label or _priority_label(self.theme),
            "subject": self.subject.to_dict() if self.subject else None,
            "materiality": self.materiality,
            "diagnosis_confidence": self.diagnosis_confidence,
            "evidence_ids": list(self.evidence_ids)[:6],
            "driver_stage": self.driver_stage,
        }

    def founder_label(self) -> str:
        return self.presentation_label or self.label or _priority_label(self.theme)


_PRIORITY_LABELS: dict[DecisionTheme, str] = {
    DecisionTheme.MARKETING: "marketing efficiency",
    DecisionTheme.PRODUCT_COST: "product-cost pressure",
    DecisionTheme.CHANNEL_EXIT: "channel contribution pressure",
    DecisionTheme.SKU_EXIT: "SKU contribution pressure",
    DecisionTheme.PRICE: "pricing / margin structure",
    DecisionTheme.GENERIC: "verified financial pressure",
}

_PRESSURE_SIGNAL_TYPES = frozenset(
    {
        "NEGATIVE_CM2_CONTRIBUTOR",
        "HIGH_REVENUE_NEGATIVE_CM2",
        "HIGH_REVENUE_LOW_CM2",
        "POSITIVE_CM1_NEGATIVE_CM2",
        "NEGATIVE_GROSS_MARGIN",
        "MARGIN_PRESSURE",
        "MARKETING_PRESSURE",
        "PRODUCT_COGS_PRESSURE",
        "CHANNEL_COST_PRESSURE",
    }
)


def _priority_label(theme: DecisionTheme) -> str:
    return _PRIORITY_LABELS.get(theme, _PRIORITY_LABELS[DecisionTheme.GENERIC])


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(text).strip().lower()).strip("_")
    return slug[:48] or "entity"


def presentation_label_for(
    *,
    theme: DecisionTheme,
    entity: str | None = None,
    dimension: str | None = None,
) -> str:
    if entity and theme in {DecisionTheme.CHANNEL_EXIT, DecisionTheme.GENERIC}:
        if dimension == "channel" or not dimension:
            return f"{entity}'s contribution pressure"
        return f"{entity}'s contribution pressure"
    if entity and theme == DecisionTheme.SKU_EXIT:
        return f"{entity}'s contribution pressure"
    if entity and theme == DecisionTheme.PRODUCT_COST:
        return f"{entity}'s product-cost pressure"
    if entity and theme == DecisionTheme.MARKETING:
        return f"{entity}'s marketing efficiency"
    return _priority_label(theme)


def resolve_priority_candidate(
    candidates: list[PrioritizeCandidate],
    candidate_id: str | None,
) -> PrioritizeCandidate | None:
    if not candidate_id:
        return None
    for candidate in candidates:
        if candidate.candidate_id == candidate_id:
            return candidate
    return None


@dataclass
class DecisionFrame:
    decision_type: DecisionType | None
    decision_theme: DecisionTheme
    subject: DecisionSubject | None
    decision_question: str
    decision_objective: str
    reasoning_dimensions: list[str] = field(default_factory=list)
    comparison_requirements: list[str] = field(default_factory=list)
    persistence_requirements: list[str] = field(default_factory=list)
    relevant_evidence_roles: list[str] = field(default_factory=list)
    relevant_unknowns: list[StrategicUnknown] = field(default_factory=list)
    decision_specific_constraints: list[str] = field(default_factory=list)
    decision_specific_monitoring_metrics: list[str] = field(default_factory=list)
    evidence_gaps: list[str] = field(default_factory=list)
    scope_hash: str | None = None
    persistence_state: TemporalPersistence = TemporalPersistence.UNKNOWN
    prioritize_candidates: list[PrioritizeCandidate] = field(default_factory=list)
    allowed_reason_keys: list[str] = field(default_factory=list)
    allowed_change_my_view_keys: list[str] = field(default_factory=list)
    allowed_tradeoff_keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_type": self.decision_type.value if self.decision_type else None,
            "theme": self.decision_theme.value,
            "subject": self.subject.to_dict() if self.subject else None,
            "objective": self.decision_objective,
            "reasoning_dimensions": list(self.reasoning_dimensions),
            "comparison_requirements": list(self.comparison_requirements),
            "persistence_requirements": list(self.persistence_requirements),
            "relevant_evidence_roles": list(self.relevant_evidence_roles),
            "relevant_unknowns": [u.value for u in self.relevant_unknowns],
            "decision_specific_constraints": list(self.decision_specific_constraints),
            "decision_specific_monitoring_metrics": list(self.decision_specific_monitoring_metrics),
            "evidence_gaps": list(self.evidence_gaps),
            "scope_hash": self.scope_hash,
            "persistence_state": self.persistence_state.value,
            "prioritize_candidates": [c.to_dict() for c in self.prioritize_candidates],
        }


_THEME_OBJECTIVES: dict[DecisionTheme, str] = {
    DecisionTheme.MARKETING: "Evaluate whether and how to adjust attributed marketing spend",
    DecisionTheme.CHANNEL_EXIT: "Evaluate whether the channel should remain in the portfolio",
    DecisionTheme.SKU_EXIT: "Evaluate whether the SKU line should remain in the portfolio",
    DecisionTheme.PRICE: "Evaluate whether a pricing intervention is justified from current economics",
    DecisionTheme.PRODUCT_COST: "Evaluate whether product or CM1 cost intervention is warranted",
    DecisionTheme.PRIORITIZE: "Compare verified material pressures and choose what to address first",
    DecisionTheme.MONITOR: "Define what to monitor before acting",
    DecisionTheme.EXPERIMENT: "Define what controlled test would resolve key unknowns",
    DecisionTheme.GENERIC: "Reason about verified economics and eligible next steps",
}

_THEME_DIMENSIONS: dict[DecisionTheme, list[str]] = {
    DecisionTheme.MARKETING: [
        "contribution_before_marketing",
        "marketing_consumption",
        "post_marketing_contribution",
        "materiality",
        "persistence",
        "concentration",
        "sensitivity_evidence",
        "demand_response_gap",
    ],
    DecisionTheme.CHANNEL_EXIT: [
        "subject_economics",
        "peer_comparison",
        "materiality",
        "persistence",
        "driver_structure",
        "concentration",
        "exit_evidence_burden",
        "strategic_unknowns",
    ],
    DecisionTheme.SKU_EXIT: [
        "sku_contribution",
        "peer_sku_comparison",
        "materiality",
        "persistence",
        "cost_driver_structure",
        "portfolio_consequences",
        "exit_evidence_burden",
    ],
    DecisionTheme.PRICE: [
        "margin_structure",
        "financial_headroom",
        "problem_diagnosis",
        "elasticity_gap",
        "competitive_response_gap",
        "experiment_justification",
    ],
    DecisionTheme.PRODUCT_COST: [
        "cogs_materiality",
        "cost_component_dominance",
        "reconciliation",
        "concentration",
        "operational_feasibility_gap",
    ],
    DecisionTheme.PRIORITIZE: [
        "materiality",
        "severity",
        "persistence",
        "controllability",
        "evidence_confidence",
        "downstream_impact",
        "safe_testability",
    ],
    DecisionTheme.GENERIC: ["verified_drivers", "materiality", "eligible_actions"],
}

_THEME_EVIDENCE_ROLES: dict[DecisionTheme, list[str]] = {
    DecisionTheme.MARKETING: [
        "subject_economics",
        "driver_structure",
        "persistence",
        "scenario_evidence",
    ],
    DecisionTheme.CHANNEL_EXIT: [
        "subject_economics",
        "peer_comparison",
        "persistence",
        "driver_structure",
        "materiality",
    ],
    DecisionTheme.SKU_EXIT: [
        "subject_economics",
        "peer_comparison",
        "persistence",
        "driver_structure",
        "materiality",
    ],
    DecisionTheme.PRICE: ["subject_economics", "materiality", "cost_context"],
    DecisionTheme.PRODUCT_COST: ["subject_economics", "cost_context", "driver_structure"],
    DecisionTheme.PRIORITIZE: ["materiality", "driver_structure", "subject_economics"],
    DecisionTheme.GENERIC: ["subject_economics", "driver_structure"],
}

_THEME_MONITORING: dict[DecisionTheme, list[str]] = {
    DecisionTheme.MARKETING: ["cm1", "cm1_pct", "marketing_pct", "cm2", "cm2_pct", "net_revenue"],
    DecisionTheme.CHANNEL_EXIT: ["net_revenue", "cm1_pct", "marketing_pct", "cm2_pct"],
    DecisionTheme.SKU_EXIT: ["cm2", "net_revenue", "cm1_pct"],
    DecisionTheme.PRICE: ["gross_margin_pct", "cm1_pct", "cm2_pct", "net_revenue", "orders"],
    DecisionTheme.PRODUCT_COST: ["gross_margin_pct", "cm1", "cm2", "net_revenue"],
    DecisionTheme.PRIORITIZE: ["cm2", "cm2_pct", "net_revenue", "marketing_pct"],
    DecisionTheme.GENERIC: ["cm2", "net_revenue", "marketing_pct"],
}


def _comparison_requirements(theme: DecisionTheme, *, filters: dict[str, Any]) -> list[str]:
    if theme == DecisionTheme.CHANNEL_EXIT:
        if filters.get("channel"):
            return ["within_channel_concentration"]
        return ["multi_channel_peer_comparison"]
    if theme == DecisionTheme.SKU_EXIT:
        return ["peer_sku_comparison"]
    return []


def _persistence_requirements(theme: DecisionTheme, persistence: TemporalPersistence) -> list[str]:
    if theme in {DecisionTheme.CHANNEL_EXIT, DecisionTheme.SKU_EXIT}:
        return [
            f"persistence_state:{persistence.value}",
            "persistent_weakness_required_for_exit",
        ]
    if theme == DecisionTheme.MARKETING:
        return [f"persistence_state:{persistence.value}", "pressure_stability"]
    return [f"persistence_state:{persistence.value}"]


def _evidence_gaps(theme: DecisionTheme, pack: DiagnosisPack, *, filters: dict[str, Any]) -> list[str]:
    gaps: list[str] = []
    from wyz_analytics.ai_cfo.strategy.evidence_requirements import EvidenceFlag

    flags = pack.evidence_flags or set()
    if theme == DecisionTheme.CHANNEL_EXIT:
        if not filters.get("channel") and EvidenceFlag.HAS_MULTI_CHANNEL_COMPARISON not in flags:
            gaps.append("multi_channel_comparison_unavailable")
        if pack.temporal_persistence == TemporalPersistence.UNKNOWN:
            gaps.append("persistence_unverified")
    if theme == DecisionTheme.PRICE and StrategicUnknown.PRICE_ELASTICITY in (pack.unknowns or []):
        gaps.append("price_elasticity_unknown")
    if theme == DecisionTheme.PRIORITIZE and len(pack.conflicts or []) == 0 and not pack.primary_insight:
        gaps.append("multiple_pressures_not_isolated")
    return gaps[:6]


def _entity_evidence_ids(envelope: dict[str, Any] | None, entity: str, *, max_items: int = 4) -> list[str]:
    if not envelope or not entity:
        return []
    entity_l = entity.strip().lower()
    ids: list[str] = []
    for section in ("verified_signals", "tool_results", "verified_facts"):
        for item in envelope.get(section) or []:
            if not isinstance(item, dict) or not item.get("evidence_id"):
                continue
            scope = item.get("scope") or {}
            cand = str(item.get("entity") or scope.get("dimension_value") or "").lower()
            if cand and (entity_l in cand or cand in entity_l):
                ids.append(str(item["evidence_id"]))
            if len(ids) >= max_items:
                return ids
    return ids


def _theme_for_pressure(
    *,
    signal_type: str | None,
    dimension: str | None,
    entity: str | None,
) -> DecisionTheme:
    st = str(signal_type or "").upper()
    dim = str(dimension or "").lower()
    if "MARKETING" in st:
        return DecisionTheme.MARKETING
    if "COGS" in st or "PRODUCT" in st:
        return DecisionTheme.PRODUCT_COST
    if dim == "sku" or (entity and entity.upper().startswith("SKU")):
        return DecisionTheme.SKU_EXIT
    if dim == "channel" or st.endswith("CONTRIBUTOR") or "CM2" in st:
        return DecisionTheme.CHANNEL_EXIT
    return DecisionTheme.GENERIC


def build_prioritize_candidates(
    pack: DiagnosisPack,
    *,
    envelope: dict[str, Any] | None,
) -> list[PrioritizeCandidate]:
    """List verified pressure candidates — unordered; model selects priority."""
    from wyz_analytics.ai_cfo.strategy.evidence_requirements import EvidenceFlag
    from wyz_analytics.ai_cfo.strategy.strategic_evidence import select_strategic_supporting_evidence_ids

    flags = pack.evidence_flags or set()
    mat_class = pack.materiality.severity_class.value if pack.materiality else "UNKNOWN"
    diag_conf = pack.diagnosis_confidence.value
    candidates: list[PrioritizeCandidate] = []
    seen_ids: set[str] = set()

    def _theme_ids(theme: DecisionTheme) -> list[str]:
        return select_strategic_supporting_evidence_ids(
            theme=theme,
            envelope=envelope,
            pack_evidence_ids=pack.evidence_ids,
            max_items=4,
        )

    def _add(candidate: PrioritizeCandidate) -> None:
        if candidate.candidate_id in seen_ids:
            return
        seen_ids.add(candidate.candidate_id)
        candidates.append(candidate)

    # 1) Entity-specific pressures from verified signals only (unordered).
    for item in (envelope or {}).get("verified_signals") or []:
        if not isinstance(item, dict):
            continue
        scope = item.get("scope") or {}
        entity = str(item.get("entity") or scope.get("dimension_value") or "").strip()
        if not entity or entity.lower() in {"filtered population", "filtered period", "this view", "unknown"}:
            continue
        signal_type = str(item.get("signal_type") or "")
        roles = {str(r) for r in (item.get("semantic_roles") or [])}
        is_pressure = (
            signal_type in _PRESSURE_SIGNAL_TYPES
            or roles.intersection({"NEGATIVE_CONTRIBUTOR", "MARGIN_PRESSURE", "COST_CONCENTRATION"})
        )
        if not is_pressure:
            continue
        dimension = str(
            scope.get("dimension") or item.get("entity_type") or item.get("dimension") or "channel"
        )
        theme = _theme_for_pressure(signal_type=signal_type, dimension=dimension, entity=entity)
        cand_id = f"priority:{dimension}:{_slug(entity)}"
        evidence = _entity_evidence_ids(envelope, entity)
        if item.get("evidence_id") and str(item["evidence_id"]) not in evidence:
            evidence = [str(item["evidence_id"])] + evidence
        label = presentation_label_for(theme=theme, entity=entity, dimension=dimension)
        _add(
            PrioritizeCandidate(
                candidate_id=cand_id,
                theme=theme,
                materiality=mat_class,
                diagnosis_confidence=diag_conf,
                evidence_ids=evidence[:4] or _theme_ids(theme),
                driver_stage=pack.driver_stage,
                label=label,
                presentation_label=label,
                subject=DecisionSubject(entity=entity, dimension=dimension),
            )
        )
        if len(candidates) >= 6:
            break

    # Also surface channel/SKU contribution entities from breakdown tool results as
    # unordered options (tool may be sorted for diagnosis; order is non-authoritative).
    seen_entities: set[str] = set()
    for item in (envelope or {}).get("tool_results") or []:
        if not isinstance(item, dict):
            continue
        metric = str(item.get("metric") or "")
        if metric not in {"cm2", "cm2_pct"}:
            continue
        scope = item.get("scope") or {}
        entity = str(item.get("entity") or scope.get("dimension_value") or "").strip()
        dimension = str(scope.get("dimension") or "channel")
        if not entity or dimension not in {"channel", "sku", "category"}:
            continue
        entity_key = f"{dimension}:{entity.lower()}"
        if entity_key in seen_entities:
            continue
        seen_entities.add(entity_key)
        theme = DecisionTheme.SKU_EXIT if dimension == "sku" else DecisionTheme.CHANNEL_EXIT
        cand_id = f"priority:{dimension}:{_slug(entity)}"
        evidence = _entity_evidence_ids(envelope, entity)
        if item.get("evidence_id") and str(item["evidence_id"]) not in evidence:
            evidence = [str(item["evidence_id"])] + evidence
        label = presentation_label_for(theme=theme, entity=entity, dimension=dimension)
        _add(
            PrioritizeCandidate(
                candidate_id=cand_id,
                theme=theme,
                materiality=mat_class,
                diagnosis_confidence=diag_conf,
                evidence_ids=evidence[:4] or _theme_ids(theme),
                driver_stage=pack.driver_stage,
                label=label,
                presentation_label=label,
                subject=DecisionSubject(entity=entity, dimension=dimension),
            )
        )
        if len(seen_entities) >= 5:
            break

    # 2) Theme-level pressures when flags present (still unordered; no scores).
    if EvidenceFlag.HAS_MARKETING_PRESSURE in flags or pack.driver_stage == "MARKETING":
        label = presentation_label_for(theme=DecisionTheme.MARKETING)
        _add(
            PrioritizeCandidate(
                candidate_id="priority:marketing",
                theme=DecisionTheme.MARKETING,
                materiality=mat_class,
                diagnosis_confidence=diag_conf,
                evidence_ids=_theme_ids(DecisionTheme.MARKETING),
                driver_stage=pack.driver_stage,
                label=label,
                presentation_label=label,
            )
        )
    if EvidenceFlag.HAS_COST_BREAKDOWN in flags or pack.driver_stage in {"PRODUCT", "COGS"}:
        label = presentation_label_for(theme=DecisionTheme.PRODUCT_COST)
        _add(
            PrioritizeCandidate(
                candidate_id="priority:product_cost",
                theme=DecisionTheme.PRODUCT_COST,
                materiality=mat_class,
                diagnosis_confidence=diag_conf,
                evidence_ids=_theme_ids(DecisionTheme.PRODUCT_COST),
                driver_stage=pack.driver_stage,
                label=label,
                presentation_label=label,
            )
        )

    # 3) Only if nothing specific: generic fallback (last resort).
    if not candidates:
        label = presentation_label_for(theme=DecisionTheme.GENERIC)
        _add(
            PrioritizeCandidate(
                candidate_id="priority:generic",
                theme=DecisionTheme.GENERIC,
                materiality=mat_class,
                diagnosis_confidence=diag_conf,
                evidence_ids=_theme_ids(DecisionTheme.GENERIC),
                driver_stage=pack.driver_stage,
                label=label,
                presentation_label=label,
            )
        )
    return candidates


def build_decision_frame(
    message: str,
    *,
    pack: DiagnosisPack,
    assessment: StrategicAssessment | None = None,
    context: dict[str, Any] | None = None,
) -> DecisionFrame:
    """Frame the decision problem — no selected_action or recommendation."""
    from wyz_analytics.ai_cfo.strategy.strategic_semantic import (
        change_my_view_keys_for_theme,
        reason_keys_for_theme,
        tradeoff_keys_for_theme,
    )

    theme = pack.theme or DecisionTheme.GENERIC
    decision_type = pack.decision_type or (assessment.decision_type if assessment else None)
    subject = pack.subject or (assessment.subject if assessment else None)
    scope = (context or {}).get("financial_scope") or {}
    filters = scope.get("filters") or (context or {}).get("filters") or {}
    unknowns = resolve_theme_unknowns(theme, pack=pack, message=message)

    prioritize: list[PrioritizeCandidate] = []
    if theme == DecisionTheme.PRIORITIZE:
        prioritize = build_prioritize_candidates(
            pack,
            envelope=(context or {}).get("evidence_envelope"),
        )

    constraints: list[str] = []
    if theme == DecisionTheme.PRICE:
        constraints.append("do_not_infer_demand_response_from_margin_data")
    if theme in {DecisionTheme.CHANNEL_EXIT, DecisionTheme.SKU_EXIT}:
        constraints.append("exit_requires_very_strong_evidence_burden")
    if theme == DecisionTheme.CHANNEL_EXIT:
        constraints.append("do_not_default_to_acquisition_spend_uncertainty")

    return DecisionFrame(
        decision_type=decision_type,
        decision_theme=theme,
        subject=subject,
        decision_question=str(message or "")[:500],
        decision_objective=_THEME_OBJECTIVES.get(theme, _THEME_OBJECTIVES[DecisionTheme.GENERIC]),
        reasoning_dimensions=list(_THEME_DIMENSIONS.get(theme, _THEME_DIMENSIONS[DecisionTheme.GENERIC])),
        comparison_requirements=_comparison_requirements(theme, filters=filters if isinstance(filters, dict) else {}),
        persistence_requirements=_persistence_requirements(theme, pack.temporal_persistence),
        relevant_evidence_roles=list(_THEME_EVIDENCE_ROLES.get(theme, _THEME_EVIDENCE_ROLES[DecisionTheme.GENERIC])),
        relevant_unknowns=unknowns,
        decision_specific_constraints=constraints,
        decision_specific_monitoring_metrics=list(
            _THEME_MONITORING.get(theme, _THEME_MONITORING[DecisionTheme.GENERIC])
        ),
        evidence_gaps=_evidence_gaps(
            theme,
            pack,
            filters=filters if isinstance(filters, dict) else {},
        ),
        scope_hash=pack.scope_hash,
        persistence_state=pack.temporal_persistence,
        prioritize_candidates=prioritize,
        allowed_reason_keys=reason_keys_for_theme(theme),
        allowed_change_my_view_keys=change_my_view_keys_for_theme(theme),
        allowed_tradeoff_keys=tradeoff_keys_for_theme(theme),
    )
