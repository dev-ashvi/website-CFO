"""Unit tests for EvidenceEnvelope-driven deterministic CFO answers."""

from __future__ import annotations

from wyz_analytics.ai_cfo.deterministic_answer import (
    INSUFFICIENT_HEADLINE,
    SCENARIO_HEADLINE,
    SENTIMENT_HEADLINE,
    build_deterministic_cfo_answer,
)
from wyz_analytics.ai_cfo.guards.capability import Capability
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE


def _envelope(**kwargs):
    base = {
        "current_scope": {"filters": kwargs.pop("filters", {}), "dimension": kwargs.pop("dimension", "channel")},
        "verified_facts": kwargs.pop("verified_facts", []),
        "verified_signals": kwargs.pop("verified_signals", []),
        "tool_results": kwargs.pop("tool_results", []),
        "methodology_caveats": kwargs.pop(
            "methodology_caveats",
            ["Channel-level CM2 uses attributed marketing allocation."],
        ),
        "claim_budget": {"evidence_items_max": 3, "numeric_claims_max": 3},
        "allowed_driver_stages": ["MIXED", "UNKNOWN", "MARKETING", "CHANNEL", "PRODUCT"],
    }
    base.update(kwargs)
    return base


def _item(metric, value, *, roles=None, entity=None, dimension="channel", filters=None, signal_type=None, stage=None):
    return {
        "evidence_id": f"id:{metric}:{entity or 'x'}",
        "metric": metric,
        "value": value,
        "unit": "INR",
        "scope": {"filters": filters or {}, "dimension": dimension, "dimension_value": entity},
        "semantic_roles": roles or [],
        "entity": entity,
        "signal_type": signal_type,
        "stage": stage,
    }


def test_company_top_contributor_headline():
    envelope = _envelope(
        verified_signals=[_item("cm2", 50, roles=["TOP_CONTRIBUTOR"], entity="Q-commerce", signal_type="TOP_CM2_CONTRIBUTOR")],
        verified_facts=[_item("net_revenue", 1000), _item("cm2", 80)],
    )
    answer = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "caveats": envelope["methodology_caveats"]},
        message="Which channel contributes the most CM2?",
    )
    assert "Q-commerce" in answer["headline"]
    assert "top verified contributor" in answer["headline"]
    assert answer["headline"] != INSUFFICIENT_HEADLINE
    values = {item["value"] for item in answer["evidence"]}
    assert 50 in values or 80 in values or 1000 in values


def test_category_pressure_headline():
    envelope = _envelope(
        dimension="category",
        verified_signals=[
            _item("cm2", -20, roles=["MARGIN_PRESSURE"], entity="Eyes", dimension="category", signal_type="HIGH_REVENUE_NEGATIVE_CM2")
        ],
    )
    answer = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "caveats": []},
        message="Which category has the weakest contribution economics?",
    )
    assert "Eyes" in answer["headline"]
    assert "margin-pressure" in answer["headline"]


def test_channel_marketing_pressure_headline():
    envelope = _envelope(
        filters={"channel": ["D2C Website"]},
        verified_signals=[
            _item(
                "allocated_marketing",
                12,
                roles=["COST_CONCENTRATION"],
                entity="D2C Website",
                signal_type="MARKETING_PRESSURE",
                stage="MARKETING",
                filters={"channel": ["D2C Website"]},
            )
        ],
        verified_facts=[_item("cm2", -5, filters={"channel": ["D2C Website"]})],
    )
    answer = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "filters": {"channel": ["D2C Website"]}, "caveats": envelope["methodology_caveats"]},
        message="Is attributed marketing pressuring CM2?",
    )
    assert "attributed marketing" in answer["headline"].lower()
    assert answer["caveat"]
    for item in answer["evidence"]:
        assert (item.get("scope") or {}).get("filters") == {"channel": ["D2C Website"]}


def test_sku_tool_backed_uses_only_tool_values():
    tool_row = _item("cm2", 33, entity="SKU001", dimension="sku")
    tool_row["source"] = "get_breakdown"
    envelope = _envelope(
        dimension="sku",
        tool_results=[tool_row],
        verified_facts=[_item("net_revenue", 999)],
    )
    answer = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "caveats": []},
        message="Which SKUs drive contribution here?",
    )
    assert "SKU001" in answer["headline"]
    values = {item["value"] for item in answer["evidence"]}
    assert values == {33}
    tool_values = {item["value"] for item in answer["evidence"] if (item.get("scope") or {}).get("dimension") == "sku"}
    assert 33 in tool_values


def test_never_invents_a_number():
    envelope = _envelope(
        verified_facts=[_item("net_revenue", 100), _item("cm2", 7)],
        verified_signals=[_item("cm2", 7, roles=["TOP_CONTRIBUTOR"], entity="Amazon")],
    )
    allowed = {100, 7}
    answer = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "caveats": []},
        message="What is driving company CM2?",
    )
    for item in answer["evidence"]:
        assert item["value"] in allowed


def test_strategic_boundary_on_fallback():
    envelope = _envelope(verified_facts=[_item("cm2", -10, filters={"channel": ["D2C Website"]})], filters={"channel": ["D2C Website"]})
    answer = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "caveats": envelope["methodology_caveats"]},
        capability=Capability.STRATEGIC_RECOMMENDATION,
        message="Should we stop selling D2C?",
    )
    assert answer["headline"] == STRATEGY_BOUNDARY_SENTENCE
    assert "does not make stop/continue" in answer["headline"]


def test_sentiment_and_scenario_refusal_headlines():
    envelope = _envelope(verified_facts=[_item("net_revenue", 1)])
    sentiment = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "caveats": []},
        capability=Capability.UNSUPPORTED_CAUSALITY,
        message="Why do customers dislike this SKU?",
    )
    assert sentiment["headline"] == SENTIMENT_HEADLINE
    scenario = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "caveats": []},
        capability=Capability.SCENARIO_REQUEST,
        message="What will CM2 be if marketing falls 20%?",
    )
    assert scenario["headline"] == SCENARIO_HEADLINE


def test_pressure_question_uses_tool_breakdown_when_no_pressure_signal():
    tool_row = _item("gross_margin_pct", 0.11, entity="Eyes", dimension="category")
    envelope = _envelope(
        dimension="category",
        tool_results=[tool_row],
        verified_facts=[_item("net_revenue", 1000)],
    )
    answer = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "caveats": []},
        message="Which category has the weakest contribution economics?",
    )
    assert "Eyes" in answer["headline"]
    assert answer["headline"] != INSUFFICIENT_HEADLINE
    values = {item["value"] for item in answer["evidence"] if (item.get("scope") or {}).get("dimension") == "category"}
    assert 0.11 in values


def test_negative_cm2_question_uses_marketing_signal():
    envelope = _envelope(
        filters={"channel": ["D2C Website"]},
        verified_signals=[
            _item(
                "allocated_marketing",
                12,
                roles=["COST_CONCENTRATION"],
                entity="D2C Website",
                signal_type="MARKETING_PRESSURE",
                stage="MARKETING",
                filters={"channel": ["D2C Website"]},
            )
        ],
        verified_facts=[_item("cm2", -5, filters={"channel": ["D2C Website"]})],
    )
    answer = build_deterministic_cfo_answer(
        envelope=envelope,
        context={"meta": {}, "filters": {"channel": ["D2C Website"]}, "caveats": envelope["methodology_caveats"]},
        message="Why is CM2 negative?",
    )
    assert "attributed marketing" in answer["headline"].lower()


def test_insufficient_evidence_uses_generic_headline():
    answer = build_deterministic_cfo_answer(
        envelope=_envelope(),
        context={"meta": {}, "caveats": []},
        message="What is driving CM2?",
    )
    assert answer["headline"] == INSUFFICIENT_HEADLINE
