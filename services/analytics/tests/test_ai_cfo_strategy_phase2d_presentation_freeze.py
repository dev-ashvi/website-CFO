"""Phase 2D presentation freeze-repair (P1–P20)."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.strategy.followup_answers import (
    compose_next_step_followup_answer,
    compose_reconsideration_presentation,
    compose_why_followup_answer,
)
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.strategic_presentation import (
    contains_unresolved_internal_keys,
    resolve_metric_label,
    resolve_scenario_effect_text,
    sanitize_founder_prose,
)
from wyz_analytics.ai_cfo.strategy.thread import StrategicDecisionThread, ThreadStatus
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


def _ask(facts, message, *, filters=None, previous_turns=None, model=None):
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
        model=model,
    )


def _turn(response: dict[str, Any], message: str) -> dict[str, Any]:
    conv = response.get("conversation") or {}
    return {
        "question": message,
        "scope_hash": conv.get("scope_hash") or response.get("scope_hash"),
        "strategic": conv.get("strategic"),
        "strategic_thread": conv.get("strategic_thread") or response["answer"].get("strategic_thread"),
        "scenario_spec": conv.get("scenario_spec") or response["answer"].get("scenario_spec"),
        "selected_entities": conv.get("selected_entities") or [],
        "selected_evidence_ids": conv.get("selected_evidence_ids") or [],
    }


def _prose_blob(answer: dict[str, Any]) -> str:
    strategic = answer.get("strategic") or {}
    parts = [answer.get("headline"), answer.get("interpretation")]
    for key in (
        "direct_answer",
        "why",
        "next_step",
        "therefore",
        "what_this_changes",
        "what_it_doesnt_tell_us",
        "new_evidence_summary",
    ):
        parts.append(strategic.get(key))
    for key in ("uncertainty", "what_would_change_my_view", "monitoring"):
        items = strategic.get(key)
        if isinstance(items, list):
            parts.extend(str(x) for x in items)
        elif items:
            parts.append(str(items))
    return " ".join(str(p) for p in parts if p)


class _LogModel(FakeAiCfoModel):
    def __init__(self):
        super().__init__()
        self.calls = 0

    def run_strategic_turn(self, *, message: str, model_input: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        self.calls += 1
        return super().run_strategic_turn(message=message, model_input=model_input, context=context)


def test_p1_no_raw_keys_in_reconsideration_prose():
    body = compose_reconsideration_presentation(
        headline="Test headline",
        why="because",
        uncertainty=["demand unknown"],
        next_step="Run a controlled marketing reduction.",
        monitoring=["CM2", "Net revenue"],
        revision_disposition="MAINTAIN",
        prior_action="EXPERIMENT",
        scenario_context={
            "lever": "MARKETING_SPEND",
            "mechanical_effects": [
                {"metric_key": "allocated_marketing", "direction": "DECREASES"},
                {"metric_key": "cm2", "direction": "IMPROVES"},
                {"metric_key": "cm2_pct", "direction": "IMPROVES"},
            ],
        },
        evidence=[],
    )
    blob = " ".join(str(body.get(k) or "") for k in body)
    assert "allocated_marketing" not in blob
    assert "cm2_pct" not in blob
    assert "cm2," not in blob or "CM2" in blob


def test_p2_allocated_marketing_label():
    assert resolve_metric_label("allocated_marketing") == "attributed marketing spend"
    text, _ = resolve_scenario_effect_text(
        [{"metric_key": "allocated_marketing", "direction": "DECREASES"}, {"metric_key": "cm2", "direction": "IMPROVES"}],
        lever="MARKETING_SPEND",
    )
    assert text
    assert "attributed marketing spend" in text
    assert "allocated_marketing" not in text


def test_p3_cm2_pct_label():
    assert resolve_metric_label("cm2_pct") == "CM2 margin"
    text, _ = resolve_scenario_effect_text(
        [{"metric_key": "cm2_pct", "direction": "IMPROVES"}],
        lever="MARKETING_SPEND",
    )
    assert text and "CM2 margin" in text
    assert "cm2_pct" not in text


def test_p4_unknown_key_does_not_leak():
    assert "weird_internal_metric_xyz" not in resolve_metric_label("weird_internal_metric_xyz")
    cleaned = sanitize_founder_prose("Pressure from weird_internal_metric_xyz remains.")
    assert cleaned
    assert "weird_internal_metric_xyz" not in cleaned
    assert contains_unresolved_internal_keys(cleaned) is False


def test_p5_reconsider_distinguishes_sensitivity(beautyco_facts):
    model = _LogModel()
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], model=model)
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    body = r3["answer"].get("strategic") or {}
    assert body.get("what_this_changes")
    assert body.get("what_it_doesnt_tell_us")
    doesnt = (body.get("what_it_doesnt_tell_us") or "").lower()
    assert "demand" in doesnt or "orders" in doesnt or "revenue" in doesnt


def test_p6_scenario_does_not_claim_stable_revenue(beautyco_facts):
    model = _LogModel()
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], model=model)
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    blob = _prose_blob(r3["answer"]).lower()
    assert "revenue will remain" not in blob
    assert "orders will remain" not in blob
    assert "demand will not" not in blob


def test_p7_may_say_held_constant_in_sensitivity():
    text, _ = resolve_scenario_effect_text(
        [
            {"metric_key": "allocated_marketing", "direction": "DECREASES"},
            {"metric_key": "cm2", "direction": "IMPROVES"},
        ],
        lever="MARKETING_SPEND",
    )
    assert text and "held constant" in text.lower()


def test_p8_marketing_reconsider_bounded_language(beautyco_facts):
    model = _LogModel()
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], model=model)
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    blob = _prose_blob(r3["answer"]).lower()
    assert "test" in blob or "controlled" in blob or "measured" in blob
    assert "broad cut" in blob or "permanent" in blob or "demand" in blob


def test_p9_channel_exit_why_specific(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should we stop selling D2C?")
    r2 = _ask(beautyco_facts, "Why?", previous_turns=[_turn(r1, "Should we stop selling D2C?")])
    headline = (r2["answer"].get("headline") or "").lower()
    assert "tied to the channel exit decision" not in headline
    assert "contribution" in headline or "exit" in headline or "channel" in headline or "d2c" in headline


def test_p10_channel_exit_why_zero_provider(beautyco_facts):
    model = _LogModel()
    r1 = _ask(beautyco_facts, "Should we stop selling D2C?", model=model)
    n = model.calls
    _ask(beautyco_facts, "Why?", previous_turns=[_turn(r1, "Should we stop selling D2C?")], model=model)
    assert model.calls == n


def test_p11_marketing_why_theme_specific(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "Why?", previous_turns=[_turn(r1, "Should I cut marketing?")])
    blob = _prose_blob(r2["answer"]).lower()
    assert "marketing" in blob and "cm2" in blob
    assert "tied to the" not in blob


def test_p12_price_why_elasticity_specific():
    thread = StrategicDecisionThread(
        thread_id="p",
        decision_theme="PRICE",
        selected_action="EXPERIMENT",
        status=ThreadStatus.ACTIVE,
        scope_hash="h",
        unknowns=["PRICE_ELASTICITY"],
        primary_reason_key="elasticity_unknown",
    )
    answer = compose_why_followup_answer(thread)
    blob = _prose_blob(answer).lower()
    assert "price" in blob or "customers" in blob or "elasticity" in blob or "respond" in blob
    assert "tied to the" not in blob


def test_p13_prioritize_why_references_candidate():
    thread = StrategicDecisionThread(
        thread_id="pr",
        decision_theme="PRIORITIZE",
        selected_action="OPTIMIZE",
        status=ThreadStatus.ACTIVE,
        scope_hash="h",
        priority_candidate_id="priority:marketing",
        current_position="verified marketing pressure",
    )
    answer = compose_why_followup_answer(thread)
    blob = _prose_blob(answer).lower()
    assert "priority:marketing" not in blob
    assert "first focus" in blob or "material" in blob or "pressure" in blob


def test_p14_monitor_formatted(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What should I monitor?",
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    monitoring = (r2["answer"].get("strategic") or {}).get("monitoring")
    assert isinstance(monitoring, list)
    assert all("_" not in str(m) for m in monitoring)


def test_p15_next_step_after_reconsider_uses_revised_thread(beautyco_facts):
    model = _LogModel()
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], model=model)
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    t3 = _turn(r3, "Does that change your recommendation?")
    r4 = _ask(
        beautyco_facts,
        "What should I do next?",
        previous_turns=[t1, t2, t3],
        model=model,
    )
    body = r4["answer"].get("strategic") or {}
    assert body.get("response_type") == "NEXT_STEP"
    blob = _prose_blob(r4["answer"]).lower()
    assert "controlled" in blob or "compare" in blob or "test" in blob or "monitor" in blob
    # Thread action continuity
    assert (r4["answer"].get("strategic_thread") or {}).get("selected_action") == (
        r3["answer"].get("strategic_thread") or {}
    ).get("selected_action")


def test_p16_next_step_zero_provider(beautyco_facts):
    model = _LogModel()
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    n = model.calls
    _ask(
        beautyco_facts,
        "What should I do next?",
        previous_turns=[_turn(r1, "Should I cut marketing?")],
        model=model,
    )
    assert model.calls == n


def test_p17_cross_scope_why_refuses_stale(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    r2 = _ask(
        beautyco_facts,
        "Why?",
        filters={"channel": ["D2C Website"]},
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    headline = (r2["answer"].get("headline") or "").lower()
    assert "previous view" in headline or "current filters" in headline


def test_p18_cross_scope_historical(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    from wyz_analytics.ai_cfo.conversation import build_conversation_context

    d2c = _ask(beautyco_facts, "ping", filters={"channel": ["D2C Website"]})
    conv = build_conversation_context(
        current_scope={"scope_hash": d2c["scope_hash"], "filters": {"channel": ["D2C Website"]}, "dataset_id": "b"},
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    assert (conv["previous_turns"][0].get("strategic_thread") or {}).get("status") == "HISTORICAL"


def test_p19_phase2c_initial_still_full_card(beautyco_facts):
    r = _ask(beautyco_facts, "Should I cut marketing?")
    body = r["answer"].get("strategic") or {}
    assert body.get("why") or body.get("direct_answer")
    assert body.get("next_step") or body.get("monitoring")
    assert contains_unresolved_internal_keys(_prose_blob(r["answer"])) is False


def test_p20_no_unresolved_keys_in_followup_fields(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    turns = [_turn(r1, "Should I cut marketing?")]
    for q in ("Why?", "What would change your view?", "What should I monitor?", "What should I do next?"):
        r = _ask(beautyco_facts, q, previous_turns=turns)
        turns.append(_turn(r, q))
        assert contains_unresolved_internal_keys(_prose_blob(r["answer"])) is False

    # Unit: next step after EXPERIMENT uses controlled language without keys.
    thread = StrategicDecisionThread.from_dict(r1["answer"]["strategic_thread"])
    assert thread is not None
    nxt = compose_next_step_followup_answer(thread)
    assert contains_unresolved_internal_keys(_prose_blob(nxt)) is False
