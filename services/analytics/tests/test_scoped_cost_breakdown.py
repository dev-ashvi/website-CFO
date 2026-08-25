"""Phase 1C: scoped cost breakdown from filtered financial facts."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.financial_scope import build_financial_scope, compute_scope_hash
from wyz_analytics.analytics.cost_breakdown import build_cost_breakdown
from wyz_analytics.analytics.scoped_cost_breakdown import build_scoped_cost_breakdown
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame
from wyz_analytics.facts.query import INR_TOL


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines), lines, sources


def _component_map(rows: list[dict]) -> dict[str, float]:
    return {row["key"]: float(row["value"]) for row in rows}


def test_c1_company_scope_parity_with_legacy_product_cogs(beautyco_facts):
    facts, lines, sources = beautyco_facts
    scoped = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters={})
    legacy = build_cost_breakdown(
        lines=lines,
        sources=sources,
        net_revenue=float(facts["net_revenue"].sum() or 0),
    )
    assert scoped["available"] is True
    assert scoped["row_count"] > 0
    # Legacy keys are unit_* ; scoped uses absolute fact columns — values must match.
    legacy_product = _component_map(legacy["product_cogs"])
    scoped_product = _component_map(scoped["product_cogs"]["components"])
    assert abs(scoped_product["manufacturing_cogs"] - legacy_product["unit_manufacturing_cogs"]) <= INR_TOL
    assert abs(scoped_product["primary_packaging"] - legacy_product["unit_primary_packaging"]) <= INR_TOL
    assert abs(scoped_product["inbound_freight"] - legacy_product["unit_inbound_freight"]) <= INR_TOL
    assert abs(scoped_product["other_direct_cogs"] - legacy_product["unit_other_direct_cogs"]) <= INR_TOL
    # CM1: fact allocation preserves settlement totals company-wide within tolerance.
    legacy_cm1 = sum(row["value"] for row in legacy["cm1_costs"])
    scoped_cm1 = sum(row["value"] for row in scoped["cm1_costs"]["components"])
    assert abs(scoped_cm1 - legacy_cm1) <= max(1.0, abs(legacy_cm1) * 1e-6)


def test_c2_channel_scope_differs_from_company(beautyco_facts):
    facts, _, _ = beautyco_facts
    company = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters={})
    amazon = build_scoped_cost_breakdown(
        facts, dataset_id="beautyco", filters={"channel": ["Amazon"]}
    )
    assert amazon["scope"]["filters"]["channel"] == ["Amazon"]
    assert amazon["row_count"] < company["row_count"]
    assert amazon["product_cogs"]["total"] != company["product_cogs"]["total"]
    assert abs(
        (amazon["product_cogs"]["total"] or 0) - (company["product_cogs"]["total"] or 0)
    ) > INR_TOL


def test_c3_channel_plus_category_narrows_further(beautyco_facts):
    facts, _, _ = beautyco_facts
    amazon = build_scoped_cost_breakdown(
        facts, dataset_id="beautyco", filters={"channel": ["Amazon"]}
    )
    amazon_lips = build_scoped_cost_breakdown(
        facts,
        dataset_id="beautyco",
        filters={"channel": ["Amazon"], "category": ["Lips"]},
    )
    assert amazon_lips["scope"]["filters"]["category"] == ["Lips"]
    assert amazon_lips["row_count"] <= amazon["row_count"]
    assert amazon_lips["product_cogs"]["total"] != amazon["product_cogs"]["total"] or amazon_lips[
        "row_count"
    ] < amazon["row_count"]


def test_c4_period_range_scopes_components(beautyco_facts):
    facts, _, _ = beautyco_facts
    months = sorted({str(m) for m in facts["month"].to_list() if m})
    assert len(months) >= 2
    mid = months[len(months) // 2]
    full = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters={})
    half = build_scoped_cost_breakdown(
        facts,
        dataset_id="beautyco",
        filters={"month_from": months[0], "month_to": mid},
    )
    assert half["row_count"] < full["row_count"]
    assert half["scope"]["filters"]["month_to"] == mid


def test_c5_unrelated_dimension_propagates(beautyco_facts):
    facts, _, _ = beautyco_facts
    if "region" not in facts.columns or facts["region"].null_count() == facts.height:
        pytest.skip("region not populated in fixture")
    regions = [str(r) for r in facts["region"].drop_nulls().unique().to_list() if r]
    if not regions:
        pytest.skip("no region values")
    region = regions[0]
    scoped = build_scoped_cost_breakdown(
        facts, dataset_id="beautyco", filters={"region": [region]}
    )
    assert scoped["scope"]["filters"]["region"] == [region]
    assert scoped["row_count"] > 0
    assert scoped["row_count"] < facts.height


def test_c6_empty_filter_does_not_fallback_to_company(beautyco_facts):
    facts, _, _ = beautyco_facts
    company = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters={})
    empty = build_scoped_cost_breakdown(
        facts,
        dataset_id="beautyco",
        filters={"channel": ["__no_such_channel__"]},
    )
    assert empty["available"] is False
    assert empty["row_count"] == 0
    assert empty["reconciliation"]["status"] == "empty"
    assert empty["product_cogs"]["components"] == []
    assert empty["cm1_costs"]["components"] == []
    assert empty["product_cogs"]["total"] is None
    assert empty["product_cogs"]["total"] != company["product_cogs"]["total"]


def test_c7_unsupported_component_omitted_not_substituted(beautyco_facts):
    facts, _, _ = beautyco_facts
    # Drop one component column — must omit, not invent from enrichment.
    slim = facts.drop("manufacturing_cogs")
    scoped = build_scoped_cost_breakdown(slim, dataset_id="beautyco", filters={})
    keys = {row["key"] for row in scoped["product_cogs"]["components"]}
    assert "manufacturing_cogs" not in keys
    assert any("manufacturing_cogs" in item for item in scoped["limitations"])


def test_c8_reconciliation_to_canonical_totals(beautyco_facts):
    facts, _, _ = beautyco_facts
    scoped = build_scoped_cost_breakdown(
        facts,
        dataset_id="beautyco",
        filters={"channel": ["Amazon"], "category": ["Lips"]},
    )
    if scoped["row_count"] == 0:
        pytest.skip("Amazon+Lips empty in fixture")
    product_sum = sum(row["value"] for row in scoped["product_cogs"]["components"])
    cm1_sum = sum(row["value"] for row in scoped["cm1_costs"]["components"])
    assert abs(product_sum - (scoped["product_cogs"]["total"] or 0)) <= INR_TOL
    assert abs(cm1_sum - (scoped["cm1_costs"]["total"] or 0)) <= INR_TOL
    assert scoped["reconciliation"]["product_cogs_status"] == "ok"
    assert scoped["reconciliation"]["cm1_cost_status"] == "ok"


def test_c9_scope_hash_matches_financial_scope(beautyco_facts):
    facts, _, _ = beautyco_facts
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    scoped = build_scoped_cost_breakdown(facts, dataset_id="beautyco", filters=filters)
    expected = build_financial_scope(dataset_id="beautyco", filters=filters)
    assert scoped["scope_hash"] == expected["scope_hash"]
    assert scoped["scope"]["scope_hash"] == compute_scope_hash("beautyco", filters)
    assert scoped["scope"]["filters"] == expected["filters"]
