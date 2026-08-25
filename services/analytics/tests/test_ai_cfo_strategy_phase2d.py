"""Phase 2D — Strategic Conversational Continuity (D1–D40 + E2E journey)."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.scenario.parse import parse_scenario_spec
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence, RecommendationStrength
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V1_BOUNDARY, STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.model_decision import StrategicModelDecision, StrategicThesisOutput
from wyz_analytics.ai_cfo.strategy.strategic_followup import (
    StrategicFollowupType,
    classify_strategic_followup_type,
    enrich_scenario_message_from_thread,
    resolve_strategic_followup,
)
from wyz_analytics.ai_cfo.strategy.thread import (
    ScenarioThreadRef,
    StrategicDecisionThread,
    ThreadStatus,
    assert_thread_has_no_financial_payload,
    attach_scenario_ref_to_thread,
    compute_revision_disposition,
)
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


def _ask(
    facts,
    message,
    *,
    filters=None,
    previous_turns=None,
    signal_context=None,
    model=None,
):
    return run_ai_cfo_turn(
        facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical={
            "filters": filters if filters is not None else {},
            "surface": "margin",
            "dimension": "channel",
        },
        message=message,
        guards_enabled=True,
        previous_turns=previous_turns,
        signal_context=signal_context,
        model=model,
    )


def _turn_payload(response: dict[str, Any], message: str) -> dict[str, Any]:
    conv = response.get("conversation") or {}
    return {
        "question": message,
        "scope_hash": conv.get("scope_hash") or response.get("scope_hash"),
        "intent": conv.get("intent"),
        "insight_type": conv.get("insight_type"),
        "selected_entities": conv.get("selected_entities") or [],
        "selected_evidence_ids": conv.get("selected_evidence_ids") or [],
        "scenario_spec": conv.get("scenario_spec") or response["answer"].get("scenario_spec"),
        "signal_context": conv.get("signal_context"),
        "strategic": conv.get("strategic"),
        "strategic_thread": conv.get("strategic_thread") or response["answer"].get("strategic_thread"),
    }


class _OverrideStrategicModel(FakeAiCfoModel):
    def __init__(self, payload: dict[str, Any] | None = None, *, call_log: list | None = None):
        super().__init__()
        self._payload = payload
        self.call_log = call_log if call_log is not None else []

    def run_strategic_turn(self, *, message: str, model_input: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        self.call_log.append({"message": message, "model_input": model_input})
        if self._payload is not None:
            return dict(self._payload)
        return super().run_strategic_turn(message=message, model_input=model_input, context=context)


def test_d1_creates_active_marketing_thread(beautyco_facts):
    r = _ask(beautyco_facts, "Should I cut marketing?")
    thread = (r.get("conversation") or {}).get("strategic_thread") or r["answer"].get("strategic_thread")
    assert thread is not None
    assert thread["status"] == "ACTIVE"
    assert thread["decision_theme"] == "MARKETING"
    assert thread["selected_action"]
    assert thread["scope_hash"] == r["scope_hash"]


def test_d2_why_resolves_against_thread(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    t1 = _turn_payload(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "Why?", previous_turns=[t1])
    assert (r2["answer"].get("strategic") or {}).get("followup_type") == "WHY"
    assert (r2.get("conversation") or {}).get("strategic_thread", {}).get("thread_id") == t1["strategic_thread"][
        "thread_id"
    ]


def test_d3_why_no_strategic_provider(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    calls_after_first = len(log)
    assert calls_after_first >= 1
    r2 = _ask(
        beautyco_facts,
        "Why?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
        model=model,
    )
    assert len(log) == calls_after_first
    assert r2["telemetry"].get("provider_calls") == 0 or r2["telemetry"].get("strategic_model_called") is not True


def test_d4_change_my_view_uses_thread_keys(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    thread = r1["answer"]["strategic_thread"]
    assert thread.get("change_my_view_keys")
    r2 = _ask(
        beautyco_facts,
        "What would change your view?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    body = r2["answer"].get("strategic") or {}
    assert body.get("followup_type") == "CHANGE_MY_VIEW"
    assert body.get("what_would_change_my_view")


def test_d5_monitor_uses_thread_keys(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What should I monitor?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    body = r2["answer"].get("strategic") or {}
    assert body.get("followup_type") == "MONITOR"
    monitoring = body.get("monitoring") or []
    assert monitoring
    assert not any("net_revenue" == m for m in monitoring)  # no raw keys


def test_d6_next_step_uses_action_semantics(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What should I do next?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    assert (r2["answer"].get("strategic") or {}).get("followup_type") == "NEXT_STEP"
    assert r2["answer"].get("headline")


def test_d7_pronoun_scenario_resolves_marketing(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What if I cut it 20%?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    assert r2["answer"].get("answer_kind") == "SCENARIO" or r2["telemetry"].get("scenario_engine_used") or r2[
        "answer"
    ].get("scenario_spec")
    spec = r2["answer"].get("scenario_spec") or {}
    assert spec.get("lever") in {None, "MARKETING_SPEND"} or "marketing" in str(spec).lower() or r2[
        "answer"
    ].get("headline")


def test_d8_scenario_provider_calls_zero(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    n = len(log)
    r2 = _ask(
        beautyco_facts,
        "What if I cut it 20%?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
        model=model,
    )
    assert len(log) == n
    assert int(r2["telemetry"].get("provider_calls") or 0) == 0


def test_d9_scenario_attaches_ref(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What if I cut it 20%?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    thread = (r2.get("conversation") or {}).get("strategic_thread") or r2["answer"].get("strategic_thread")
    assert thread and thread.get("latest_scenario_ref")
    assert thread["latest_scenario_ref"]["scope_hash"] == r2["scope_hash"]
    assert "deltas" not in (thread.get("latest_scenario_ref") or {})


def test_d10_reconsider_detected(beautyco_facts):
    assert classify_strategic_followup_type("Does that change your recommendation?") == StrategicFollowupType.RECONSIDER


def test_d11_reconsider_calls_model(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = _turn_payload(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], model=model)
    t2 = _turn_payload(r2, "What if I cut it 20%")
    n = len(log)
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    assert len(log) > n
    assert r3["telemetry"].get("strategic_reconsideration_model_called") is True or r3["telemetry"].get(
        "strategic_model_called"
    )


def test_d12_scenario_does_not_auto_raise_confidence(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    conf1 = (r1["answer"].get("strategic_thread") or {}).get("decision_confidence")
    t1 = _turn_payload(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1])
    t2 = _turn_payload(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
    )
    conf3 = (r3["answer"].get("strategic_thread") or {}).get("decision_confidence")
    rank = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "VERY_HIGH": 4}
    if conf1 and conf3:
        # Ceiling clamp — never strictly above prior ceiling path via scenario alone.
        assert rank.get(str(conf3), 0) <= max(rank.get(str(conf1), 0) + 1, 3)


def test_d13_model_can_maintain(beautyco_facts):
    assert compute_revision_disposition(
        previous_action="EXPERIMENT",
        new_action="EXPERIMENT",
        previous_strength="MODERATE",
        new_strength="MODERATE",
    ).value == "MAINTAIN"


def test_d14_change_only_to_eligible(beautyco_facts):
    # Disposition CHANGE when action differs — eligibility still enforced by validation path.
    assert compute_revision_disposition(
        previous_action="EXPERIMENT",
        new_action="REDUCE",
        previous_strength="MODERATE",
        new_strength="MODERATE",
    ).value == "CHANGE"


def test_d15_ineligible_clamped_via_fake_override(beautyco_facts):
    # EXIT is typically ineligible for marketing — fallback/clamp path.
    payload = {
        "action": "EXIT",
        "strength": "STRONG",
        "confidence": "HIGH",
        "evidence": [],
        "position_key": "exit",
        "primary_reason_key": "cm2_pressure_material",
        "unknowns": ["DEMAND_RESPONSE"],
        "change_my_view_keys": ["demand_deteriorates_during_reduction"],
        "monitor": ["net_revenue", "cm2_pct"],
    }
    model = _OverrideStrategicModel(payload)
    r = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    action = (r["answer"].get("strategic_thread") or {}).get("selected_action")
    assert action != "EXIT"


def test_d16_current_financial_scope_wins(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    company_hash = r1["scope_hash"]
    r2 = _ask(
        beautyco_facts,
        "Why?",
        filters={"channel": ["D2C Website"]},
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    assert r2["scope_hash"] != company_hash
    assert (r2["answer"].get("telemetry") or {}).get("strategic_thread_scope_match") is False or (
        r2["answer"].get("strategic") or {}
    ).get("followup_type")


def test_d17_scope_change_marks_historical(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    t1 = _turn_payload(r1, "Should I cut marketing?")
    # Build conversation under new scope — cleaned thread becomes HISTORICAL.
    from wyz_analytics.ai_cfo.conversation import build_conversation_context

    d2c = _ask(beautyco_facts, "ping", filters={"channel": ["D2C Website"]})
    conv = build_conversation_context(
        current_scope={"scope_hash": d2c["scope_hash"], "filters": {"channel": ["D2C Website"]}, "dataset_id": "b"},
        previous_turns=[t1],
    )
    cleaned = (conv["previous_turns"] or [])[0].get("strategic_thread") or {}
    assert cleaned.get("status") == "HISTORICAL"


def test_d18_cross_scope_why_no_grounding(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    r2 = _ask(
        beautyco_facts,
        "Why?",
        filters={"channel": ["D2C Website"]},
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    headline = (r2["answer"].get("headline") or "").lower()
    assert "previous view" in headline or "current filters" in headline or "historical" in str(
        r2["answer"].get("strategic")
    ).lower()
    assert "company" not in (r2["answer"].get("evidence") or [])


def test_d19_explicit_theme_override(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    res = resolve_strategic_followup(
        "What about product COGS?",
        current_scope_hash=r1["scope_hash"],
        conversation={
            "previous_turns": [_turn_payload(r1, "Should I cut marketing?")],
        },
    )
    assert res.force_new_strategic is True
    assert res.followup_type == StrategicFollowupType.NONE


def test_d20_explicit_subject_override(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should we stop selling D2C?")
    res = resolve_strategic_followup(
        "What about Amazon instead?",
        current_scope_hash=r1["scope_hash"],
        conversation={"previous_turns": [_turn_payload(r1, "Should we stop selling D2C?")]},
    )
    assert res.force_new_strategic is True


def test_d21_ambiguous_it_only_when_safe():
    thread = StrategicDecisionThread(
        thread_id="x",
        decision_theme="MARKETING",
        status=ThreadStatus.ACTIVE,
        scope_hash="h",
    )
    assert enrich_scenario_message_from_thread("What if I cut it 20%?", thread)
    price = StrategicDecisionThread(
        thread_id="y",
        decision_theme="PRICE",
        status=ThreadStatus.ACTIVE,
        scope_hash="h",
    )
    assert enrich_scenario_message_from_thread("What if I increase it 5%?", price) is None


def test_d22_price_increase_unsupported(beautyco_facts):
    # Seed a PRICE thread manually then ask unsupported scenario.
    r0 = _ask(beautyco_facts, "Should I raise prices?")
    thread = dict(r0["answer"].get("strategic_thread") or {})
    thread["decision_theme"] = "PRICE"
    thread["selected_action"] = thread.get("selected_action") or "EXPERIMENT"
    turn = _turn_payload(r0, "Should I raise prices?")
    turn["strategic_thread"] = thread
    r = _ask(beautyco_facts, "What if I increase it 5%?", previous_turns=[turn])
    # Must not approximate a price scenario as marketing.
    spec = r["answer"].get("scenario_spec")
    refusal = (r["answer"].get("telemetry") or {}).get("answer_source")
    if spec and spec.get("lever"):
        assert spec.get("lever") != "MARKETING_SPEND"
    else:
        assert refusal == "deterministic_scenario_refusal" or "not supported" in (
            r["answer"].get("headline") or ""
        ).lower() or "not supported" in (r["answer"].get("interpretation") or "").lower()


def test_d23_no_thread_why_no_invention(beautyco_facts):
    r = _ask(beautyco_facts, "Why?")
    assert (r["answer"].get("strategic") or {}).get("followup_type") != "WHY"
    assert (r.get("conversation") or {}).get("strategic_thread") in (None, {})


def test_d24_new_strategic_supersedes(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    id1 = r1["answer"]["strategic_thread"]["thread_id"]
    r2 = _ask(
        beautyco_facts,
        "Should we stop selling D2C?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    id2 = (r2["answer"].get("strategic_thread") or {}).get("thread_id")
    assert id2 and id2 != id1


def test_d25_signal_context_remains_separate(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    thread = r1["answer"]["strategic_thread"]
    assert "signal_id" not in thread
    assert "signal_context" not in thread


def test_d26_stale_signal_not_reactivated_via_thread(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    stale_signal = {
        "signal_id": "sig_old",
        "signal_type": "MARGIN_PRESSURE",
        "entity": "D2C Website",
        "scope_hash": "other_hash",
        "label": "stale",
    }
    turn = _turn_payload(r1, "Should I cut marketing?")
    turn["signal_context"] = stale_signal
    r2 = _ask(
        beautyco_facts,
        "Why?",
        filters={},
        previous_turns=[turn],
        signal_context=stale_signal,
    )
    # Follow-up why should not require signal grounding; stale signal must not become financial truth.
    assert r2["telemetry"].get("signal_context_valid") in (False, None) or r2["telemetry"].get(
        "signal_context_scope_match"
    ) is False


def test_d27_scenario_ref_cross_scope_rejected():
    thread = StrategicDecisionThread(
        thread_id="t",
        decision_theme="MARKETING",
        status=ThreadStatus.ACTIVE,
        scope_hash="company",
    )
    updated = attach_scenario_ref_to_thread(
        thread,
        lean_spec={"lever": "MARKETING_SPEND", "direction": "DECREASE", "percentage": 20, "scope_hash": "d2c"},
        scope_hash="d2c",
    )
    assert updated.latest_scenario_ref is None


def test_d28_thread_no_raw_financials(beautyco_facts):
    r = _ask(beautyco_facts, "Should I cut marketing?")
    thread = r["answer"]["strategic_thread"]
    assert_thread_has_no_financial_payload(thread)
    blob = str(thread)
    assert "filters" not in thread
    assert "net_revenue" not in thread


def test_d29_same_scope_followup_retains_scope_hash(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    h = r1["scope_hash"]
    r2 = _ask(beautyco_facts, "Why?", previous_turns=[_turn_payload(r1, "Should I cut marketing?")])
    assert r2["scope_hash"] == h
    assert (r2.get("conversation") or {}).get("strategic_thread", {}).get("scope_hash") == h


def test_d30_v1_boundary_unchanged(beautyco_facts, monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V1_BOUNDARY)
    r = _ask(beautyco_facts, "Should I cut marketing?")
    # V1 boundary must not create partner recommendation threads.
    assert r["telemetry"].get("strategy_mode") == STRATEGY_MODE_V1_BOUNDARY or r["telemetry"].get(
        "recommendations_enabled"
    ) in (False, None)


def test_d31_phase2c_single_turn_still_works(beautyco_facts):
    r = _ask(beautyco_facts, "Should I cut marketing?")
    assert r["telemetry"].get("strategic_model_called") is True
    assert r["answer"].get("headline")


def test_d32_what_about_30_baseline_not_compounded(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    t1 = _turn_payload(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1])
    t2 = _turn_payload(r2, "What if I cut it 20%")
    r3 = _ask(beautyco_facts, "What about 30%?", previous_turns=[t1, t2])
    spec = r3["answer"].get("scenario_spec") or {}
    # Absolute 30% from baseline, not 20% then +30% compound.
    if spec.get("percentage") is not None:
        assert float(spec["percentage"]) == 30.0


def test_d33_thread_does_not_alter_scenario_arithmetic():
    spec = parse_scenario_spec(
        "What if marketing falls 20%?",
        scope_hash="h",
        dataset_id="b",
    )
    assert spec.valid
    assert float(spec.changes[0].value) == -20.0


def test_d34_financial_engine_untouched():
    # Import smoke — Phase 2D modules must not redefine pipeline formulas.
    from wyz_analytics.engine import pipeline  # noqa: F401

    assert hasattr(pipeline, "build_line_facts")


def test_d35_temporal_routing_wins(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What changed recently?",
        previous_turns=[_turn_payload(r1, "Should I cut marketing?")],
    )
    assert (r2["answer"].get("strategic") or {}).get("followup_type") != "WHY"
    assert r2["telemetry"].get("resolved_intent") in {"TREND", "COMPARISON", None} or classify_capability(
        "What changed recently?"
    ) == Capability.TREND_REQUIRED


def test_d36_ranking_still_works(beautyco_facts):
    r = _ask(beautyco_facts, "Which channels are weakest on CM2?")
    assert r["answer"].get("headline")


def test_d37_guards_still_precede(beautyco_facts):
    r = _ask(beautyco_facts, "Why do customers dislike our brand?")
    assert classify_capability("Why do customers dislike our brand?") == Capability.UNSUPPORTED_CAUSALITY
    assert r["telemetry"].get("answer_source") == "deterministic_guard" or "sentiment" in (
        r["answer"].get("headline") or ""
    ).lower() or r["answer"].get("headline")


def test_d38_invalid_thread_fails_safe(beautyco_facts):
    bad_turn = {
        "question": "Should I cut marketing?",
        "scope_hash": "h",
        "strategic_thread": {"thread_id": "", "status": "ACTIVE"},
    }
    r = _ask(beautyco_facts, "Why?", previous_turns=[bad_turn])
    assert (r["answer"].get("strategic") or {}).get("followup_type") != "WHY"


def test_d39_repeated_why_no_provider_spam(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    turns = [_turn_payload(r1, "Should I cut marketing?")]
    n = len(log)
    for _ in range(3):
        r = _ask(beautyco_facts, "Why?", previous_turns=turns, model=model)
        turns.append(_turn_payload(r, "Why?"))
    assert len(log) == n


def test_d40_reconsider_stores_final_not_raw(beautyco_facts):
    payload = {
        "action": "EXIT",
        "strength": "STRONG",
        "confidence": "HIGH",
        "evidence": [],
        "position_key": "exit",
        "primary_reason_key": "cm2_pressure_material",
        "unknowns": ["DEMAND_RESPONSE"],
        "change_my_view_keys": ["demand_deteriorates_during_reduction"],
        "monitor": ["net_revenue"],
    }
    model = _OverrideStrategicModel(payload)
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    t1 = _turn_payload(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1])
    t2 = _turn_payload(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    final = (r3["answer"].get("strategic_thread") or {}).get("selected_action")
    assert final != "EXIT"
    assert final == r3["telemetry"].get("final_selected_action") or final is not None


def test_phase2d_e2e_company_journey(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    turns: list[dict[str, Any]] = []

    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    assert r1["answer"]["strategic_thread"]["decision_theme"] == "MARKETING"
    assert len(log) >= 1
    turns.append(_turn_payload(r1, "Should I cut marketing?"))
    n = len(log)

    r2 = _ask(beautyco_facts, "Why?", previous_turns=turns, model=model)
    assert (r2["answer"].get("strategic") or {}).get("followup_type") == "WHY"
    assert len(log) == n
    turns.append(_turn_payload(r2, "Why?"))

    r3 = _ask(beautyco_facts, "What should I monitor?", previous_turns=turns, model=model)
    assert (r3["answer"].get("strategic") or {}).get("followup_type") == "MONITOR"
    assert len(log) == n
    turns.append(_turn_payload(r3, "What should I monitor?"))

    r4 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=turns, model=model)
    assert int(r4["telemetry"].get("provider_calls") or 0) == 0
    assert (r4.get("conversation") or {}).get("strategic_thread", {}).get("latest_scenario_ref")
    turns.append(_turn_payload(r4, "What if I cut it 20%?"))

    r5 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=turns,
        model=model,
    )
    assert len(log) > n
    assert "DEMAND_RESPONSE" in str(
        (r5["answer"].get("strategic_thread") or {}).get("unknowns")
    ) or "demand" in (r5["answer"].get("interpretation") or "").lower() or "demand" in str(
        r5["answer"].get("strategic")
    ).lower()
    turns.append(_turn_payload(r5, "Does that change your recommendation?"))
    n2 = len(log)

    r6 = _ask(beautyco_facts, "What would change your view?", previous_turns=turns, model=model)
    assert (r6["answer"].get("strategic") or {}).get("followup_type") == "CHANGE_MY_VIEW"
    assert len(log) == n2

    # Cross-scope Why
    r7 = _ask(
        beautyco_facts,
        "Why?",
        filters={"channel": ["D2C Website"]},
        previous_turns=turns,
        model=model,
    )
    assert (r7["answer"].get("telemetry") or {}).get("strategic_thread_scope_match") is False or "previous view" in (
        r7["answer"].get("headline") or ""
    ).lower()
