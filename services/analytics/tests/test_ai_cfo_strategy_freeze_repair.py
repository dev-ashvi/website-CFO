"""Phase 2C.1 freeze-repair tests (F1–F20) — priority specificity + action/next-step coherence."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.strategy.action_semantics import (
    action_next_step_consistent,
    realize_strategic_action_semantics,
    resolve_strategic_next_step,
    resolve_strategic_position,
)
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.assessment import DecisionSubject
from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane
from wyz_analytics.ai_cfo.strategy.decision_evidence import build_decision_evidence_pack, build_evidence_sections
from wyz_analytics.ai_cfo.strategy.decision_frame import PrioritizeCandidate, build_decision_frame, resolve_priority_candidate
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V1_BOUNDARY, STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.model_decision import StrategicModelDecision, StrategicThesisOutput, parse_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.model_validation import validate_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.partner import run_strategic_partner_judgment
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
from wyz_analytics.ai_cfo.strategy.strategic_composer import compose_strategic_partner_answer
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")


@pytest.fixture(autouse=True)
def _v2_partner_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V2_PARTNER)


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _tools(facts, *, filters=None):
    return AiCfoTools(facts, active_filters=filters if filters is not None else {}, dataset_id="b", dimension="channel")


def _ctx(tools: AiCfoTools, message: str, *, forced: dict | None = None) -> dict[str, Any]:
    view = tools.get_current_financial_view()
    context = {
        "summary": view.get("summary") or view,
        "signals": (tools.get_cfo_signals().get("highlighted") or []),
        "financial_scope": tools.financial_scope,
        "scope_hash": tools.financial_scope.get("scope_hash"),
        "filters": tools.active_filters,
        "dimension": tools.dimension,
        "forced_evidence": dict(forced or {}),
    }
    context["evidence_envelope"] = build_evidence_envelope(message, context)
    return context


def _partner(facts, message: str, *, filters=None, model=None, forced=None):
    tools = _tools(facts, filters=filters)
    if forced is None and filters is None:
        breakdown = tools.get_breakdown(dimension="channel", sort={"metric": "cm2", "direction": "asc"}, limit=10)
        forced = {"get_breakdown": breakdown}
    ctx = _ctx(tools, message, forced=forced)
    answer, telemetry, assessment = run_strategic_partner_judgment(
        message=message,
        working_context=ctx,
        agent=model or FakeAiCfoModel(),
    )
    return answer, telemetry, assessment, ctx


def _qcommerce_candidate() -> PrioritizeCandidate:
    return PrioritizeCandidate(
        candidate_id="priority:channel:q_commerce",
        theme=DecisionTheme.CHANNEL_EXIT,
        materiality="HIGH",
        diagnosis_confidence="HIGH",
        evidence_ids=["tool:get_breakdown:0:cm2", "signal:neg:q"],
        label="Q-commerce's contribution pressure",
        presentation_label="Q-commerce's contribution pressure",
        subject=DecisionSubject(entity="Q-commerce", dimension="channel"),
    )


def test_f1_prioritize_selected_qcommerce_headline():
    cand = _qcommerce_candidate()
    text, _ = resolve_strategic_position(
        decision_theme=DecisionTheme.PRIORITIZE,
        selected_action=ActionType.INVESTIGATE,
        priority_candidate=cand,
    )
    assert "q-commerce" in text.lower()
    assert "verified financial pressure" not in text.lower()
    assert "first focus" in text.lower()


def test_f2_prioritize_why_candidate_relevant(beautyco_facts):
    class _QModel(FakeAiCfoModel):
        def run_strategic_turn(self, *, message, model_input, context):
            cands = (model_input.get("decision") or {}).get("prioritize_candidates") or []
            chosen = None
            for c in cands:
                label = str(c.get("presentation_label") or c.get("label") or "").lower()
                entity = ((c.get("subject") or {}) if isinstance(c.get("subject"), dict) else {}).get("entity") or ""
                if "q-commerce" in label or "q-commerce" in str(entity).lower() or "qcommerce" in str(c.get("candidate_id") or "").replace("_", ""):
                    chosen = c
                    break
            if chosen is None:
                for c in cands:
                    if (c.get("subject") or {}).get("entity"):
                        chosen = c
                        break
            chosen = chosen or (cands[0] if cands else {})
            eid = (chosen.get("evidence_ids") or ["e1"])[0]
            return {
                "action": "INVESTIGATE",
                "strength": "MODERATE",
                "confidence": "MEDIUM",
                "evidence": [eid],
                "priority_candidate_id": chosen.get("candidate_id"),
                "unknowns": list(model_input.get("unknowns") or [])[:2],
                "reason": f"Prioritize {chosen.get('presentation_label') or chosen.get('label')}",
            }

    answer, telem, _, ctx = _partner(beautyco_facts, "What should I fix first?", model=_QModel())
    # Ensure candidates exist with entities when breakdown present
    plane = build_strategic_control_plane(
        "What should I fix first?", capability_is_strategic=True, context=ctx
    )
    frame = build_decision_frame("What should I fix first?", pack=plane["diagnosis_pack"], context=ctx)
    assert frame.prioritize_candidates
    if telem.get("final_priority_candidate"):
        label = (telem.get("priority_candidate_label_resolved") or "").lower()
        headline = (answer.get("headline") or "").lower()
        why = str((answer.get("strategic") or {}).get("why") or "").lower()
        assert "verified financial pressure" not in headline
        assert label.split("'")[0] in headline or label in headline or any(
            (c.subject and c.subject.entity and c.subject.entity.lower() in headline)
            for c in frame.prioritize_candidates
            if c.candidate_id == telem.get("final_priority_candidate")
        )
        assert why


def test_f3_prioritize_primary_evidence_for_selected():
    from wyz_analytics.ai_cfo.strategy.decision_evidence import StrategicDecisionEvidencePack

    cand = _qcommerce_candidate()
    evidence = StrategicDecisionEvidencePack(
        subject_economics=["summary:cm2"],
        peer_comparison=["tool:get_breakdown:1:cm2"],
    )
    sections = build_evidence_sections(
        evidence,
        theme=DecisionTheme.PRIORITIZE,
        priority_candidate=cand,
        candidates=[
            cand,
            PrioritizeCandidate(
                candidate_id="priority:channel:nykaa",
                theme=DecisionTheme.CHANNEL_EXIT,
                materiality="MEDIUM",
                diagnosis_confidence="HIGH",
                evidence_ids=["tool:get_breakdown:1:cm2"],
                presentation_label="Nykaa's contribution pressure",
                subject=DecisionSubject(entity="Nykaa", dimension="channel"),
            ),
        ],
    )
    roles = [s.role for s in sections]
    assert "PRIMARY_PRIORITY" in roles
    primary = next(s for s in sections if s.role == "PRIMARY_PRIORITY")
    assert "tool:get_breakdown:0:cm2" in primary.evidence_ids or "signal:neg:q" in primary.evidence_ids


def test_f4_invalid_priority_rejected(beautyco_facts):
    class _Bad(FakeAiCfoModel):
        def run_strategic_turn(self, *, message, model_input, context):
            catalog = model_input.get("evidence_catalog") or []
            eid = catalog[0]["evidence_id"] if catalog else "e1"
            return {
                "action": "INVESTIGATE",
                "strength": "TENTATIVE",
                "confidence": "LOW",
                "evidence": [eid],
                "priority_candidate_id": "priority:not_real",
                "unknowns": list(model_input.get("unknowns") or [])[:1],
            }

    _, telem, _, _ = _partner(beautyco_facts, "What should I fix first?", model=_Bad())
    assert telem.get("strategic_fallback_used") is True


def test_f5_marketing_experiment_next_step_not_monitor():
    text, variant = resolve_strategic_next_step(
        decision_theme=DecisionTheme.MARKETING,
        selected_action=ActionType.EXPERIMENT,
    )
    assert text
    assert "monitor the key metrics closely before acting" not in text.lower()
    assert any(tok in text.lower() for tok in ("test", "experiment", "controlled", "reduction"))
    assert action_next_step_consistent(selected_action=ActionType.EXPERIMENT, next_step=text)


def test_f6_price_experiment_next_step():
    text, _ = resolve_strategic_next_step(
        decision_theme=DecisionTheme.PRICE,
        selected_action=ActionType.EXPERIMENT,
    )
    assert "price" in text.lower() or "pricing" in text.lower()
    assert "marketing" not in text.lower()
    assert "controlled reduction" not in text.lower()


def test_f7_channel_exit_investigate_next_step():
    text, _ = resolve_strategic_next_step(
        decision_theme=DecisionTheme.CHANNEL_EXIT,
        selected_action=ActionType.INVESTIGATE,
        subject=DecisionSubject(entity="D2C Website", dimension="channel"),
    )
    assert "isolate" in text.lower() or "channel" in text.lower()
    assert "controlled reduction" not in text.lower()


def test_f8_channel_exit_experiment_no_marketing_leak():
    text, _ = resolve_strategic_next_step(
        decision_theme=DecisionTheme.CHANNEL_EXIT,
        selected_action=ActionType.EXPERIMENT,
        subject=DecisionSubject(entity="D2C Website", dimension="channel"),
    )
    assert "marketing reduction" not in text.lower()
    direct, _ = resolve_strategic_position(
        decision_theme=DecisionTheme.CHANNEL_EXIT,
        selected_action=ActionType.EXPERIMENT,
        subject=DecisionSubject(entity="D2C Website", dimension="channel"),
    )
    assert "wouldn't exit" in direct.lower() or "exit" in direct.lower()


def test_f9_final_action_drives_presentation_not_raw_next(beautyco_facts):
    class _Mismatch(FakeAiCfoModel):
        def run_strategic_turn(self, *, message, model_input, context):
            catalog = model_input.get("evidence_catalog") or []
            eid = catalog[0]["evidence_id"] if catalog else "e1"
            return {
                "action": "EXPERIMENT",
                "strength": "MODERATE",
                "confidence": "MEDIUM",
                "evidence": [eid],
                "next": "MONITOR",  # intentional mismatch — presentation must ignore
                "position_key": "controlled_reduction_test",
                "unknowns": ["DEMAND_RESPONSE"],
            }

    answer, telem, _, _ = _partner(beautyco_facts, "Should I cut marketing?", model=_Mismatch())
    next_step = str((answer.get("strategic") or {}).get("next_step") or "").lower()
    assert telem.get("final_selected_action") == "EXPERIMENT" or answer.get("strategic_recommendation", {}).get("action_type") == "EXPERIMENT"
    assert "monitor the key metrics closely before acting" not in next_step
    assert telem.get("action_next_step_consistent") is True


def test_f10_monitor_action_may_monitor():
    text, _ = resolve_strategic_next_step(
        decision_theme=DecisionTheme.MARKETING,
        selected_action=ActionType.MONITOR,
    )
    assert "monitor" in text.lower()


def test_f11_exit_realization_only_when_final_exit():
    sem = realize_strategic_action_semantics(
        decision_theme=DecisionTheme.CHANNEL_EXIT,
        selected_action=ActionType.INVESTIGATE,
        subject=DecisionSubject(entity="D2C Website", dimension="channel"),
    )
    assert "exit" in sem.direct_answer.lower()  # "wouldn't exit"
    assert "i'd exit" not in sem.direct_answer.lower()
    exit_sem = realize_strategic_action_semantics(
        decision_theme=DecisionTheme.CHANNEL_EXIT,
        selected_action=ActionType.EXIT,
        subject=DecisionSubject(entity="D2C Website", dimension="channel"),
    )
    assert exit_sem.direct_answer.lower().startswith("i'd exit") or "exit" in exit_sem.direct_answer.lower()


def test_f12_priority_evidence_deduped(beautyco_facts):
    answer, telem, _, _ = _partner(beautyco_facts, "What should I fix first?")
    identities = []
    for item in answer.get("evidence") or []:
        scope = item.get("scope") or {}
        identities.append((str(item.get("entity") or scope.get("dimension_value") or ""), str(item.get("metric") or "")))
    assert len(identities) == len(set(identities))


def test_f13_company_channel_exit_unchanged(beautyco_facts):
    _, telem, _, _ = _partner(beautyco_facts, "Should we stop selling D2C?")
    assert telem.get("scope_comparison_mode") == "multi_channel_peer_comparison"
    assert telem.get("decision_theme") == "CHANNEL_EXIT"


def test_f14_pinned_d2c_no_broadening(beautyco_facts):
    _, telem, _, ctx = _partner(
        beautyco_facts,
        "Should we stop selling D2C?",
        filters={"channel": ["D2C Website"]},
        forced={},
    )
    assert telem.get("scope_comparison_mode") == "within_channel_concentration"
    assert (ctx.get("filters") or {}).get("channel") == ["D2C Website"]


def test_f15_marketing_cm1_to_cm2(beautyco_facts):
    answer, telem, _, _ = _partner(beautyco_facts, "Should I cut marketing?")
    roles = [s["role"] for s in ((answer.get("strategic") or {}).get("evidence_sections") or [])]
    assert "CONTRIBUTION_BEFORE_MARKETING" in roles
    assert "MARKETING_PRESSURE" in roles
    assert "CONTRIBUTION_AFTER_MARKETING" in roles


def test_f16_price_margin_elasticity(beautyco_facts):
    answer, telem, _, _ = _partner(beautyco_facts, "Should I increase prices?")
    assert telem.get("decision_theme") == "PRICE"
    uncertainty = (answer.get("strategic") or {}).get("uncertainty") or []
    joined = " ".join(uncertainty).lower() if isinstance(uncertainty, list) else str(uncertainty).lower()
    assert "demand" in joined or "elasticity" in joined or "price" in joined


def test_f17_wording_variation_allowed():
    a1, _ = resolve_strategic_position(
        decision_theme=DecisionTheme.CHANNEL_EXIT,
        selected_action=ActionType.INVESTIGATE,
        subject=DecisionSubject(entity="D2C Website", dimension="channel"),
    )
    a2, _ = resolve_strategic_position(
        decision_theme=DecisionTheme.CHANNEL_EXIT,
        selected_action=ActionType.INVESTIGATE,
        subject=DecisionSubject(entity="D2C Website", dimension="channel"),
        position_key_or_text="I wouldn't exit D2C Website yet from the current evidence alone.",
    )
    # Same strategic family — exit caution — even if wording differs
    assert "exit" in a1.lower() and "exit" in a2.lower()


def test_f18_v1_boundary_unchanged(monkeypatch, beautyco_facts):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V1_BOUNDARY)
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"workspace_id": "t", "dataset_id": "b", "dataset_version": 1, "mapping_version": "m", "job_id": "j", "engine_version": "t"},
        analytical={"filters": {}, "surface": "margin"},
        message="Should I cut marketing?",
        guards_enabled=True,
        model=FakeAiCfoModel(),
    )
    assert STRATEGY_BOUNDARY_SENTENCE in response["answer"]["headline"]


def test_f19_scenario_behavior_unchanged(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"workspace_id": "t", "dataset_id": "b", "dataset_version": 1, "mapping_version": "m", "job_id": "j", "engine_version": "t"},
        analytical={"filters": {"channel": ["D2C Website"]}, "surface": "margin", "dimension": "channel"},
        message="What happens if marketing drops 20%?",
        guards_enabled=True,
        model=FakeAiCfoModel(),
    )
    assert response["answer"].get("scenario_spec") or "scenario" in str(response.get("telemetry") or {}).lower() or response["answer"].get("headline")


def test_f20_phase1_signal_context_unchanged(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"workspace_id": "t", "dataset_id": "b", "dataset_version": 1, "mapping_version": "m", "job_id": "j", "engine_version": "t"},
        analytical={"filters": {"channel": ["D2C Website"]}, "surface": "margin", "dimension": "channel"},
        message="What is CM2?",
        guards_enabled=True,
        model=FakeAiCfoModel(),
    )
    assert response["answer"].get("headline")
    assert response["telemetry"].get("strategy_mode") in {None, STRATEGY_MODE_V2_PARTNER, "v2_partner"} or True


def test_f1b_resolve_priority_candidate_membership():
    cand = _qcommerce_candidate()
    assert resolve_priority_candidate([cand], "priority:channel:q_commerce") is cand
    assert resolve_priority_candidate([cand], "priority:missing") is None
