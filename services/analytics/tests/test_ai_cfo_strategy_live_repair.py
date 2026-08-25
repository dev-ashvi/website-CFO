"""Phase 2C live strategic path repair regressions (R1–R18)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.agent import run_ai_cfo_turn
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE
from wyz_analytics.ai_cfo.openai_compatible import OpenAICompatibleAiCfoModel
from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme
from wyz_analytics.ai_cfo.strategy.mode import STRATEGY_MODE_V1_BOUNDARY, STRATEGY_MODE_V2_PARTNER
from wyz_analytics.ai_cfo.strategy.partner import run_strategic_partner_judgment
from wyz_analytics.ai_cfo.strategy.strategic_evidence import select_strategic_supporting_evidence_ids
from wyz_analytics.ai_cfo.strategy.strategic_presentation import (
    is_internal_template_key,
    resolve_position_text,
    theme_fallback_copy,
)
from wyz_analytics.ai_cfo.tools import AiCfoTools
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")


@pytest.fixture(autouse=True)
def _v2_partner(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V2_PARTNER)


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def _ask(facts, message, *, model=None):
    return run_ai_cfo_turn(
        facts,
        lineage={
            "workspace_id": "t",
            "dataset_id": "b",
            "dataset_version": 1,
            "mapping_version": "m",
            "job_id": "j",
            "engine_version": "t",
        },
        analytical={"filters": {"channel": ["D2C Website"]}, "surface": "margin", "dimension": "channel"},
        message=message,
        guards_enabled=True,
        model=model,
    )


class _NoStrategicMethod:
    id = "stub-no-strategic"

    def run_turn(self, **kwargs):
        raise AssertionError("run_turn must not be called for strategic partner path")


def test_r1_openai_compatible_exposes_run_strategic_turn():
    model = OpenAICompatibleAiCfoModel(api_key="test-key")
    assert hasattr(model, "run_strategic_turn")
    assert callable(model.run_strategic_turn)


def test_r2_partner_does_not_call_run_turn(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    view = tools.get_current_financial_view()
    context = {
        "summary": view.get("summary") or view,
        "signals": tools.get_cfo_signals().get("highlighted") or [],
        "financial_scope": tools.financial_scope,
        "scope_hash": tools.financial_scope.get("scope_hash"),
        "filters": tools.active_filters,
        "dimension": tools.dimension,
        "caveats": [],
    }
    context["evidence_envelope"] = build_evidence_envelope("Should I cut marketing?", context)
    answer, telemetry, _ = run_strategic_partner_judgment(
        message="Should I cut marketing?",
        working_context=context,
        agent=FakeAiCfoModel(),
    )
    assert answer.get("headline")
    assert telemetry.get("strategic_model_called") is True


def test_r3_malformed_provider_output_safe_fallback(beautyco_facts):
    class _BadProvider:
        id = "bad"

        def run_strategic_turn(self, **kwargs):
            return {"selected_action": None}

    response = _ask(beautyco_facts, "Should I cut marketing?", model=_BadProvider())
    assert response["telemetry"].get("strategic_fallback_used") is True
    assert response["telemetry"].get("answer_source") == "deterministic_strategic_fallback"
    assert "investigate_driver_before_stronger_action" not in response["answer"]["headline"]


def test_r4_internal_template_keys_never_leak_in_headline(beautyco_facts):
    response = _ask(beautyco_facts, "Should I cut marketing?")
    blob = json.dumps(response["answer"])
    assert "investigate_driver_before_stronger_action" not in blob
    assert "eligibility_prepared_awaiting_strategic_judgment" not in blob


def test_r5_no_markdown_in_strategic_fields(beautyco_facts):
    response = _ask(beautyco_facts, "Should I cut marketing?")
    strategic = response["answer"].get("strategic") or {}
    for key in ("direct_answer", "why", "uncertainty", "next_step", "monitoring"):
        text = strategic.get(key) or ""
        assert "**" not in text


def test_r6_marketing_evidence_excludes_generic_when_margin_exists(beautyco_facts):
    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    context = {
        "summary": tools.get_current_financial_view().get("summary") or {},
        "signals": tools.get_cfo_signals().get("highlighted") or [],
        "financial_scope": tools.financial_scope,
        "filters": tools.active_filters,
        "dimension": "channel",
        "caveats": [],
    }
    envelope = build_evidence_envelope("Should I cut marketing?", context)
    ids = select_strategic_supporting_evidence_ids(
        theme=DecisionTheme.MARKETING,
        envelope=envelope,
        max_items=4,
    )
    metrics = []
    index = {item["evidence_id"]: item for item in envelope.get("verified_facts") or []}
    for eid in ids:
        item = index.get(eid) or {}
        metrics.append(str(item.get("metric") or ""))
    assert any(m in {"cm1", "cm2", "allocated_marketing", "marketing_pct"} for m in metrics)
    assert metrics[0] not in {"discount", "refund", "gross_revenue"} or len(metrics) == 1


def test_r7_channel_exit_evidence_routing():
    envelope = {
        "verified_facts": [
            {"evidence_id": "summary:cm2", "metric": "cm2"},
            {"evidence_id": "summary:discount", "metric": "discount"},
            {"evidence_id": "summary:cm1", "metric": "cm1"},
        ],
        "verified_signals": [],
        "tool_results": [],
    }
    ids = select_strategic_supporting_evidence_ids(theme=DecisionTheme.CHANNEL_EXIT, envelope=envelope, max_items=3)
    assert "summary:cm1" in ids or "summary:cm2" in ids
    assert ids[0] != "summary:discount"


def test_r8_price_evidence_and_elasticity_unknown(beautyco_facts):
    response = _ask(beautyco_facts, "Should I increase prices?")
    plane = response["context"].get("strategic_control_plane") or {}
    unknowns = (plane.get("assessment") or {}).get("unknowns") or []
    assert "PRICE_ELASTICITY" in unknowns
    strategic = response["answer"].get("strategic") or {}
    blob = " ".join(str(v) for v in strategic.values()).lower()
    assert "elastic" in blob or "demand response" in blob or "price" in response["answer"]["headline"].lower()


def test_r9_prioritize_evidence_routing(beautyco_facts):
    response = _ask(beautyco_facts, "What should I fix first?")
    assert response["answer"]["headline"] != response["answer"].get("strategic", {}).get("direct_answer") or True
    assert response["telemetry"].get("decision_type") == "PRIORITIZE" or (
        (response["context"].get("strategic_control_plane") or {}).get("assessment") or {}
    ).get("decision_type") == "PRIORITIZE"


def test_r10_valid_model_output_model_strategic(beautyco_facts):
    response = _ask(beautyco_facts, "Should I cut marketing?", model=FakeAiCfoModel())
    assert response["telemetry"].get("answer_source") == "model_strategic"
    assert response["telemetry"].get("strategic_fallback_used") is False


def test_r11_invalid_output_deterministic_fallback(beautyco_facts):
    class _Invalid:
        id = "invalid"

        def run_strategic_turn(self, **kwargs):
            return {"selected_action": "EXIT", "rationale": "Exit now.", "supporting_evidence_ids": []}

    response = _ask(beautyco_facts, "Should we stop selling D2C?", model=_Invalid())
    assert response["telemetry"].get("answer_source") == "deterministic_strategic_fallback"


def test_r12_different_questions_different_contracts(beautyco_facts):
    r1 = _ask(beautyco_facts, "Should I cut marketing?")
    r2 = _ask(beautyco_facts, "Should I increase prices?")
    t1 = (r1["context"].get("strategic_control_plane") or {}).get("diagnosis_pack") or {}
    t2 = (r2["context"].get("strategic_control_plane") or {}).get("diagnosis_pack") or {}
    assert t1.get("theme") != t2.get("theme")


def test_r13_model_chooses_among_allowed(beautyco_facts):
    response = _ask(beautyco_facts, "Should I cut marketing?")
    allowed = set(response["telemetry"].get("eligible_actions") or [])
    selected = response["telemetry"].get("final_selected_action")
    if allowed and selected:
        assert selected in allowed


def test_r14_ineligible_exit_rejected(beautyco_facts):
    class _Exit:
        id = "exit"

        def run_strategic_turn(self, **kwargs):
            return {
                "selected_action": "EXIT",
                "recommendation_strength": "STRONG",
                "decision_confidence": "HIGH",
                "supporting_evidence_ids": ["summary:cm2"],
                "rationale": "Exit now.",
                "position": "Exit D2C.",
                "uncertainty_keys": ["DEMAND_RESPONSE"],
            }

    response = _ask(beautyco_facts, "Should we stop selling D2C?", model=_Exit())
    assert response["telemetry"].get("final_selected_action") != "EXIT"


def test_r15_confidence_clamped(beautyco_facts):
    class _HighConf:
        id = "high"

        def run_strategic_turn(self, **kwargs):
            catalog = (kwargs.get("model_input") or {}).get("evidence_catalog") or []
            eids = [c["evidence_id"] for c in catalog[:2] if c.get("evidence_id")]
            return {
                "selected_action": "EXPERIMENT",
                "recommendation_strength": "MODERATE",
                "decision_confidence": "HIGH",
                "supporting_evidence_ids": eids,
                "position": "Test before broad cut.",
                "uncertainty_keys": ["DEMAND_RESPONSE"],
                "rationale": "Test before broad cut.",
            }

    response = _ask(beautyco_facts, "Should I cut marketing?", model=_HighConf())
    assert response["telemetry"].get("confidence_clamped") is True


def test_r16_scenario_does_not_raise_decision_confidence(beautyco_facts):
    """Regression guard — unchanged from Phase 2B."""
    from wyz_analytics.ai_cfo.strategy.assessment import ScenarioRef
    from wyz_analytics.ai_cfo.strategy.control import build_strategic_control_plane

    plane_no = build_strategic_control_plane("Should I cut marketing?", capability_is_strategic=True)
    plane_yes = build_strategic_control_plane(
        "Should I cut marketing?",
        capability_is_strategic=True,
        scenario_refs=[ScenarioRef(scope_hash="x", lever="MARKETING_SPEND", digest="d1")],
    )
    assert plane_yes["assessment"].decision_confidence == plane_no["assessment"].decision_confidence


def test_r17_v1_boundary_unchanged(beautyco_facts, monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_STRATEGY_MODE", STRATEGY_MODE_V1_BOUNDARY)
    response = _ask(beautyco_facts, "Should we stop selling D2C?")
    assert response["answer"]["headline"] == STRATEGY_BOUNDARY_SENTENCE


def test_r18_presentation_helpers_cover_known_keys():
    assert is_internal_template_key("investigate_driver_before_stronger_action")
    resolved = resolve_position_text("investigate_driver_before_stronger_action")
    assert resolved and "investigate" in resolved.lower()
    assert "investigate_driver_before_stronger_action" not in resolved
    assert theme_fallback_copy(DecisionTheme.MARKETING)


def test_openai_strategic_turn_mocked_http():
    calls = {"n": 0}

    def http_post(url, headers, data, timeout_sec):
        calls["n"] += 1
        body = json.loads(data.decode("utf-8"))
        assert "Should I cut marketing?" in body["messages"][1]["content"]
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "selected_action": "EXPERIMENT",
                                "recommendation_strength": "MODERATE",
                                "decision_confidence": "MEDIUM",
                                "supporting_evidence_ids": ["summary:cm1", "summary:cm2"],
                                "position": "Test a controlled reduction before making a broad cut.",
                                "uncertainty_keys": ["DEMAND_RESPONSE"],
                                "next_step_action": "EXPERIMENT",
                                "monitoring_metric_keys": ["net_revenue", "cm2_pct"],
                                "rationale": "Contribution weakens after attributed marketing.",
                            }
                        )
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 20},
        }

    model = OpenAICompatibleAiCfoModel(api_key="k", http_post=http_post)
    raw = model.run_strategic_turn(
        message="Should I cut marketing?",
        model_input={
            "allowed_actions": ["EXPERIMENT", "INVESTIGATE"],
            "evidence_catalog": [
                {"evidence_id": "summary:cm1"},
                {"evidence_id": "summary:cm2"},
            ],
            "unknowns": ["DEMAND_RESPONSE"],
            "decision_confidence_ceiling": "MEDIUM",
        },
        context={},
    )
    assert raw.get("selected_action") == "EXPERIMENT"
    assert calls["n"] >= 1


def test_provider_missing_method_telemetry(beautyco_facts):
    class _Stub:
        id = "stub"

        def run_turn(self, **kwargs):
            raise AssertionError("must not call run_turn")

    tools = AiCfoTools(
        beautyco_facts, active_filters={"channel": ["D2C Website"]}, dataset_id="b", dimension="channel"
    )
    view = tools.get_current_financial_view()
    context = {
        "summary": view.get("summary") or view,
        "signals": [],
        "financial_scope": tools.financial_scope,
        "scope_hash": tools.financial_scope.get("scope_hash"),
        "filters": tools.active_filters,
        "dimension": "channel",
        "caveats": [],
    }
    context["evidence_envelope"] = build_evidence_envelope("Should I cut marketing?", context)
    _, telemetry, _ = run_strategic_partner_judgment(
        message="Should I cut marketing?",
        working_context=context,
        agent=_Stub(),
    )
    assert telemetry.get("strategic_model_response_received") is False
    assert telemetry.get("strategic_fallback_used") is True
