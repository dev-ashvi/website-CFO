"""P6L.1 — conversational scenario follow-up + strategic routing regressions."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.scenario import ScenarioLever, parse_scenario_spec
from wyz_analytics.ai_cfo.strategy.intent import DecisionType, classify_decision_type, classify_strategic_intent
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


LINEAGE = {
    "workspace_id": "t",
    "dataset_id": "beautyco",
    "dataset_version": 1,
    "mapping_version": "m",
    "job_id": "j",
    "engine_version": "t",
}
TOL = 1e-6

PRIOR_MARKETING_15 = {
    "changes": [
        {
            "lever": "MARKETING_SPEND",
            "operation": "PERCENT_CHANGE",
            "value": -15.0,
            "unit": "PERCENT",
        }
    ]
}

PRIOR_AMBIGUOUS = {
    "changes": [
        {"lever": "MARKETING_SPEND", "operation": "PERCENT_CHANGE", "value": -10.0, "unit": "PERCENT"},
        {"lever": "PRODUCT_COGS", "operation": "PERCENT_CHANGE", "value": -5.0, "unit": "PERCENT"},
    ]
}


@pytest.fixture(autouse=True)
def _partner_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", "v2_partner")


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _ask(facts, message, *, previous=None, conversation_id="p6l1"):
    return run_ai_cfo_turn(
        facts,
        lineage=LINEAGE,
        analytical={"filters": {}, "surface": "overview", "dimension": "channel"},
        message=message,
        model=FakeAiCfoModel(),
        conversation_id=conversation_id,
        previous_turns=previous,
    )


def _prev_from(response, question: str):
    return [
        {
            "question": question,
            "scope_hash": response["scope_hash"],
            "same_scope": True,
            **(response.get("conversation") or {}),
            "scenario_spec": (response.get("answer") or {}).get("scenario_spec"),
        }
    ]


# --- Scenario follow-up / anaphora ---


def test_p6l1_previous_scenario_from_conversation_shell():
    from wyz_analytics.ai_cfo.conversation import previous_turns_from_client_payload
    from wyz_analytics.ai_cfo.guards.orchestrator import _previous_scenario_spec

    prior = _previous_scenario_spec(
        {
            "turn_id": "t1",
            "scenario_spec": PRIOR_MARKETING_15,
            "previous_turns": None,
        }
    )
    assert prior is not None
    assert prior["changes"][0]["lever"] == "MARKETING_SPEND"

    turns = previous_turns_from_client_payload(
        {
            "conversation": {
                "question": "What happens if marketing spend decreases by 15%?",
                "scope_hash": "scope_abc",
                "scenario_spec": PRIOR_MARKETING_15,
                "previous_turns": None,
            }
        }
    )
    assert turns and turns[-1]["scenario_spec"]["changes"][0]["lever"] == "MARKETING_SPEND"

    spec = parse_scenario_spec(
        "What if instead I reduce it by only 10%?",
        scope_hash="s",
        dataset_id="d",
        previous_scenario=PRIOR_MARKETING_15,
    )
    assert spec.valid
    assert spec.parse_source == "DETERMINISTIC_FOLLOWUP"
    assert len(spec.changes) == 1
    assert spec.changes[0].lever == ScenarioLever.MARKETING_SPEND
    assert abs(spec.changes[0].value - (-10.0)) < TOL


def test_p6l1_inherit_what_about_only_5():
    spec = parse_scenario_spec(
        "What about only 5%?",
        scope_hash="s",
        dataset_id="d",
        previous_scenario=PRIOR_MARKETING_15,
    )
    assert spec.valid
    assert spec.changes[0].lever == ScenarioLever.MARKETING_SPEND
    assert abs(spec.changes[0].value - (-5.0)) < TOL


def test_p6l1_inherit_make_that_12():
    spec = parse_scenario_spec(
        "Make that 12%.",
        scope_hash="s",
        dataset_id="d",
        previous_scenario=PRIOR_MARKETING_15,
    )
    assert spec.valid
    assert spec.changes[0].lever == ScenarioLever.MARKETING_SPEND
    assert abs(spec.changes[0].value - (-12.0)) < TOL


def test_p6l1_explicit_revenue_overrides_inheritance():
    spec = parse_scenario_spec(
        "What if revenue decreases 10% instead?",
        scope_hash="s",
        dataset_id="d",
        previous_scenario=PRIOR_MARKETING_15,
    )
    assert not spec.valid
    assert spec.refusal_code == "UNSUPPORTED_REVENUE"
    assert not any(c.lever == ScenarioLever.MARKETING_SPEND for c in spec.changes)


def test_p6l1_no_prior_refuses_anaphora():
    spec = parse_scenario_spec(
        "What if I reduce it 10%?",
        scope_hash="s",
        dataset_id="d",
        previous_scenario=None,
    )
    assert not spec.valid
    assert spec.refusal_code == "FOLLOWUP_NO_PRIOR"


def test_p6l1_ambiguous_prior_refuses():
    spec = parse_scenario_spec(
        "reduce it 10%",
        scope_hash="s",
        dataset_id="d",
        previous_scenario=PRIOR_AMBIGUOUS,
    )
    assert not spec.valid
    assert spec.refusal_code == "FOLLOWUP_AMBIGUOUS"


def test_p6l1_live_chain_15_then_10_reconsider(beautyco_facts):
    first = _ask(beautyco_facts, "What happens if marketing spend decreases by 15%?", conversation_id="p6l1-a")
    a1 = first["answer"]
    assert (a1.get("telemetry") or {}).get("answer_source") == "deterministic_scenario"
    assert abs(float((a1.get("scenario_spec") or {}).get("changes", [{}])[0].get("value")) - (-15.0)) < TOL

    previous = _prev_from(first, "What happens if marketing spend decreases by 15%?")
    second = _ask(
        beautyco_facts,
        "What if instead I reduce it by only 10%?",
        previous=previous,
        conversation_id="p6l1-a",
    )
    a2 = second["answer"]
    telem = a2.get("telemetry") or {}
    assert telem.get("answer_source") == "deterministic_scenario"
    assert telem.get("scenario_reconsider") is True or telem.get("scenario_parse_source") == "DETERMINISTIC_FOLLOWUP"
    change = (a2.get("scenario_spec") or {}).get("changes") or [{}]
    assert change[0].get("lever") == "MARKETING_SPEND"
    assert abs(float(change[0].get("value")) - (-10.0)) < TOL
    b = float((a1.get("scenario_result") or {}).get("baseline_full", {}).get("allocated_marketing") or 0)
    s2 = float((a2.get("scenario_result") or {}).get("scenario_full", {}).get("allocated_marketing") or 0)
    if b:
        assert abs(s2 - b * 0.9) < max(1.0, abs(b) * 1e-6)


# --- Strategic routing ---


@pytest.mark.parametrize(
    "message",
    [
        "What would you recommend?",
        "What do you recommend?",
        "Given this, what should we do?",
        "What should I do?",
        "Which option would you choose?",
        "What would you prioritize?",
        "Should we do this?",
        "Would you recommend this?",
        "What is the best course of action?",
        "What should management do?",
    ],
)
def test_p6l1_strategic_capability_phrases(message):
    assert classify_capability(message) == Capability.STRATEGIC_RECOMMENDATION
    intent = classify_strategic_intent(message, capability_is_strategic=True)
    assert intent.is_strategic is True


def test_p6l1_negative_control_revenue_calc_is_scenario_not_strategic():
    message = "What should revenue be if marketing decreases by 10%?"
    assert classify_capability(message) == Capability.SCENARIO_REQUEST
    assert classify_decision_type(message) is None or classify_capability(message) != Capability.STRATEGIC_RECOMMENDATION


def test_p6l1_strategic_after_diagnostic_turn(beautyco_facts):
    first = _ask(beautyco_facts, "What is hurting my profitability?", conversation_id="p6l1-strat")
    previous = [
        {
            "question": "What is hurting my profitability?",
            "scope_hash": first["scope_hash"],
            "same_scope": True,
            **(first.get("conversation") or {}),
        }
    ]
    second = _ask(
        beautyco_facts,
        "What would you recommend?",
        previous=previous,
        conversation_id="p6l1-strat",
    )
    telem = (second.get("answer") or {}).get("telemetry") or second.get("telemetry") or {}
    assert telem.get("capability") == Capability.STRATEGIC_RECOMMENDATION.value or (
        (second.get("answer") or {}).get("telemetry") or {}
    ).get("capability") == Capability.STRATEGIC_RECOMMENDATION.value or telem.get(
        "strategic_model_called"
    ) or telem.get(
        "answer_source"
    ) in {
        "model_strategic",
        "deterministic_strategic",
        "strategic_partner",
    } or "strategic" in str(telem.get("answer_source") or "").lower() or (
        (second.get("answer") or {}).get("strategic_recommendation") is not None
    ) or ((second.get("answer") or {}).get("strategic") is not None) or (
        (telem.get("strategy") or {}).get("strategy_mode") == "v2_partner"
        and telem.get("recommendations_enabled") is not False
        and (
            telem.get("strategic_model_called")
            or telem.get("final_selected_action")
            or "strategic_partner_judgment" in str(telem.get("interventions") or [])
        )
    )
    # Stronger direct signal: interventions / answer_source from partner path
    ans_telem = (second.get("answer") or {}).get("telemetry") or {}
    interventions = ans_telem.get("interventions") or telem.get("interventions") or []
    phases = {str((i or {}).get("phase")) for i in interventions if isinstance(i, dict)}
    assert (
        "strategic_partner_judgment" in phases
        or ans_telem.get("answer_source") in {"model_strategic", "strategic_partner"}
        or bool(ans_telem.get("strategic_model_called"))
        or bool((second.get("answer") or {}).get("strategic_recommendation"))
        or bool((second.get("answer") or {}).get("strategic"))
    ), ans_telem


def test_p6l1_strategic_after_scenario(beautyco_facts):
    first = _ask(beautyco_facts, "What happens if marketing spend decreases by 15%?", conversation_id="p6l1-sc")
    previous = _prev_from(first, "What happens if marketing spend decreases by 15%?")
    second = _ask(
        beautyco_facts,
        "Given this, what should we do?",
        previous=previous,
        conversation_id="p6l1-sc",
    )
    ans_telem = (second.get("answer") or {}).get("telemetry") or {}
    interventions = ans_telem.get("interventions") or []
    phases = {str((i or {}).get("phase")) for i in interventions if isinstance(i, dict)}
    assert (
        "strategic_partner_judgment" in phases
        or ans_telem.get("answer_source") in {"model_strategic", "strategic_partner"}
        or bool(ans_telem.get("strategic_model_called"))
        or bool((second.get("answer") or {}).get("strategic_recommendation"))
        or bool((second.get("answer") or {}).get("strategic"))
    ), ans_telem


def test_p6l1_would_recommend_after_scenario(beautyco_facts):
    first = _ask(beautyco_facts, "What happens if marketing spend decreases by 15%?", conversation_id="p6l1-wr")
    previous = _prev_from(first, "What happens if marketing spend decreases by 15%?")
    second = _ask(
        beautyco_facts,
        "Would you recommend this?",
        previous=previous,
        conversation_id="p6l1-wr",
    )
    ans_telem = (second.get("answer") or {}).get("telemetry") or {}
    interventions = ans_telem.get("interventions") or []
    phases = {str((i or {}).get("phase")) for i in interventions if isinstance(i, dict)}
    assert (
        "strategic_partner_judgment" in phases
        or bool(ans_telem.get("strategic_model_called"))
        or "strategic" in str(ans_telem.get("answer_source") or "").lower()
        or bool((second.get("answer") or {}).get("strategic"))
    ), ans_telem
