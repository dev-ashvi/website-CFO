"""Truncation + forecast guard regressions for Phase 2C live reliability."""

from __future__ import annotations

import pytest

from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.openai_compatible import OpenAICompatibleAiCfoModel, resolve_strategic_max_tokens
from wyz_analytics.ai_cfo.strategy.actions import ActionType
from wyz_analytics.ai_cfo.strategy.confidence import DecisionConfidence
from wyz_analytics.ai_cfo.strategy.forecast_guard import is_prohibited_forecast
from wyz_analytics.ai_cfo.strategy.model_decision import parse_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.model_validation import validate_strategic_model_decision
from wyz_analytics.ai_cfo.strategy.partner import run_strategic_partner_judgment
from wyz_analytics.ai_cfo.strategy.reasoning_contract import StrategicReasoningContract
from wyz_analytics.ai_cfo.strategy.smoke import run_strategic_smoke_batch
from wyz_analytics.ai_cfo.strategy.strategic_prompt import STRATEGIC_JUDGMENT_SYSTEM_PROMPT
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


@pytest.fixture
def contract():
    return StrategicReasoningContract(
        allowed_actions=[ActionType.EXPERIMENT, ActionType.INVESTIGATE],
        forbidden_actions=[ActionType.EXIT],
        unknowns=[StrategicUnknown.DEMAND_RESPONSE],
        evidence_ids=["summary:cm1", "summary:cm2"],
        decision_confidence_ceiling=DecisionConfidence.MEDIUM,
    )


def test_finish_reason_length_explicit_truncation():
    def http_post(url, headers, data, timeout_sec):
        return {
            "choices": [{"message": {"content": '{"action":"EXPER'}, "finish_reason": "length"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }

    model = OpenAICompatibleAiCfoModel(api_key="k", http_post=http_post)
    raw = model.run_strategic_turn(
        message="Should I cut marketing?",
        model_input={"allowed_actions": ["EXPERIMENT"], "evidence_catalog": []},
        context={},
    )
    assert raw.get("_strategic_truncated") is True
    meta = raw.get("_provider_telemetry") or {}
    assert meta.get("finish_reason") == "length"
    assert meta.get("parse_warning") == "strategic_output_truncated"


def test_truncated_does_not_masquerade_as_parse_only_failure(contract):
    class _TruncatedProvider:
        id = "trunc"

        def run_strategic_turn(self, **kwargs):
            return {
                "selected_action": None,
                "_strategic_truncated": True,
                "_provider_telemetry": {
                    "finish_reason": "length",
                    "parse_warning": "strategic_output_truncated",
                },
            }

    context = {
        "summary": {"cm1": 1, "cm2": -1, "allocated_marketing": 1, "marketing_pct": 0.2},
        "signals": [],
        "financial_scope": {"scope_hash": "s", "filters": {"channel": ["D2C Website"]}, "dataset_id": "b"},
        "filters": {"channel": ["D2C Website"]},
        "dimension": "channel",
        "caveats": [],
    }
    context["evidence_envelope"] = build_evidence_envelope("Should I cut marketing?", context)
    _, telemetry, _ = run_strategic_partner_judgment(
        message="Should I cut marketing?",
        working_context=context,
        agent=_TruncatedProvider(),
    )
    assert telemetry.get("strategic_failure_stage") == "provider_output_truncated"
    assert "finish_reason_length" in (telemetry.get("strategic_failure_codes") or [])


def test_compact_schema_parses():
    raw = {
        "action": "EXPERIMENT",
        "strength": "MODERATE",
        "confidence": "MEDIUM",
        "evidence": ["summary:cm1"],
        "position_key": "controlled_reduction_test",
        "unknowns": ["DEMAND_RESPONSE"],
        "next": "EXPERIMENT",
        "monitor": ["net_revenue", "cm2_pct"],
        "reason": "Contribution weakens after attributed marketing.",
    }
    decision = parse_strategic_model_decision(raw)
    assert decision.selected_action == ActionType.EXPERIMENT
    assert decision.thesis.position == "controlled_reduction_test"


def test_strategic_prompt_is_compact():
    assert len(STRATEGIC_JUDGMENT_SYSTEM_PROMPT) < 1200
    assert "provenance architecture" not in STRATEGIC_JUDGMENT_SYSTEM_PROMPT.lower()


def test_strategic_max_tokens_default():
    assert resolve_strategic_max_tokens() >= 1024


@pytest.mark.parametrize(
    "text",
    [
        "We do not know how revenue responds to lower spend.",
        "Monitor revenue to see whether demand changes.",
        "A controlled experiment can test whether lower spend affects revenue.",
        "If revenue remains stable, CM2 improves mechanically.",
        "The main uncertainty is demand response.",
    ],
)
def test_forecast_guard_allows_uncertainty_and_conditionals(text):
    prohibited, _ = is_prohibited_forecast(text)
    assert prohibited is False


@pytest.mark.parametrize(
    "text",
    [
        "Revenue will remain stable.",
        "Cutting marketing will not affect sales.",
        "Revenue will decline 5%.",
        "Demand will remain unchanged.",
        "Sales should be unaffected.",
    ],
)
def test_forecast_guard_blocks_assertive_forecasts(text):
    prohibited, rule = is_prohibited_forecast(text)
    assert prohibited is True
    assert rule


def test_unknown_taxonomy_not_forecast():
    prohibited, _ = is_prohibited_forecast("DEMAND_RESPONSE")
    assert prohibited is False


def test_valid_monitoring_phrase_passes_validation(contract):
    decision = parse_strategic_model_decision(
        {
            "action": "EXPERIMENT",
            "strength": "MODERATE",
            "confidence": "MEDIUM",
            "evidence": ["summary:cm1"],
            "position_key": "controlled_reduction_test",
            "unknowns": ["DEMAND_RESPONSE"],
            "reason": "Monitor revenue to see whether demand changes after a controlled test.",
        }
    )
    result = validate_strategic_model_decision(decision, contract=contract, known_evidence_ids={"summary:cm1"})
    assert result.ok
    assert result.forecast_violation_field is None


def test_invalid_forecast_reports_field(contract):
    decision = parse_strategic_model_decision(
        {
            "action": "EXPERIMENT",
            "strength": "MODERATE",
            "confidence": "MEDIUM",
            "evidence": ["summary:cm1"],
            "position_key": "controlled_reduction_test",
            "reason": "Revenue will remain stable if we cut marketing.",
        }
    )
    result = validate_strategic_model_decision(decision, contract=contract, known_evidence_ids={"summary:cm1"})
    assert not result.ok
    assert result.forecast_violation_field == "rationale"


def test_smoke_batch_aggregation_with_stub():
    class _Stub:
        id = "stub"

        def run_strategic_turn(self, **kwargs):
            return {
                "action": "EXPERIMENT",
                "strength": "MODERATE",
                "confidence": "MEDIUM",
                "evidence": ["summary:cm1"],
                "position_key": "controlled_reduction_test",
                "unknowns": ["DEMAND_RESPONSE"],
                "_provider_telemetry": {"latency_ms": 100, "finish_reason": "stop"},
            }

    import wyz_analytics.ai_cfo.strategy.smoke as smoke_mod

    original = smoke_mod.resolve_ai_cfo_model
    smoke_mod.resolve_ai_cfo_model = lambda **kwargs: _Stub()
    try:
        batch = run_strategic_smoke_batch(runs=3, provider="fake", model=None)
    finally:
        smoke_mod.resolve_ai_cfo_model = original
    assert batch["runs"] == 3
    assert batch["parse_pass_rate"] == 1.0
    assert batch["truncation_count"] == 0
