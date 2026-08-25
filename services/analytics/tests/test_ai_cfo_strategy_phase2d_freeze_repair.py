"""Phase 2D freeze-repair — scenario-aware reconsider + lean follow-up shapes (R1–R30)."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.scenario_context import (
    model_facing_scenario_context,
    resolve_scenario_context_for_reconsider,
    spec_from_scenario_thread_ref,
)
from wyz_analytics.ai_cfo.strategy.strategic_prompt import compact_strategic_context
from wyz_analytics.ai_cfo.strategy.thread import (
    ScenarioThreadRef,
    StrategicDecisionThread,
    ThreadStatus,
    attach_scenario_ref_to_thread,
    compute_revision_disposition,
)
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


def _ask(facts, message, *, filters=None, previous_turns=None, model=None, signal_context=None):
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


def _turn(response: dict[str, Any], message: str) -> dict[str, Any]:
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


def test_r1_creates_active_marketing_thread(beautyco_facts):
    r = _ask(beautyco_facts, "Should I cut marketing?")
    thread = r["answer"]["strategic_thread"]
    assert thread["status"] == "ACTIVE"
    assert thread["decision_theme"] == "MARKETING"


def test_r2_why_same_thread(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "Why?", previous_turns=[_turn(r1, "Should I cut marketing?")])
    assert r2["answer"]["strategic"]["followup_type"] == "WHY"
    assert r2["answer"]["strategic_thread"]["thread_id"] == r1["answer"]["strategic_thread"]["thread_id"]


def test_r3_why_no_monitor_cmv_replay(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "Why?", previous_turns=[_turn(r1, "Should I cut marketing?")])
    body = r2["answer"]["strategic"]
    assert body.get("response_type") == "WHY"
    assert "monitoring" not in body
    assert "what_would_change_my_view" not in body
    assert "next_step" not in body


def test_r4_cmv_specific_shape(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What would change your view?",
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    body = r2["answer"]["strategic"]
    assert body.get("response_type") == "CHANGE_MY_VIEW"
    assert body.get("what_would_change_my_view")
    assert "monitoring" not in body
    assert "next_step" not in body


def test_r5_monitor_specific_shape(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What should I monitor?",
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    body = r2["answer"]["strategic"]
    assert body.get("response_type") == "MONITOR"
    assert isinstance(body.get("monitoring"), list)
    assert "what_would_change_my_view" not in body
    assert "next_step" not in body


def test_r6_monitor_labels_structured(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What should I monitor?",
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    labels = r2["answer"]["strategic"]["monitoring"]
    assert len(labels) >= 2
    joined = " · ".join(labels)
    assert "CM2Net" not in joined
    assert " · " in joined or len(labels) == 1


def test_r7_next_step_specific_shape(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What should I do next?",
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    body = r2["answer"]["strategic"]
    assert body.get("response_type") == "NEXT_STEP"
    assert body.get("next_step")
    assert "what_would_change_my_view" not in body


def test_r8_pronoun_resolves_marketing(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What if I cut it 20%?",
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    spec = r2["answer"].get("scenario_spec") or {}
    assert spec.get("lever") == "MARKETING_SPEND" or r2["answer"].get("answer_kind") == "SCENARIO"


def test_r9_scenario_attaches_ref(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(
        beautyco_facts,
        "What if I cut it 20%?",
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    ref = (r2["answer"].get("strategic_thread") or {}).get("latest_scenario_ref")
    assert ref and ref.get("scope_hash") == r2["scope_hash"]
    assert ref.get("percentage") == 20 or float(ref.get("percentage") or 0) == 20


def test_r10_reconsider_receives_scenario_context(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], model=model)
    t2 = _turn(r2, "What if I cut it 20%")
    _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    last = log[-1]["model_input"]
    assert last.get("new_evidence") or last.get("scenario_context")
    ne = last.get("new_evidence") or last.get("scenario_context")
    assert ne.get("provenance") == "CALCULATED_SCENARIO" or ne.get("type") == "SCENARIO"


def test_r11_reconsider_model_input_prior_and_new(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], model=model)
    t2 = _turn(r2, "What if I cut it 20%")
    _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    mi = log[-1]["model_input"]
    compact = compact_strategic_context(mi)
    assert compact.get("prior_position") or (mi.get("conversation_context") or {}).get("prior_position")
    assert compact.get("new_evidence")
    effects = (compact["new_evidence"] or {}).get("mechanical_effects") or []
    assert effects
    # Model-facing effects have directions, not raw ₹ dumps.
    assert "baseline_value" not in effects[0]


def test_r12_scenario_provenance_calculated(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
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
    ne = (log[-1]["model_input"].get("new_evidence") or {})
    assert ne.get("provenance") == "CALCULATED_SCENARIO"
    evidence = r3["answer"].get("evidence") or []
    assert evidence
    assert any(
        e.get("provenance") in {"CALCULATED_SCENARIO", "SCENARIO_CALCULATED"}
        or "scenario" in str(e.get("evidence_id") or "")
        for e in evidence
    )


def test_r13_scenario_does_not_raise_ceiling(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    conf1 = r1["answer"]["strategic_thread"].get("decision_confidence")
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1])
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
    )
    conf3 = (r3["answer"].get("strategic_thread") or {}).get("decision_confidence")
    rank = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "VERY_HIGH": 4}
    if conf1 and conf3:
        assert rank.get(str(conf3), 0) <= max(rank.get(str(conf1), 2), 3)


def test_r14_may_maintain():
    assert compute_revision_disposition(
        previous_action="EXPERIMENT",
        new_action="EXPERIMENT",
        previous_strength="MODERATE",
        new_strength="MODERATE",
    ).value == "MAINTAIN"


def test_r15_may_strengthen():
    assert compute_revision_disposition(
        previous_action="EXPERIMENT",
        new_action="EXPERIMENT",
        previous_strength="WEAK",
        new_strength="MODERATE",
    ).value == "STRENGTHEN"


def test_r16_may_weaken():
    assert compute_revision_disposition(
        previous_action="EXPERIMENT",
        new_action="EXPERIMENT",
        previous_strength="MODERATE",
        new_strength="WEAK",
    ).value == "WEAKEN"


def test_r17_may_change():
    assert compute_revision_disposition(
        previous_action="EXPERIMENT",
        new_action="OPTIMIZE",
        previous_strength="MODERATE",
        new_strength="MODERATE",
    ).value == "CHANGE"


def test_r18_python_does_not_force_disposition(beautyco_facts):
    # Disposition is derived from model-selected action/strength after validation — not pre-set.
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
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
    assert (r3["answer"].get("strategic") or {}).get("revision") in {
        "MAINTAIN",
        "STRENGTHEN",
        "WEAKEN",
        "CHANGE",
        None,
    }
    # Model input must not contain a prechosen disposition.
    mi = log[-1]["model_input"]
    assert "forced_revision" not in mi
    assert (mi.get("conversation_context") or {}).get("forced_disposition") is None


def test_r19_ineligible_change_clamped(beautyco_facts):
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
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1])
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    assert (r3["answer"].get("strategic_thread") or {}).get("selected_action") != "EXIT"


def test_r20_reconsider_displays_scenario_evidence(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1])
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
    )
    body = r3["answer"].get("strategic") or {}
    assert body.get("response_type") == "RECONSIDERATION"
    assert r3["answer"].get("evidence")
    assert body.get("what_this_changes") or body.get("what_it_doesnt_tell_us")


def test_r21_demand_response_preserved(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1])
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
    )
    unknowns = (r3["answer"].get("strategic_thread") or {}).get("unknowns") or []
    uncertainty = (r3["answer"].get("strategic") or {}).get("uncertainty") or []
    blob = " ".join([str(u) for u in unknowns] + [str(u) for u in uncertainty]).lower()
    assert "demand" in blob or "DEMAND_RESPONSE" in unknowns


def test_r22_cross_scope_scenario_ref_excluded(beautyco_facts):
    thread = StrategicDecisionThread(
        thread_id="t",
        decision_theme="MARKETING",
        status=ThreadStatus.ACTIVE,
        scope_hash="company",
        latest_scenario_ref=ScenarioThreadRef(
            scenario_ref="scn_x",
            lever="MARKETING_SPEND",
            direction="DECREASE",
            percentage=20,
            scope_hash="d2c",
        ),
    )
    tools = AiCfoTools(
        beautyco_facts,
        active_filters={"channel": ["D2C Website"]},
        surface="margin",
        dimension="channel",
        dataset_id="b",
    )
    ctx = resolve_scenario_context_for_reconsider(
        thread,
        tools=tools,
        financial_scope=tools.financial_scope,
    )
    assert ctx is None


def test_r23_cross_scope_thread_historical(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    from wyz_analytics.ai_cfo.conversation import build_conversation_context

    d2c = _ask(beautyco_facts, "ping", filters={"channel": ["D2C Website"]})
    conv = build_conversation_context(
        current_scope={"scope_hash": d2c["scope_hash"], "filters": {"channel": ["D2C Website"]}, "dataset_id": "b"},
        previous_turns=[_turn(r1, "Should I cut marketing?")],
    )
    cleaned = (conv["previous_turns"] or [])[0].get("strategic_thread") or {}
    assert cleaned.get("status") == "HISTORICAL"


def test_r24_cross_scope_reconsider_no_stale_scenario(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?", filters={})
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], filters={})
    t2 = _turn(r2, "What if I cut it 20%")
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        filters={"channel": ["D2C Website"]},
    )
    # Must not ground company scenario into D2C.
    assert (r3["answer"].get("strategic") or {}).get("response_type") != "RECONSIDERATION" or (
        r3["answer"].get("telemetry") or {}
    ).get("strategic_thread_scope_match") is False
    evidence = r3["answer"].get("evidence") or []
    # If any scenario evidence slipped through, scope must match current.
    for row in evidence:
        if row.get("provenance") == "CALCULATED_SCENARIO":
            assert row.get("scope_hash") == r3["scope_hash"]


def test_r25_client_scenario_numbers_not_trusted(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    t1 = _turn(r1, "Should I cut marketing?")
    # Poison conversation payload with fake scenario numbers.
    t1["strategic_thread"] = dict(t1["strategic_thread"] or {})
    t1["strategic_thread"]["latest_scenario_ref"] = {
        "scenario_ref": "scn_fake",
        "lever": "MARKETING_SPEND",
        "direction": "DECREASE",
        "percentage": 20,
        "scope_hash": r1["scope_hash"],
        "cm2_delta": 999999999,  # must never be used as truth
    }
    r2 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1],
    )
    blob = str(r2["answer"])
    assert "999999999" not in blob


def test_r26_price_unsupported_no_fake_scenario():
    thread = StrategicDecisionThread(
        thread_id="p",
        decision_theme="PRICE",
        status=ThreadStatus.ACTIVE,
        scope_hash="h",
        latest_scenario_ref=ScenarioThreadRef(
            scenario_ref="scn_price",
            lever="PRICE",  # unsupported
            direction="INCREASE",
            percentage=5,
            scope_hash="h",
        ),
    )
    spec = spec_from_scenario_thread_ref(thread.latest_scenario_ref, scope_hash="h")
    assert spec is None or not spec.valid


def test_r27_followups_zero_provider(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    n = len(log)
    turns = [_turn(r1, "Should I cut marketing?")]
    for q in ("Why?", "What would change your view?", "What should I monitor?", "What should I do next?"):
        r = _ask(beautyco_facts, q, previous_turns=turns, model=model)
        turns.append(_turn(r, q))
    assert len(log) == n


def test_r28_reconsider_may_call_provider(beautyco_facts):
    log: list = []
    model = _OverrideStrategicModel(call_log=log)
    r1 = _ask(beautyco_facts, "Should I cut marketing?", model=model)
    t1 = _turn(r1, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "What if I cut it 20%?", previous_turns=[t1], model=model)
    t2 = _turn(r2, "What if I cut it 20%")
    n = len(log)
    r3 = _ask(
        beautyco_facts,
        "Does that change your recommendation?",
        previous_turns=[t1, t2],
        model=model,
    )
    assert len(log) == n + 1
    assert r3["telemetry"].get("strategic_reconsideration_model_called") is True or r3[
        "telemetry"
    ].get("strategic_model_called")


def test_r29_phase2c_single_turn_unchanged(beautyco_facts):
    r = _ask(beautyco_facts, "Should I cut marketing?")
    body = r["answer"].get("strategic") or {}
    # Full initial decision card still has why + next_step + monitoring.
    assert body.get("why") or body.get("direct_answer")
    assert body.get("next_step") or body.get("monitoring")
    assert body.get("response_type") not in {"WHY", "MONITOR", "CHANGE_MY_VIEW"}


def test_r30_scenario_path_unchanged(beautyco_facts):
    r = _ask(beautyco_facts, "What if marketing falls 20%?")
    assert r["answer"].get("answer_kind") == "SCENARIO" or r["telemetry"].get("scenario_engine_used") is not False
    assert int(r["telemetry"].get("provider_calls") or 0) == 0
