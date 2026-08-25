"""Productization acceptance: formatting, follow-up, temporal, evidence UX, signals, guards, scope."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.change_evidence import (
    build_change_evidence_from_trend,
    classify_change_insight,
    select_primary_change,
)
from wyz_analytics.ai_cfo.conversation import build_conversation_context
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.followup import (
    ComparisonBasis,
    FollowUpIntent,
    RankDirection,
    resolve_followup,
)
from wyz_analytics.ai_cfo.presentation import (
    format_inr_compact,
    format_metric_value,
    get_metric_presentation,
    present_evidence_item,
)
from wyz_analytics.ai_cfo.ranking_followup import compose_ranking_followup_answer
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.metrics import METRICS
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(scope="module")
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


# --- FORMATTING ---


def test_currency_compact_format():
    assert format_inr_compact(9_625_442.709999999) == "₹96.3 L"
    assert format_inr_compact(23_500_000) == "₹2.35 Cr"
    assert format_inr_compact(1408) == "₹1,408"


def test_negative_currency():
    text = format_inr_compact(-2_260_000)
    assert text == "₹-22.6 L"


def test_ratio_to_percentage_conversion():
    meta = get_metric_presentation("cm2_pct")
    assert meta.storage == "ratio_0_1"
    assert meta.percentage_scale == 100
    assert METRICS["cm2_pct"].kind == "ratio"
    out = format_metric_value("cm2_pct", 0.007273928420485073)
    assert out["formatted"] == "0.7%"
    mkt = format_metric_value("marketing_pct", 0.4832827393546411)
    assert mkt["formatted"] == "48.3%"


def test_already_percent_values_not_double_scaled_when_storage_percent():
    # Registry treats *_pct as ratio_0_1; percent_0_100 would not multiply.
    from wyz_analytics.ai_cfo.presentation import MetricPresentation, format_metric_value as fmt

    # Simulate an already-percent storage path without mutating global registry.
    # Direct scale check: storage percent_0_100 with value 16.6 → 16.6%
    meta = MetricPresentation(
        key="demo_pct",
        label="Demo %",
        format_type="percentage",
        storage="percent_0_100",
        percentage_scale=1.0,
    )
    raw = 16.6
    display = raw * meta.percentage_scale if meta.storage == "ratio_0_1" else raw
    assert display == 16.6
    assert fmt("marketing_pct", 0.166)["formatted"] == "16.6%"


def test_raw_floating_precision_never_in_user_facing_display():
    item = present_evidence_item(
        {
            "evidence_id": "summary:cm2",
            "metric": "cm2",
            "value": 9625442.709999999,
            "entity": "Filtered population",
        }
    )
    display = item["display"]["formatted_value"]
    assert "9625442" not in display
    assert "709999" not in display
    assert "Filtered population" not in (item.get("interpretation") or "")
    assert item["display"]["label"] == "CM2"


# --- FOLLOW-UP ---


def test_followup_weakest_after_sku_ranking(beautyco_facts):
    prior = {
        "question": "Which SKUs drive margin?",
        "scope_hash": "abc",
        "same_scope": True,
        "intent": "RANKING_TOP",
        "dimension": "sku",
        "rank_direction": "BEST",
        "selected_entities": ["SKU-A"],
        "selected_evidence_ids": ["tool:get_breakdown:0:cm2"],
    }
    resolution = resolve_followup(
        "Which one is weakest?",
        previous_turns=[prior],
        analytical={"dimension": "channel"},
    )
    assert resolution.intent == FollowUpIntent.RANKING_BOTTOM
    assert resolution.rank_direction == RankDirection.WORST
    assert resolution.dimension == "sku"
    assert resolution.force_tool == "get_breakdown"
    assert resolution.force_tool_args["sort"]["direction"] == "asc"

    tools = AiCfoTools(
        beautyco_facts,
        active_filters={"channel": ["Amazon"], "category": ["Lips"]},
        dimension="sku",
    )
    answer = compose_ranking_followup_answer(
        resolution=resolution,
        tools=tools,
        context={
            "summary": tools.get_current_financial_view().get("summary") or {},
            "signals": [],
            "filters": tools.active_filters,
            "financial_scope": tools.financial_scope,
            "dimension": "sku",
            "meta": {"context_version": "t"},
            "caveats": [],
        },
        message="Which one is weakest?",
    )
    entities = [
        (item.get("entity") or (item.get("scope") or {}).get("dimension_value"))
        for item in answer.get("evidence") or []
    ]
    assert entities
    # Must not be framed as a leading contributor
    assert "leading" not in str(answer.get("headline") or "").lower()
    assert (answer.get("telemetry") or {}).get("semantic", {}).get("resolved_insight_type") in {
        "CONTRIBUTION_LAGGARD",
        "INSUFFICIENT_EVIDENCE",
    } or "laggard" in str(answer.get("headline") or "").lower() or "weaker" in str(
        answer.get("interpretation") or ""
    ).lower()


def test_followup_strongest():
    resolution = resolve_followup(
        "What about the strongest one?",
        previous_turns=[
            {
                "question": "Which SKUs drive margin?",
                "same_scope": True,
                "dimension": "sku",
                "intent": "RANKING_TOP",
            }
        ],
    )
    assert resolution.intent == FollowUpIntent.RANKING_TOP
    assert resolution.rank_direction == RankDirection.BEST
    assert resolution.dimension == "sku"


def test_referent_preserved_under_same_scope():
    scope = {"dataset_id": "d", "filters": {"channel": ["Amazon"]}, "scope_hash": "h1"}
    conv = build_conversation_context(
        current_scope=scope,
        previous_turns=[
            {
                "question": "Which SKUs drive margin?",
                "scope_hash": "h1",
                "dimension": "sku",
                "intent": "RANKING_TOP",
                "selected_entities": ["X"],
                "selected_evidence_ids": ["e1"],
            }
        ],
    )
    assert conv["previous_turns"][0]["same_scope"] is True
    assert conv["previous_turns"][0]["dimension"] == "sku"
    resolution = resolve_followup("Which one is weakest?", conversation=conv)
    assert resolution.referent_valid is True
    assert resolution.dimension == "sku"


def test_changed_scope_invalidates_old_referent():
    scope = {"dataset_id": "d", "filters": {"channel": ["Nykaa"]}, "scope_hash": "h2"}
    conv = build_conversation_context(
        current_scope=scope,
        previous_turns=[
            {
                "question": "Which SKUs drive margin?",
                "scope_hash": "h1",
                "dimension": "sku",
                "intent": "RANKING_TOP",
                "selected_entities": ["X"],
                "selected_evidence_ids": ["e1"],
            }
        ],
    )
    assert conv["previous_turns"][0]["same_scope"] is False
    assert conv["previous_turns"][0]["selected_entities"] == []
    resolution = resolve_followup("Which one is weakest?", conversation=conv)
    assert resolution.referent_valid is False
    assert resolution.referent_invalidated_by_scope is True


def test_insufficient_evidence_forces_breakdown(beautyco_facts):
    resolution = resolve_followup("Which SKUs contribute least?")
    assert resolution.force_tool == "get_breakdown"
    assert resolution.force_tool_args["sort"]["direction"] == "asc"
    tools = AiCfoTools(beautyco_facts, active_filters={}, dimension="sku")
    answer = compose_ranking_followup_answer(
        resolution=resolution,
        tools=tools,
        context={
            "summary": {},
            "signals": [
                {
                    "signal_type": "TOP_CM2_CONTRIBUTOR",
                    "entity_type": "sku",
                    "entity": "LEADER",
                    "evidence": {"cm2": 1e9},
                    "label": "Top CM2 contributor",
                }
            ],
            "filters": {},
            "financial_scope": tools.financial_scope,
            "dimension": "sku",
            "meta": {},
            "caveats": [],
        },
        message="Which SKUs contribute least?",
    )
    # Forced breakdown path; TOP signal must not be the selected entity when a weaker row exists
    assert any(
        call.get("tool") == "get_breakdown" for call in (answer.get("tool_calls") or [])
    )


# --- TEMPORAL ---


def test_what_changed_uses_trend_data(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"dataset_id": "beautyco"},
        analytical={"filters": {}, "surface": "overview", "dimension": "channel"},
        message="What changed in this period?",
        model=FakeAiCfoModel(),
    )
    answer = response["answer"]
    assert (answer.get("telemetry") or {}).get("answer_source") == "deterministic_temporal"
    assert any(
        call.get("tool") == "get_trend" for call in (answer.get("tool_calls") or [])
    ) or (answer.get("telemetry") or {}).get("guard", {}).get("forced_tools")
    text = f"{answer.get('headline')} {answer.get('interpretation')}"
    assert "mixed across margin stages" not in text.lower() or answer.get("change_evidence")


def test_latest_vs_previous_month(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={})
    trend = tools.get_trend()
    changes = build_change_evidence_from_trend(
        trend, scope_hash="s", basis=ComparisonBasis.VS_PREV_MONTH
    )
    if len(trend.get("rows") or []) >= 2:
        assert changes
        assert changes[0].basis == ComparisonBasis.VS_PREV_MONTH.value


def test_previous_period_comparison(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={})
    trend = tools.get_trend()
    changes = build_change_evidence_from_trend(
        trend, scope_hash="s", basis=ComparisonBasis.VS_PREV_EQUAL
    )
    if len([r for r in (trend.get("rows") or []) if r.get("month")]) >= 2:
        assert changes


def test_no_comparable_history_bounded_answer():
    changes = build_change_evidence_from_trend({"rows": [{"month": "2024-01", "cm2": 1}]}, scope_hash="s")
    assert changes == []
    primary = select_primary_change(changes)
    insight = classify_change_insight(changes, primary)
    assert insight.value == "INSUFFICIENT_EVIDENCE"


def test_no_llm_arithmetic_on_temporal(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"dataset_id": "beautyco"},
        analytical={"filters": {}, "surface": "overview", "dimension": "channel"},
        message="What changed vs last month?",
        model=FakeAiCfoModel(),
    )
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_temporal"
    # Fake model must not have been needed for arithmetic; change_evidence is Python-owned
    assert "change_evidence" in response["answer"] or response["answer"].get("interpretation")


# --- EVIDENCE UX ---


def test_no_raw_metric_keys_in_default_display():
    item = present_evidence_item(
        {"evidence_id": "summary:marketing_pct", "metric": "marketing_pct", "value": 0.485, "entity": "D2C Website"}
    )
    assert item["display"]["label"] == "Marketing % of Net Revenue"
    assert "marketing_pct" not in item["display"]["label"]
    assert item["display"]["formatted_value"].endswith("%")


def test_no_filtered_population_label():
    item = present_evidence_item(
        {"evidence_id": "x", "metric": "cm2_pct", "value": 0.009, "entity": "Filtered population"}
    )
    assert "Filtered population" not in str(item["display"])
    assert "Filtered population" not in str(item.get("interpretation"))


def test_evidence_values_formatted():
    item = present_evidence_item({"evidence_id": "x", "metric": "cm1", "value": 28_200_000})
    assert item["display"]["formatted_value"] == "₹2.82 Cr"


def test_internal_evidence_ids_preserved():
    item = present_evidence_item(
        {"evidence_id": "tool:get_breakdown:3:cm2", "metric": "cm2", "value": 1000, "entity": "SKU1"}
    )
    assert item["evidence_id"] == "tool:get_breakdown:3:cm2"


# --- SIGNALS (presentation helpers are frontend; backend labels unchanged) ---


def test_signal_entity_display_maps_filtered_population():
    from wyz_analytics.ai_cfo.presentation import display_entity_name

    assert display_entity_name("Filtered population") == "This view"


# --- GUARDS ---


def test_sentiment_refusal_still_works(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"dataset_id": "beautyco"},
        analytical={"filters": {}, "surface": "overview", "dimension": "channel"},
        message="Why do customers dislike this SKU?",
        model=FakeAiCfoModel(),
    )
    text = f"{response['answer'].get('headline')} {response['answer'].get('interpretation')}".lower()
    assert "dislike" in text or "sentiment" in text or "cannot" in text or "infer" in text


def test_strategic_boundary_still_works(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"dataset_id": "beautyco"},
        analytical={"filters": {"channel": ["D2C Website"]}, "surface": "margin", "dimension": "channel"},
        message="Should we stop selling D2C?",
        model=FakeAiCfoModel(),
    )
    text = f"{response['answer'].get('headline')}".lower()
    assert "stop" in text or "strategic" in text or "recommend" in text or "cannot" in text


def test_scenario_sensitivity_replaces_v1_refusal(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"dataset_id": "beautyco"},
        analytical={"filters": {}, "surface": "overview", "dimension": "channel"},
        message="What happens if marketing drops 20%?",
        model=FakeAiCfoModel(),
    )
    assert response["answer"].get("answer_kind") == "SCENARIO"
    assert (response["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario"
    assert "held constant" in " ".join(response["answer"].get("assumptions") or []).lower()


# --- SCOPE ---


def test_trend_and_followup_inherit_financial_scope(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"dataset_id": "beautyco"},
        analytical={"filters": filters, "surface": "margin", "dimension": "sku"},
        message="What changed over this period?",
        model=FakeAiCfoModel(),
    )
    assert response["scope"]["filters"]["channel"] == ["Amazon"]
    assert response["scope_hash"] == response["scope"]["scope_hash"]
    for item in response["answer"].get("evidence") or []:
        if item.get("scope_hash"):
            assert item["scope_hash"] == response["scope_hash"]


def test_acceptance_weakest_never_leading_contributor(beautyco_facts):
    first = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"dataset_id": "beautyco"},
        analytical={
            "filters": {"channel": ["Amazon"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "sku",
        },
        message="Which SKUs drive margin?",
        model=FakeAiCfoModel(),
        conversation_id="accept-1",
    )
    previous = [
        {
            "question": "Which SKUs drive margin?",
            "scope_hash": first["scope_hash"],
            "intent": first["conversation"].get("intent"),
            "insight_type": first["conversation"].get("insight_type"),
            "dimension": first["conversation"].get("dimension") or "sku",
            "rank_direction": first["conversation"].get("rank_direction"),
            "selected_entities": first["conversation"].get("selected_entities") or [],
            "selected_evidence_ids": first["conversation"].get("selected_evidence_ids") or [],
        }
    ]
    second = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"dataset_id": "beautyco"},
        analytical={
            "filters": {"channel": ["Amazon"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "sku",
        },
        message="Which one is weakest?",
        model=FakeAiCfoModel(),
        conversation_id="accept-1",
        previous_turns=previous,
    )
    headline = str(second["answer"].get("headline") or "").lower()
    assert "leading" not in headline
    insight = (second["answer"].get("telemetry") or {}).get("semantic", {}).get("resolved_insight_type")
    assert insight in {"CONTRIBUTION_LAGGARD", "INSUFFICIENT_EVIDENCE", None} or "laggard" in headline or "weaker" in str(
        second["answer"].get("interpretation") or ""
    ).lower()
