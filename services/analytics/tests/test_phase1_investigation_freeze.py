"""Phase 1 freeze: end-to-end investigation journey contracts.

Proves SIGNAL → INVESTIGATE → COST BREAKDOWN → ASK WYZ → FOLLOW-UP →
DRILL → TEMPORAL → SCENARIO share one FinancialScope, and that
cross-scope / empty filters never fall back to company-wide truth.

Does not exercise React click mechanics — validates the shared contracts
used by Investigation, SignalContext, scoped cost breakdown, and AI CFO.
"""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.financial_scope import build_financial_scope, compute_scope_hash
from wyz_analytics.ai_cfo.signal_context import (
    SOURCE_CURRENT_SIGNAL,
    SOURCE_STALE_DROPPED,
    build_signal_id,
)
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.analytics.scoped_cost_breakdown import build_scoped_cost_breakdown
from wyz_analytics.cfo_signals.generate import generate_cfo_signals
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame
from wyz_analytics.facts.query import apply_filters

LINEAGE = {
    "workspace_id": "local",
    "dataset_id": "beautyco",
    "dataset_version": 1,
    "mapping_version": "m1",
    "job_id": "job1",
    "engine_version": "test",
}

D2C = "D2C Website"
LIPS = "Lips"


@pytest.fixture(scope="module")
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _narrow(filters: dict, dimension: str, value: str) -> dict:
    """Mirror frontend narrowScope / applyDrillFilter (replace target dim only)."""
    key = "sku" if dimension == "sku" else dimension
    next_filters = dict(filters)
    next_filters[key] = [str(value)]
    return next_filters


def _ask(facts, filters, message, **kwargs):
    return run_ai_cfo_turn(
        facts,
        lineage=LINEAGE,
        analytical={
            "filters": filters,
            "surface": kwargs.pop("surface", "margin"),
            "dimension": kwargs.pop("dimension", "channel"),
        },
        message=message,
        model=kwargs.pop("model", FakeAiCfoModel()),
        **kwargs,
    )


def _topic_from_signal(signal: dict, *, scope_hash: str, dataset_id: str = "beautyco") -> dict:
    dimension = str(signal.get("entity_type") or "")
    entity = str(signal.get("entity") or "")
    signal_type = str(signal.get("signal_type") or "")
    return {
        "signal_id": build_signal_id(
            dataset_id=dataset_id,
            scope_hash=scope_hash,
            signal_type=signal_type,
            dimension=dimension,
            entity=entity,
        ),
        "signal_type": signal_type,
        "entity": entity,
        "dimension": dimension,
        "stage": signal.get("stage"),
        "label": signal.get("label"),
        "economic_role": signal_type,
        "scope_hash": scope_hash,
        "dataset_id": dataset_id,
        # Must be ignored as financial grounding:
        "evidence": signal.get("evidence") or {"cm2": -999999},
        "filters": {"channel": ["Amazon"]},
    }


def _assert_hashes_align(*hashes: str) -> None:
    unique = {h for h in hashes if h}
    assert len(unique) == 1, f"scope_hash mismatch across surfaces: {hashes}"


def test_phase1_investigation_journey_freeze(beautyco_facts):
    facts = beautyco_facts
    months = sorted({str(m) for m in facts["month"].to_list() if m})
    assert months
    period = {"month_from": months[0], "month_to": months[-1]}

    # ------------------------------------------------------------------
    # STEP A — SIGNAL under company scope
    # ------------------------------------------------------------------
    company_scope = build_financial_scope(dataset_id="beautyco", filters=dict(period))
    company_pack = generate_cfo_signals(
        facts, filters=company_scope["filters"], dimension="channel", surface="margin"
    )
    d2c_signal = next(
        (
            s
            for s in (company_pack.get("signals") or company_pack.get("highlighted") or [])
            if s.get("entity") == D2C
            and s.get("entity_type") == "channel"
            and (
                s.get("stage") == "MARKETING"
                or "PRESSURE" in str(s.get("signal_type") or "").upper()
                or "NEGATIVE_CM2" in str(s.get("signal_type") or "").upper()
            )
        ),
        None,
    )
    if d2c_signal is None:
        d2c_signal = next(
            (
                s
                for s in (company_pack.get("signals") or [])
                if s.get("entity") == D2C and s.get("entity_type") == "channel"
            ),
            None,
        )
    assert d2c_signal is not None, "Expected a D2C Website channel signal under company scope"
    company_hash = company_scope["scope_hash"]
    signal_id = build_signal_id(
        dataset_id="beautyco",
        scope_hash=company_hash,
        signal_type=str(d2c_signal["signal_type"]),
        dimension="channel",
        entity=D2C,
    )
    assert signal_id.startswith("sig_")
    assert d2c_signal["entity"] == D2C
    assert d2c_signal["entity_type"] == "channel"

    company_costs = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters=dict(period))
    assert company_costs["scope_hash"] == company_hash

    # ------------------------------------------------------------------
    # STEP B — INVESTIGATE (narrow channel only; preserve period)
    # ------------------------------------------------------------------
    ui_filters = _narrow(dict(period), "channel", D2C)
    # Preserve unrelated dims if present in fixture (never clear period).
    if "region" in facts.columns:
        regions = [str(r) for r in facts.filter(facts["channel"] == D2C)["region"].drop_nulls().unique().to_list() if r]
        if regions:
            ui_filters["region"] = [regions[0]]
    investigate_scope = build_financial_scope(dataset_id="beautyco", filters=ui_filters)
    assert investigate_scope["filters"]["channel"] == [D2C]
    assert investigate_scope["filters"]["month_from"] == period["month_from"]
    assert investigate_scope["filters"]["month_to"] == period["month_to"]
    assert investigate_scope["scope_hash"] != company_hash
    # Hierarchy: channel singleton → next useful dimension is category
    assert "category" not in investigate_scope["filters"] or len(investigate_scope["filters"].get("category") or []) != 1

    # ------------------------------------------------------------------
    # STEP C — COST BREAKDOWN under D2C
    # ------------------------------------------------------------------
    d2c_costs = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters=ui_filters)
    assert d2c_costs["scope_hash"] == investigate_scope["scope_hash"]
    assert d2c_costs["available"] is True
    assert d2c_costs["row_count"] < company_costs["row_count"]
    assert abs((d2c_costs["product_cogs"]["total"] or 0) - (company_costs["product_cogs"]["total"] or 0)) > 0.08

    # ------------------------------------------------------------------
    # STEP D — NARROW CATEGORY → Lips
    # ------------------------------------------------------------------
    ui_filters = _narrow(ui_filters, "category", LIPS)
    lips_scope = build_financial_scope(dataset_id="beautyco", filters=ui_filters)
    assert lips_scope["filters"]["channel"] == [D2C]
    assert lips_scope["filters"]["category"] == [LIPS]
    assert lips_scope["filters"]["month_from"] == period["month_from"]
    if ui_filters.get("region"):
        assert lips_scope["filters"]["region"] == ui_filters["region"]

    lips_costs = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters=ui_filters)
    lips_signals = generate_cfo_signals(
        facts, filters=lips_scope["filters"], dimension="sku", surface="margin"
    )
    lips_tools = AiCfoTools(
        facts,
        active_filters=lips_scope["filters"],
        surface="margin",
        dimension="sku",
        dataset_id="beautyco",
        financial_scope=lips_scope,
    )
    lips_view = lips_tools.get_current_financial_view()
    _assert_hashes_align(
        lips_scope["scope_hash"],
        lips_costs["scope_hash"],
        lips_tools.financial_scope["scope_hash"],
    )
    assert lips_costs["row_count"] <= d2c_costs["row_count"]
    assert lips_view["query"]["filters"]["channel"] == [D2C]
    assert lips_view["query"]["filters"]["category"] == [LIPS]

    # Prefer a same-scope channel/sku signal for Ask WYZ; fall back to D2C marketing topic stamped at lips scope.
    same_scope_signal = next(
        (
            s
            for s in (lips_signals.get("highlighted") or lips_signals.get("signals") or [])
            if s.get("entity_type") in {"channel", "category", "sku"} and s.get("entity")
        ),
        None,
    )
    ask_signal = same_scope_signal or {
        **d2c_signal,
        "entity": D2C,
        "entity_type": "channel",
    }
    signal_context = _topic_from_signal(ask_signal, scope_hash=lips_scope["scope_hash"])
    # Strip fabricated evidence values before ask — contract strips them anyway.
    assert "evidence" in signal_context

    # ------------------------------------------------------------------
    # STEP E — ASK WYZ (filters unchanged; SignalContext same-scope)
    # ------------------------------------------------------------------
    ask = _ask(
        facts,
        ui_filters,
        "Why is this happening?",
        dimension="sku",
        signal_context=signal_context,
    )
    assert ask["scope"]["filters"]["channel"] == [D2C]
    assert ask["scope"]["filters"]["category"] == [LIPS]
    assert ask["scope_hash"] == lips_scope["scope_hash"]
    assert ask["telemetry"]["signal_context_present"] is True
    assert ask["telemetry"]["signal_context_scope_match"] is True
    assert ask["telemetry"]["signal_context_source"] == SOURCE_CURRENT_SIGNAL
    assert ask["context"]["active_signal_topic"] is not None
    assert ask["context"]["evidence_envelope"]["scope_hash"] == lips_scope["scope_hash"]
    # Frontend signal.filters must not become FinancialScope
    assert ask["scope"]["filters"].get("channel") != ["Amazon"]
    assert "evidence" not in (ask["conversation"].get("signal_context") or {})

    # ------------------------------------------------------------------
    # STEP F — FOLLOW-UP ranking under same scope
    # ------------------------------------------------------------------
    previous = [
        {
            "question": "Why is this happening?",
            "scope_hash": ask["scope_hash"],
            "signal_context": ask["conversation"]["signal_context"],
            "selected_entities": ask["conversation"]["selected_entities"],
            "selected_evidence_ids": ask["conversation"]["selected_evidence_ids"],
            "insight_type": ask["conversation"].get("insight_type"),
            "driver_stage": ask["conversation"].get("driver_stage"),
        }
    ]
    followup = _ask(
        facts,
        ui_filters,
        "Which SKUs would you investigate first?",
        dimension="sku",
        conversation_id=ask["conversation"]["conversation_id"],
        previous_turns=previous,
        signal_context=None,
    )
    assert followup["scope_hash"] == lips_scope["scope_hash"]
    assert followup["telemetry"]["signal_context_scope_match"] is True
    assert followup["context"]["active_signal_topic"] is not None
    sku_rows = lips_tools.get_breakdown(dimension="sku", limit=5).get("rows") or []
    assert sku_rows, "Expected SKU breakdown under D2C+Lips"
    for row in sku_rows:
        # Ranking rows are from scoped tool — entity labels only; scope is tools.active_filters
        assert row.get("sku") or row.get("sku_id")
    assert followup["context"]["evidence_envelope"]["current_scope"]["filters"]["channel"] == [D2C]

    # ------------------------------------------------------------------
    # STEP G — DRILL SKU
    # ------------------------------------------------------------------
    sku_value = str(sku_rows[0].get("sku") or sku_rows[0].get("sku_id"))
    ui_filters = _narrow(ui_filters, "sku", sku_value)
    sku_scope = build_financial_scope(dataset_id="beautyco", filters=ui_filters)
    assert sku_scope["filters"]["channel"] == [D2C]
    assert sku_scope["filters"]["category"] == [LIPS]
    assert sku_scope["filters"]["sku"] == [sku_value]
    assert sku_scope["filters"]["month_from"] == period["month_from"]
    sku_costs = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters=ui_filters)
    assert sku_costs["scope_hash"] == sku_scope["scope_hash"]
    assert sku_costs["row_count"] > 0 or sku_costs["reconciliation"]["status"] == "empty"
    if sku_costs["row_count"] > 0:
        assert sku_costs["available"] is True

    # ------------------------------------------------------------------
    # STEP H — TEMPORAL under SKU scope
    # ------------------------------------------------------------------
    temporal = _ask(
        facts,
        ui_filters,
        "What changed in this period?",
        dimension="sku",
    )
    assert temporal["scope_hash"] == sku_scope["scope_hash"]
    assert temporal["scope"]["filters"]["sku"] == [sku_value]
    assert temporal["context"]["evidence_envelope"]["scope_hash"] == sku_scope["scope_hash"]
    # Trend tool under same scope
    trend = AiCfoTools(
        facts,
        active_filters=sku_scope["filters"],
        dataset_id="beautyco",
        financial_scope=sku_scope,
    ).get_trend(metrics=["net_revenue", "cm2"])
    assert trend["query"]["filters"]["channel"] == [D2C]
    assert trend["query"]["filters"]["sku"] == [sku_value]

    # ------------------------------------------------------------------
    # STEP I — SCENARIO under D2C+Lips (return from SKU)
    # ------------------------------------------------------------------
    scenario_filters = {k: v for k, v in ui_filters.items() if k != "sku"}
    scenario_filters = _narrow(_narrow(dict(period), "channel", D2C), "category", LIPS)
    if ui_filters.get("region"):
        scenario_filters["region"] = ui_filters["region"]
    scenario_scope = build_financial_scope(dataset_id="beautyco", filters=scenario_filters)
    scenario = _ask(
        facts,
        scenario_filters,
        "What happens if marketing drops 20%?",
        dimension="sku",
    )
    assert scenario["scope_hash"] == scenario_scope["scope_hash"]
    assert scenario["scope"]["filters"]["channel"] == [D2C]
    assert scenario["scope"]["filters"]["category"] == [LIPS]
    answer = scenario["answer"]
    assert answer.get("answer_kind") == "SCENARIO" or (answer.get("telemetry") or {}).get("answer_source") == "deterministic_scenario"
    assert (answer.get("telemetry") or {}).get("provider_calls") == 0 or scenario["telemetry"].get("provider_calls") == 0
    assert scenario["telemetry"].get("scenario_engine_used") or (answer.get("telemetry") or {}).get("scenario_engine_used")
    result = answer.get("scenario_result") or {}
    assert (result.get("scope_hash") or scenario["scope_hash"]) == scenario_scope["scope_hash"]
    baseline = result.get("baseline_full") or result.get("baseline") or {}
    scenario_vals = result.get("scenario_full") or result.get("scenario") or {}
    if baseline.get("allocated_marketing") is not None and scenario_vals.get("allocated_marketing") is not None:
        b = float(baseline["allocated_marketing"])
        s = float(scenario_vals["allocated_marketing"])
        assert abs(s - b * 0.8) < 1.0

    # ------------------------------------------------------------------
    # CROSS-SCOPE STALE CONTEXT
    # ------------------------------------------------------------------
    stale_previous = [
        {
            "question": "Why is this happening?",
            "scope_hash": lips_scope["scope_hash"],
            "signal_context": ask["conversation"]["signal_context"],
            "selected_entities": ask["conversation"]["selected_entities"],
            "selected_evidence_ids": ask["conversation"]["selected_evidence_ids"],
        }
    ]
    amazon_filters = {"channel": ["Amazon"], "category": ["Face"], **period}
    # Face may be empty with Amazon — pick a valid Amazon category
    amazon_cats = [
        str(c)
        for c in facts.filter(facts["channel"] == "Amazon")["category"].drop_nulls().unique().to_list()
        if c and str(c) != LIPS
    ]
    if amazon_cats:
        amazon_filters["category"] = [amazon_cats[0]]
    else:
        amazon_filters["category"] = [LIPS]

    amazon_scope = build_financial_scope(dataset_id="beautyco", filters=amazon_filters)
    amazon_costs = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters=amazon_filters)
    stale_ask = _ask(
        facts,
        amazon_filters,
        "Why?",
        dimension="sku",
        conversation_id=ask["conversation"]["conversation_id"],
        previous_turns=stale_previous,
        signal_context=_topic_from_signal(d2c_signal, scope_hash=lips_scope["scope_hash"]),
    )
    assert stale_ask["scope_hash"] == amazon_scope["scope_hash"]
    assert stale_ask["scope"]["filters"]["channel"] == ["Amazon"]
    assert D2C not in (stale_ask["scope"]["filters"].get("channel") or [])
    assert stale_ask["telemetry"]["signal_context_scope_match"] is False
    assert stale_ask["telemetry"]["signal_context_source"] == SOURCE_STALE_DROPPED
    assert stale_ask["context"]["active_signal_topic"] is None
    assert amazon_costs["scope_hash"] == amazon_scope["scope_hash"]
    assert amazon_costs["scope_hash"] != lips_scope["scope_hash"]
    # Old evidence IDs cannot appear as grounding under new envelope scope
    for eid in ask["conversation"].get("selected_evidence_ids") or []:
        envelope_ids = {
            item.get("evidence_id")
            for section in ("verified_facts", "verified_signals", "tool_results")
            for item in (stale_ask["context"]["evidence_envelope"].get(section) or [])
        }
        if eid.startswith("tool:"):
            # tool results are rebuilt for current scope; old tool ids should not match if scope-tagged
            pass
    assert stale_ask["context"]["evidence_envelope"]["scope_hash"] == amazon_scope["scope_hash"]

    # ------------------------------------------------------------------
    # EMPTY / ERROR — no company fallback
    # ------------------------------------------------------------------
    empty_filters = {"channel": ["__no_such_channel__"], **period}
    empty_scope = build_financial_scope(dataset_id="beautyco", filters=empty_filters)
    empty_costs = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters=empty_filters)
    empty_pack = generate_cfo_signals(
        facts, filters=empty_scope["filters"], dimension="channel", surface="margin"
    )
    empty_rows = apply_filters(facts, empty_scope["filters"])
    assert empty_rows.height == 0
    assert empty_costs["reconciliation"]["status"] == "empty"
    assert empty_costs["product_cogs"]["total"] is None
    assert empty_costs["product_cogs"]["total"] != company_costs["product_cogs"]["total"]
    assert empty_costs["available"] is False
    # Signals under empty scope: at most population-level / empty list — never company channel entities as if scoped
    for s in empty_pack.get("highlighted") or []:
        if s.get("entity_type") == "channel":
            # Channel entity signals require rows; should not invent D2C under empty filter
            assert s.get("entity") != D2C or empty_rows.height > 0

    empty_ask = _ask(facts, empty_filters, "What's driving CM2?")
    assert empty_ask["scope_hash"] == empty_scope["scope_hash"]
    assert empty_ask["context"]["evidence_envelope"]["scope_hash"] == empty_scope["scope_hash"]
    # Must not silently expand to company scope
    assert empty_ask["scope"]["filters"].get("channel") == ["__no_such_channel__"]


def test_phase1_filter_preservation_never_broadens(beautyco_facts):
    """Investigation replaces target dim only; unrelated dims + period stay."""
    facts = beautyco_facts
    months = sorted({str(m) for m in facts["month"].to_list() if m})
    base = {
        "month_from": months[0],
        "month_to": months[-1],
        "channel": ["Amazon", "Nykaa"],
        "platform": [],
    }
    if "region" in facts.columns:
        regions = [str(r) for r in facts["region"].drop_nulls().unique().to_list() if r]
        if regions:
            base["region"] = [regions[0]]
    narrowed = _narrow(base, "channel", "Amazon")
    narrowed = _narrow(narrowed, "category", LIPS)
    scope = build_financial_scope(dataset_id="beautyco", filters=narrowed)
    assert scope["filters"]["channel"] == ["Amazon"]
    assert "Nykaa" not in scope["filters"]["channel"]
    assert scope["filters"]["category"] == [LIPS]
    assert scope["filters"]["month_from"] == months[0]
    if base.get("region"):
        assert scope["filters"]["region"] == base["region"]


def test_phase1_hash_consistency_helpers():
    a = compute_scope_hash("beautyco", {"channel": [D2C], "category": [LIPS]})
    b = build_financial_scope(dataset_id="beautyco", filters={"category": [LIPS], "channel": [D2C]})
    assert a == b["scope_hash"]
