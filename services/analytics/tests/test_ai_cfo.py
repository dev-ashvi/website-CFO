"""Tests for AI CFO context, tools, and fake agent flow."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import StaleContextError, run_ai_cfo_turn
from wyz_analytics.ai_cfo.context import build_context_hash, build_financial_intelligence_context
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame
from wyz_analytics.workers.errors import AnalyticsError


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def test_context_includes_filters_summary_and_lineage(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters)
    view = tools.get_current_financial_view()
    context = build_financial_intelligence_context(
        lineage={"workspace_id": "local", "dataset_id": "ds1", "dataset_version": 1, "mapping_version": "m1", "job_id": "job1", "engine_version": "test"},
        analytical={"filters": filters, "surface": "margin", "dimension": "sku"},
        summary=view["summary"],
        signals=[],
        reconciliation={"ok": True},
    )
    assert context["filters"]["channel"] == ["Amazon"]
    assert context["summary"]["net_revenue"] == view["summary"]["net_revenue"]
    assert context["meta"]["dataset_id"] == "ds1"
    assert context["caveats"]


def test_context_hash_changes_with_filters(beautyco_facts):
    h1 = build_context_hash({"filters": {"channel": ["Amazon"]}, "surface": "margin"})
    h2 = build_context_hash({"filters": {"channel": ["Nykaa"]}, "surface": "margin"})
    assert h1 != h2


def test_tools_preserve_active_filters(beautyco_facts):
    filters = {"channel": ["Amazon"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters)
    breakdown = tools.get_breakdown(dimension="category")
    assert breakdown["query"]["filters"]["channel"] == ["Amazon"]
    trend = tools.get_trend()
    assert trend["query"]["filters"]["channel"] == ["Amazon"]


def test_get_cfo_signals_tool_respects_filters(beautyco_facts):
    filters = {"channel": ["Amazon"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, surface="margin", dimension="category")
    pack = tools.get_cfo_signals()
    assert pack["scope"]["filters"]["channel"] == ["Amazon"]
    assert tools.dispatch("get_cfo_signals")["scope"]["filters"]["channel"] == ["Amazon"]


def test_invalid_tool_rejected(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={})
    with pytest.raises(AnalyticsError):
        tools.dispatch("select * from facts")


def test_fake_ai_flow_uses_tools(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"workspace_id": "local", "dataset_id": "ds1", "dataset_version": 1, "mapping_version": "m1", "job_id": "job1", "engine_version": "test"},
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        message="Why is CM2 weak and which SKUs are causing it?",
    )
    assert response["answer"]["headline"]
    assert response["context"]["summary"]["net_revenue"] is not None
    assert response["answer"]["tool_calls"]


def test_stale_context_rejected(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"workspace_id": "local", "dataset_id": "ds1", "dataset_version": 1, "mapping_version": "m1", "job_id": "job1", "engine_version": "test"},
        analytical={"filters": {}, "surface": "overview", "dimension": "channel"},
        message="What is driving CM2?",
    )
    version = response["context"]["meta"]["context_version"]
    with pytest.raises(StaleContextError):
        run_ai_cfo_turn(
            beautyco_facts,
            lineage={"workspace_id": "local", "dataset_id": "ds1", "dataset_version": 1, "mapping_version": "m1", "job_id": "job1", "engine_version": "test"},
            analytical={"filters": {"channel": ["Amazon"]}, "surface": "overview", "dimension": "channel"},
            message="What is driving CM2?",
            expected_context_version=version,
        )
