"""P1 observability tests O1–O30 (focused)."""

from __future__ import annotations

import json
import logging

import pytest

from wyz_analytics.observability.ai_trace import emit_ai_cfo_turn_trace
from wyz_analytics.observability.config import ObservabilityConfig
from wyz_analytics.observability.context import get_request_id, set_request_id
from wyz_analytics.observability.emit import emit_event, reset_config_for_tests
from wyz_analytics.observability.events import ObservabilityEvent, new_request_id
from wyz_analytics.observability.feedback import build_feedback_record
from wyz_analytics.observability.feedback.repository import FilesystemAiFeedbackRepository
from wyz_analytics.observability.redaction import redact_attributes
from wyz_analytics.workers.logging_config import JsonFormatter, configure_logging
from wyz_analytics.workers.service import AnalyticsWorkspace


@pytest.fixture(autouse=True)
def _reset_obs(monkeypatch):
    monkeypatch.setenv("WYZ_OBSERVABILITY_ENABLED", "true")
    monkeypatch.setenv("WYZ_LOG_FORMAT", "json")
    monkeypatch.delenv("WYZ_OBSERVABILITY_FILE_ENABLED", raising=False)
    reset_config_for_tests()
    yield
    reset_config_for_tests()
    set_request_id(None)


def test_o1_structured_event_serialization():
    event = ObservabilityEvent(
        event_name="http_request_completed",
        component="http",
        category="http",
        request_id="req_abc",
        attributes={"route": "/health", "method": "GET", "status_code": 200},
    )
    payload = event.to_dict()
    assert payload["event_name"] == "http_request_completed"
    assert payload["event_version"] == 1
    assert payload["request_id"] == "req_abc"
    assert "prompt" not in payload


def test_o2_request_id_generation_and_context():
    rid = new_request_id()
    assert rid.startswith("req_")
    set_request_id(rid)
    assert get_request_id() == rid


def test_o3_o5_ai_turn_and_provider_correlation(caplog):
    set_request_id("req_turn_1")
    with caplog.at_level(logging.INFO):
        emit_ai_cfo_turn_trace(
            public_telemetry={
                "answer_source": "strategic_partner",
                "provider_calls": 1,
                "resolved_intent": "STRATEGIC",
            },
            conversation={
                "conversation_id": "c1",
                "turn_id": "t1",
                "selected_evidence_ids": ["ev_1"],
                "strategic": {"decision_theme": "MARKETING_SPEND", "decision_type": "COST_CUT"},
                "strategic_thread": {"thread_id": "th1"},
            },
            lineage={"dataset_id": "ds_abcdef123456", "job_id": "job_1"},
            scope_hash="scope_abc",
            latency_ms=120,
            request_id="req_turn_1",
            answer={
                "telemetry": {
                    "final_selected_action": "EXPERIMENT",
                    "strategic_model_called": True,
                    "provider": "openai_compatible",
                    "model": "gpt-oss-20b",
                }
            },
        )
    joined = " ".join(r.message for r in caplog.records)
    assert "ai_cfo_turn_completed" in joined


def test_o6_o8_fallback_and_clamp_events(caplog):
    with caplog.at_level(logging.WARNING):
        emit_ai_cfo_turn_trace(
            public_telemetry={"answer_source": "deterministic_fallback", "provider_calls": 0},
            conversation={"conversation_id": "c1", "turn_id": "t2", "selected_evidence_ids": []},
            lineage={"dataset_id": "ds_abcdef123456"},
            scope_hash="scope_x",
            latency_ms=10,
            answer={
                "telemetry": {
                    "strategic_fallback_used": True,
                    "strategic_failure_stage": "validation",
                    "confidence_clamped": True,
                    "strength_clamped": True,
                    "finish_reason": "length",
                }
            },
        )
    names = [r.message for r in caplog.records]
    assert "ai_strategic_fallback_used" in names
    assert "ai_model_confidence_clamped" in names
    assert "ai_model_strength_clamped" in names


def test_o11_o12_decision_events(caplog):
    with caplog.at_level(logging.INFO):
        emit_event(
            "strategic_decision_tracked",
            component="strategy_decisions",
            category="decision",
            dataset_id="ds_abcdef123456",
            decision_id="sdr_1",
            scope_hash="scope_x",
            attributes={"decision_theme": "MARKETING_SPEND", "selected_action": "EXPERIMENT"},
        )
        emit_event(
            "strategic_decision_review_completed",
            component="strategy_decisions",
            category="decision",
            dataset_id="ds_abcdef123456",
            decision_id="sdr_1",
            attributes={"revision_disposition": "MAINTAIN"},
        )
    assert any(r.message == "strategic_decision_tracked" for r in caplog.records)


def test_o13_o15_o16_o17_feedback_persistence_and_validation(tmp_path):
    repo = FilesystemAiFeedbackRepository(tmp_path)
    record = build_feedback_record(
        dataset_id="ds_abcdef123456",
        turn_id="t1",
        rating="USEFUL",
        answer_source="strategic_partner",
        decision_theme="MARKETING_SPEND",
        selected_action="EXPERIMENT",
    )
    repo.put(record)
    reopened = FilesystemAiFeedbackRepository(tmp_path)
    loaded = reopened.find_by_turn("ds_abcdef123456", "t1")
    assert loaded is not None
    assert loaded.rating == "USEFUL"
    assert "answer_text" not in loaded.to_record()

    bad = build_feedback_record(
        dataset_id="ds_abcdef123456",
        turn_id="t2",
        rating="NOT_USEFUL",
        reason="WRONG_REASONING",
    )
    assert bad.reason == "WRONG_REASONING"
    with pytest.raises(ValueError):
        build_feedback_record(dataset_id="ds_x", turn_id="t3", rating="MEH")
    with pytest.raises(ValueError):
        build_feedback_record(
            dataset_id="ds_x", turn_id="t3", rating="NOT_USEFUL", reason="HATES_CFO"
        )


def test_o14_not_useful_with_reason(tmp_path):
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    ds = ws.create_dataset(name="FB")
    out = ws.submit_ai_feedback(
        ds.dataset_id,
        {
            "turn_id": "t9",
            "rating": "NOT_USEFUL",
            "reason": "TOO_GENERIC",
            "answer_text": "SHOULD_NOT_PERSIST",
            "prompt": "SHOULD_NOT_PERSIST",
        },
    )
    fb = out["feedback"]
    assert fb["rating"] == "NOT_USEFUL"
    assert fb["reason"] == "TOO_GENERIC"
    assert "answer_text" not in fb
    assert "prompt" not in fb
    dup = ws.submit_ai_feedback(ds.dataset_id, {"turn_id": "t9", "rating": "USEFUL"})
    assert dup["duplicate"] is True


def test_o18_o19_o20_o21_redaction_blocks_sensitive_fields():
    cleaned = redact_attributes(
        {
            "route": "/x",
            "api_key": "secret",
            "authorization": "Bearer x",
            "prompt": "do not log",
            "messages": [{"role": "user"}],
            "net_revenue": 123,
            "answer_source": "strategic_partner",
            "unknown_field": "drop_me",
        }
    )
    assert cleaned == {"route": "/x", "answer_source": "strategic_partner"}
    assert "api_key" not in cleaned
    assert "prompt" not in cleaned
    assert "net_revenue" not in cleaned


def test_o22_o23_o24_health_and_readiness(tmp_path, monkeypatch):
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    ready = ws.readiness()
    assert ready["ready"] is True
    assert ready["work_dir_writable"] is True

    # Unwritable simulation: point root at a file path.
    broken = AnalyticsWorkspace.__new__(AnalyticsWorkspace)
    broken.root = tmp_path / "not_a_dir.txt"
    broken.root.write_text("x", encoding="utf-8")
    not_ready = AnalyticsWorkspace.readiness(broken)
    assert not_ready["ready"] is False


def test_o29_json_formatter_emits_machine_readable():
    configure_logging(level="INFO", log_format="json")
    record = logging.LogRecord(
        name="wyz_analytics.observability",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="http_request_completed",
        args=(),
        exc_info=None,
    )
    record.route = "/health"
    record.status_code = 200
    line = JsonFormatter().format(record)
    payload = json.loads(line)
    assert payload["event_name"] == "http_request_completed"


def test_acceptance_trace_correlation_without_financials(tmp_path, caplog):
    """Offline acceptance: useful feedback correlates by request_id/turn_id/dataset_id."""
    set_request_id("req_accept_1")
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    ds = ws.create_dataset(name="Accept")
    with caplog.at_level(logging.INFO):
        emit_ai_cfo_turn_trace(
            public_telemetry={"answer_source": "strategic_partner", "provider_calls": 1},
            conversation={
                "conversation_id": "conv_1",
                "turn_id": "t1",
                "selected_evidence_ids": ["ev_marketing"],
                "strategic": {"decision_theme": "MARKETING_SPEND"},
            },
            lineage={"dataset_id": ds.dataset_id},
            scope_hash="scope_accept",
            latency_ms=50,
            request_id="req_accept_1",
            answer={"telemetry": {"final_selected_action": "EXPERIMENT", "strategic_model_called": True}},
        )
        ws.submit_ai_feedback(
            ds.dataset_id,
            {
                "turn_id": "t1",
                "conversation_id": "conv_1",
                "scope_hash": "scope_accept",
                "request_id": "req_accept_1",
                "rating": "USEFUL",
                "selected_action": "EXPERIMENT",
                "decision_theme": "MARKETING_SPEND",
            },
        )
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "ai_cfo_turn_completed" in text
    assert "ai_answer_feedback_submitted" in text
    # Ensure no raw financial-looking payloads were forced into redacted attrs via emit.
    for record in caplog.records:
        extra = getattr(record, "__dict__", {})
        assert "net_revenue" not in extra
        assert "prompt" not in extra
