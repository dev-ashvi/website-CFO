"""Q10 strategic path must keep the capability boundary under semantic compose."""

from __future__ import annotations

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.answer_contract import UNSTRUCTURED_PLACEHOLDER_HEADLINE
from wyz_analytics.ai_cfo.benchmark.cases import BENCHMARK_CASES
from wyz_analytics.ai_cfo.benchmark.scorer import score_response
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.guards.orchestrator import run_guarded_turn
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


class _MalformedModel:
    id = "malformed"

    def run_turn(self, **kwargs):
        return {
            "headline": "{",
            "evidence": [],
            "driver_stage": "UNKNOWN",
            "interpretation": "{",
            "parse_warning": "non_json_final_answer",
            "tool_calls": [],
            "telemetry": {"model_calls": 1, "parse": {"status": "truncated", "began_with": "{", "content_type": "text"}},
        }


def test_strategic_malformed_fallback_preserves_boundary(beautyco_facts):
    filters = {"channel": ["D2C Website"]}
    tools = AiCfoTools(beautyco_facts, active_filters=filters, surface="margin", dimension="channel")
    context = {
        "meta": {"context_version": "ctx_t"},
        "summary": tools.get_current_financial_view().get("summary") or {},
        "signals": tools.get_cfo_signals().get("highlighted") or [],
        "filters": filters,
        "surface": "margin",
        "dimension": "channel",
        "period": {},
        "caveats": ["Attributed marketing CM2 is not fully-loaded profitability."],
    }
    context["evidence_envelope"] = build_evidence_envelope("Should we stop selling D2C?", context)
    answer = run_guarded_turn(
        message="Should we stop selling D2C?",
        context=context,
        analytical={"filters": filters, "surface": "margin", "dimension": "channel"},
        tools=tools,
        agent=_MalformedModel(),
        get_signals=lambda: {"highlighted": context["signals"], "signals": context["signals"]},
    )
    assert (answer.get("telemetry") or {}).get("answer_source") in {
        "deterministic_semantic",
        "model_semantic",
        "deterministic_fallback",
    }
    assert answer["headline"] == STRATEGY_BOUNDARY_SENTENCE
    assert "does not make stop/continue" in (answer["headline"] or "").lower()
    assert UNSTRUCTURED_PLACEHOLDER_HEADLINE not in str(answer.get("headline"))
    rv = (answer.get("telemetry") or {}).get("response_validation") or {}
    assert rv.get("correction_attempted") is not True
    assert answer.get("caveat")

    case = next(item for item in BENCHMARK_CASES if item["id"] == "Q10")
    scored = score_response(
        case=case,
        response={"answer": answer, "scoring_answer": answer, "context": context},
    )
    assert scored["categories"]["hallucination_scope"] == 2
    assert not scored["material_violation"]
    notes = " ".join(scored.get("notes") or []).lower()
    assert "failed to refuse strategic recommendation" not in notes
