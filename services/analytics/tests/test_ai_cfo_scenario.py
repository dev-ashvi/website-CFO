"""Offline tests for AI CFO V1.1 scenario hardening + presentation freeze."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.presentation import format_inr_compact
from wyz_analytics.ai_cfo.scenario import (
    HOLD_CONSTANT_ASSUMPTION,
    ScenarioLever,
    ScenarioOperation,
    methodology_for_spec,
    parse_scenario_spec,
    simulate_scenario,
)
from wyz_analytics.ai_cfo.tools import AiCfoTools
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


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _filters_d2c_lips():
    return {"channel": ["D2C Website"], "category": ["Lips"]}


def _ask(facts, message, *, previous=None, filters=None, conversation_id="scen"):
    return run_ai_cfo_turn(
        facts,
        lineage=LINEAGE,
        analytical={
            "filters": filters if filters is not None else _filters_d2c_lips(),
            "surface": "margin",
            "dimension": "channel",
        },
        message=message,
        model=FakeAiCfoModel(),
        conversation_id=conversation_id,
        previous_turns=previous,
    )


def test_classify_scenario_intent():
    assert classify_capability("What happens if marketing drops 20%?") == Capability.SCENARIO_REQUEST
    assert classify_capability("Should we stop selling D2C?") == Capability.STRATEGIC_RECOMMENDATION
    assert classify_capability("Should we cut marketing 20%?") == Capability.STRATEGIC_RECOMMENDATION


def test_marketing_minus_20(beautyco_facts):
    response = _ask(beautyco_facts, "What happens if marketing drops 20%?")
    answer = response["answer"]
    assert answer.get("answer_kind") == "SCENARIO"
    assert (answer.get("telemetry") or {}).get("answer_source") == "deterministic_scenario"
    assert (answer.get("telemetry") or {}).get("provider_calls") == 0
    result = answer.get("scenario_result") or {}
    b = float((result.get("baseline_full") or result.get("baseline") or {})["allocated_marketing"])
    s = float((result.get("scenario_full") or result.get("scenario") or {})["allocated_marketing"])
    assert abs(s - b * 0.8) < TOL
    assert abs(
        float((result.get("scenario_full") or result["scenario"])["cm1"])
        - float((result.get("baseline_full") or result["baseline"])["cm1"])
    ) < TOL


def test_marketing_plus_10(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters=_filters_d2c_lips(), dataset_id="beautyco")
    spec = parse_scenario_spec(
        "What if marketing increases 10%?",
        scope_hash=tools.financial_scope["scope_hash"],
        dataset_id="beautyco",
    )
    result = simulate_scenario(tools, spec, financial_scope=tools.financial_scope)
    b = float(result["baseline_full"]["allocated_marketing"])
    assert abs(float(result["scenario_full"]["allocated_marketing"]) - b * 1.1) < TOL
    assert abs(float(result["scenario_full"]["gross_margin"]) - float(result["baseline_full"]["gross_margin"])) < TOL


def test_cogs_minus_5(beautyco_facts):
    response = _ask(beautyco_facts, "What if product COGS falls 5%?")
    full = response["answer"]["scenario_result"]
    b = float((full.get("baseline_full") or full["baseline"])["product_cogs"])
    s = float((full.get("scenario_full") or full["scenario"])["product_cogs"])
    assert abs(s - b * 0.95) < TOL


def test_cogs_plus_10(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters=_filters_d2c_lips(), dataset_id="beautyco")
    spec = parse_scenario_spec(
        "What if COGS increases 10%?",
        scope_hash=tools.financial_scope["scope_hash"],
        dataset_id="beautyco",
    )
    result = simulate_scenario(tools, spec, financial_scope=tools.financial_scope)
    b = float(result["baseline_full"]["product_cogs"])
    assert abs(float(result["scenario_full"]["product_cogs"]) - b * 1.1) < TOL


def test_cm1_costs_minus_10(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters=_filters_d2c_lips(), dataset_id="beautyco")
    spec = parse_scenario_spec(
        "What if CM1 costs fall 10%?",
        scope_hash=tools.financial_scope["scope_hash"],
        dataset_id="beautyco",
    )
    result = simulate_scenario(tools, spec, financial_scope=tools.financial_scope)
    assert result["ok"]
    b = float(result["baseline_full"]["cm1_cost"])
    assert abs(float(result["scenario_full"]["cm1_cost"]) - b * 0.9) < TOL
    assert abs(float(result["scenario_full"]["gross_margin"]) - float(result["baseline_full"]["gross_margin"])) < TOL


def test_cm1_costs_plus_10(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters=_filters_d2c_lips(), dataset_id="beautyco")
    spec = parse_scenario_spec(
        "What if CM1 costs increase 10%?",
        scope_hash=tools.financial_scope["scope_hash"],
        dataset_id="beautyco",
    )
    result = simulate_scenario(tools, spec, financial_scope=tools.financial_scope)
    b = float(result["baseline_full"]["cm1_cost"])
    assert abs(float(result["scenario_full"]["cm1_cost"]) - b * 1.1) < TOL


def test_followup_a_marketing_baseline_relative(beautyco_facts):
    first = _ask(beautyco_facts, "What happens if marketing drops 20%?", conversation_id="fu-a")
    previous = [
        {
            "question": "What happens if marketing drops 20%?",
            "scope_hash": first["scope_hash"],
            **(first.get("conversation") or {}),
            "scenario_spec": first["answer"].get("scenario_spec"),
        }
    ]
    second = _ask(beautyco_facts, "What about 30%?", previous=previous, conversation_id="fu-a")
    b = float(first["answer"]["scenario_result"]["baseline_full"]["allocated_marketing"])
    s2 = float(second["answer"]["scenario_result"]["scenario_full"]["allocated_marketing"])
    assert abs(s2 - b * 0.7) < TOL


def test_followup_b_cogs_baseline_relative(beautyco_facts):
    first = _ask(beautyco_facts, "What if product COGS falls 5%?", conversation_id="fu-b")
    previous = [
        {
            "question": "What if product COGS falls 5%?",
            "scope_hash": first["scope_hash"],
            **(first.get("conversation") or {}),
            "scenario_spec": first["answer"].get("scenario_spec"),
        }
    ]
    second = _ask(beautyco_facts, "What about 30%?", previous=previous, conversation_id="fu-b")
    b = float(first["answer"]["scenario_result"]["baseline_full"]["product_cogs"])
    s2 = float(second["answer"]["scenario_result"]["scenario_full"]["product_cogs"])
    assert abs(s2 - b * 0.7) < TOL
    s1 = float(first["answer"]["scenario_result"]["scenario_full"]["product_cogs"])
    assert abs(s2 - s1 * 0.7) > 1.0


def test_followup_c_cm1_costs(beautyco_facts):
    first = _ask(beautyco_facts, "What if CM1 costs fall 10%?", conversation_id="fu-c")
    previous = [
        {
            "question": "What if CM1 costs fall 10%?",
            "scope_hash": first["scope_hash"],
            **(first.get("conversation") or {}),
            "scenario_spec": first["answer"].get("scenario_spec"),
        }
    ]
    second = _ask(beautyco_facts, "What about 15%?", previous=previous, conversation_id="fu-c")
    b = float(first["answer"]["scenario_result"]["baseline_full"]["cm1_cost"])
    s2 = float(second["answer"]["scenario_result"]["scenario_full"]["cm1_cost"])
    assert abs(s2 - b * 0.85) < TOL


def test_followup_d_direction_change(beautyco_facts):
    first = _ask(beautyco_facts, "What if product COGS falls 5%?", conversation_id="fu-d")
    previous = [
        {
            "question": "What if product COGS falls 5%?",
            "scope_hash": first["scope_hash"],
            **(first.get("conversation") or {}),
            "scenario_spec": first["answer"].get("scenario_spec"),
        }
    ]
    second = _ask(beautyco_facts, "What about increasing it 10%?", previous=previous, conversation_id="fu-d")
    b = float(first["answer"]["scenario_result"]["baseline_full"]["product_cogs"])
    s2 = float(second["answer"]["scenario_result"]["scenario_full"]["product_cogs"])
    assert abs(s2 - b * 1.10) < TOL


def test_followup_e_scope_change_no_leak(beautyco_facts):
    first = _ask(beautyco_facts, "What happens if marketing drops 20%?", conversation_id="fu-e")
    previous = [
        {
            "question": "What happens if marketing drops 20%?",
            "scope_hash": first["scope_hash"],
            "scenario_spec": first["answer"].get("scenario_spec"),
            **(first.get("conversation") or {}),
        }
    ]
    second = _ask(
        beautyco_facts,
        "What about 30%?",
        previous=previous,
        filters={"channel": ["Amazon"], "category": ["Lips"]},
        conversation_id="fu-e",
    )
    assert second["scope_hash"] != first["scope_hash"]
    # Prior scenario must not leak — follow-up without same-scope prior refuses or re-asks.
    assert (second["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario_refusal"


def test_unsupported_revenue(beautyco_facts):
    response = _ask(beautyco_facts, "What if revenue grows 20%?")
    headline = str(response["answer"].get("headline") or "").lower()
    assert "revenue" in headline and "not supported" in headline
    assert "marketing spend" in str(response["answer"].get("interpretation") or "").lower()


def test_unsupported_composite_rejects_all(beautyco_facts):
    response = _ask(beautyco_facts, "What if marketing drops 20% and revenue grows 10%?")
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario_refusal"
    assert response["answer"].get("scenario_result") is None or not (
        response["answer"].get("telemetry") or {}
    ).get("scenario_engine_used")
    text = f"{response['answer'].get('headline')} {response['answer'].get('interpretation')}".lower()
    assert "composite" in text or "unsupported" in text or "revenue" in text


def test_malformed_percentage(beautyco_facts):
    response = _ask(beautyco_facts, "What if marketing drops abc%?")
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario_refusal"
    assert "parse" in str(response["answer"].get("headline") or "").lower() or "parse" in str(
        response["answer"].get("interpretation") or ""
    ).lower()


def test_reduction_over_100(beautyco_facts):
    response = _ask(beautyco_facts, "What if marketing drops 150%?")
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario_refusal"
    text = f"{response['answer'].get('headline')} {response['answer'].get('interpretation')}".lower()
    assert "100" in text or "not supported" in text


def test_methodology_differs_from_assumptions(beautyco_facts):
    response = _ask(beautyco_facts, "What happens if marketing drops 20%?")
    answer = response["answer"]
    assumptions = " ".join(answer.get("assumptions") or [])
    methodology = str(answer.get("methodology") or "")
    assert HOLD_CONSTANT_ASSUMPTION in assumptions or "held constant" in assumptions.lower()
    assert methodology != assumptions
    assert "attributed marketing" in methodology.lower()
    assert "recomputed" in methodology.lower()
    assert "forecast" not in methodology.lower() or "held constant" in assumptions.lower()
    # COGS methodology distinct
    cogs = _ask(beautyco_facts, "What if product COGS falls 5%?")
    assert "product cogs" in str(cogs["answer"].get("methodology") or "").lower()
    assert cogs["answer"]["methodology"] != answer["methodology"]


def test_deterministic_headline_uses_verified_values(beautyco_facts):
    response = _ask(beautyco_facts, "What happens if marketing drops 20%?")
    full = response["answer"]["scenario_result"]
    b = float(full["baseline_full"]["cm2"])
    s = float(full["scenario_full"]["cm2"])
    headline = str(response["answer"].get("headline") or "")
    assert format_inr_compact(b) in headline
    assert format_inr_compact(s) in headline
    assert "in this sensitivity" in headline.lower()
    assert "will" not in headline.lower()
    assert "should" not in headline.lower()


def test_provenance_contract(beautyco_facts):
    response = _ask(beautyco_facts, "What happens if marketing drops 20%?")
    for row in response["answer"].get("scenario_comparisons") or []:
        if row.get("metric") in {"allocated_marketing", "cm2", "cm2_pct", "marketing_pct"}:
            assert row.get("provenance") == "SCENARIO_CALCULATED"
        assert row.get("display", {}).get("kind") == "scenario_change"


def test_provider_calls_zero(beautyco_facts):
    response = _ask(beautyco_facts, "What happens if marketing drops 20%?")
    assert (response["answer"].get("telemetry") or {}).get("provider_calls") == 0
    assert (response.get("telemetry") or {}).get("provider_calls") == 0
    assert (response["answer"].get("telemetry") or {}).get("scenario_lever") == "MARKETING_SPEND"
    assert (response["answer"].get("telemetry") or {}).get("scenario_percentage") == 20.0


def test_v1_regression_guards_still_pass(beautyco_facts):
    sentiment = _ask(beautyco_facts, "Why do customers dislike this SKU?")
    assert (sentiment["answer"].get("telemetry") or {}).get("guard", {}).get("capability") == (
        Capability.UNSUPPORTED_CAUSALITY.value
    )
    strategic = _ask(beautyco_facts, "Should we stop selling D2C?")
    headline = str(strategic["answer"].get("headline") or "").lower()
    assert "stop" in headline or "strategic" in headline or "recommend" in headline or "cannot" in headline


def test_methodology_helper_lever_specific():
    mkt = methodology_for_spec({"changes": [{"lever": "MARKETING_SPEND", "operation": "PERCENT_CHANGE", "value": -20, "unit": "PERCENT"}]})
    cogs = methodology_for_spec({"changes": [{"lever": "PRODUCT_COGS", "operation": "PERCENT_CHANGE", "value": -5, "unit": "PERCENT"}]})
    cm1 = methodology_for_spec({"changes": [{"lever": "CM1_COSTS", "operation": "PERCENT_CHANGE", "value": -10, "unit": "PERCENT"}]})
    assert mkt != cogs != cm1
    assert "CM1 and revenue remain unchanged" in mkt
    assert "Gross Margin, CM1, CM2" in cogs
    assert "Gross Margin and revenue remain unchanged" in cm1
