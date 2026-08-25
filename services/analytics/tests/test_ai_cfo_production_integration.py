"""Production integration: UI scope → EvidenceEnvelope → tools → conversation."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.conversation import build_conversation_context, history_for_model
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.financial_scope import (
    build_financial_scope,
    compute_scope_hash,
    evidence_matches_active_scope,
    normalize_scope_filters,
)
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.semantic_contract import validate_evidence_selection
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame

LINEAGE = {
    "workspace_id": "local",
    "dataset_id": "beautyco",
    "dataset_version": 1,
    "mapping_version": "m1",
    "job_id": "job1",
    "engine_version": "test",
}


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _ask(facts, filters, message, **kwargs):
    return run_ai_cfo_turn(
        facts,
        lineage=LINEAGE,
        analytical={"filters": filters, "surface": "margin", "dimension": kwargs.pop("dimension", "channel")},
        message=message,
        **kwargs,
    )


def test_scope_hash_stable_under_filter_ordering():
    left = compute_scope_hash("ds1", {"channel": ["Amazon", "Nykaa"]})
    right = compute_scope_hash("ds1", {"channel": ["Nykaa", "Amazon"]})
    assert left == right
    assert left.startswith("scope_")


def test_different_scope_produces_different_scope_hash():
    amazon = compute_scope_hash("ds1", {"channel": ["Amazon"]})
    lips = compute_scope_hash("ds1", {"channel": ["Amazon"], "category": ["Lips"]})
    other_ds = compute_scope_hash("ds2", {"channel": ["Amazon"]})
    assert amazon != lips
    assert amazon != other_ds


def test_company_wide_question(beautyco_facts):
    response = _ask(beautyco_facts, {}, "What's driving CM2?")
    assert response["answer"]["headline"]
    assert response["scope"]["filters"] == {}
    assert response["scope_hash"] == compute_scope_hash("beautyco", {})


def test_channel_filter_propagation(beautyco_facts):
    response = _ask(beautyco_facts, {"channel": ["Amazon"]}, "What's driving CM2?")
    assert response["scope"]["filters"]["channel"] == ["Amazon"]
    assert response["context"]["filters"]["channel"] == ["Amazon"]
    envelope = response["context"]["evidence_envelope"]
    assert envelope["scope_hash"] == response["scope_hash"]
    assert envelope["current_scope"]["filters"]["channel"] == ["Amazon"]


def test_category_filter_propagation(beautyco_facts):
    response = _ask(beautyco_facts, {"category": ["Lips"]}, "What's driving CM2 in this category?")
    assert response["scope"]["category"] == ["Lips"]
    assert "category" in response["scope"]["filters"]


def test_channel_plus_category_filter_propagation(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    response = _ask(beautyco_facts, filters, "Which SKUs drive margin?", dimension="sku")
    assert normalize_scope_filters(response["scope"]["filters"]) == normalize_scope_filters(filters)


def test_sku_filter_propagation(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts,
        active_filters={"channel": ["Amazon"], "category": ["Lips"]},
        dimension="sku",
        dataset_id="beautyco",
    )
    rows = tools.get_breakdown(dimension="sku", limit=1).get("rows") or []
    sku = rows[0].get("sku") if rows else None
    if not sku:
        pytest.skip("No SKU rows under Amazon+Lips")
    response = _ask(beautyco_facts, {"sku": [str(sku)]}, "What's driving margin for this SKU?")
    assert response["scope"]["filters"]["sku"] == [str(sku)]


def test_date_range_filter_propagation(beautyco_facts):
    month = str(beautyco_facts["month"][0])
    response = _ask(beautyco_facts, {"month_from": month, "month_to": month}, "What's driving CM2?")
    assert response["scope"]["filters"]["month_from"] == month
    assert response["scope"]["filters"]["month_to"] == month
    view = AiCfoTools(
        beautyco_facts, active_filters={"month_from": month, "month_to": month}, dataset_id="beautyco"
    ).get_current_financial_view()
    assert view["query"]["filters"]["month_from"] == month


def test_geographic_filter_propagation(beautyco_facts):
    if "region" not in beautyco_facts.columns:
        pytest.skip("No region column")
    values = [str(v) for v in beautyco_facts["region"].drop_nulls().unique().to_list() if str(v)]
    if not values:
        pytest.skip("No region values")
    response = _ask(beautyco_facts, {"region": [values[0]]}, "What's driving CM2?")
    assert response["scope"]["filters"]["region"] == [values[0]]


def test_multi_select_filters(beautyco_facts):
    filters = {"channel": ["Nykaa", "Amazon"]}
    response = _ask(beautyco_facts, filters, "What's driving CM2?")
    assert response["scope"]["filters"]["channel"] == ["Amazon", "Nykaa"]
    assert response["scope_hash"] == compute_scope_hash("beautyco", {"channel": ["Amazon", "Nykaa"]})


def test_forced_breakdown_inherits_filters(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, surface="margin", dimension="sku", dataset_id="beautyco")
    leaked = tools.dispatch(
        "get_breakdown",
        {"dimension": "sku", "filters": {"channel": ["Nykaa"]}, "limit": 5},
    )
    assert leaked["query"]["filters"]["channel"] == ["Amazon"]
    assert leaked["query"]["filters"]["category"] == ["Lips"]
    assert leaked["query"]["group_by"] == ["sku"]
    response = _ask(beautyco_facts, filters, "Which SKUs drive margin?", dimension="sku")
    envelope = response["context"]["evidence_envelope"]
    for item in envelope.get("tool_results") or []:
        assert item["scope"]["filters"]["channel"] == ["Amazon"]
        assert item["scope"]["filters"]["category"] == ["Lips"]
        assert item["scope_hash"] == response["scope_hash"]


def test_cfo_signals_inherit_filters(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, surface="margin", dimension="sku", dataset_id="beautyco")
    pack = tools.get_cfo_signals()
    assert pack["scope"]["filters"]["channel"] == ["Amazon"]
    assert pack["scope"]["filters"]["category"] == ["Lips"]


def test_evidence_envelope_scope_matches_filters(beautyco_facts):
    filters = {"channel": ["Amazon"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, dataset_id="beautyco")
    view = tools.get_current_financial_view()
    scope = build_financial_scope(dataset_id="beautyco", filters=filters)
    context = {
        "meta": {"dataset_id": "beautyco"},
        "filters": scope["filters"],
        "financial_scope": scope,
        "summary": view.get("summary") or {},
        "signals": [],
        "dimension": "channel",
        "surface": "margin",
        "caveats": [],
    }
    envelope = build_evidence_envelope("What's driving CM2?", context)
    assert envelope["scope_hash"] == scope["scope_hash"]
    for item in envelope["verified_facts"]:
        assert item["scope_hash"] == scope["scope_hash"]
        assert item["scope"]["filters"]["channel"] == ["Amazon"]


def test_invalid_cross_scope_evidence_rejected():
    amazon = build_financial_scope(dataset_id="beautyco", filters={"channel": ["Amazon"]})
    lips = build_financial_scope(dataset_id="beautyco", filters={"channel": ["Amazon"], "category": ["Lips"]})
    company_item = {
        "evidence_id": "summary:cm2",
        "metric": "cm2",
        "value": 1,
        "scope": {"filters": {}, "scope_hash": compute_scope_hash("beautyco", {})},
        "scope_hash": compute_scope_hash("beautyco", {}),
    }
    amazon_item = {
        "evidence_id": "signal:TOP:channel:Amazon:cm2",
        "metric": "cm2",
        "value": 2,
        "semantic_roles": ["TOP_CONTRIBUTOR"],
        "scope": {"filters": amazon["filters"], "scope_hash": amazon["scope_hash"]},
        "scope_hash": amazon["scope_hash"],
    }
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "current_scope": {"filters": lips["filters"]},
        "scope_hash": lips["scope_hash"],
        "verified_facts": [],
        "verified_signals": [amazon_item],
        "tool_results": [],
    }
    result = validate_evidence_selection(
        evidence_ids=[company_item["evidence_id"], amazon_item["evidence_id"]],
        envelope=envelope,
        context={"filters": lips["filters"], "financial_scope": lips},
    )
    assert company_item["evidence_id"] in result.invalid_ids
    assert amazon_item["evidence_id"] in result.invalid_ids
    assert not evidence_matches_active_scope(
        company_item, active_filters=amazon["filters"], active_scope_hash=amazon["scope_hash"]
    )


def test_follow_up_retains_scope(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    first = _ask(beautyco_facts, filters, "Which SKUs drive margin?", dimension="sku")
    previous = [
        {
            "question": "Which SKUs drive margin?",
            "scope_hash": first["scope_hash"],
            "insight_type": first["conversation"]["insight_type"],
            "driver_stage": first["conversation"]["driver_stage"],
            "selected_entities": first["conversation"]["selected_entities"],
            "selected_evidence_ids": first["conversation"]["selected_evidence_ids"],
        }
    ]
    second = _ask(
        beautyco_facts,
        filters,
        "What about the weakest one?",
        dimension="sku",
        conversation_id=first["conversation"]["conversation_id"],
        previous_turns=previous,
    )
    assert second["scope_hash"] == first["scope_hash"]
    assert second["scope"]["filters"]["channel"] == ["Amazon"]
    assert second["scope"]["filters"]["category"] == ["Lips"]
    conv = build_conversation_context(
        current_scope=second["scope"],
        conversation_id=first["conversation"]["conversation_id"],
        previous_turns=previous,
    )
    assert conv["previous_turns"][0]["same_scope"] is True
    assert conv["previous_turns"][0]["selected_evidence_ids"] == previous[0]["selected_evidence_ids"]


def test_ui_scope_change_overrides_conversation_scope(beautyco_facts):
    first = _ask(
        beautyco_facts,
        {"channel": ["Amazon"], "category": ["Lips"]},
        "Which SKUs drive margin?",
        dimension="sku",
    )
    previous = [
        {
            "question": "Which SKUs drive margin?",
            "scope_hash": first["scope_hash"],
            "selected_evidence_ids": first["conversation"]["selected_evidence_ids"],
            "selected_entities": first["conversation"]["selected_entities"],
            "insight_type": first["conversation"]["insight_type"],
            "driver_stage": first["conversation"]["driver_stage"],
        }
    ]
    second = _ask(
        beautyco_facts,
        {"channel": ["D2C Website"]},
        "Why is CM2 weak?",
        conversation_id=first["conversation"]["conversation_id"],
        previous_turns=previous,
    )
    assert second["scope"]["filters"]["channel"] == ["D2C Website"]
    assert "category" not in second["scope"]["filters"]
    assert second["scope_hash"] != first["scope_hash"]
    history = history_for_model(
        build_conversation_context(current_scope=second["scope"], previous_turns=previous)
    )
    assert history[0]["same_scope"] is False
    assert history[0]["selected_entities"] == []


def test_old_evidence_ids_cannot_ground_changed_scope(beautyco_facts):
    first = _ask(
        beautyco_facts,
        {"channel": ["Amazon"], "category": ["Lips"]},
        "Which SKUs drive margin?",
        dimension="sku",
    )
    old_ids = first["conversation"]["selected_evidence_ids"]
    second = _ask(beautyco_facts, {"channel": ["D2C Website"]}, "Why is CM2 weak?")
    envelope = second["context"]["evidence_envelope"]
    result = validate_evidence_selection(
        evidence_ids=old_ids or ["summary:cm2"],
        envelope=envelope,
        context=second["context"],
    )
    for item in result.selected_items:
        assert item.get("scope_hash") == second["scope_hash"]
    for eid in old_ids:
        if eid.startswith("tool:"):
            assert eid not in result.selected_ids


def test_deterministic_guard_retains_scope_metadata(beautyco_facts):
    filters = {"channel": ["Amazon"]}
    response = _ask(beautyco_facts, filters, "Do customers dislike this SKU?")
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_guard"
    assert response["scope_hash"] == compute_scope_hash("beautyco", filters)
    assert response["scope"]["filters"]["channel"] == ["Amazon"]
    assert response["telemetry"]["answer_source"] == "deterministic_guard"


def test_semantic_answers_retain_scope_metadata(beautyco_facts):
    response = _ask(beautyco_facts, {"channel": ["Amazon"]}, "What's driving CM2?")
    assert response["scope_hash"]
    assert response["telemetry"]["answer_source"]
    assert response["answer"].get("headline")
    envelope = response["context"]["evidence_envelope"]
    assert envelope["scope_hash"] == response["scope_hash"]


def test_telemetry_reports_forced_tools_and_overrides(beautyco_facts):
    response = _ask(
        beautyco_facts,
        {"channel": ["Amazon"], "category": ["Lips"]},
        "Which SKUs drive margin?",
        dimension="sku",
    )
    public = response["telemetry"]
    assert "forced_tools" in public
    assert "deterministic_insight_override" in public
    assert "provider_calls" in public
    assert public["end_to_end_latency_ms"] is not None
    guard = (response["answer"].get("telemetry") or {}).get("guard") or {}
    assert "capability" in guard


def test_acceptance_a_company_view(beautyco_facts):
    response = _ask(beautyco_facts, {}, "What's driving CM2?")
    assert response["scope"]["filters"] == {}
    assert response["answer"]["headline"]


def test_acceptance_b_sku_breakdown_under_amazon_lips(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, dimension="sku", dataset_id="beautyco")
    breakdown = tools.get_breakdown(dimension="sku", limit=5)
    assert breakdown["query"]["filters"] == normalize_scope_filters(filters)
    response = _ask(beautyco_facts, filters, "Which SKUs drive margin?", dimension="sku")
    assert response["scope"]["filters"]["channel"] == ["Amazon"]
    assert response["scope"]["filters"]["category"] == ["Lips"]


def test_acceptance_c_follow_up_same_scope(beautyco_facts):
    test_follow_up_retains_scope(beautyco_facts)


def test_acceptance_d_filter_change_drops_old_evidence(beautyco_facts):
    test_ui_scope_change_overrides_conversation_scope(beautyco_facts)
    test_old_evidence_ids_cannot_ground_changed_scope(beautyco_facts)


def test_acceptance_e_sentiment_guard_keeps_scope(beautyco_facts):
    test_deterministic_guard_retains_scope_metadata(beautyco_facts)


def test_acceptance_f_strategic_boundary(beautyco_facts):
    response = _ask(beautyco_facts, {"channel": ["D2C Website"]}, "Should we stop selling this channel?")
    assert response["answer"]["headline"] == STRATEGY_BOUNDARY_SENTENCE
    assert response["scope"]["filters"]["channel"] == ["D2C Website"]
    assert response["scope_hash"]
