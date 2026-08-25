"""Offline tests for AI CFO BeautyCo benchmark scorer and fake run."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.benchmark.cases import BENCHMARK_CASES, DEFAULT_MODELS
from wyz_analytics.ai_cfo.benchmark.progress import classify_case_status
from wyz_analytics.ai_cfo.benchmark.report import format_report
from wyz_analytics.ai_cfo.benchmark.runner import (
    aggregate_model_results,
    choose_recommendation,
    run_benchmark,
    run_case_bounded,
    select_cases,
)
from wyz_analytics.ai_cfo.benchmark.scorer import score_response
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def test_benchmark_cases_cover_required_ids():
    ids = {case["id"] for case in BENCHMARK_CASES}
    assert {"Q1", "Q5", "Q7", "Q8", "Q9", "Q10", "Q11"}.issubset(ids)
    assert DEFAULT_MODELS[0] == "openai/gpt-oss-20b"


def test_scorer_refuses_sentiment():
    case = next(item for item in BENCHMARK_CASES if item["id"] == "Q9")
    scored = score_response(
        case=case,
        response={
            "answer": {
                "headline": "Financial data does not establish customer sentiment.",
                "evidence": ["No survey evidence."],
                "drivers": "n/a",
                "caveat": None,
                "tool_calls": [],
            },
            "context": {"filters": {"channel": ["Amazon"]}, "summary": {"net_revenue": 1}},
        },
    )
    assert scored["categories"]["hallucination_scope"] == 2


def test_scorer_marks_infra_separately():
    case = BENCHMARK_CASES[0]
    scored = score_response(case=case, response={}, infra_error={"code": "auth", "message": "no key"})
    assert scored["scored"] is False
    assert scored["total"] is None


def test_recommendation_prefers_smaller_passing_model():
    small = aggregate_model_results(
        "openai/gpt-oss-20b",
        [
            {
                "case_id": "Q1",
                "scored": True,
                "categories": {
                    "numerical_grounding": 2,
                    "filter_adherence": 2,
                    "margin_stage": 2,
                    "tool_behavior": 2,
                    "materiality": 2,
                    "caveat_awareness": 2,
                    "hallucination_scope": 2,
                },
                "total": 14,
                "max_total": 14,
                "latency_ms": 100,
            }
        ]
        * 11,
        {
            "min_avg_score": 12,
            "min_grounding_rate": 0.95,
            "min_filter_adherence_rate": 1.0,
            "min_tool_success_rate": 0.95,
            "max_material_hallucination_rate": 0.0,
        },
    )
    large = {**small, "model": "meta/llama-3.3-70b-instruct", "metrics": {**small["metrics"], "avg_latency_ms": 500}}
    decision = choose_recommendation([small, large])
    assert decision["recommended"] == "openai/gpt-oss-20b"


def test_offline_fake_benchmark_runs(beautyco_facts):
    result = run_benchmark(models=["openai/gpt-oss-20b"], live=False, facts=beautyco_facts)
    assert result["live"] is False
    assert result["models"]
    report = format_report(result)
    assert "Recommended WYZ V1 model" in report
    assert "Q9" in report


def test_select_cases_limit_preserves_order():
    cases = select_cases(limit=1)
    assert len(cases) == 1
    assert cases[0]["id"] == BENCHMARK_CASES[0]["id"]
    assert select_cases(limit=3)[2]["id"] == BENCHMARK_CASES[2]["id"]


def test_select_cases_question():
    cases = select_cases(question="Q5")
    assert len(cases) == 1
    assert cases[0]["id"] == "Q5"


def test_limit_one_offline_benchmark(beautyco_facts):
    events = []
    result = run_benchmark(
        models=["openai/gpt-oss-20b"],
        live=False,
        facts=beautyco_facts,
        limit=1,
        on_progress=lambda event: events.append(event),
    )
    assert result["case_ids"] == ["Q1"]
    assert len(result["models"][0]["cases"]) == 1
    assert any("Q1 starting" in (event.get("message") or "") for event in events)
    assert any("completed" in (event.get("message") or "") for event in events)


def test_infra_timeout_not_scored_as_reasoning():
    case = BENCHMARK_CASES[0]
    scored = score_response(
        case=case,
        response={},
        infra_error={"code": "timeout", "message": "Question exceeded 90s", "status": None},
    )
    assert scored["scored"] is False
    assert scored["total"] is None
    assert classify_case_status(scored) == "TIMEOUT"


def test_question_timeout_marks_infra(beautyco_facts):
    class SlowModel:
        id = "slow"

        def run_turn(self, **kwargs):
            import time

            time.sleep(2)
            return {"headline": "late", "evidence": [], "drivers": "", "tool_calls": [], "telemetry": {}}

    scored = run_case_bounded(
        beautyco_facts,
        BENCHMARK_CASES[0],
        model=SlowModel(),
        question_timeout_sec=0.2,
    )
    assert scored["scored"] is False
    assert scored["status"] == "TIMEOUT"
    assert scored["infra_failure"]["code"] == "timeout"


def test_keyboard_interrupt_keeps_partial(beautyco_facts, monkeypatch):
    calls = {"n": 0}
    import wyz_analytics.ai_cfo.benchmark.runner as runner

    original = runner.run_case

    def flaky(facts, case, *, model):
        calls["n"] += 1
        if calls["n"] == 2:
            raise KeyboardInterrupt()
        return original(facts, case, model=model)

    monkeypatch.setattr(runner, "run_case", flaky)
    result = run_benchmark(
        models=["openai/gpt-oss-20b"],
        live=False,
        facts=beautyco_facts,
        limit=3,
    )
    assert result["cancelled"] is True
    assert result["models"]
    assert "cancelled" in (result["decision"]["why"] or "").lower()


def test_insufficient_inference_recommendation():
    empty = aggregate_model_results(
        "openai/gpt-oss-20b",
        [
            {
                "case_id": "Q1",
                "scored": False,
                "infra_failure": {"code": "auth", "message": "nope"},
                "categories": {key: None for key in [
                    "numerical_grounding",
                    "filter_adherence",
                    "margin_stage",
                    "tool_behavior",
                    "materiality",
                    "caveat_awareness",
                    "hallucination_scope",
                ]},
                "total": None,
                "status": "AUTH_FAIL",
            }
        ],
        {
            "min_avg_score": 12,
            "min_grounding_rate": 0.95,
            "min_filter_adherence_rate": 1.0,
            "min_tool_success_rate": 0.95,
            "max_material_hallucination_rate": 0.0,
        },
    )
    decision = choose_recommendation([empty])
    assert decision["recommended"] is None
    assert "Insufficient successful inference" in decision["why"]
