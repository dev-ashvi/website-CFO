"""StrategicDecisionEvidencePack — decision-relevant evidence grouped by semantic role."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.strategy.assessment import DecisionSubject
from wyz_analytics.ai_cfo.strategy.decision_frame import PrioritizeCandidate
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme


@dataclass
class StrategicEvidenceSection:
    role: str
    label: str
    evidence_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "label": self.label,
            "evidence_ids": list(self.evidence_ids),
        }


@dataclass
class StrategicDecisionEvidencePack:
    subject_economics: list[str] = field(default_factory=list)
    peer_comparison: list[str] = field(default_factory=list)
    persistence: list[str] = field(default_factory=list)
    driver_structure: list[str] = field(default_factory=list)
    materiality: list[str] = field(default_factory=list)
    cost_context: list[str] = field(default_factory=list)
    scenario_evidence: list[str] = field(default_factory=list)
    # Marketing story splits (IDs only).
    contribution_before: list[str] = field(default_factory=list)
    marketing_pressure: list[str] = field(default_factory=list)
    contribution_after: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, list[str]]:
        return {
            "subject": list(self.subject_economics),
            "comparison": list(self.peer_comparison),
            "persistence": list(self.persistence),
            "drivers": list(self.driver_structure),
            "materiality": list(self.materiality),
            "cost_context": list(self.cost_context),
            "scenario": list(self.scenario_evidence),
            "contribution_before": list(self.contribution_before),
            "marketing_pressure": list(self.marketing_pressure),
            "contribution_after": list(self.contribution_after),
        }

    def all_ids(self) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for group in (
            self.contribution_before,
            self.marketing_pressure,
            self.contribution_after,
            self.subject_economics,
            self.peer_comparison,
            self.persistence,
            self.driver_structure,
            self.materiality,
            self.cost_context,
            self.scenario_evidence,
        ):
            for eid in group:
                if eid not in seen:
                    seen.add(eid)
                    out.append(eid)
        return out


_MARKETING_BEFORE = ["cm1", "cm1_pct"]
_MARKETING_PRESSURE = ["allocated_marketing", "marketing_pct"]
_MARKETING_AFTER = ["cm2", "cm2_pct"]

_SUBJECT_METRICS: dict[DecisionTheme, list[str]] = {
    DecisionTheme.MARKETING: _MARKETING_BEFORE + _MARKETING_PRESSURE + _MARKETING_AFTER,
    DecisionTheme.CHANNEL_EXIT: [
        "net_revenue",
        "cm2_pct",
        "cm2",
        "cm1_pct",
        "marketing_pct",
        "cm1",
    ],
    DecisionTheme.SKU_EXIT: ["net_revenue", "cm2", "cm2_pct", "cm1", "cm1_pct"],
    DecisionTheme.PRICE: ["gross_margin_pct", "cm1_pct", "cm2_pct", "gross_margin", "cm1", "cm2"],
    DecisionTheme.PRODUCT_COST: ["gross_margin_pct", "cm1", "cm2", "gross_margin"],
    DecisionTheme.PRIORITIZE: ["cm2", "cm2_pct", "allocated_marketing", "marketing_pct", "cm1", "cm1_pct"],
    DecisionTheme.GENERIC: ["cm2", "cm1", "net_revenue"],
}

_PEER_METRICS = ("cm2_pct", "cm2", "cm1_pct", "net_revenue", "marketing_pct")


def _index_envelope(envelope: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    if not envelope:
        return index
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in envelope.get(section) or []:
            if isinstance(item, dict) and item.get("evidence_id"):
                index[str(item["evidence_id"])] = item
    return index


def _is_scope_level(item: dict[str, Any]) -> bool:
    """Prefer summary/scope-level facts over peer-entity tool rows for story metrics."""
    eid = str(item.get("evidence_id") or "")
    if eid.startswith("summary:"):
        return True
    scope = item.get("scope") or {}
    # No dimension_value → current-scope aggregate.
    if not scope.get("dimension_value") and not item.get("entity"):
        return True
    return False


def _entity_matches(item: dict[str, Any], subject: DecisionSubject | None) -> bool:
    if not subject or not subject.entity:
        return True
    entity = str(subject.entity).strip().lower()
    scope = item.get("scope") or {}
    candidates = [
        str(item.get("entity") or "").lower(),
        str(scope.get("dimension_value") or "").lower(),
    ]
    return any(entity in c or c in entity for c in candidates if c)


def _is_peer_channel_row(item: dict[str, Any], subject: DecisionSubject | None) -> bool:
    scope = item.get("scope") or {}
    if scope.get("dimension") != "channel":
        return False
    dim_val = str(scope.get("dimension_value") or item.get("entity") or "")
    if subject and subject.entity and dim_val.lower() == str(subject.entity).lower():
        return False
    metric = str(item.get("metric") or "")
    return metric in _PEER_METRICS


def _pick_by_metrics(
    index: dict[str, dict[str, Any]],
    metrics: list[str],
    *,
    subject: DecisionSubject | None = None,
    subject_only: bool = False,
    peer_only: bool = False,
    prefer_scope_level: bool = False,
    max_items: int = 6,
) -> list[str]:
    selected: list[str] = []
    seen: set[str] = set()
    seen_metrics: set[str] = set()

    def _try_add(eid: str, item: dict[str, Any], metric: str) -> bool:
        if eid in seen:
            return False
        if prefer_scope_level and metric in seen_metrics:
            return False
        seen.add(eid)
        seen_metrics.add(metric)
        selected.append(eid)
        return True

    # Pass 1: prefer scope-level / summary rows
    if prefer_scope_level:
        for metric in metrics:
            for eid, item in index.items():
                if str(item.get("metric") or "") != metric:
                    continue
                if not _is_scope_level(item):
                    continue
                if subject_only and not _entity_matches(item, subject):
                    continue
                if peer_only and not _is_peer_channel_row(item, subject):
                    continue
                _try_add(eid, item, metric)
                if len(selected) >= max_items:
                    return selected

    for metric in metrics:
        for eid, item in index.items():
            if str(item.get("metric") or "") != metric:
                continue
            if prefer_scope_level and metric in seen_metrics:
                continue
            if subject_only and not _entity_matches(item, subject):
                continue
            if peer_only and not _is_peer_channel_row(item, subject):
                continue
            _try_add(eid, item, metric)
            if len(selected) >= max_items:
                return selected
    return selected


def _signal_driver_ids(index: dict[str, dict[str, Any]], max_items: int = 4) -> list[str]:
    out: list[str] = []
    for eid, item in index.items():
        if not str(eid).startswith("signal:"):
            continue
        roles = set(item.get("semantic_roles") or [])
        st = str(item.get("signal_type") or "")
        if roles or any(tok in st for tok in ("MARKETING", "MARGIN", "COGS", "NEGATIVE", "PRESSURE")):
            out.append(eid)
        if len(out) >= max_items:
            break
    return out


def _persistence_ids(pack: DiagnosisPack, context: dict[str, Any] | None) -> list[str]:
    ids: list[str] = []
    for item in (context or {}).get("change_evidence") or []:
        if isinstance(item, dict) and item.get("evidence_id"):
            ids.append(str(item["evidence_id"]))
    for eid in pack.comparison_evidence_ids or []:
        if "trend" in eid or "change" in eid:
            ids.append(eid)
    return ids[:4]


def _scenario_ids(pack: DiagnosisPack) -> list[str]:
    return [f"scenario:{r.digest}" for r in (pack.scenario_refs or []) if r.digest][:2]


def build_decision_evidence_pack(
    *,
    theme: DecisionTheme,
    pack: DiagnosisPack,
    envelope: dict[str, Any] | None,
    context: dict[str, Any] | None = None,
) -> StrategicDecisionEvidencePack:
    """Group evidence IDs by decision role — values remain in the canonical envelope."""
    index = _index_envelope(envelope)
    subject = pack.subject
    scope = (context or {}).get("financial_scope") or {}
    filters = scope.get("filters") or (context or {}).get("filters") or {}
    channel_pinned = bool(filters.get("channel")) if isinstance(filters, dict) else False

    contribution_before: list[str] = []
    marketing_pressure: list[str] = []
    contribution_after: list[str] = []

    if theme == DecisionTheme.MARKETING:
        contribution_before = _pick_by_metrics(
            index, _MARKETING_BEFORE, prefer_scope_level=True, max_items=2
        )
        marketing_pressure = _pick_by_metrics(
            index, _MARKETING_PRESSURE, prefer_scope_level=True, max_items=2
        )
        contribution_after = _pick_by_metrics(
            index, _MARKETING_AFTER, prefer_scope_level=True, max_items=2
        )
        subject_economics = contribution_before + marketing_pressure + contribution_after
    else:
        subject_metrics = _SUBJECT_METRICS.get(theme, _SUBJECT_METRICS[DecisionTheme.GENERIC])
        prefer_scope = theme in {DecisionTheme.PRICE, DecisionTheme.PRIORITIZE, DecisionTheme.PRODUCT_COST}
        subject_only = bool(subject and subject.entity) and theme in {
            DecisionTheme.CHANNEL_EXIT,
            DecisionTheme.SKU_EXIT,
        }
        subject_economics = _pick_by_metrics(
            index,
            subject_metrics,
            subject=subject,
            subject_only=subject_only,
            prefer_scope_level=prefer_scope or not subject_only,
            max_items=6,
        )
        if not subject_economics:
            subject_economics = _pick_by_metrics(
                index, subject_metrics, prefer_scope_level=True, max_items=6
            )

    peer_comparison: list[str] = []
    if theme in {DecisionTheme.CHANNEL_EXIT, DecisionTheme.SKU_EXIT} and not channel_pinned:
        peer_comparison = _pick_by_metrics(
            index,
            list(_PEER_METRICS),
            subject=subject,
            peer_only=True,
            max_items=4,
        )
    elif theme in {DecisionTheme.CHANNEL_EXIT, DecisionTheme.SKU_EXIT} and channel_pinned:
        for eid, item in index.items():
            scope_dim = (item.get("scope") or {}).get("dimension")
            if scope_dim in {"category", "sku", "subcategory"} and str(item.get("metric") or "") in _PEER_METRICS:
                peer_comparison.append(eid)
            if len(peer_comparison) >= 3:
                break

    driver_structure = _signal_driver_ids(index, max_items=2)
    materiality = [eid for eid in index if str(eid).startswith("signal:")][:2]
    cost_context = list((pack.cost_context.component_evidence_ids if pack.cost_context else []) or [])[:4]
    persistence = _persistence_ids(pack, context)
    scenario = _scenario_ids(pack)

    return StrategicDecisionEvidencePack(
        subject_economics=subject_economics,
        peer_comparison=peer_comparison,
        persistence=persistence,
        driver_structure=driver_structure,
        materiality=materiality,
        cost_context=cost_context,
        scenario_evidence=scenario,
        contribution_before=contribution_before,
        marketing_pressure=marketing_pressure,
        contribution_after=contribution_after,
    )


def build_evidence_sections(
    pack_evidence: StrategicDecisionEvidencePack,
    *,
    theme: DecisionTheme,
    priority_candidate: PrioritizeCandidate | None = None,
    candidates: list[PrioritizeCandidate] | None = None,
    max_total: int = 6,
) -> list[StrategicEvidenceSection]:
    """Build presentation sections over evidence IDs — no duplicated financial values."""
    sections: list[StrategicEvidenceSection] = []
    used = 0

    def _add(role: str, label: str, ids: list[str], limit: int) -> None:
        nonlocal used
        if used >= max_total or not ids:
            return
        take = [eid for eid in ids if eid][: max(0, min(limit, max_total - used))]
        if not take:
            return
        sections.append(StrategicEvidenceSection(role=role, label=label, evidence_ids=take))
        used += len(take)

    if theme == DecisionTheme.MARKETING:
        _add("CONTRIBUTION_BEFORE_MARKETING", "Before marketing", pack_evidence.contribution_before, 2)
        _add("MARKETING_PRESSURE", "Marketing", pack_evidence.marketing_pressure, 2)
        _add("CONTRIBUTION_AFTER_MARKETING", "After marketing", pack_evidence.contribution_after, 2)
    elif theme == DecisionTheme.CHANNEL_EXIT:
        _add("SUBJECT_ECONOMICS", "Channel economics", pack_evidence.subject_economics, 3)
        _add("PEER_COMPARISON", "Peer comparison", pack_evidence.peer_comparison, 3)
        _add("PERSISTENCE", "Persistence", pack_evidence.persistence, 1)
    elif theme == DecisionTheme.SKU_EXIT:
        _add("SUBJECT_ECONOMICS", "SKU economics", pack_evidence.subject_economics, 3)
        _add("PEER_COMPARISON", "Peer SKUs", pack_evidence.peer_comparison, 2)
        _add("PERSISTENCE", "Persistence", pack_evidence.persistence, 1)
    elif theme == DecisionTheme.PRICE:
        _add("MARGIN_STRUCTURE", "Margin structure", pack_evidence.subject_economics, 4)
    elif theme == DecisionTheme.PRODUCT_COST:
        _add("COST_STRUCTURE", "Cost structure", pack_evidence.cost_context or pack_evidence.subject_economics, 4)
    elif theme == DecisionTheme.PRIORITIZE:
        primary_ids = list(priority_candidate.evidence_ids) if priority_candidate else pack_evidence.subject_economics
        _add("PRIMARY_PRIORITY", "Selected pressure", primary_ids, 3)
        alt_ids: list[str] = []
        for cand in candidates or []:
            if priority_candidate and cand.candidate_id == priority_candidate.candidate_id:
                continue
            for eid in cand.evidence_ids[:1]:
                if eid not in primary_ids and eid not in alt_ids:
                    alt_ids.append(eid)
        _add("ALTERNATIVE_PRESSURES", "Other pressures", alt_ids, 2)
    else:
        _add("SUBJECT_ECONOMICS", "Economics", pack_evidence.subject_economics, 4)

    if pack_evidence.scenario_evidence and used < max_total:
        _add("SCENARIO_SUPPORT", "Scenario support", pack_evidence.scenario_evidence, 1)

    return sections


def flatten_section_ids(sections: list[StrategicEvidenceSection], *, max_items: int = 6) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for section in sections:
        for eid in section.evidence_ids:
            if eid not in seen:
                seen.add(eid)
                ordered.append(eid)
            if len(ordered) >= max_items:
                return ordered
    return ordered


def display_evidence_ids_for_theme(
    pack_evidence: StrategicDecisionEvidencePack,
    *,
    theme: DecisionTheme,
    model_supporting_ids: list[str] | None = None,
    max_items: int = 6,
    priority_candidate: PrioritizeCandidate | None = None,
    candidates: list[PrioritizeCandidate] | None = None,
) -> list[str]:
    """Theme-ordered evidence IDs for founder-facing display."""
    sections = build_evidence_sections(
        pack_evidence,
        theme=theme,
        priority_candidate=priority_candidate,
        candidates=candidates,
        max_total=max_items,
    )
    ordered = flatten_section_ids(sections, max_items=max_items)
    if ordered:
        return ordered
    # Fallback to legacy flat ordering.
    primary = [eid for eid in (model_supporting_ids or []) if eid]
    groups = [pack_evidence.subject_economics, pack_evidence.peer_comparison, pack_evidence.driver_structure]
    seen: set[str] = set()
    out: list[str] = []
    for eid in primary + [e for g in groups for e in g]:
        if eid not in seen:
            seen.add(eid)
            out.append(eid)
        if len(out) >= max_items:
            break
    return out
