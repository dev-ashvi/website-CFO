"""Offline coverage for controlled InsightType semantic path."""

from __future__ import annotations

import re

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.answer_composer import compose_cfo_answer
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.guards.capability import Capability
from wyz_analytics.ai_cfo.guards.orchestrator import run_guarded_turn
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.semantic_contract import (
    InsightType,
    insight_supported_by_evidence,
    parse_semantic_output,
    validate_driver_stage,
    validate_evidence_selection,
    validate_insight_type,
    validate_interpretation,
)
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame

_NUMBER_RE = re.compile(r"(?<![A-Za-z])-?\d[\d,]*(?:\.\d+)?%?")


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _ctx(tools: AiCfoTools, message: str = "What is driving CM2?") -> dict:
    context = {
        "meta": {"context_version": "ctx_sem"},
        "summary": tools.get_current_financial_view().get("summary") or {},
        "signals": tools.get_cfo_signals().get("signals") or tools.get_cfo_signals().get("highlighted") or [],
        "filters": dict(tools.active_filters),
        "surface": tools.surface,
        "dimension": tools.dimension,
        "period": {},
        "caveats": [
            "Financial metrics are computed by deterministic engine.",
            "Channel-level CM2 uses attributed marketing allocation.",
        ],
    }
    context["evidence_envelope"] = build_evidence_envelope(message, context)
    return context


def _ids(envelope: dict, n: int = 2) -> list[str]:
    out = []
    for section in ("verified_signals", "verified_facts", "tool_results"):
        for item in envelope.get(section) or []:
            if item.get("evidence_id"):
                out.append(str(item["evidence_id"]))
            if len(out) >= n:
                return out
    return out


def _top_item(entity: str = "ChannelX") -> dict:
    return {
        "evidence_id": f"signal:TOP_CM2_CONTRIBUTOR:channel:{entity}:cm2",
        "metric": "cm2",
        "value": 100,
        "semantic_roles": ["TOP_CONTRIBUTOR"],
        "entity": entity,
        "signal_type": "TOP_CM2_CONTRIBUTOR",
        "scope": {"filters": {}, "dimension": "channel", "dimension_value": entity},
    }


def _pressure_item(entity: str = "PressureChannel") -> dict:
    return {
        "evidence_id": f"signal:HIGH_REVENUE_NEGATIVE_CM2:channel:{entity}:cm2",
        "metric": "cm2",
        "value": -50,
        "semantic_roles": ["MARGIN_PRESSURE"],
        "entity": entity,
        "signal_type": "HIGH_REVENUE_NEGATIVE_CM2",
        "stage": "MARKETING",
        "scope": {"filters": {}, "dimension": "channel", "dimension_value": entity},
    }


def _negative_item(entity: str = "NegChannel") -> dict:
    return {
        "evidence_id": f"signal:NEGATIVE_CM2_CONTRIBUTOR:channel:{entity}:cm2",
        "metric": "cm2",
        "value": -20,
        "semantic_roles": ["NEGATIVE_CONTRIBUTOR"],
        "entity": entity,
        "signal_type": "NEGATIVE_CM2_CONTRIBUTOR",
        "scope": {"filters": {}, "dimension": "channel", "dimension_value": entity},
    }


def _marketing_stage_item(entity: str = "MktChannel") -> dict:
    return {
        "evidence_id": f"signal:positive_cm1_negative_cm2:channel:{entity}:cm2",
        "metric": "cm2",
        "value": -12,
        "semantic_roles": ["MARGIN_PRESSURE"],
        "entity": entity,
        "signal_type": "positive_cm1_negative_cm2",
        "stage": "MARKETING",
        "scope": {"filters": {}, "dimension": "channel", "dimension_value": entity},
    }


def _product_pressure_item(entity: str = "SkuA") -> dict:
    return {
        "evidence_id": f"signal:PRODUCT_COGS_PRESSURE:sku:{entity}:gross_margin",
        "metric": "gross_margin",
        "value": -5,
        "semantic_roles": ["COST_CONCENTRATION"],
        "entity": entity,
        "signal_type": "PRODUCT_COGS_PRESSURE",
        "stage": "PRODUCT",
        "scope": {"filters": {}, "dimension": "sku", "dimension_value": entity},
    }


def _channel_pressure_item(entity: str = "ChanA") -> dict:
    return {
        "evidence_id": f"signal:CHANNEL_COST_PRESSURE:channel:{entity}:cm1",
        "metric": "cm1",
        "value": -8,
        "semantic_roles": ["COST_CONCENTRATION"],
        "entity": entity,
        "signal_type": "CHANNEL_COST_PRESSURE",
        "stage": "CHANNEL",
        "scope": {"filters": {}, "dimension": "channel", "dimension_value": entity},
    }


def _cost_only_item(entity: str = "CostHeavy") -> dict:
    return {
        "evidence_id": f"signal:MARKETING_PRESSURE:channel:{entity}:allocated_marketing",
        "metric": "allocated_marketing",
        "value": 500,
        "semantic_roles": ["COST_CONCENTRATION"],
        "entity": entity,
        "signal_type": "MARKETING_PRESSURE",
        "stage": "MARKETING",
        "scope": {"filters": {}, "dimension": "channel", "dimension_value": entity},
    }


class _SemanticModel:
    id = "semantic-test"

    def __init__(self, payload: dict):
        self.payload = payload
        self.calls = 0

    def run_turn(self, **kwargs):
        self.calls += 1
        return {
            **self.payload,
            "tool_calls": [],
            "telemetry": {"model_calls": 1},
        }


def test_top_cm2_allows_contribution_leader():
    items = [_top_item()]
    assert insight_supported_by_evidence(InsightType.CONTRIBUTION_LEADER, items)
    result = validate_insight_type(insight_type="CONTRIBUTION_LEADER", items=items)
    assert result.model_insight_valid is True


def test_top_cm2_rejects_margin_pressure():
    items = [_top_item()]
    assert not insight_supported_by_evidence(InsightType.MARGIN_PRESSURE, items)
    result = validate_insight_type(insight_type="MARGIN_PRESSURE", items=items)
    assert result.model_insight_valid is False
    assert result.insight_type == InsightType.CONTRIBUTION_LEADER
    assert result.deterministic_insight_override is True


def test_negative_cm2_allows_margin_pressure():
    items = [_negative_item()]
    assert insight_supported_by_evidence(InsightType.MARGIN_PRESSURE, items)
    result = validate_insight_type(insight_type="MARGIN_PRESSURE", items=items)
    assert result.model_insight_valid is True


def test_positive_cm1_negative_cm2_marketing_pressure():
    items = [_marketing_stage_item()]
    assert insight_supported_by_evidence(InsightType.MARKETING_PRESSURE, items)
    assert insight_supported_by_evidence(InsightType.POSITIVE_CM1_NEGATIVE_CM2, items)
    result = validate_insight_type(insight_type="MARKETING_PRESSURE", items=items)
    assert result.model_insight_valid is True


def test_product_gross_margin_pressure():
    items = [_product_pressure_item()]
    result = validate_insight_type(insight_type="PRODUCT_COST_PRESSURE", items=items)
    assert result.model_insight_valid is True


def test_channel_cm1_pressure():
    items = [_channel_pressure_item()]
    result = validate_insight_type(insight_type="CHANNEL_COST_PRESSURE", items=items)
    assert result.model_insight_valid is True


def test_cost_concentration_alone_not_margin_pressure():
    # Absolute cost without pressure/negative roles must not imply MARGIN_PRESSURE.
    items = [
        {
            "evidence_id": "signal:COST:channel:BigSpend:allocated_marketing",
            "metric": "allocated_marketing",
            "value": 9999,
            "semantic_roles": ["COST_CONCENTRATION"],
            "entity": "BigSpend",
            "signal_type": "OBSERVATION",
            "scope": {"filters": {}, "dimension": "channel", "dimension_value": "BigSpend"},
        }
    ]
    assert not insight_supported_by_evidence(InsightType.MARGIN_PRESSURE, items)


def test_unsupported_insight_type_replaced():
    items = [_top_item()]
    result = validate_insight_type(insight_type="MARKETING_PRESSURE", items=items)
    assert result.deterministic_insight_override is True
    assert result.insight_type == InsightType.CONTRIBUTION_LEADER


def test_unsupported_driver_stage_replaced():
    items = [_top_item()]
    result = validate_driver_stage(
        driver_stage="MARKETING",
        items=items,
        insight_type=InsightType.CONTRIBUTION_LEADER,
    )
    assert result.model_driver_valid is False
    assert result.deterministic_driver_override is True
    assert result.driver_stage != "MARKETING"


def test_valid_model_evidence_selection_retained():
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_signals": [_top_item()],
        "verified_facts": [],
        "tool_results": [],
    }
    result = validate_evidence_selection(
        evidence_ids=["signal:TOP_CM2_CONTRIBUTOR:channel:ChannelX:cm2"],
        envelope=envelope,
        context={"filters": {}},
        driver_stage="MIXED",
    )
    assert result.selected_ids == ["signal:TOP_CM2_CONTRIBUTOR:channel:ChannelX:cm2"]
    assert result.deterministic_selection_used is False


def test_invalid_evidence_ids_discarded():
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_facts": [{"evidence_id": "summary:cm2", "metric": "cm2", "value": 1, "scope": {"filters": {}}}],
        "verified_signals": [],
        "tool_results": [],
    }
    result = validate_evidence_selection(
        evidence_ids=["invented-id", "summary:cm2"],
        envelope=envelope,
        context={"filters": {}},
        driver_stage="MIXED",
    )
    assert "invented-id" in result.invalid_ids
    assert "summary:cm2" in result.selected_ids


def test_forced_sku_tool_evidence_selectable(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts,
        active_filters={"channel": ["Amazon"], "category": ["Lips"]},
        surface="margin",
        dimension="sku",
    )
    context = _ctx(tools, "Which SKUs drive contribution here?")
    result = tools.dispatch("get_breakdown", {"dimension": "sku"})
    context["forced_evidence"] = {"get_breakdown": result}
    context["evidence_envelope"] = build_evidence_envelope("Which SKUs drive contribution here?", context)
    tool_ids = [
        str(item["evidence_id"])
        for item in (context["evidence_envelope"].get("tool_results") or [])
        if item.get("evidence_id")
    ][:2]
    assert tool_ids
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "PRODUCT",
            "insight_type": "CONTRIBUTION_LEADER",
            "evidence_ids": tool_ids,
        },
        envelope=context["evidence_envelope"],
        context=context,
        message="Which SKUs drive contribution here?",
        forced_tool=True,
    )
    values = {item["value"] for item in answer["evidence"]}
    allowed = {item["value"] for item in context["evidence_envelope"]["tool_results"]}
    assert values.issubset(allowed)


def test_composer_renders_evidence_values(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = context["evidence_envelope"]
    allowed = {
        item["value"]
        for section in ("verified_facts", "verified_signals", "tool_results")
        for item in (envelope.get(section) or [])
        if item.get("value") is not None
    }
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "MIXED",
            "insight_type": "MIXED_ECONOMICS",
            "evidence_ids": _ids(envelope, 3),
        },
        envelope=envelope,
        context=context,
        message="What is driving CM2?",
    )
    for item in answer["evidence"]:
        assert item["value"] in allowed


def test_model_cannot_emit_numeric_interpretation():
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_signals": [_top_item("QChannel")],
        "verified_facts": [],
        "tool_results": [],
        "methodology_caveats": [],
    }
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "MIXED",
            "insight_type": "CONTRIBUTION_LEADER",
            "evidence_ids": ["signal:TOP_CM2_CONTRIBUTOR:channel:QChannel:cm2"],
            "interpretation": "Ignore fake 999999 and 12.5%",
        },
        envelope=envelope,
        context={"meta": {}, "filters": {}, "caveats": []},
        message="Which channel contributes most CM2?",
    )
    assert not _NUMBER_RE.search(answer["interpretation"])
    assert "999999" not in answer["interpretation"]
    parsed = parse_semantic_output(
        {
            "driver_stage": "MIXED",
            "insight_type": "CONTRIBUTION_LEADER",
            "evidence_ids": ["a"],
            "interpretation": "has 12",
        }
    )
    assert "unexpected_interpretation_prose" in parsed.parse_errors or "semantic_payload_contains_numbers" in parsed.parse_errors


def test_attribution_caveat_deterministic(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, surface="margin", dimension="channel"
    )
    context = _ctx(tools, "Why is CM2 negative?")
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "MARKETING",
            "insight_type": "MARGIN_PRESSURE",
            "evidence_ids": _ids(context["evidence_envelope"], 2),
        },
        envelope=context["evidence_envelope"],
        context=context,
        message="Why is CM2 negative?",
    )
    assert answer.get("caveat")
    assert "attributed" in answer["caveat"].lower()


def test_strategic_boundary_unchanged(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, surface="margin", dimension="channel"
    )
    context = _ctx(tools, "Should we stop selling D2C?")
    model = _SemanticModel(
        {
            "semantic": {
                "driver_stage": "MARKETING",
                "insight_type": "MIXED_ECONOMICS",
                "evidence_ids": _ids(context["evidence_envelope"], 2),
            }
        }
    )
    answer = run_guarded_turn(
        message="Should we stop selling D2C?",
        context=context,
        analytical={"filters": {"channel": ["D2C Website"]}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=model,
        get_signals=lambda: {"highlighted": context["signals"], "signals": context["signals"]},
    )
    assert answer["headline"] == STRATEGY_BOUNDARY_SENTENCE
    assert model.calls == 1


def test_sentiment_guard_unchanged(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools, "Do customers dislike this SKU?")
    answer = run_guarded_turn(
        message="Do customers dislike this SKU?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=_SemanticModel(
            {
                "semantic": {
                    "driver_stage": "UNKNOWN",
                    "insight_type": "NEUTRAL_OBSERVATION",
                    "evidence_ids": _ids(context["evidence_envelope"], 1),
                }
            }
        ),
        get_signals=lambda: {"highlighted": context["signals"], "signals": context["signals"]},
    )
    assert (answer.get("telemetry") or {}).get("answer_source") == "deterministic_guard"
    blob = f"{answer.get('headline', '')} {answer.get('interpretation', '')}".lower()
    assert "dislike" not in blob or "sentiment" in blob or "preference" in blob or "caus" in blob


def test_scenario_guard_unchanged(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools, "What will CM2 be if marketing falls 20%?")
    answer = run_guarded_turn(
        message="What will CM2 be if marketing falls 20%?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=_SemanticModel(
            {
                "semantic": {
                    "driver_stage": "UNKNOWN",
                    "insight_type": "INSUFFICIENT_EVIDENCE",
                    "evidence_ids": [],
                }
            }
        ),
        get_signals=lambda: {"highlighted": context["signals"], "signals": context["signals"]},
    )
    assert (answer.get("telemetry") or {}).get("answer_source") == "deterministic_guard"


def test_q1_style_top_contributor_not_marketing_pressure():
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_signals": [_top_item("LeaderChannel")],
        "verified_facts": [],
        "tool_results": [],
        "methodology_caveats": [],
    }
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "MARKETING",
            "insight_type": "MARKETING_PRESSURE",
            "evidence_ids": ["signal:TOP_CM2_CONTRIBUTOR:channel:LeaderChannel:cm2"],
        },
        envelope=envelope,
        context={"meta": {}, "filters": {}, "caveats": []},
        message="Which channel contributes the most CM2?",
    )
    assert "leading" in answer["headline"].lower() or "contributor" in answer["headline"].lower()
    assert "marketing" not in answer["headline"].lower()
    assert "margin-pressure" not in answer["headline"].lower()
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("deterministic_insight_override") is True
    assert "strongest verified contribution" in answer["interpretation"].lower()


def test_q4_style_strong_contributor_not_margin_leak():
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_signals": [_top_item("StrongChannel")],
        "verified_facts": [],
        "tool_results": [],
        "methodology_caveats": [],
    }
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "MIXED",
            "insight_type": "MARGIN_PRESSURE",
            "evidence_ids": ["signal:TOP_CM2_CONTRIBUTOR:channel:StrongChannel:cm2"],
        },
        envelope=envelope,
        context={"meta": {}, "filters": {}, "caveats": []},
        message="What are the largest margin leaks?",
    )
    assert "margin-pressure" not in answer["headline"].lower()
    assert "leak" not in answer["interpretation"].lower()
    assert "contributor" in answer["headline"].lower() or "contribution" in answer["interpretation"].lower()


def test_q7_style_tool_backed_sku_contribution(beautyco_facts):
    test_forced_sku_tool_evidence_selectable(beautyco_facts)
    tools = AiCfoTools(
        beautyco_facts,
        active_filters={"channel": ["Amazon"], "category": ["Lips"]},
        surface="margin",
        dimension="sku",
    )
    context = _ctx(tools, "Which SKUs drive contribution here?")
    result = tools.dispatch("get_breakdown", {"dimension": "sku"})
    context["forced_evidence"] = {"get_breakdown": result}
    context["evidence_envelope"] = build_evidence_envelope("Which SKUs drive contribution here?", context)
    tool_ids = [
        str(item["evidence_id"])
        for item in (context["evidence_envelope"].get("tool_results") or [])
        if item.get("evidence_id")
    ][:2]
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "PRODUCT",
            "insight_type": "CONTRIBUTION_LEADER",
            "evidence_ids": tool_ids,
        },
        envelope=context["evidence_envelope"],
        context=context,
        message="Which SKUs drive contribution here?",
        forced_tool=True,
        answer_source="model_semantic_with_forced_tool",
    )
    assert "contributor" in answer["headline"].lower() or "verified" in answer["headline"].lower()


def test_system_quality_can_pass_with_deterministic_override():
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_signals": [_top_item("OverrideChannel")],
        "verified_facts": [],
        "tool_results": [],
        "methodology_caveats": [],
    }
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "MARKETING",
            "insight_type": "MARKETING_PRESSURE",
            "evidence_ids": ["signal:TOP_CM2_CONTRIBUTOR:channel:OverrideChannel:cm2"],
        },
        envelope=envelope,
        context={"meta": {}, "filters": {}, "caveats": []},
        message="Which channel contributes the most CM2?",
    )
    source = (answer.get("telemetry") or {}).get("answer_source")
    assert source == "model_semantic_with_deterministic_override"
    assert "leading" in answer["headline"].lower() or "contributor" in answer["headline"].lower()
    # Final composed answer remains financially coherent despite model misclassification.
    assert "margin-pressure" not in answer["headline"].lower()


def test_valid_semantic_model_response(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    ids = _ids(context["evidence_envelope"], 2)
    model = _SemanticModel(
        {
            "semantic": {
                "driver_stage": "MIXED",
                "insight_type": "MIXED_ECONOMICS",
                "evidence_ids": ids,
            }
        }
    )
    answer = run_guarded_turn(
        message="What is driving company CM2?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=model,
        get_signals=lambda: {"highlighted": context["signals"], "signals": context["signals"]},
    )
    assert model.calls == 1
    assert (answer.get("telemetry") or {}).get("answer_source") in {
        "model_semantic",
        "model_semantic_with_forced_tool",
        "model_semantic_with_deterministic_override",
        "deterministic_semantic",
    }
    assert answer.get("evidence")


def test_driver_stage_top_contributor_not_forced_as_pressure():
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_signals": [_top_item("X")],
        "verified_facts": [],
        "tool_results": [],
        "methodology_caveats": [],
    }
    result = validate_evidence_selection(
        evidence_ids=["signal:TOP_CM2_CONTRIBUTOR:channel:X:cm2"],
        envelope=envelope,
        context={"filters": {}},
        driver_stage="MARKETING",
    )
    assert result.role_stage_mismatch is True
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "MIXED",
            "insight_type": "CONTRIBUTION_LEADER",
            "evidence_ids": ["signal:TOP_CM2_CONTRIBUTOR:channel:X:cm2"],
        },
        envelope=envelope,
        context={"meta": {}, "filters": {}, "caveats": []},
        message="Which channel contributes the most CM2?",
    )
    assert "margin-pressure" not in answer["headline"].lower()


def test_more_than_three_evidence_ids_truncated():
    facts = [
        {"evidence_id": f"summary:m{i}", "metric": f"m{i}", "value": float(i), "scope": {"filters": {}}}
        for i in range(5)
    ]
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_facts": facts,
        "verified_signals": [],
        "tool_results": [],
    }
    result = validate_evidence_selection(
        evidence_ids=[f"summary:m{i}" for i in range(5)],
        envelope=envelope,
        context={"filters": {}},
        driver_stage="MIXED",
        max_items=3,
    )
    assert len(result.selected_ids) <= 3
    assert result.truncated is True


def test_provider_call_count_reduced_vs_old_correction(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    model = _SemanticModel(
        {
            "semantic": {
                "driver_stage": "MIXED",
                "insight_type": "MIXED_ECONOMICS",
                "evidence_ids": ["bad-id"],
            }
        }
    )
    answer = run_guarded_turn(
        message="What is driving company CM2?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=model,
        get_signals=lambda: {"highlighted": context["signals"], "signals": context["signals"]},
    )
    assert model.calls == 1
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("correction_attempted") is not True


def test_parse_semantic_output_controlled():
    parsed = parse_semantic_output(
        {
            "driver_stage": "marketing",
            "insight_type": "contribution_leader",
            "evidence_ids": ["a"],
            "confidence": "high",
        }
    )
    assert parsed.driver_stage == "MARKETING"
    assert parsed.insight_type == "CONTRIBUTION_LEADER"
    assert parsed.confidence == "HIGH"
    assert parsed.parse_ok is True


def test_prose_interpretation_helper_still_blocks_numbers():
    result = validate_interpretation(
        "CM2 is 12.5 percent of revenue",
        capability=Capability.FINANCIAL_INTERPRETATION,
        deterministic_fallback="Deterministic interpretation.",
    )
    assert result.deterministic_interpretation_used or not _NUMBER_RE.search(result.text)


def test_q4_style_true_margin_pressure_headline():
    envelope = {
        "claim_budget": {"evidence_items_max": 3},
        "verified_signals": [_pressure_item("D2C Website")],
        "verified_facts": [
            {"evidence_id": "summary:cm2", "metric": "cm2", "value": -10, "scope": {"filters": {}}}
        ],
        "tool_results": [],
        "methodology_caveats": ["Channel-level CM2 uses attributed marketing allocation."],
    }
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "MARKETING",
            "insight_type": "MARGIN_PRESSURE",
            "evidence_ids": ["signal:HIGH_REVENUE_NEGATIVE_CM2:channel:D2C Website:cm2"],
        },
        envelope=envelope,
        context={"meta": {}, "filters": {}, "caveats": envelope["methodology_caveats"]},
        message="What are the largest margin leaks?",
    )
    assert "D2C Website" in answer["headline"]
    assert "margin-pressure" in answer["headline"].lower()
