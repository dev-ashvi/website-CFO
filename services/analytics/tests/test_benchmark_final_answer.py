"""Regression: benchmark scores the FINAL user-visible AI CFO answer only."""

from __future__ import annotations

from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.answer_contract import UNSTRUCTURED_PLACEHOLDER_HEADLINE
from wyz_analytics.ai_cfo.benchmark.cases import BENCHMARK_CASES
from wyz_analytics.ai_cfo.benchmark.scorer import score_response
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.guards.orchestrator import run_guarded_turn
from wyz_analytics.ai_cfo.response_validation import validate_structured_answer
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _q4():
    return next(case for case in BENCHMARK_CASES if case["id"] == "Q4")


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


def _three_evidence(envelope: dict[str, Any]) -> list[dict[str, Any]]:
    facts = (envelope.get("verified_facts") or [])[:3]
    return [
        {
            "evidence_id": item.get("evidence_id"),
            "metric": item.get("metric"),
            "value": item.get("value"),
            "unit": item.get("unit"),
            "scope": item.get("scope"),
            "interpretation": "Verified evidence item.",
        }
        for item in facts
    ]


def _structured_answer(envelope: dict[str, Any], headline: str) -> dict[str, Any]:
    return {
        "headline": headline,
        "evidence": _three_evidence(envelope),
        "driver_stage": "MIXED",
        "interpretation": "Contribution is mixed across verified stages.",
        "caveat": "Channel-level CM2 uses attributed marketing allocation.",
        "tool_calls": [],
    }


class _InitialValidModel:
    id = "initial-valid"

    def __init__(self, envelope: dict[str, Any]):
        self.envelope = envelope
        self.calls = 0

    def run_turn(self, **kwargs):
        self.calls += 1
        return _structured_answer(self.envelope, "Initial structured interpretation.")


class _CorrectionSucceedsModel:
    id = "correction-succeeds"

    def __init__(self, envelope: dict[str, Any]):
        self.envelope = envelope
        self.calls = 0

    def run_turn(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            return {
                "headline": UNSTRUCTURED_PLACEHOLDER_HEADLINE,
                "evidence": [],
                "driver_stage": "UNKNOWN",
                "interpretation": UNSTRUCTURED_PLACEHOLDER_HEADLINE,
                "parse_warning": "non_json_final_answer",
                "tool_calls": [],
            }
        return _structured_answer(self.envelope, "Corrected structured interpretation.")


class _AlwaysInvalidModel:
    id = "always-invalid"

    def run_turn(self, **kwargs):
        return {
            "headline": UNSTRUCTURED_PLACEHOLDER_HEADLINE,
            "evidence": [{"metric": "invented_metric", "value": 9999999}],
            "driver_stage": "MARKETING",
            "interpretation": "invalid",
            "parse_warning": "non_json_final_answer",
            "tool_calls": [],
        }


def _run(model, beautyco_facts, envelope, context):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    return run_guarded_turn(
        message="What are the largest margin leaks?",
        context=context,
        analytical={"filters": {}, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=model,
        get_signals=lambda: {"highlighted": context["signals"]},
    )


def test_unstructured_placeholder_is_invalid_schema():
    envelope = {
        "claim_budget": {"evidence_items_max": 3, "numeric_claims_max": 3},
        "allowed_driver_stages": ["MIXED", "UNKNOWN", "MARKETING", "CHANNEL", "PRODUCT", "REVENUE_QUALITY"],
        "verified_facts": [],
        "verified_signals": [],
        "tool_results": [],
    }
    context = {"filters": {}, "dimension": "channel", "summary": {}, "signals": [], "caveats": []}
    result = validate_structured_answer(
        {
            "headline": UNSTRUCTURED_PLACEHOLDER_HEADLINE,
            "evidence": [],
            "driver_stage": "UNKNOWN",
            "parse_warning": "non_json_final_answer",
        },
        envelope=envelope,
        context=context,
    )
    assert result.valid is False
    assert any("malformed_schema" in item for item in result.violations)


def test_scorer_uses_initial_when_valid(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What are the largest margin leaks?", context)
    context["evidence_envelope"] = envelope
    model = _InitialValidModel(envelope)
    answer = _run(model, beautyco_facts, envelope, context)
    assert model.calls == 1
    assert (answer.get("telemetry") or {}).get("answer_source") == "model"
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("initial_response_valid") is True
    assert rv.get("correction_attempted") is False
    scored = score_response(
        case=_q4(),
        response={"answer": answer, "scoring_answer": answer, "context": context},
    )
    assert "did not return a structured answer" not in " ".join(scored.get("notes") or []).lower()
    assert answer["headline"] == "Initial structured interpretation."


def test_scorer_uses_corrected_answer_not_stale_placeholder(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What are the largest margin leaks?", context)
    context["evidence_envelope"] = envelope
    model = _CorrectionSucceedsModel(envelope)
    answer = _run(model, beautyco_facts, envelope, context)
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("correction_attempted") is True
    assert rv.get("correction_valid") is True
    assert rv.get("fallback_used") is not True
    assert (answer.get("telemetry") or {}).get("answer_source") == "corrected_model"
    assert answer["headline"] == "Corrected structured interpretation."
    assert UNSTRUCTURED_PLACEHOLDER_HEADLINE not in str(answer.get("headline"))
    stale = {
        "headline": UNSTRUCTURED_PLACEHOLDER_HEADLINE,
        "evidence": [],
        "interpretation": UNSTRUCTURED_PLACEHOLDER_HEADLINE,
        "telemetry": {"answer_source": "model"},
    }
    scored = score_response(
        case=_q4(),
        response={"answer": stale, "scoring_answer": answer, "context": context},
    )
    notes = " ".join(scored.get("notes") or [])
    assert "did not return a structured answer" not in notes.lower()
    assert scored["numeric_claim_count"] > 0
    assert scored["grounded_numeric_claim_count"] > 0


def test_corrected_three_evidence_values_ground_numerically(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What are the largest margin leaks?", context)
    context["evidence_envelope"] = envelope
    model = _CorrectionSucceedsModel(envelope)
    answer = _run(model, beautyco_facts, envelope, context)
    assert len(answer.get("evidence") or []) == 3
    scored = score_response(
        case=_q4(),
        response={"answer": answer, "scoring_answer": answer, "context": context},
    )
    assert scored["numeric_claim_count"] >= 3
    assert scored["grounded_numeric_claim_count"] >= 3
    assert scored["categories"]["numerical_grounding"] == 2


def test_fallback_is_what_scorer_sees_when_correction_fails(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What are the largest margin leaks?", context)
    context["evidence_envelope"] = envelope
    answer = _run(_AlwaysInvalidModel(), beautyco_facts, envelope, context)
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("fallback_used") is True
    assert (answer.get("telemetry") or {}).get("answer_source") == "deterministic_fallback"
    assert UNSTRUCTURED_PLACEHOLDER_HEADLINE not in str(answer.get("headline"))
    assert "constrained to deterministic evidence" not in (answer.get("headline") or "").lower()
    scored = score_response(
        case=_q4(),
        response={"answer": answer, "scoring_answer": answer, "context": context},
    )
    notes = " ".join(scored.get("notes") or [])
    assert "did not return a structured answer" not in notes.lower()


def test_answer_source_records_expected_paths(beautyco_facts):
    tools = AiCfoTools(beautyco_facts, active_filters={}, surface="margin", dimension="channel")
    context = _ctx(tools)
    envelope = build_evidence_envelope("What are the largest margin leaks?", context)
    context["evidence_envelope"] = envelope

    initial = _run(_InitialValidModel(envelope), beautyco_facts, envelope, context)
    assert (initial.get("telemetry") or {}).get("answer_source") == "model"

    corrected = _run(_CorrectionSucceedsModel(envelope), beautyco_facts, envelope, context)
    assert (corrected.get("telemetry") or {}).get("answer_source") == "corrected_model"

    fallback = _run(_AlwaysInvalidModel(), beautyco_facts, envelope, context)
    assert (fallback.get("telemetry") or {}).get("answer_source") == "deterministic_fallback"

    trace = (corrected.get("telemetry") or {}).get("answer_trace") or {}
    assert trace.get("initial_headline") == UNSTRUCTURED_PLACEHOLDER_HEADLINE
    assert trace.get("final_headline") == "Corrected structured interpretation."
