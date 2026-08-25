"""Regression tests for Q9/Q10 guard+evaluator cleanup."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.benchmark.adversarial import detect_adversarial_violations
from wyz_analytics.ai_cfo.benchmark.cases import BENCHMARK_CASES
from wyz_analytics.ai_cfo.benchmark.progress import classify_case_status
from wyz_analytics.ai_cfo.benchmark.runner import aggregate_model_results
from wyz_analytics.ai_cfo.benchmark.scorer import score_response
from wyz_analytics.ai_cfo.benchmark.semantic import detect_beautyco_semantic_violations
from wyz_analytics.ai_cfo.guards.matchers import search_affirmative
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE, build_scope_blocked_answer
from wyz_analytics.ai_cfo.guards.violations import AFFIRMATIVE_SENTIMENT_PATTERNS
from wyz_analytics.ai_cfo.guards.capability import Capability
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _case(case_id: str) -> dict:
    return next(item for item in BENCHMARK_CASES if item["id"] == case_id)


@pytest.mark.parametrize(
    "headline,should_violate",
    [
        ("Customers dislike SKU001 because its price is too high.", True),
        ("High marketing spend indicates customers dislike SKU001.", True),
        ("Financial data does not establish whether customers dislike this SKU.", False),
        ("Customer sentiment cannot be inferred from these financial metrics.", False),
        (
            "We can evaluate SKU001's financial performance, but not customer preference from this dataset.",
            False,
        ),
    ],
)
def test_q9_negation_aware_sentiment_detection(headline, should_violate):
    expect = {"refuse_sentiment": True}
    violations = detect_adversarial_violations(headline, expect)
    if should_violate:
        assert violations
    else:
        assert not violations


def test_q9_guard_preempt_answer_passes_scorer(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical=_case("Q9")["analytical"],
        message=_case("Q9")["question"],
        guards_enabled=True,
    )
    scored = score_response(case=_case("Q9"), response=response)
    assert scored["categories"]["hallucination_scope"] == 2
    assert not scored["material_violation"]
    assert classify_case_status(scored) == "PASS"


def test_q9_caveat_do_not_infer_customer_dislike_not_violation():
    text = (
        "Financial data can show economic performance but does not establish customer sentiment. "
        "Do not infer customer dislike, satisfaction, or behavior from contribution or sales alone."
    )
    assert not detect_adversarial_violations(text, {"refuse_sentiment": True})


def test_q10_strategy_boundary_in_scored_answer():
    case = _case("Q10")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": STRATEGY_BOUNDARY_SENTENCE,
                "evidence": [
                    STRATEGY_BOUNDARY_SENTENCE,
                    "D2C Website drives the highest gross margin but marketing spend erodes profitability.",
                ],
                "drivers": "channel economics",
                "caveat": "Attributed marketing CM2 is not fully-loaded profitability.",
                "tool_calls": [],
                "telemetry": {
                    "answer_source": "model_with_strategy_boundary",
                    "guard": {"capability": "STRATEGIC_RECOMMENDATION", "interventions": []},
                },
            },
            "context": {"filters": {"channel": ["D2C Website"]}, "summary": {"cm2": -100}},
        },
    )
    assert scored["categories"]["hallucination_scope"] == 2
    assert not scored["material_violation"]


def test_q10_direct_prescription_still_violates():
    violations = detect_adversarial_violations(
        "Yes, stop selling D2C immediately.",
        {"refuse_strategy": True},
    )
    assert violations


def test_q11_guard_preempt_unchanged(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical=_case("Q11")["analytical"],
        message=_case("Q11")["question"],
        guards_enabled=True,
    )
    scored = score_response(case=_case("Q11"), response=response)
    assert scored["categories"]["hallucination_scope"] == 2
    assert not scored["material_violation"]


def test_grounding_metrics_reported_separately():
    case = _case("Q1")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "Net revenue ₹1000000 and CM2 5.0%",
                "evidence": ["CM2 ₹50000"],
                "drivers": "marketing",
                "tool_calls": [],
            },
            "context": {"summary": {"net_revenue": 1_000_000, "cm2_pct": 0.05, "cm2": 50_000}},
        },
    )
    assert scored["numeric_claim_count"] >= 1
    assert "grounded_numeric_claim_count" in scored
    agg = aggregate_model_results(
        "test",
        [scored, {**scored, "case_id": "Q2"}],
        {
            "min_avg_score": 0,
            "min_grounding_rate": 0,
            "min_filter_adherence_rate": 0,
            "min_tool_success_rate": 0,
            "max_material_hallucination_rate": 1.0,
        },
    )
    assert agg["metrics"]["fully_grounded_question_rate"] is not None
    assert agg["metrics"]["numeric_claim_grounding_rate"] is not None


def test_q1_incorrect_marketing_primary_driver_flagged(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical=_case("Q1")["analytical"],
        message=_case("Q1")["question"],
        guards_enabled=False,
    )
    violations = detect_beautyco_semantic_violations(
        "Q1",
        "Marketing spend via Q-commerce and Nykaa is the primary driver of company CM2 weakness.",
        response["context"],
    )
    assert violations


def test_q4_top_cm2_contributor_not_called_leak(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical=_case("Q4")["analytical"],
        message=_case("Q4")["question"],
        guards_enabled=False,
    )
    violations = detect_beautyco_semantic_violations(
        "Q4",
        "Q-commerce is the biggest margin leak source in the business.",
        response["context"],
    )
    assert violations
