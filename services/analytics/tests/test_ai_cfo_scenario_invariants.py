"""Invariant tests for AI CFO V1.1 deterministic scenario identities.

These assert scenario engine outputs against canonical waterfall identities —
not a second formula implementation.
"""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.scenario import (
    ScenarioChange,
    ScenarioLever,
    ScenarioOperation,
    ScenarioSpec,
    parse_scenario_spec,
    simulate_scenario,
)
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame

TOL = 1e-6


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


@pytest.fixture
def tools(beautyco_facts):
    return AiCfoTools(
        beautyco_facts,
        active_filters={"channel": ["D2C Website"], "category": ["Lips"]},
        dataset_id="beautyco",
    )


def _run(tools: AiCfoTools, lever: ScenarioLever, pct: float) -> dict:
    spec = ScenarioSpec(
        scope_hash=tools.financial_scope["scope_hash"],
        dataset_id="beautyco",
        changes=[
            ScenarioChange(
                lever=lever,
                operation=ScenarioOperation.PERCENT_CHANGE,
                value=pct,
                unit="PERCENT",
            )
        ],
        parse_source="DETERMINISTIC",
    )
    result = simulate_scenario(tools, spec, financial_scope=tools.financial_scope)
    assert result["ok"], result.get("error")
    return result


def _d(result: dict, metric: str) -> float:
    b = float((result.get("baseline_full") or result["baseline"])[metric])
    s = float((result.get("scenario_full") or result["scenario"])[metric])
    return s - b


def test_invariant_net_revenue_held_all_levers(tools):
    for lever, pct in (
        (ScenarioLever.MARKETING_SPEND, -20),
        (ScenarioLever.MARKETING_SPEND, 10),
        (ScenarioLever.PRODUCT_COGS, -5),
        (ScenarioLever.PRODUCT_COGS, 10),
        (ScenarioLever.CM1_COSTS, -10),
        (ScenarioLever.CM1_COSTS, 10),
    ):
        result = _run(tools, lever, pct)
        assert abs(_d(result, "net_revenue")) < TOL


def test_invariant_marketing_delta_cm2_equals_neg_delta_marketing(tools):
    for pct in (-20.0, 10.0):
        result = _run(tools, ScenarioLever.MARKETING_SPEND, pct)
        assert abs(_d(result, "cm2") - (-_d(result, "allocated_marketing"))) < TOL
        # Unaffected
        assert abs(_d(result, "gross_margin")) < TOL
        assert abs(_d(result, "cm1")) < TOL
        assert abs(_d(result, "product_cogs")) < TOL


def test_invariant_cogs_propagation(tools):
    for pct in (-5.0, 10.0):
        result = _run(tools, ScenarioLever.PRODUCT_COGS, pct)
        d_cogs = _d(result, "product_cogs")
        assert abs(_d(result, "gross_margin") - (-d_cogs)) < TOL
        assert abs(_d(result, "cm1") - (-d_cogs)) < TOL
        assert abs(_d(result, "cm2") - (-d_cogs)) < TOL
        # Marketing held
        assert abs(_d(result, "allocated_marketing")) < TOL


def test_invariant_cm1_costs_propagation(tools):
    for pct in (-10.0, 10.0):
        result = _run(tools, ScenarioLever.CM1_COSTS, pct)
        d_cost = _d(result, "cm1_cost")
        assert abs(_d(result, "cm1") - (-d_cost)) < TOL
        assert abs(_d(result, "cm2") - (-d_cost)) < TOL
        assert abs(_d(result, "gross_margin")) < TOL
        assert abs(_d(result, "product_cogs")) < TOL


def test_canonical_cm2_identity_holds_after_scenario(tools):
    result = _run(tools, ScenarioLever.MARKETING_SPEND, -20)
    full = result["scenario_full"]
    assert abs(float(full["cm2"]) - (float(full["cm1"]) - float(full["allocated_marketing"]))) < TOL
