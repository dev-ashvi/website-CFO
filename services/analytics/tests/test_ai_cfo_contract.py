"""Offline tests for structured AI CFO contract and evidence validation."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.answer_contract import resolve_claim_budget
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.guards.capability import Capability
from wyz_analytics.ai_cfo.guards.orchestrator import run_guarded_turn
from wyz_analytics.ai_cfo.response_validation import (
    build_deterministic_fallback,
    normalize_structured_answer,
    validate_structured_answer,
)
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    """These tests exercise the deprecated full-answer validate/correct path."""
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _ctx(tools: AiCfoTools) -> dict[str, Any]:
    return {
        "meta": {"context_version": "ctx_t"},
        "summary": tools.get_current_financial_view().get("summary") or {},
        "signals": tools.get_cfo_signals().get("highlighted") or [],
        "filters": dict(tools.active_filters),
        "surface": tools.surface,
        "dimension": tools.dimension,
        "period": {},
        "caveats": [
            "Financial metrics are computed by deterministic engine.",
            "Channel-level CM2 uses attributed marketing allocation.",
        ],
    }


def _valid_answer(envelope: dict[str, Any]) -> dict[str, Any]:
    item = (envelope.get("verified_facts") or [])[0]
    return {
        "headline": "Verified contribution remains positive in current scope.",
        "evidence": [
            {
                "evidence_id": item.get("evidence_id"),
                "metric": item.get("metric"),
                "value": item.get("value"),
                "unit": item.get("unit"),
                "scope": item.get("scope"),
                "interpretation": "Observed directly from verified context.",
            }
        ],
        "driver_stage": "MIXED",
        "interpretation": "Stage-level effects are mixed but verified.",
        "caveat": "Channel-level CM2 uses attributed marketing allocation.",
    }


def test_valid_two_evidence_response(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What is driving CM2?", context)
    answer = _valid_answer(envelope)
    cm2_pct_item = next(item for item in (envelope.get("verified_facts") or []) if item.get("metric") == "cm2_pct")
    answer["evidence"].append(
        {
            "evidence_id": cm2_pct_item.get("evidence_id"),
            "metric": cm2_pct_item.get("metric"),
            "value": cm2_pct_item.get("value"),
            "unit": cm2_pct_item.get("unit"),
            "scope": cm2_pct_item.get("scope"),
            "interpretation": "CM2 percent directly from verified summary.",
        }
    )
    result = validate_structured_answer(answer, envelope=envelope, context=context)
    assert result.valid is True


def test_claim_budget_default_and_expanded():
    assert resolve_claim_budget("What is driving CM2?").evidence_items_max == 3
    assert resolve_claim_budget("Give me detailed breakdown with all SKUs").evidence_items_max > 3


def test_more_than_three_numeric_claims_rejected_default(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What is driving CM2?", context)
    item = (envelope.get("verified_facts") or [])[0]
    answer = _valid_answer(envelope)
    answer["evidence"] = []
    for i in range(4):
        answer["evidence"].append({**item, "evidence_id": f"x{i}", "metric": item["metric"], "value": item["value"]})
    result = validate_structured_answer(answer, envelope=envelope, context=context)
    assert not result.valid
    assert any("budget" in violation for violation in result.violations)


def test_invented_numeric_value_rejected(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What is driving CM2?", context)
    answer = _valid_answer(envelope)
    answer["evidence"][0]["value"] = 9999999999
    result = validate_structured_answer(answer, envelope=envelope, context=context)
    assert not result.valid
    assert any("value_not_verified" in violation for violation in result.violations)


def test_wrong_dimension_rejected(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={"channel": ["Amazon"]}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("Which channel contributes most CM2?", context)
    answer = _valid_answer(envelope)
    answer["evidence"][0]["scope"] = {"filters": {"channel": ["Amazon"]}, "dimension": "sku", "dimension_value": "SKU001"}
    result = validate_structured_answer(answer, envelope=envelope, context=context)
    assert not result.valid
    assert any("scope_mismatch" in violation for violation in result.violations)


def test_wrong_filter_scope_rejected(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={"channel": ["Amazon"]}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("Which channel contributes most CM2?", context)
    answer = _valid_answer(envelope)
    answer["evidence"][0]["scope"] = {"filters": {"channel": ["D2C Website"]}, "dimension": "channel"}
    result = validate_structured_answer(answer, envelope=envelope, context=context)
    assert not result.valid


def test_top_contributor_not_automatically_margin_pressure(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What are margin leaks?", context)
    answer = _valid_answer(envelope)
    answer["interpretation"] = "Q-commerce is a margin leak source."
    result = validate_structured_answer(answer, envelope=envelope, context=context)
    assert any("margin_pressure_language_without_support" in v for v in result.violations)


def test_negative_cm2_supports_margin_pressure():
    context = {
        "meta": {"context_version": "c"},
        "filters": {},
        "dimension": "channel",
        "summary": {"cm2": -100, "cm2_pct": -0.05},
        "signals": [],
        "caveats": [],
    }
    envelope = {
        "claim_budget": {"evidence_items_max": 3, "numeric_claims_max": 3},
        "allowed_driver_stages": ["MIXED", "UNKNOWN", "MARKETING", "CHANNEL", "PRODUCT", "REVENUE_QUALITY"],
        "verified_facts": [
            {
                "evidence_id": "summary:cm2",
                "metric": "cm2",
                "value": -100,
                "unit": "INR",
                "scope": {"filters": {}, "dimension": "channel"},
                "semantic_roles": ["MARGIN_PRESSURE"],
            }
        ],
        "verified_signals": [],
        "tool_results": [],
    }
    answer = {
        "headline": "Margin pressure is present in this scope.",
        "evidence": [
            {
                "evidence_id": "summary:cm2",
                "metric": "cm2",
                "value": -100,
                "unit": "INR",
                "scope": {"filters": {}, "dimension": "channel"},
                "interpretation": "Negative CM2 supports margin pressure.",
            }
        ],
        "driver_stage": "MARKETING",
        "interpretation": "Margin pressure remains visible.",
        "caveat": None,
    }
    result = validate_structured_answer(answer, envelope=envelope, context=context)
    assert result.valid


def test_attribution_caveat_required():
    context = {"meta": {"context_version": "c"}, "filters": {}, "dimension": "channel", "summary": {}, "signals": [], "caveats": []}
    envelope = {
        "claim_budget": {"evidence_items_max": 3, "numeric_claims_max": 3},
        "allowed_driver_stages": ["MIXED", "UNKNOWN", "MARKETING", "CHANNEL", "PRODUCT", "REVENUE_QUALITY"],
        "verified_facts": [],
        "verified_signals": [],
        "tool_results": [],
    }
    answer = {
        "headline": "Attributed marketing drives CM2.",
        "evidence": [],
        "driver_stage": "MARKETING",
        "interpretation": "Attributed marketing is elevated.",
        "caveat": None,
    }
    result = validate_structured_answer(answer, envelope=envelope, context=context)
    assert any("attribution_caveat_required" in v for v in result.violations)


def test_normalize_structured_answer():
    normalized = normalize_structured_answer(
        {"headline": "x", "evidence": ["a"], "drivers": "marketing", "interpretation": "i"}
    )
    assert normalized["driver_stage"] == "MARKETING"
    assert "markdown" in normalized


class _CorrectionModel:
    id = "correction-model"

    def __init__(self):
        self.calls = 0

    def run_turn(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            return {"headline": "bad", "evidence": [{"metric": "invented_metric", "value": 9999999}], "drivers": "marketing"}
        return {
            "headline": "Verified interpretation.",
            "evidence": [{"metric": "cm2", "value": kwargs["context"]["summary"].get("cm2"), "scope": {"filters": kwargs["context"].get("filters")}}],
            "driver_stage": "MARKETING",
            "interpretation": "Corrected to verified value.",
            "caveat": None,
            "tool_calls": [],
        }


def test_correction_attempt_and_success(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    context["evidence_envelope"] = build_evidence_envelope("What is driving CM2?", context)
    model = _CorrectionModel()
    answer = run_guarded_turn(
        message="What is driving CM2?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=model,
        get_signals=lambda: {"highlighted": context["signals"]},
    )
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("correction_attempted") is True
    assert rv.get("correction_succeeded") is True


class _AlwaysInvalidModel:
    id = "always-invalid"

    def run_turn(self, **kwargs):
        return {"headline": "invalid", "evidence": [{"metric": "invented_metric", "value": 9999999}], "drivers": "marketing"}


def test_correction_failure_uses_deterministic_fallback(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    context["evidence_envelope"] = build_evidence_envelope("What is driving CM2?", context)
    answer = run_guarded_turn(
        message="What is driving CM2?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=_AlwaysInvalidModel(),
        get_signals=lambda: {"highlighted": context["signals"]},
    )
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("deterministic_fallback_used") is True


def test_forced_tool_evidence_added_to_envelope(beautyco_facts):
    response = run_ai_cfo_turn(
        beautyco_facts,
        lineage={"workspace_id": "w", "dataset_id": "d", "dataset_version": 1, "mapping_version": "m", "job_id": "j", "engine_version": "e"},
        analytical={"filters": {"channel": ["Amazon"], "category": ["Lips"]}, "surface": "margin", "dimension": "sku"},
        message="Which SKUs drive contribution here?",
    )
    envelope = (response.get("context") or {}).get("evidence_envelope") or {}
    assert envelope.get("verified_facts") is not None


def test_q9_q10_q11_guards_unchanged(beautyco_facts):
    lineage = {"workspace_id": "w", "dataset_id": "d", "dataset_version": 1, "mapping_version": "m", "job_id": "j", "engine_version": "e"}
    q9 = run_ai_cfo_turn(
        beautyco_facts,
        lineage=lineage,
        analytical={"filters": {"channel": ["Amazon"], "category": ["Lips"]}, "surface": "margin", "dimension": "sku"},
        message="Why do customers dislike this SKU?",
    )
    assert "does not establish" in (q9["answer"]["headline"] or "").lower()
    q10 = run_ai_cfo_turn(
        beautyco_facts,
        lineage=lineage,
        analytical={"filters": {"channel": ["D2C Website"]}, "surface": "margin", "dimension": "channel"},
        message="Should we stop selling D2C?",
    )
    assert "does not make stop/continue" in (q10["answer"]["headline"] or "").lower()
    q11 = run_ai_cfo_turn(
        beautyco_facts,
        lineage=lineage,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        message="What will CM2 be if marketing falls 20%?",
    )
    assert q11["answer"].get("answer_kind") == "SCENARIO"
    assert (q11["answer"].get("telemetry") or {}).get("answer_source") == "deterministic_scenario"
    baseline_m = float((q11["answer"].get("scenario_result") or {}).get("baseline", {}).get("allocated_marketing") or 0)
    scenario_m = float((q11["answer"].get("scenario_result") or {}).get("scenario", {}).get("allocated_marketing") or 0)
    assert baseline_m > 0 and abs(scenario_m - baseline_m * 0.8) < 1e-6


def test_deterministic_fallback_builder():
    fallback = build_deterministic_fallback(
        envelope={"claim_budget": {"evidence_items_max": 3, "numeric_claims_max": 3}},
        context={"meta": {"context_version": "ctx"}, "summary": {"net_revenue": 100, "cm2_pct": 0.1}, "filters": {}, "dimension": "channel", "caveats": []},
        reason=["x"],
    )
    assert fallback["telemetry"]["response_validation"]["deterministic_fallback_used"] is True


# --- Claim budget / numeric duplication tests ---

from wyz_analytics.ai_cfo.response_validation import _count_numeric_claims


def _budget_envelope():
    return {
        "claim_budget": {"evidence_items_max": 3, "numeric_claims_max": 3},
        "allowed_driver_stages": ["MIXED", "UNKNOWN", "MARKETING", "CHANNEL", "PRODUCT", "REVENUE_QUALITY"],
        "verified_facts": [
            {"evidence_id": f"f{i}", "metric": f"m{i}", "value": (i + 1) * 100.0, "unit": "INR", "scope": {"filters": {}, "dimension": "channel"}}
            for i in range(5)
        ],
        "verified_signals": [],
        "tool_results": [],
    }


def _budget_context():
    return {"meta": {"context_version": "c"}, "filters": {}, "dimension": "channel", "summary": {}, "signals": [], "caveats": []}


def test_3_evidence_3_numbers_valid():
    env = _budget_envelope()
    answer = {
        "headline": "Top contributors identified.",
        "evidence": [
            {"evidence_id": "f0", "metric": "m0", "value": 100.0, "unit": "INR", "scope": {"filters": {}, "dimension": "channel"}, "interpretation": "x"},
            {"evidence_id": "f1", "metric": "m1", "value": 200.0, "unit": "INR", "scope": {"filters": {}, "dimension": "channel"}, "interpretation": "y"},
            {"evidence_id": "f2", "metric": "m2", "value": 300.0, "unit": "INR", "scope": {"filters": {}, "dimension": "channel"}, "interpretation": "z"},
        ],
        "driver_stage": "MIXED",
        "interpretation": "Three metrics contribute most to the view.",
        "caveat": None,
    }
    result = validate_structured_answer(answer, envelope=env, context=_budget_context())
    assert result.valid is True
    assert result.numeric_claim_count == 3


def test_same_numbers_repeated_in_interpretation_not_double_counted():
    """If interpretation restates the same values from evidence, total should still be 3."""
    answer = {
        "headline": "Top contributors.",
        "evidence": [
            {"metric": "rev", "value": 100.0, "unit": "INR", "scope": {}, "interpretation": "x"},
            {"metric": "cm1", "value": 200.0, "unit": "INR", "scope": {}, "interpretation": "y"},
            {"metric": "cm2", "value": 300.0, "unit": "INR", "scope": {}, "interpretation": "z"},
        ],
        "driver_stage": "MIXED",
        "interpretation": "Revenue is 100, CM1 is 200, CM2 is 300.",
        "caveat": None,
    }
    assert _count_numeric_claims(answer) == 3


def test_new_number_in_interpretation_counts_extra():
    answer = {
        "headline": "Top contributors.",
        "evidence": [
            {"metric": "rev", "value": 100.0, "unit": "INR", "scope": {}, "interpretation": "x"},
            {"metric": "cm1", "value": 200.0, "unit": "INR", "scope": {}, "interpretation": "y"},
            {"metric": "cm2", "value": 300.0, "unit": "INR", "scope": {}, "interpretation": "z"},
        ],
        "driver_stage": "MIXED",
        "interpretation": "Additionally, marketing is 456.",
        "caveat": None,
    }
    assert _count_numeric_claims(answer) == 4


def test_4th_evidence_item_budget_violation():
    env = _budget_envelope()
    answer = {
        "headline": "Contributions analyzed.",
        "evidence": [
            {"evidence_id": f"f{i}", "metric": f"m{i}", "value": (i + 1) * 100.0, "unit": "INR", "scope": {"filters": {}, "dimension": "channel"}, "interpretation": "x"}
            for i in range(4)
        ],
        "driver_stage": "MIXED",
        "interpretation": "Four items listed.",
        "caveat": None,
    }
    result = validate_structured_answer(answer, envelope=env, context=_budget_context())
    assert not result.valid
    assert any("budget" in v for v in result.violations)


def test_correction_from_5_claims_to_3_succeeds(beautyco_facts):
    """Model returns 5 evidence items on first call, corrects to 3 on retry."""

    class _CorrectingModel:
        id = "correcting-model"
        def __init__(self):
            self.calls = 0

        def run_turn(self, **kwargs):
            self.calls += 1
            ctx = kwargs.get("context") or {}
            summary = ctx.get("summary") or {}
            nr = summary.get("net_revenue") or 100
            cm2 = summary.get("cm2_pct") or 0.1
            if self.calls == 1:
                return {
                    "headline": "Multiple items provided.",
                    "evidence": [
                        {"metric": "m0", "value": nr, "unit": "INR", "scope": {"filters": ctx.get("filters") or {}, "dimension": ctx.get("dimension")}, "interpretation": "a"},
                        {"metric": "m1", "value": cm2, "unit": "PCT", "scope": {"filters": ctx.get("filters") or {}, "dimension": ctx.get("dimension")}, "interpretation": "b"},
                        {"metric": "m2", "value": nr * 0.5, "unit": "INR", "scope": {"filters": ctx.get("filters") or {}, "dimension": ctx.get("dimension")}, "interpretation": "c"},
                        {"metric": "m3", "value": nr * 0.3, "unit": "INR", "scope": {"filters": ctx.get("filters") or {}, "dimension": ctx.get("dimension")}, "interpretation": "d"},
                        {"metric": "m4", "value": nr * 0.1, "unit": "INR", "scope": {"filters": ctx.get("filters") or {}, "dimension": ctx.get("dimension")}, "interpretation": "e"},
                    ],
                    "driver_stage": "MIXED",
                    "interpretation": "Too many items.",
                    "caveat": None,
                    "tool_calls": [],
                }
            # Correction: return 3 evidence items using verified values
            envelope = ctx.get("evidence_envelope") or {}
            facts = (envelope.get("verified_facts") or [])[:3]
            return {
                    "headline": "Corrected to fewer items.",
                "evidence": [
                    {"evidence_id": f.get("evidence_id"), "metric": f.get("metric"), "value": f.get("value"), "unit": f.get("unit"), "scope": f.get("scope"), "interpretation": "verified"}
                    for f in facts
                ],
                "driver_stage": "MIXED",
                "interpretation": "Reduced to budget.",
                "caveat": None,
                "tool_calls": [],
            }

    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    context["evidence_envelope"] = build_evidence_envelope("What is driving CM2?", context)
    model = _CorrectingModel()
    answer = run_guarded_turn(
        message="What is driving CM2?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=model,
        get_signals=lambda: {"highlighted": context["signals"]},
    )
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("correction_attempted") is True
    assert rv.get("correction_succeeded") is True
    assert rv.get("deterministic_fallback_used") is not True
    assert len(answer.get("evidence") or []) <= 3


def test_correction_failure_still_falls_back_safely(beautyco_facts):
    """Model always returns too many items -> fallback."""
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    context["evidence_envelope"] = build_evidence_envelope("What is driving CM2?", context)
    answer = run_guarded_turn(
        message="What is driving CM2?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=_AlwaysInvalidModel(),
        get_signals=lambda: {"highlighted": context["signals"]},
    )
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("deterministic_fallback_used") is True
    assert len(answer.get("evidence") or []) <= 3


def test_no_numeric_duplication_across_sections():
    """Evidence value 100 restated in headline should not be double-counted."""
    answer = {
        "headline": "Revenue is 100 INR.",
        "evidence": [{"metric": "rev", "value": 100, "unit": "INR", "scope": {}, "interpretation": "x"}],
        "driver_stage": "MIXED",
        "interpretation": "Revenue remains stable.",
        "caveat": None,
    }
    assert _count_numeric_claims(answer) == 1
