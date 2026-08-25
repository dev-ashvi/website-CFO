from __future__ import annotations

from wyz_analytics.analytics.classification import (
    NEGATIVE_GROSS_MARGIN,
    POSITIVE_CM1_NEGATIVE_CM2,
    POSITIVE_GM_NEGATIVE_CM1,
    PROFITABLE,
    classify_profitability,
)
from wyz_analytics.analytics.enrichment import build_explorer_analytics
from wyz_analytics.analytics.growth import enrich_monthly_growth


def test_classify_profitability_states():
    assert classify_profitability({"gross_margin": -1, "cm1": 2, "cm2": 3}) == NEGATIVE_GROSS_MARGIN
    assert classify_profitability({"gross_margin": 10, "cm1": -1, "cm2": 3}) == POSITIVE_GM_NEGATIVE_CM1
    assert classify_profitability({"gross_margin": 10, "cm1": 5, "cm2": -1}) == POSITIVE_CM1_NEGATIVE_CM2
    assert classify_profitability({"gross_margin": 10, "cm1": 5, "cm2": 2}) == PROFITABLE


def test_monthly_mom_growth():
    rows = [
        {"order_month": "2025-04", "net_revenue": 100.0, "orders": 10},
        {"order_month": "2025-05", "net_revenue": 120.0, "orders": 11},
    ]
    enriched, meta = enrich_monthly_growth(rows)
    assert meta["mom_available"] is True
    assert enriched[1]["growth"]["net_revenue"]["delta"] == 20.0
    assert enriched[1]["growth"]["net_revenue"]["pct"] == 0.2


def test_explorer_payload_from_engine(beautyco_result, beautyco_paths):
    payload = build_explorer_analytics(beautyco_result)
    company = payload["company"]
    assert company["net_aov"] is not None
    assert company["discount_pct"] is not None
    assert payload["dimensions"]["channel"]["rows"]
    assert payload["dimensions"]["channel"]["rows"][0]["revenue_share"] is not None
    assert payload["monthly_trend"]
    assert payload["concentration"]["cm2"]["top"]


def test_build_analysis_result_uses_line_facts_for_product_cogs(beautyco_result, beautyco_paths):
    from wyz_analytics.adapters.beautyco import load_beautyco_sources
    from wyz_analytics.engine.pipeline import build_line_facts
    from wyz_analytics.workers.results import build_analysis_result

    sources = load_beautyco_sources(beautyco_paths[0].parent)
    line_facts, _ = build_line_facts(sources)
    payload = build_analysis_result(
        job=type("Job", (), {
            "workspace_id": "local",
            "dataset_id": "ds_test",
            "dataset_version": 1,
            "mapping_version": "m1",
            "job_id": "job_test",
        })(),
        dataset={"name": "BeautyCo"},
        engine_result=beautyco_result,
        sources=sources,
        readiness={"joins": [], "grain_warnings": [], "relationship_warnings": []},
        methodology={},
        lines=line_facts,
    )
    breakdown = payload["explorers"]["cost_breakdown"]
    assert breakdown is not None
    assert breakdown["product_cogs"]
    assert any(row["key"] == "unit_manufacturing_cogs" for row in breakdown["product_cogs"])


def test_explorer_includes_cost_breakdown_when_sources_provided(beautyco_result, beautyco_paths):
    from wyz_analytics.adapters.beautyco import load_beautyco_sources
    from wyz_analytics.engine.pipeline import build_line_facts

    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    payload = build_explorer_analytics(beautyco_result, lines=lines, sources=sources)
    assert payload["cost_breakdown"] is not None
    assert payload["cost_breakdown"]["product_cogs"]
    assert payload["cost_breakdown"]["cm1_costs"]
