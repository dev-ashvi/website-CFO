"""Strategic DiagnosisPack — lean wrapper over existing verified intelligence."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.answer_contract import DriverStage
from wyz_analytics.ai_cfo.semantic_contract import InsightType
from wyz_analytics.ai_cfo.strategy.assessment import DecisionSubject, FinancialDiagnosisRef, ScenarioRef
from wyz_analytics.ai_cfo.strategy.confidence import DiagnosisConfidence
from wyz_analytics.ai_cfo.strategy.conflicts import StrategicConflict, detect_strategic_conflicts
from wyz_analytics.ai_cfo.strategy.evidence_requirements import (
    DecisionTheme,
    EvidenceFlag,
    build_strategic_evidence_plan,
    classify_decision_theme,
)
from wyz_analytics.ai_cfo.strategy.intent import DecisionType, extract_subject_hint
from wyz_analytics.ai_cfo.strategy.materiality import Materiality, derive_materiality
from wyz_analytics.ai_cfo.strategy.persistence import TemporalPersistence, classify_temporal_persistence
from wyz_analytics.ai_cfo.strategy.strategic_evidence import select_strategic_supporting_evidence_ids
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown, resolve_theme_unknowns


@dataclass
class CostContextRef:
    available: bool = False
    reconciliation_status: str | None = None
    component_evidence_ids: list[str] = field(default_factory=list)
    limitation_keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "reconciliation_status": self.reconciliation_status,
            "component_evidence_ids": list(self.component_evidence_ids),
            "limitation_keys": list(self.limitation_keys),
        }


@dataclass
class DiagnosisPack:
    """References/IDs over existing envelope/signals — does not duplicate financial values."""

    decision_type: DecisionType | None = None
    theme: DecisionTheme | None = None
    subject: DecisionSubject | None = None
    scope_hash: str | None = None
    primary_insight: str | None = None
    driver_stage: str | None = None
    evidence_ids: list[str] = field(default_factory=list)
    strategic_supporting_evidence_ids: list[str] = field(default_factory=list)
    verified_signal_refs: list[str] = field(default_factory=list)
    materiality: Materiality | None = None
    temporal_persistence: TemporalPersistence = TemporalPersistence.UNKNOWN
    cost_context: CostContextRef | None = None
    comparison_evidence_ids: list[str] = field(default_factory=list)
    scenario_refs: list[ScenarioRef] = field(default_factory=list)
    unknowns: list[StrategicUnknown] = field(default_factory=list)
    diagnosis_confidence: DiagnosisConfidence = DiagnosisConfidence.INSUFFICIENT
    conflicts: list[StrategicConflict] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    evidence_flags: set[EvidenceFlag] = field(default_factory=set)
    empty_scope: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_type": self.decision_type.value if self.decision_type else None,
            "theme": self.theme.value if self.theme else None,
            "subject": self.subject.to_dict() if self.subject else None,
            "scope_hash": self.scope_hash,
            "primary_insight": self.primary_insight,
            "driver_stage": self.driver_stage,
            "evidence_ids": list(self.evidence_ids),
            "strategic_supporting_evidence_ids": list(self.strategic_supporting_evidence_ids),
            "verified_signal_refs": list(self.verified_signal_refs),
            "materiality": self.materiality.to_dict() if self.materiality else None,
            "temporal_persistence": self.temporal_persistence.value,
            "cost_context": self.cost_context.to_dict() if self.cost_context else None,
            "comparison_evidence_ids": list(self.comparison_evidence_ids),
            "scenario_refs": [r.to_dict() for r in self.scenario_refs],
            "unknowns": [u.value for u in self.unknowns],
            "diagnosis_confidence": self.diagnosis_confidence.value,
            "conflicts": [c.value for c in self.conflicts],
            "limitations": list(self.limitations),
            "evidence_flags": sorted(f.value for f in self.evidence_flags),
            "empty_scope": self.empty_scope,
        }

    def as_financial_diagnosis_ref(self) -> FinancialDiagnosisRef:
        return FinancialDiagnosisRef(
            driver_stage=self.driver_stage,
            insight_type=self.primary_insight,
            summary_key="strategic_diagnosis_pack",
        )


def _summary_value(summary: dict[str, Any], key: str) -> float | None:
    raw = summary.get(key)
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _collect_evidence_ids(envelope: dict[str, Any] | None) -> list[str]:
    ids: list[str] = []
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in (envelope or {}).get(section) or []:
            if isinstance(item, dict) and item.get("evidence_id"):
                ids.append(str(item["evidence_id"]))
    return ids


def _signal_refs(signals: list[dict[str, Any]]) -> list[str]:
    refs: list[str] = []
    for signal in signals:
        if not isinstance(signal, dict):
            continue
        st = str(signal.get("signal_type") or "")
        entity = str(signal.get("entity") or "")
        et = str(signal.get("entity_type") or "")
        if st:
            refs.append(f"{st}:{et}:{entity}"[:120])
    return refs[:12]


def _infer_driver_and_insight(
    *,
    summary: dict[str, Any],
    signals: list[dict[str, Any]],
    theme: DecisionTheme,
) -> tuple[str | None, str | None]:
    cm1 = _summary_value(summary, "cm1")
    cm2 = _summary_value(summary, "cm2")
    gm = _summary_value(summary, "gross_margin")
    types = {str(s.get("signal_type") or "") for s in signals if isinstance(s, dict)}

    if "MARKETING_PRESSURE" in types or theme == DecisionTheme.MARKETING:
        if cm1 is not None and cm1 > 0 and cm2 is not None and cm2 < 0:
            return DriverStage.MARKETING.value, InsightType.POSITIVE_CM1_NEGATIVE_CM2.value
        return DriverStage.MARKETING.value, InsightType.MARKETING_PRESSURE.value
    if "PRODUCT_COGS_PRESSURE" in types or theme == DecisionTheme.PRODUCT_COST:
        return DriverStage.PRODUCT.value, InsightType.PRODUCT_COST_PRESSURE.value
    if "CHANNEL_COST_PRESSURE" in types:
        return DriverStage.CHANNEL.value, InsightType.CHANNEL_COST_PRESSURE.value
    if cm1 is not None and cm1 > 0 and cm2 is not None and cm2 < 0:
        return DriverStage.MARKETING.value, InsightType.POSITIVE_CM1_NEGATIVE_CM2.value
    if gm is not None and gm < 0:
        return DriverStage.PRODUCT.value, InsightType.PRODUCT_COST_PRESSURE.value
    if cm2 is not None and cm2 < 0:
        return DriverStage.MIXED.value, InsightType.MARGIN_PRESSURE.value
    if any(t.startswith("NEGATIVE_") for t in types):
        return DriverStage.MIXED.value, InsightType.NEGATIVE_CONTRIBUTOR.value
    if not summary:
        return DriverStage.UNKNOWN.value, InsightType.INSUFFICIENT_EVIDENCE.value
    return DriverStage.MIXED.value, InsightType.NEUTRAL_OBSERVATION.value


def compute_evidence_flags(
    *,
    scope_hash: str | None,
    summary: dict[str, Any],
    envelope: dict[str, Any] | None,
    signals: list[dict[str, Any]],
    materiality: Materiality,
    persistence: TemporalPersistence,
    cost_context: CostContextRef | None,
    trend_payload: dict[str, Any] | None,
    empty_scope: bool,
    filters: dict[str, Any] | None = None,
) -> set[EvidenceFlag]:
    flags: set[EvidenceFlag] = set()
    if scope_hash and not empty_scope:
        flags.add(EvidenceFlag.HAS_SCOPE)
    if _summary_value(summary, "cm1") is not None:
        flags.add(EvidenceFlag.HAS_CM1)
    if _summary_value(summary, "cm2") is not None:
        flags.add(EvidenceFlag.HAS_CM2)
    if EvidenceFlag.HAS_CM1 in flags and EvidenceFlag.HAS_CM2 in flags:
        flags.add(EvidenceFlag.HAS_CM1_CM2_RELATION)
    if _summary_value(summary, "allocated_marketing") is not None or _summary_value(summary, "marketing_pct") is not None:
        flags.add(EvidenceFlag.HAS_MARKETING_METRIC)
    if _summary_value(summary, "gross_margin") is not None or _summary_value(summary, "gross_margin_pct") is not None:
        flags.add(EvidenceFlag.HAS_GROSS_MARGIN)

    types = {str(s.get("signal_type") or "") for s in signals if isinstance(s, dict)}
    if "MARKETING_PRESSURE" in types:
        flags.add(EvidenceFlag.HAS_MARKETING_PRESSURE)
    if types & {
        "NEGATIVE_CM2_CONTRIBUTOR",
        "HIGH_REVENUE_NEGATIVE_CM2",
        "positive_cm1_negative_cm2",
        "negative_gross_margin",
    } or (_summary_value(summary, "cm2") is not None and float(summary["cm2"]) < 0):
        flags.add(EvidenceFlag.HAS_NEGATIVE_CONTRIBUTION)
    if signals:
        flags.add(EvidenceFlag.HAS_VERIFIED_SIGNAL)
    if materiality.supports_high_impact:
        flags.add(EvidenceFlag.HAS_MATERIALITY_MEDIUM_PLUS)

    tool_ids = [str(i.get("evidence_id") or "") for i in (envelope or {}).get("tool_results") or []]
    if any("get_breakdown" in eid for eid in tool_ids) or types & {
        "TOP_CM2_CONTRIBUTOR",
        "TOP_CM1_CONTRIBUTOR",
        "NEGATIVE_CM2_CONTRIBUTOR",
    }:
        flags.add(EvidenceFlag.HAS_PEER_RANKING)

    if persistence == TemporalPersistence.PERSISTENT:
        flags.add(EvidenceFlag.HAS_PERSISTENCE_PERSISTENT)
    if trend_payload and len(trend_payload.get("rows") or []) >= 2:
        flags.add(EvidenceFlag.HAS_TREND)
    if any("get_trend" in eid for eid in tool_ids):
        flags.add(EvidenceFlag.HAS_TREND)

    if cost_context and cost_context.available:
        flags.add(EvidenceFlag.HAS_COST_BREAKDOWN)
        if cost_context.reconciliation_status == "ok":
            flags.add(EvidenceFlag.HAS_COST_RECON_OK)

    sources: set[str] = set()
    for item in (envelope or {}).get("verified_facts") or []:
        if isinstance(item, dict) and item.get("source"):
            sources.add(str(item["source"]))
    for item in (envelope or {}).get("verified_signals") or []:
        if isinstance(item, dict):
            sources.add("cfo_signal")
    for item in (envelope or {}).get("tool_results") or []:
        if isinstance(item, dict) and item.get("source"):
            sources.add(str(item["source"]))
    if len(sources) >= 2:
        flags.add(EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES)
    # Summary + signals without envelope tool_results still count as multi-source.
    if summary and signals:
        flags.add(EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES)

    # Channel EXIT needs multi-channel comparison; a single-channel pin cannot provide it.
    active_filters = filters or ((envelope or {}).get("current_scope") or {}).get("filters") or {}
    pinned = active_filters.get("channel") if isinstance(active_filters, dict) else None
    single_channel_pin = isinstance(pinned, (list, tuple)) and len(pinned) == 1
    if not single_channel_pin:
        channel_entities = {
            str(s.get("entity") or "")
            for s in signals
            if isinstance(s, dict) and str(s.get("entity_type") or "") == "channel" and s.get("entity")
        }
        if len(channel_entities) >= 2:
            flags.add(EvidenceFlag.HAS_MULTI_CHANNEL_COMPARISON)

    return flags


def compute_diagnosis_confidence(
    *,
    empty_scope: bool,
    flags: set[EvidenceFlag],
    conflicts: list[StrategicConflict],
    cost_context: CostContextRef | None,
    evidence_id_count: int,
) -> DiagnosisConfidence:
    """Deterministic diagnosis confidence (what is happening — not what to do).

    Rules:
    - Empty / no scope / no financial facts → INSUFFICIENT
    - Recon mismatch → at most LOW when cost present with mismatch
    - HIGH: CM1/CM2 relation + multi independent sources + >= 3 evidence ids
    - MEDIUM: clear CM1/CM2 or pressure signal but limited corroboration
    - LOW: weak/conflicting/incomplete
    """
    if empty_scope or EvidenceFlag.HAS_SCOPE not in flags:
        return DiagnosisConfidence.INSUFFICIENT
    if EvidenceFlag.HAS_CM2 not in flags and EvidenceFlag.HAS_GROSS_MARGIN not in flags:
        return DiagnosisConfidence.INSUFFICIENT
    if evidence_id_count <= 0:
        return DiagnosisConfidence.INSUFFICIENT

    recon_bad = bool(
        cost_context
        and cost_context.available
        and cost_context.reconciliation_status in {"mismatch", "partial"}
    )

    strong_pattern = (
        EvidenceFlag.HAS_CM1_CM2_RELATION in flags
        and EvidenceFlag.HAS_MULTI_INDEPENDENT_SOURCES in flags
        and evidence_id_count >= 3
    )
    has_signal = EvidenceFlag.HAS_VERIFIED_SIGNAL in flags or EvidenceFlag.HAS_MARKETING_PRESSURE in flags

    if strong_pattern and not recon_bad:
        return DiagnosisConfidence.HIGH
    if EvidenceFlag.HAS_CM1_CM2_RELATION in flags or has_signal:
        if recon_bad or len(conflicts) >= 2:
            return DiagnosisConfidence.LOW
        return DiagnosisConfidence.MEDIUM
    if recon_bad:
        return DiagnosisConfidence.LOW
    return DiagnosisConfidence.LOW


def _same_scope_scenario_refs(
    refs: list[ScenarioRef] | None,
    *,
    active_scope_hash: str | None,
) -> list[ScenarioRef]:
    if not refs or not active_scope_hash:
        return []
    return [r for r in refs if r.scope_hash == active_scope_hash]


def _cost_context_from_forced(forced: dict[str, Any] | None) -> CostContextRef | None:
    payload = (forced or {}).get("get_cost_breakdown")
    if not isinstance(payload, dict):
        return None
    recon = payload.get("reconciliation") or {}
    component_ids: list[str] = []
    for section, block in (("product_cogs", payload.get("product_cogs") or {}), ("cm1_costs", payload.get("cm1_costs") or {})):
        for row in block.get("components") or []:
            if isinstance(row, dict) and row.get("key"):
                component_ids.append(f"cost:{section}:{row['key']}")
    limitations = [str(x) for x in (payload.get("limitations") or [])][:6]
    return CostContextRef(
        available=bool(payload.get("available")),
        reconciliation_status=str(recon.get("status") or "") or None,
        component_evidence_ids=component_ids[:20],
        limitation_keys=limitations,
    )


def build_diagnosis_pack(
    message: str,
    *,
    decision_type: DecisionType | None,
    context: dict[str, Any],
    scenario_refs: list[ScenarioRef] | None = None,
) -> DiagnosisPack:
    """Build DiagnosisPack from current-scope verified intelligence only."""
    scope = context.get("financial_scope") or {}
    scope_hash = str(scope.get("scope_hash") or context.get("scope_hash") or "") or None
    summary = dict(context.get("summary") or {})
    envelope = context.get("evidence_envelope") if isinstance(context.get("evidence_envelope"), dict) else None
    signals = list(context.get("signals") or [])

    signal_resolution = context.get("signal_context_resolution") or {}
    if signal_resolution.get("grounding_allowed") and (
        signal_resolution.get("verified_signal") or context.get("active_signal_verified")
    ):
        active = context.get("active_signal_verified") or signal_resolution.get("verified_signal")
        if isinstance(active, dict):
            signals = [active] + [s for s in signals if s is not active]
    # STALE_DROPPED / topic-only: do not add unmatched signal_context as evidence.

    filters = scope.get("filters") or context.get("filters") or {}
    no_metrics = not summary or all(
        summary.get(k) is None for k in ("net_revenue", "cm1", "cm2", "gross_margin")
    )
    empty_scope = (not bool(filters) and no_metrics) or (bool(filters) is False and no_metrics)

    theme = classify_decision_theme(message, decision_type)
    plan = build_strategic_evidence_plan(
        message,
        decision_type=decision_type,
        filters=filters if isinstance(filters, dict) else {},
    )
    subject_hint = extract_subject_hint(message)
    subject = DecisionSubject(entity=subject_hint.get("entity"), dimension=subject_hint.get("dimension"))

    evidence_ids = _collect_evidence_ids(envelope)
    for key in ("cm1", "cm2", "allocated_marketing", "marketing_pct", "gross_margin", "net_revenue"):
        if summary.get(key) is not None:
            eid = f"summary:{key}"
            if eid not in evidence_ids:
                evidence_ids.append(eid)

    materiality = derive_materiality(signals=signals, summary=summary, evidence_ids=evidence_ids)
    trend_payload = (context.get("forced_evidence") or {}).get("get_trend")
    change_evidence = list(context.get("change_evidence") or [])
    persistence = classify_temporal_persistence(
        trend_payload=trend_payload if isinstance(trend_payload, dict) else None,
        change_evidence=change_evidence,
        metric="cm2",
    )
    cost_context = _cost_context_from_forced(context.get("forced_evidence"))
    conflicts = detect_strategic_conflicts(
        summary=summary,
        signals=signals,
        change_evidence=change_evidence,
        trend_payload=trend_payload if isinstance(trend_payload, dict) else None,
    )

    # Scope present when filters or scope_hash with metrics exist.
    scope_empty_for_flags = no_metrics and not filters
    flags = compute_evidence_flags(
        scope_hash=scope_hash,
        summary=summary,
        envelope=envelope,
        signals=signals,
        materiality=materiality,
        persistence=persistence,
        cost_context=cost_context,
        trend_payload=trend_payload if isinstance(trend_payload, dict) else None,
        empty_scope=scope_empty_for_flags,
        filters=filters if isinstance(filters, dict) else {},
    )
    # If we have filters + metrics, ensure HAS_SCOPE.
    if filters and scope_hash and not scope_empty_for_flags:
        flags.add(EvidenceFlag.HAS_SCOPE)

    driver_stage, primary_insight = _infer_driver_and_insight(summary=summary, signals=signals, theme=theme)
    diag_conf = compute_diagnosis_confidence(
        empty_scope=EvidenceFlag.HAS_SCOPE not in flags,
        flags=flags,
        conflicts=conflicts,
        cost_context=cost_context,
        evidence_id_count=len(evidence_ids),
    )

    interim_pack = DiagnosisPack(
        decision_type=decision_type,
        theme=theme,
        subject=subject,
        scope_hash=scope_hash,
        primary_insight=primary_insight,
        driver_stage=driver_stage,
        evidence_flags=flags,
    )
    unknowns = resolve_theme_unknowns(theme, pack=interim_pack, message=message)
    for extra in plan.relevant_unknowns:
        if extra not in unknowns:
            unknowns.append(extra)

    limitations: list[str] = []
    if cost_context and cost_context.limitation_keys:
        limitations.extend(cost_context.limitation_keys[:4])
    if cost_context and cost_context.reconciliation_status == "mismatch":
        limitations.append("cost_breakdown_reconciliation_mismatch")
    if StrategicUnknown.ATTRIBUTION_LIMITATION in unknowns:
        limitations.append("attributed_marketing_not_fully_loaded")
    if persistence == TemporalPersistence.UNKNOWN:
        limitations.append("temporal_persistence_unknown")

    comparison_ids = [eid for eid in evidence_ids if "get_breakdown" in eid][:8]
    scoped_scenarios = _same_scope_scenario_refs(scenario_refs, active_scope_hash=scope_hash)

    is_empty = EvidenceFlag.HAS_SCOPE not in flags or (
        diag_conf == DiagnosisConfidence.INSUFFICIENT and no_metrics
    )

    strategic_ids = select_strategic_supporting_evidence_ids(
        theme=theme,
        envelope=envelope,
        pack_evidence_ids=evidence_ids,
        max_items=6,
    )

    return DiagnosisPack(
        decision_type=decision_type,
        theme=theme,
        subject=subject,
        scope_hash=scope_hash,
        primary_insight=primary_insight,
        driver_stage=driver_stage,
        evidence_ids=evidence_ids[:40],
        strategic_supporting_evidence_ids=strategic_ids,
        verified_signal_refs=_signal_refs(signals),
        materiality=materiality,
        temporal_persistence=persistence,
        cost_context=cost_context,
        comparison_evidence_ids=comparison_ids,
        scenario_refs=scoped_scenarios,
        unknowns=unknowns,
        diagnosis_confidence=diag_conf,
        conflicts=conflicts,
        limitations=limitations[:8],
        evidence_flags=flags,
        empty_scope=bool(is_empty),
    )
