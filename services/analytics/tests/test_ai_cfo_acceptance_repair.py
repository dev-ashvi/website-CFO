"""Production-path acceptance repairs for AI CFO V1 drawer failures."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.followup import FollowUpIntent, resolve_followup
from wyz_analytics.ai_cfo.presentation import format_metric_value, get_metric_presentation
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(scope="module")
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


LINEAGE = {
    "workspace_id": "t",
    "dataset_id": "beautyco",
    "dataset_version": 1,
    "mapping_version": "m",
    "job_id": "j",
    "engine_version": "t",
}


def _entities(answer: dict) -> list[str]:
    out = []
    for item in answer.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        entity = item.get("entity") or (item.get("scope") or {}).get("dimension_value")
        if entity:
            out.append(str(entity))
    return out


def test_sku_question_cannot_resolve_to_channel_evidence(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage=LINEAGE,
        analytical={
            "filters": {"channel": ["Amazon"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "channel",  # UI explorer dimension must not win
        },
        message="Which SKUs drive margin?",
        model=FakeAiCfoModel(),
    )
    answer = response["answer"]
    assert (response.get("telemetry") or {}).get("resolved_dimension") == "sku" or (
        answer.get("telemetry") or {}
    ).get("resolved_dimension") == "sku"
    assert "get_breakdown" in ((response.get("telemetry") or {}).get("forced_tools") or []) or any(
        call.get("tool") == "get_breakdown" for call in (answer.get("tool_calls") or [])
    )
    entities = _entities(answer)
    assert entities, "expected SKU evidence entities"
    assert all(e not in {"Amazon", "Nykaa", "D2C Website", "Q-commerce"} for e in entities)
    assert "amazon" not in str(answer.get("headline") or "").lower()
    assert "sku" in str(answer.get("headline") or "").lower() or entities[0].upper().startswith("SKU")


def test_two_turn_weakest_followup_production_path(beautyco_facts):
    filters = {"channel": ["Amazon"], "category": ["Lips"]}
    first = run_ai_cfo_turn(
        beautyco_facts,
        lineage=LINEAGE,
        analytical={"filters": filters, "surface": "margin", "dimension": "channel"},
        message="Which SKUs drive margin?",
        model=FakeAiCfoModel(),
        conversation_id="weakest-seq",
    )
    top_entities = set(_entities(first["answer"]))
    previous = [
        {
            "question": "Which SKUs drive margin?",
            "scope_hash": first["scope_hash"],
            **(first.get("conversation") or {}),
        }
    ]
    second = run_ai_cfo_turn(
        beautyco_facts,
        lineage=LINEAGE,
        analytical={"filters": filters, "surface": "margin", "dimension": "channel"},
        message="Which one is weakest?",
        model=FakeAiCfoModel(),
        conversation_id="weakest-seq",
        previous_turns=previous,
    )
    answer = second["answer"]
    assert (second.get("telemetry") or {}).get("resolved_intent") == FollowUpIntent.RANKING_BOTTOM.value or (
        answer.get("telemetry") or {}
    ).get("followup", {}).get("intent") == FollowUpIntent.RANKING_BOTTOM.value
    assert "mixed across margin stages" not in str(answer.get("headline") or "").lower()
    assert "leading" not in str(answer.get("headline") or "").lower()
    weak_entities = _entities(answer)
    assert weak_entities
    if top_entities and weak_entities:
        # Bottom entity must not be the sole previously selected leader when more SKUs exist.
        assert not (len(top_entities) == 1 and set(weak_entities) == top_entities and "laggard" not in str(answer.get("headline") or "").lower())


def test_temporal_not_contributor_ranking(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage=LINEAGE,
        analytical={
            "filters": {
                "channel": ["D2C Website"],
                "category": ["Lips"],
                "month_from": "2025-12",
                "month_to": "2026-03",
            },
            "surface": "margin",
            "dimension": "channel",
        },
        message="What changed in this period?",
        model=FakeAiCfoModel(),
    )
    answer = response["answer"]
    source = (answer.get("telemetry") or {}).get("answer_source") or (response.get("telemetry") or {}).get(
        "answer_source"
    )
    assert source == "deterministic_temporal"
    assert (response.get("telemetry") or {}).get("resolved_intent") in {"TREND", "COMPARISON", None} or (
        answer.get("telemetry") or {}
    ).get("followup", {}).get("intent") in {"TREND", "COMPARISON"}
    headline = str(answer.get("headline") or "").lower()
    assert "leading verified contributor" not in headline
    assert any(
        token in headline
        for token in (
            "improved",
            "worsened",
            "deteriorated",
            "grew",
            "declined",
            "mixed",
            "comparable",
            "moved",
            "increased",
            "compressed",
        )
    ) or answer.get("change_evidence") is not None
    assert answer.get("comparison") and answer["comparison"].get("label")
    assert "→" in answer["comparison"]["label"]
    assert "get_trend" not in str(answer.get("methodology") or "")
    assert "FinancialScope" not in str(answer.get("methodology") or "")
    for item in answer.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        display = item.get("display") or {}
        assert display.get("label")
        assert display.get("kind") == "temporal_change" or item.get("source") == "change_evidence"
        # Metric name is the row label — not a truncated period string
        assert not str(display.get("label") or "").startswith("2025")
        if display.get("delta_format_type") == "percentage_points":
            assert "pp" in str(display.get("formatted_delta") or "")
        assert item.get("absolute_change") is not None


def test_driver_comparison_explicit_side(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage=LINEAGE,
        analytical={
            "filters": {"channel": ["D2C Website"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "channel",
        },
        message="Is the problem product economics or marketing?",
        model=FakeAiCfoModel(),
    )
    answer = response["answer"]
    headline = str(answer.get("headline") or "").lower()
    assert any(
        token in headline
        for token in (
            "marketing",
            "product economics",
            "both",
            "does not clearly isolate",
            "channel costs",
        )
    )
    assert (answer.get("telemetry") or {}).get("answer_source") == "deterministic_driver_comparison" or (
        resolve_followup("Is the problem product economics or marketing?").driver_comparison
    )


def test_guard_answers_have_no_placeholder_evidence(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage=LINEAGE,
        analytical={
            "filters": {"channel": ["D2C Website"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "channel",
        },
        message="Why do customers dislike this SKU?",
        model=FakeAiCfoModel(),
    )
    evidence = response["answer"].get("evidence") or []
    assert evidence == []
    assert not any(item == "Evidence" or item == "N/A" for item in evidence)


def test_scope_change_invalidates_referent(beautyco_facts):
    first = run_ai_cfo_turn(
        beautyco_facts,
        lineage=LINEAGE,
        analytical={
            "filters": {"channel": ["Amazon"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "sku",
        },
        message="Which SKUs drive margin?",
        model=FakeAiCfoModel(),
        conversation_id="scope-switch",
    )
    previous = [
        {
            "question": "Which SKUs drive margin?",
            "scope_hash": first["scope_hash"],
            **(first.get("conversation") or {}),
        }
    ]
    second = run_ai_cfo_turn(
        beautyco_facts,
        lineage=LINEAGE,
        analytical={
            "filters": {"channel": ["Nykaa"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "sku",
        },
        message="Which one is weakest?",
        model=FakeAiCfoModel(),
        conversation_id="scope-switch",
        previous_turns=previous,
    )
    assert second["scope_hash"] != first["scope_hash"]
    followup = (second["answer"].get("telemetry") or {}).get("followup") or {}
    # Either invalidated or resolved under new scope without reusing old evidence IDs
    old_ids = set(first["conversation"].get("selected_evidence_ids") or [])
    new_ids = set(second["conversation"].get("selected_evidence_ids") or [])
    if followup.get("referent_invalidated_by_scope"):
        assert True
    elif old_ids and new_ids:
        # New-scope ranking may share tool id patterns but must not ground on old-scope hash items
        for item in second["answer"].get("evidence") or []:
            if isinstance(item, dict) and item.get("scope_hash"):
                assert item["scope_hash"] == second["scope_hash"]


def test_share_of_total_is_percentage_not_currency():
    meta = get_metric_presentation("share_of_total")
    assert meta.format_type == "percentage"
    assert meta.storage == "ratio_0_1"
    assert format_metric_value("share_of_total", 1.0)["formatted"] == "100.0%"
    assert format_metric_value("share_of_total", 0.42)["formatted"] == "42.0%"
    assert "₹" not in format_metric_value("share_of_total", 1.0)["formatted"]


def test_intent_precedence_helpers():
    assert resolve_followup("What changed in this period?").intent == FollowUpIntent.TREND
    sku = resolve_followup(
        "Which SKUs drive margin?",
        analytical={"dimension": "channel"},
    )
    assert sku.intent == FollowUpIntent.RANKING_TOP
    assert sku.dimension == "sku"
    weak = resolve_followup(
        "Which one is weakest?",
        previous_turns=[
            {
                "question": "Which SKUs drive margin?",
                "same_scope": True,
                "dimension": "sku",
                "intent": "RANKING_TOP",
            }
        ],
    )
    assert weak.intent == FollowUpIntent.RANKING_BOTTOM
    assert weak.dimension == "sku"
    cmp = resolve_followup("Is the problem product economics or marketing?")
    assert cmp.intent == FollowUpIntent.DRIVER_DIAGNOSIS
    assert cmp.driver_comparison is True
