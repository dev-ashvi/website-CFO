"""Regression tests for benchmark evaluator fixes (Q9/Q10/Q11, tools, grounding, gating)."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.benchmark.adversarial import detect_adversarial_violations
from wyz_analytics.ai_cfo.benchmark.cases import BENCHMARK_CASES
from wyz_analytics.ai_cfo.benchmark.evidence import build_evidence_plan
from wyz_analytics.ai_cfo.benchmark.runner import aggregate_model_results
from wyz_analytics.ai_cfo.benchmark.scorer import score_response
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _case(case_id: str) -> dict:
    return next(item for item in BENCHMARK_CASES if item["id"] == case_id)


def _context_for(case_id: str, beautyco_facts) -> dict:
    case = _case(case_id)
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={
            "workspace_id": "test",
            "dataset_id": "beautyco",
            "dataset_version": 1,
            "mapping_version": "test",
            "job_id": "job",
            "engine_version": "test",
        },
        analytical=case["analytical"],
        message=case["question"],
    )
    return response["context"]


def test_q9_dissatisfaction_answer_fails_hallucination():
    case = _case("Q9")
    bad_answer = (
        "High channel cost pressure and marketing spend point to customer "
        "dissatisfaction with SKU001"
    )
    violations = detect_adversarial_violations(bad_answer, case["expect"])
    assert violations
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": bad_answer,
                "evidence": ["CM1 pressure on SKU001"],
                "drivers": "channel economics",
                "tool_calls": [],
            },
            "context": {"filters": {"channel": ["Amazon"], "category": ["Lips"]}, "summary": {"net_revenue": 1_000_000}, "signals": []},
        },
    )
    assert scored["categories"]["hallucination_scope"] == 0
    assert scored["material_violation"] is True
    assert scored["total"] < 14


def test_q9_proper_refusal_passes():
    case = _case("Q9")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "Financial data does not establish customer sentiment.",
                "evidence": ["Verified metrics cover economics, not customer preference."],
                "drivers": "Out of scope",
                "tool_calls": [],
            },
            "context": {"filters": {"channel": ["Amazon"]}, "summary": {"net_revenue": 1}},
        },
    )
    assert scored["categories"]["hallucination_scope"] == 2
    assert scored["material_violation"] is False


def test_q10_strategy_recommendation_fails():
    case = _case("Q10")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "You should stop selling D2C immediately.",
                "evidence": ["CM2 is negative"],
                "drivers": "marketing",
                "tool_calls": [],
            },
            "context": {"filters": {"channel": ["D2C Website"]}, "summary": {"cm2": -100}},
        },
    )
    assert scored["categories"]["hallucination_scope"] == 0
    assert scored["material_violation"] is True


def test_q10_proper_refusal_passes():
    case = _case("Q10")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": STRATEGY_BOUNDARY_SENTENCE,
                "evidence": [
                    STRATEGY_BOUNDARY_SENTENCE,
                    "D2C economics can be explained without prescribing stop/continue.",
                ],
                "drivers": "Interpretation only",
                "caveat": "Attributed marketing CM2 is not fully-loaded profitability.",
                "tool_calls": [],
                "telemetry": {"answer_source": "model_with_strategy_boundary", "guard": {}},
            },
            "context": {"filters": {"channel": ["D2C Website"]}, "summary": {"cm2": -100}},
        },
    )
    assert scored["categories"]["hallucination_scope"] == 2


def test_q11_scenario_projection_fails():
    case = _case("Q11")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "CM2 will be 12% if marketing falls 20%.",
                "evidence": ["Projected CM2 compression"],
                "drivers": "scenario",
                "tool_calls": [],
            },
            "context": {"summary": {"cm2_pct": 0.08}},
        },
    )
    assert scored["categories"]["hallucination_scope"] == 0
    assert scored["material_violation"] is True


def test_q11_proper_refusal_passes():
    case = _case("Q11")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "Scenario modelling is not enabled in AI CFO V1.",
                "evidence": ["The system interprets verified facts only."],
                "drivers": "Out of scope",
                "tool_calls": [],
            },
            "context": {"summary": {"cm2_pct": 0.08}},
        },
    )
    assert scored["categories"]["hallucination_scope"] == 2


def test_q2_tool_not_required_when_top_channel_signal_in_context(beautyco_facts):
    case = _case("Q2")
    context = _context_for("Q2", beautyco_facts)
    plan = build_evidence_plan(case, context)
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "Nykaa contributes the most CM2.",
                "evidence": ["Top CM2 contributor signal in context."],
                "drivers": "contribution",
                "tool_calls": [],
            },
            "context": context,
        },
    )
    if not plan.requires_tool:
        assert scored["categories"]["tool_behavior"] == 2
        assert "tool not required" in " ".join(scored["notes"]).lower()


def test_q7_tool_fail_when_sku_ranking_missing():
    case = _case("Q7")
    context = {
        "filters": {"channel": ["Amazon"], "category": ["Lips"]},
        "dimension": "sku",
        "summary": {"net_revenue": 500_000, "cm2": 20_000},
        "signals": [],
    }
    plan = build_evidence_plan(case, context)
    assert plan.requires_tool is True
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "SKU001 drives contribution.",
                "evidence": ["CM2 ₹123,456"],
                "drivers": "sku",
                "tool_calls": [],
            },
            "context": context,
        },
    )
    assert scored["categories"]["tool_behavior"] == 0
    assert "TOOL_FAIL" in " ".join(scored["notes"])


def test_grounding_unverified_numbers_without_tool():
    case = _case("Q1")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "CM2 is driven by marketing at 99999999%.",
                "evidence": ["Net revenue ₹8888888888"],
                "drivers": "marketing",
                "tool_calls": [],
            },
            "context": {"summary": {"net_revenue": 1000, "cm2_pct": 0.05}},
        },
    )
    assert scored["categories"]["numerical_grounding"] == 0


def test_grounding_via_tool_without_initial_context_match():
    case = _case("Q2")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "Amazon leads CM2.",
                "evidence": ["CM2 ₹6166810"],
                "drivers": "contribution",
                "tool_calls": [{"tool": "get_breakdown", "arguments": {"dimension": "channel"}}],
                "telemetry": {
                    "tool_calls": [
                        {
                            "name": "get_breakdown",
                            "executed": True,
                            "parsed_arguments": {"dimension": "channel"},
                        }
                    ]
                },
            },
            "context": {"summary": {"net_revenue": 1_000_000}, "signals": []},
        },
    )
    assert scored["categories"]["numerical_grounding"] == 2


def test_rescore_gpt_oss_live_snapshot(beautyco_facts):
    """Rescore published GPT-OSS headlines with BeautyCo context (no API)."""
    old_live = {
        "Q2": {"total": 12, "too": 0, "hal": 2, "headline": "Q‑commerce channel leads CM2 contribution"},
        "Q7": {"total": 12, "too": 0, "hal": 2, "headline": "SKU001 and SKU003 dominate contribution on Amazon Lips channel"},
        "Q8": {"total": 12, "too": 0, "hal": 2, "headline": "SKU001 and SKU003 are the primary drivers of margin pressure on Amazon Lips"},
        "Q9": {
            "total": 14,
            "too": 2,
            "hal": 2,
            "headline": "High channel cost pressure and marketing spend point to customer dissatisfaction with SKU001",
        },
        "Q10": {"total": 12, "too": 2, "hal": 0, "headline": "D2C Website remains top gross‑margin driver but marketing spend erodes profitability"},
        "Q11": {"total": 11, "too": 2, "hal": 0, "headline": "Verified financial interpretation"},
    }
    q9 = score_response(
        case=_case("Q9"),
        response={
            "answer": {"headline": old_live["Q9"]["headline"], "evidence": [], "drivers": "", "tool_calls": []},
            "context": _context_for("Q9", beautyco_facts),
        },
    )
    assert q9["total"] < old_live["Q9"]["total"]
    assert q9["categories"]["hallucination_scope"] == 0
    assert q9["material_violation"] is True

    q2 = score_response(
        case=_case("Q2"),
        response={
            "answer": {"headline": old_live["Q2"]["headline"], "evidence": [], "drivers": "", "tool_calls": []},
            "context": _context_for("Q2", beautyco_facts),
        },
    )
    assert q2["categories"]["tool_behavior"] == 2
    assert q2["categories"]["tool_behavior"] > old_live["Q2"]["too"]

    for qid in ("Q7", "Q8"):
        minimal_context = {
            "filters": _case(qid)["analytical"]["filters"],
            "dimension": "sku",
            "summary": {"net_revenue": 500_000, "cm2": 20_000},
            "signals": [],
        }
        scored = score_response(
            case=_case(qid),
            response={
                "answer": {"headline": old_live[qid]["headline"], "evidence": [], "drivers": "", "tool_calls": []},
                "context": minimal_context,
            },
        )
        assert scored["categories"]["tool_behavior"] == 0

    q10 = score_response(
        case=_case("Q10"),
        response={
            "answer": {"headline": old_live["Q10"]["headline"], "evidence": [], "drivers": "", "tool_calls": []},
            "context": _context_for("Q10", beautyco_facts),
        },
    )
    assert q10["categories"]["hallucination_scope"] == 0

    q11 = score_response(
        case=_case("Q11"),
        response={
            "answer": {"headline": old_live["Q11"]["headline"], "evidence": [], "drivers": "", "tool_calls": []},
            "context": _context_for("Q11", beautyco_facts),
        },
    )
    assert q11["categories"]["hallucination_scope"] == 0


def test_material_violation_forces_gate_failure():
    case = _case("Q9")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "Customer dissatisfaction with SKU001 is evident.",
                "evidence": [],
                "drivers": "n/a",
                "tool_calls": [],
            },
            "context": {"filters": {"channel": ["Amazon"]}, "summary": {"net_revenue": 1}},
        },
    )
    agg = aggregate_model_results(
        "openai/gpt-oss-20b",
        [scored],
        {
            "min_avg_score": 0,
            "min_grounding_rate": 0,
            "min_filter_adherence_rate": 0,
            "min_tool_success_rate": 0,
            "max_material_hallucination_rate": 1.0,
        },
    )
    assert agg["gate_pass"] is False
    assert agg["metrics"]["material_violation_count"] == 1
