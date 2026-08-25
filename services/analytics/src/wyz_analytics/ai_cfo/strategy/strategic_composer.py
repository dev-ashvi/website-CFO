"""Compose founder-facing strategic partner answers (Phase 2C / 2C.1)."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.presentation import present_evidence_item
from wyz_analytics.ai_cfo.strategy.action_semantics import (
    action_next_step_consistent,
    realize_strategic_action_semantics,
)
from wyz_analytics.ai_cfo.strategy.assessment import StrategicAssessment
from wyz_analytics.ai_cfo.strategy.decision_evidence import (
    StrategicDecisionEvidencePack,
    build_evidence_sections,
    flatten_section_ids,
)
from wyz_analytics.ai_cfo.strategy.decision_frame import DecisionFrame, PrioritizeCandidate, resolve_priority_candidate
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme
from wyz_analytics.ai_cfo.strategy.model_decision import StrategicModelDecision
from wyz_analytics.ai_cfo.strategy.strategic_presentation import (
    build_strategic_presentation,
    sanitize_founder_prose,
    sanitize_strategic_presentation_fields,
    strip_markdown_leakage,
)
from wyz_analytics.ai_cfo.strategy.strategic_semantic import resolve_reason_key


def compose_strategic_partner_answer(
    *,
    decision: StrategicModelDecision,
    assessment: StrategicAssessment,
    envelope: dict[str, Any],
    context: dict[str, Any],
    cfo_actions: list[Any],
    pack: DiagnosisPack | None = None,
    decision_evidence: StrategicDecisionEvidencePack | None = None,
    decision_frame: DecisionFrame | None = None,
    answer_source: str = "model_strategic",
    fallback_used: bool = False,
    validation_meta: dict[str, Any] | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Combine model judgment + Python-owned evidence into a conversational CFO answer."""
    thesis = decision.thesis
    theme = (
        decision_frame.decision_theme
        if decision_frame
        else (pack.theme if pack and pack.theme else DecisionTheme.GENERIC)
    )
    subject = (decision_frame.subject if decision_frame else None) or assessment.subject
    # FINAL validated action drives presentation — never raw / alternate next_step_action.
    selected = decision.selected_action
    rationale = (decision.rationale or "").strip()
    position = (thesis.position if thesis else None) or rationale or ""

    priority_candidate: PrioritizeCandidate | None = None
    if decision_frame and decision_frame.prioritize_candidates:
        priority_candidate = resolve_priority_candidate(
            decision_frame.prioritize_candidates,
            decision.priority_candidate_id,
        )

    semantics = realize_strategic_action_semantics(
        decision_theme=theme,
        selected_action=selected,
        subject=subject,
        priority_candidate=priority_candidate,
        primary_reason_key=decision.primary_reason_key,
        position_key_or_text=position,
        fallback_used=fallback_used,
    )
    headline = semantics.direct_answer
    semantic_variant = semantics.semantic_variant

    uncertainty_keys = list(thesis.uncertainty_keys if thesis else []) or [u.value for u in assessment.unknowns]
    why = _resolve_why(
        theme=theme,
        rationale=rationale if rationale and rationale not in headline else None,
        primary_reason_key=decision.primary_reason_key,
        priority_candidate=priority_candidate,
        selected_action=selected,
    )

    sections = []
    if decision_evidence:
        sections = build_evidence_sections(
            decision_evidence,
            theme=theme,
            priority_candidate=priority_candidate,
            candidates=decision_frame.prioritize_candidates if decision_frame else None,
            max_total=6,
        )
    section_dicts = [s.to_dict() for s in sections]

    strategic_body = build_strategic_presentation(
        headline=headline,
        rationale=why,
        why_fallback=None,
        primary_reason_key=None,
        uncertainty_keys=uncertainty_keys,
        tradeoff_keys=decision.tradeoff_keys,
        change_my_view_keys=decision.change_my_view_keys,
        next_action=selected,
        monitoring_keys=(thesis.monitoring_metric_keys if thesis else None)
        or (decision_frame.decision_specific_monitoring_metrics if decision_frame else None),
        theme=theme,
        subject=subject,
        priority_candidate=priority_candidate,
        evidence_sections=section_dicts,
        semantic_variant=semantic_variant,
        evidence_gaps=list(decision_frame.evidence_gaps) if decision_frame else None,
        next_step_override=semantics.next_step,
    )

    evidence_items, deduped_count = _resolve_evidence(
        envelope,
        sections=sections,
        fallback_ids=decision.supporting_evidence_ids,
        max_items=6,
    )
    caveat = next(
        (
            str(item)
            for item in list(envelope.get("methodology_caveats") or []) + list(context.get("caveats") or [])
            if "attributed" in str(item).lower()
        ),
        "Attributed marketing CM2 is not fully-loaded profitability.",
    )

    uncertainty_text = " ".join(strategic_body.get("uncertainty") or [])
    # Keep monitoring as a list for UI separators; also provide display string.
    monitoring_list = (
        list(strategic_body.get("monitoring") or [])
        if isinstance(strategic_body.get("monitoring"), list)
        else ([str(strategic_body.get("monitoring"))] if strategic_body.get("monitoring") else [])
    )
    monitoring_text = " · ".join(monitoring_list)
    interpretation_parts = [
        p
        for p in [
            strategic_body.get("why"),
            uncertainty_text,
            strategic_body.get("next_step"),
            monitoring_text,
            " ".join(strategic_body.get("what_would_change_my_view") or []),
        ]
        if p
    ]
    interpretation = " ".join(interpretation_parts)[:1200] if interpretation_parts else None
    strategic_body["monitoring"] = monitoring_list
    strategic_body["monitoring_display"] = monitoring_text
    strategic_body, pres_telem = sanitize_strategic_presentation_fields(strategic_body)
    headline = sanitize_founder_prose(headline) or headline

    answer = {
        "headline": headline[:500],
        "evidence": evidence_items,
        "driver_stage": assessment.financial_diagnosis.driver_stage if assessment.financial_diagnosis else "MIXED",
        "interpretation": sanitize_founder_prose(interpretation) if interpretation else None,
        "drivers": assessment.financial_diagnosis.driver_stage if assessment.financial_diagnosis else "MIXED",
        "caveat": caveat,
        "methodology": caveat,
        "context_version": (context.get("meta") or {}).get("context_version"),
        "tool_calls": list(tool_calls or []),
        "cfo_actions": [a.to_dict() if hasattr(a, "to_dict") else a for a in cfo_actions],
        "strategic": strategic_body,
        "strategic_recommendation": assessment.recommendation.to_dict() if assessment.recommendation else None,
        "decision_thesis": assessment.decision_thesis.to_dict() if assessment.decision_thesis else None,
    }
    answer["telemetry"] = {
        "answer_source": answer_source,
        "strategic_fallback_used": fallback_used,
        "strategic_validation": validation_meta or {},
        "recommendations_enabled": True,
        "decision_theme": theme.value,
        "priority_candidate_count": len(decision_frame.prioritize_candidates) if decision_frame else 0,
        "model_priority_candidate": decision.priority_candidate_id,
        "final_priority_candidate": priority_candidate.candidate_id if priority_candidate else None,
        "priority_candidate_label_resolved": semantics.priority_candidate_label_resolved,
        "strategic_evidence_section_roles": [s.role for s in sections],
        "strategic_display_evidence_count": len(evidence_items),
        "strategic_evidence_deduped_count": deduped_count,
        "strategic_semantic_variant": semantic_variant,
        "strategic_next_step_variant": semantics.next_step_variant,
        "action_next_step_consistent": action_next_step_consistent(
            selected_action=selected,
            next_step=strategic_body.get("next_step"),
        ),
        **pres_telem,
    }
    return answer


def _resolve_why(
    *,
    theme: DecisionTheme,
    rationale: str | None,
    primary_reason_key: str | None,
    priority_candidate: PrioritizeCandidate | None,
    selected_action,
) -> str | None:
    reason_snippet = resolve_reason_key(primary_reason_key)
    why = strip_markdown_leakage((rationale or "").strip() or reason_snippet or None)
    if theme == DecisionTheme.PRIORITIZE and priority_candidate:
        label = priority_candidate.founder_label()
        entity = priority_candidate.subject.entity if priority_candidate.subject else None
        # Prefer model rationale only when it refers to the selected candidate.
        if why and entity and entity.lower() in why.lower():
            return why
        if why and label.split("'")[0].lower() in why.lower():
            return why
        return (
            f"{label[0].upper() + label[1:]} is the priority I'd address first "
            f"based on materiality ({priority_candidate.materiality}) and diagnosis confidence "
            f"({priority_candidate.diagnosis_confidence})."
        )
    # Soft contradiction guard: EXPERIMENT why should not say "just monitor".
    if why and selected_action and selected_action.value == "EXPERIMENT":
        if "just monitor" in why.lower() or why.lower().startswith("monitor for now"):
            return reason_snippet or "A controlled test is the right next move given the verified economics and unknowns."
    return why


def _semantic_identity(item: dict[str, Any]) -> tuple[Any, ...]:
    scope = item.get("scope") or {}
    return (
        str(item.get("scope_hash") or scope.get("scope_hash") or ""),
        str(item.get("entity") or scope.get("dimension_value") or ""),
        str(item.get("metric") or ""),
        str(scope.get("dimension") or ""),
    )


def _resolve_evidence(
    envelope: dict[str, Any],
    *,
    sections: list[Any],
    fallback_ids: list[str] | None,
    max_items: int,
) -> tuple[list[dict[str, Any]], int]:
    index: dict[str, dict[str, Any]] = {}
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in envelope.get(section) or []:
            if isinstance(item, dict) and item.get("evidence_id"):
                index[str(item["evidence_id"])] = item

    ordered_ids = flatten_section_ids(sections, max_items=max_items * 2) if sections else []
    if not ordered_ids:
        ordered_ids = list(fallback_ids or [])

    selected: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_semantic: set[tuple[Any, ...]] = set()
    raw_count = 0
    for eid in ordered_ids:
        item = index.get(eid)
        if not item:
            continue
        raw_count += 1
        if eid in seen_ids:
            continue
        sem = _semantic_identity(item)
        if sem in seen_semantic:
            continue
        seen_ids.add(eid)
        seen_semantic.add(sem)
        selected.append(present_evidence_item(item))
        if len(selected) >= max_items:
            break
    deduped = max(0, raw_count - len(selected))
    return selected, deduped
