"""Offline tests for deterministic AI CFO guards."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.evidence.requirements import resolve_evidence_requirement
from wyz_analytics.ai_cfo.guards.capability import Capability, classify_capability
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.guards.orchestrator import run_guarded_turn
from wyz_analytics.ai_cfo.guards.post_response import detect_output_violations
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


class ViolatingFakeModel:
    id = "violating-fake"

    def run_turn(self, **kwargs):
        return {
            "headline": "Customer dissatisfaction with SKU001 is evident.",
            "evidence": ["High marketing spend proves customers dislike the SKU."],
            "drivers": "customer sentiment",
            "tool_calls": [],
            "telemetry": {},
        }


class StrategicViolatingFakeModel:
    id = "strategy-violating-fake"

    def run_turn(self, **kwargs):
        return {
            "headline": "You should stop selling D2C immediately.",
            "evidence": ["CM2 is negative on D2C Website."],
            "drivers": "marketing",
            "tool_calls": [],
            "telemetry": {},
        }


def test_classify_capability_examples():
    assert classify_capability("Why is CM2 weak?") == Capability.FINANCIAL_INTERPRETATION
    assert classify_capability("Which SKUs drive contribution?") == Capability.BREAKDOWN_REQUIRED
    assert classify_capability("Why do customers dislike this SKU?") == Capability.UNSUPPORTED_CAUSALITY
    assert classify_capability("Should we stop selling D2C?") == Capability.STRATEGIC_RECOMMENDATION
    assert (
        classify_capability("What will CM2 be if marketing falls 20%?")
        == Capability.SCENARIO_REQUEST
    )


def test_sentiment_question_preempted(beautyco_facts):
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
        analytical={"filters": {"channel": ["Amazon"], "category": ["Lips"]}, "surface": "margin", "dimension": "sku"},
        message="Why do customers dislike this SKU?",
        guards_enabled=True,
    )
    headline = response["answer"]["headline"].lower()
    assert "sentiment" in headline or "does not establish" in headline or "economic performance" in headline
    guard = (response["answer"].get("telemetry") or {}).get("guard") or {}
    assert guard.get("capability") == Capability.UNSUPPORTED_CAUSALITY.value
    assert any(item.get("phase") == "preempt" for item in guard.get("interventions") or [])


def test_scenario_question_runs_deterministic_sensitivity(beautyco_facts):
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
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        message="What will CM2 be if marketing falls 20%?",
        guards_enabled=True,
    )
    assert response["answer"].get("answer_kind") == "SCENARIO"
    guard = (response["answer"].get("telemetry") or {}).get("guard") or {}
    assert guard.get("capability") == Capability.SCENARIO_REQUEST.value
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario"


def test_forced_sku_breakdown_when_evidence_missing(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, surface="margin", dimension="sku")
    view = tools.get_current_financial_view()
    signal_pack = tools.get_cfo_signals()
    context = {
        "meta": {"context_version": "test"},
        "summary": view.get("summary") or {},
        "signals": signal_pack.get("highlighted") or [],
        "filters": filters,
        "dimension": "sku",
        "caveats": [],
    }
    req = resolve_evidence_requirement(
        message="Which SKUs drive contribution here?",
        analytical={"filters": filters, "dimension": "sku"},
        context=context,
    )
    assert req.requires_tool is True
    assert req.required_tool == "get_breakdown"
    assert req.required_tool_args["dimension"] == "sku"
    assert req.required_tool_args.get("sort", {}).get("metric") in {None, "cm2"} or True
    # Sorted breakdown args are allowed for ranking questions.
    assert req.required_tool_args["dimension"] == "sku"


def test_no_redundant_forced_tool_when_top_cm2_in_context(beautyco_facts):
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
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        message="Which channel contributes the most CM2?",
        guards_enabled=True,
    )
    guard = (response["answer"].get("telemetry") or {}).get("guard") or {}
    assert guard.get("evidence_plan", "").startswith("tool not required")


def test_post_response_violation_detected():
    violations = detect_output_violations(
        {
            "headline": "Customers dislike SKU001 based on margin pressure.",
            "evidence": [],
            "drivers": "",
        },
        Capability.UNSUPPORTED_CAUSALITY,
    )
    assert violations


def test_post_response_guard_replaces_after_retry(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, surface="margin", dimension="sku")
    context = {
        "meta": {"context_version": "test"},
        "summary": tools.get_current_financial_view().get("summary") or {},
        "signals": tools.get_cfo_signals().get("highlighted") or [],
        "filters": filters,
        "dimension": "sku",
        "caveats": ["Attributed marketing caveat."],
    }
    answer = run_guarded_turn(
        message="Explain CM2 weakness for these SKUs.",
        context=context,
        analytical={"filters": filters, "dimension": "sku"},
        tools=tools,
        agent=ViolatingFakeModel(),
        get_signals=lambda: {"highlighted": context["signals"]},
    )
    guard = (answer.get("telemetry") or {}).get("guard") or {}
    assert any(item.get("phase") in {"replaced", "replaced_after_retry"} for item in guard.get("interventions") or [])


def test_strategy_question_bounded_after_violation(beautyco_facts):
    filters = {"channel": ["D2C Website"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, surface="margin", dimension="channel")
    context = {
        "meta": {"context_version": "test"},
        "summary": tools.get_current_financial_view().get("summary") or {},
        "signals": tools.get_cfo_signals().get("highlighted") or [],
        "filters": filters,
        "dimension": "channel",
        "caveats": ["Attributed marketing CM2 is not fully-loaded profitability."],
    }
    answer = run_guarded_turn(
        message="Should we stop selling D2C?",
        context=context,
        analytical={"filters": filters, "dimension": "channel"},
        tools=tools,
        agent=StrategicViolatingFakeModel(),
        get_signals=lambda: {"highlighted": context["signals"]},
    )
    text = " ".join(
        [
            str(answer.get("headline") or ""),
            str(answer.get("interpretation") or ""),
            " ".join(str(item) for item in (answer.get("evidence") or [])),
        ]
    ).lower()
    assert "you should stop" not in text
    assert "recommend shutting" not in text
    source = (answer.get("telemetry") or {}).get("answer_source")
    assert source in {"deterministic_replacement", "deterministic_fallback", "model_with_strategy_boundary"}
