"""Mocked HTTP tests for OpenAI-compatible AI CFO provider (no network)."""

from __future__ import annotations

import json

import pytest

from wyz_analytics.ai_cfo.openai_compatible import (
    OpenAICompatibleAiCfoModel,
    ProviderError,
    _normalize_assistant_message,
    _parse_tool_arguments,
    _reject_unsafe_arguments,
)
from wyz_analytics.ai_cfo.providers import resolve_ai_cfo_model
from wyz_analytics.workers.errors import AnalyticsError


@pytest.fixture(autouse=True)
def _legacy_answer_mode(monkeypatch):
    """Provider unit tests still use full structured JSON completions."""
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")


class _FakeTools:
    def __init__(self):
        self.calls = []

    def dispatch(self, name, arguments=None):
        self.calls.append({"name": name, "arguments": arguments or {}})
        if name == "get_breakdown":
            return {
                "query": {"filters": {"channel": ["Amazon"]}, "group_by": ["sku"]},
                "summary": {"net_revenue": 1000, "cm2": 100},
                "rows": [{"sku": "SKU1", "cm2": 80, "net_revenue": 500}],
            }
        if name == "get_current_financial_view":
            return {"summary": {"net_revenue": 1000, "cm2": 100, "cm2_pct": 0.1}}
        raise AnalyticsError("invalid_query", f"unknown {name}")


def test_resolve_defaults_to_fake(monkeypatch):
    monkeypatch.delenv("WYZ_AI_CFO_PROVIDER", raising=False)
    model = resolve_ai_cfo_model()
    assert model.id == "fake-ai-cfo"


def test_resolve_openai_compatible(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_PROVIDER", "openai_compatible")
    monkeypatch.setenv("WYZ_AI_CFO_MODEL", "openai/gpt-oss-20b")
    monkeypatch.setenv("WYZ_AI_CFO_API_KEY", "test-key")
    model = resolve_ai_cfo_model()
    assert "gpt-oss-20b" in model.id


def test_normalize_function_call_shape():
    msg = _normalize_assistant_message(
        {"role": "assistant", "content": None, "function_call": {"name": "get_breakdown", "arguments": '{"dimension":"channel"}'}}
    )
    assert msg["tool_calls"][0]["function"]["name"] == "get_breakdown"


def test_reject_unsafe_sql_arguments():
    with pytest.raises(AnalyticsError):
        _reject_unsafe_arguments({"sql": "select * from facts"})
    with pytest.raises(AnalyticsError):
        _reject_unsafe_arguments({"dimension": "select * from facts"})


def test_parse_tool_arguments_object_and_string():
    assert _parse_tool_arguments('{"dimension":"sku","limit":5}')["dimension"] == "sku"
    assert _parse_tool_arguments({"dimension": "channel"})["dimension"] == "channel"


def test_tool_loop_with_mocked_http():
    calls = {"n": 0}

    def http_post(url, headers, data, timeout_sec):
        assert "Authorization" in headers
        assert "test-key" in headers["Authorization"]
        body = json.loads(data.decode("utf-8"))
        assert body["model"] == "openai/gpt-oss-20b"
        assert body["tools"]
        calls["n"] += 1
        if calls["n"] == 1:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {
                                        "name": "get_breakdown",
                                        "arguments": '{"dimension":"sku","limit":5}',
                                    },
                                }
                            ],
                        }
                    }
                ],
                "usage": {"prompt_tokens": 100, "completion_tokens": 20},
            }
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps(
                            {
                                "headline": "SKU1 drives CM2 under Amazon.",
                                "evidence": ["Net revenue 1000", "CM2 100"],
                                "drivers": "Contribution concentrated in SKU1.",
                                "caveat": None,
                            }
                        ),
                    }
                }
            ],
            "usage": {"prompt_tokens": 150, "completion_tokens": 40},
        }

    model = OpenAICompatibleAiCfoModel(
        api_key="test-key",
        model="openai/gpt-oss-20b",
        base_url="https://example.test/v1",
        http_post=http_post,
    )
    tools = _FakeTools()
    context = {
        "meta": {"context_version": "ctx_test", "dataset_id": "ds"},
        "filters": {"channel": ["Amazon"]},
        "summary": {"net_revenue": 1000, "cm2": 100, "cm2_pct": 0.1},
        "signals": [],
        "caveats": ["a", "b"],
    }
    answer = model.run_turn(message="Which SKUs drive contribution?", context=context, tools=tools, get_signals=lambda: {"highlighted": []})
    assert answer["headline"].startswith("SKU1")
    assert answer["telemetry"]["model_calls"] == 2
    assert answer["telemetry"]["tool_calls"][0]["executed"] is True
    assert tools.calls[0]["name"] == "get_breakdown"


def test_malformed_tool_call_recorded_not_executed():
    def http_post(url, headers, data, timeout_sec):
        body = json.loads(data.decode("utf-8"))
        # Final answer after tool error
        if any(msg.get("role") == "tool" for msg in body["messages"]):
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(
                                {
                                    "headline": "Unable to complete breakdown.",
                                    "evidence": ["Tool validation failed."],
                                    "drivers": "n/a",
                                }
                            ),
                        }
                    }
                ]
            }
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "bad",
                                "type": "function",
                                "function": {"name": "get_breakdown", "arguments": "not-json"},
                            }
                        ],
                    }
                }
            ]
        }

    model = OpenAICompatibleAiCfoModel(api_key="k", model="m", http_post=http_post)
    answer = model.run_turn(
        message="Which channel?",
        context={"meta": {"context_version": "x"}, "summary": {}, "signals": [], "caveats": ["a", "b"], "filters": {}},
        tools=_FakeTools(),
        get_signals=lambda: {},
    )
    assert answer["telemetry"]["malformed_tool_calls"] >= 1
    assert answer["telemetry"]["tool_calls"][0]["validation"] == "malformed"


def test_auth_error_classification():
    def http_post(url, headers, data, timeout_sec):
        raise ProviderError("auth", "Provider HTTP 401: unauthorized", status=401)

    model = OpenAICompatibleAiCfoModel(api_key="bad", model="m", http_post=http_post)
    with pytest.raises(ProviderError) as exc:
        model.run_turn(
            message="hi",
            context={"meta": {}, "summary": {}, "signals": [], "caveats": ["a", "b"], "filters": {}},
            tools=_FakeTools(),
            get_signals=lambda: {},
        )
    assert exc.value.code == "auth"


def test_unknown_tool_rejected():
    def http_post(url, headers, data, timeout_sec):
        body = json.loads(data.decode("utf-8"))
        if any(msg.get("role") == "tool" for msg in body["messages"]):
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": '{"headline":"refused","evidence":[],"drivers":"n/a"}',
                        }
                    }
                ]
            }
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "x",
                                "type": "function",
                                "function": {"name": "run_sql", "arguments": "{}"},
                            }
                        ],
                    }
                }
            ]
        }

    model = OpenAICompatibleAiCfoModel(api_key="k", model="m", http_post=http_post)
    answer = model.run_turn(
        message="hack",
        context={"meta": {"context_version": "x"}, "summary": {}, "signals": [], "caveats": ["a", "b"], "filters": {}},
        tools=_FakeTools(),
        get_signals=lambda: {},
    )
    assert answer["telemetry"]["tool_calls"][0]["validation"] == "rejected"


def test_http_timeout_default_and_env(monkeypatch):
    from wyz_analytics.ai_cfo.openai_compatible import resolve_http_timeout_sec

    monkeypatch.delenv("WYZ_AI_CFO_HTTP_TIMEOUT_SEC", raising=False)
    assert resolve_http_timeout_sec() == 90
    monkeypatch.setenv("WYZ_AI_CFO_HTTP_TIMEOUT_SEC", "45")
    assert resolve_http_timeout_sec() == 45.0
    assert resolve_http_timeout_sec(12) == 12.0


def test_timeout_error_classified():
    def http_post(url, headers, data, timeout_sec):
        raise ProviderError("timeout", f"Provider request timed out after {timeout_sec}s")

    model = OpenAICompatibleAiCfoModel(api_key="k", model="m", http_post=http_post, timeout_sec=1)
    with pytest.raises(ProviderError) as exc:
        model.run_turn(
            message="hi",
            context={"meta": {}, "summary": {}, "signals": [], "caveats": ["a", "b"], "filters": {}},
            tools=_FakeTools(),
            get_signals=lambda: {},
        )
    assert exc.value.code == "timeout"


def test_retries_transient_then_succeeds():
    calls = {"n": 0}

    def http_post(url, headers, data, timeout_sec):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ProviderError("provider_unavailable", "Provider HTTP 503", status=503)
        return {
            "choices": [{"message": {"role": "assistant", "content": '{"headline":"ok","evidence":[],"drivers":"n/a"}'}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        }

    model = OpenAICompatibleAiCfoModel(api_key="k", model="m", http_post=http_post, max_retries=2)
    answer = model.run_turn(
        message="hi",
        context={"meta": {"context_version": "x"}, "summary": {}, "signals": [], "caveats": ["a", "b"], "filters": {}},
        tools=_FakeTools(),
        get_signals=lambda: {},
    )
    assert answer["headline"] == "ok"
    assert answer["telemetry"]["retries"] >= 1
    assert calls["n"] >= 2


def test_auth_not_retried():
    calls = {"n": 0}

    def http_post(url, headers, data, timeout_sec):
        calls["n"] += 1
        raise ProviderError("auth", "Provider HTTP 401", status=401)

    model = OpenAICompatibleAiCfoModel(api_key="k", model="m", http_post=http_post, max_retries=2)
    with pytest.raises(ProviderError):
        model.run_turn(
            message="hi",
            context={"meta": {}, "summary": {}, "signals": [], "caveats": ["a", "b"], "filters": {}},
            tools=_FakeTools(),
            get_signals=lambda: {},
        )
    assert calls["n"] == 1


def test_progress_callback_emits_safe_events():
    events = []

    def http_post(url, headers, data, timeout_sec):
        return {
            "choices": [{"message": {"role": "assistant", "content": '{"headline":"ok","evidence":[],"drivers":"n/a"}'}}],
            "usage": {},
        }

    model = OpenAICompatibleAiCfoModel(
        api_key="k",
        model="m",
        http_post=http_post,
        on_progress=lambda event: events.append(event),
    )
    model.run_turn(
        message="hi",
        context={"meta": {"context_version": "x"}, "summary": {}, "signals": [], "caveats": ["a", "b"], "filters": {}},
        tools=_FakeTools(),
        get_signals=lambda: {},
    )
    assert any("model request started" in (event.get("message") or "") for event in events)
    joined = json.dumps(events)
    assert "Bearer" not in joined
    assert "api_key" not in joined.lower()


def test_smoke_completion_mocked():
    calls = {"n": 0}

    def http_post(url, headers, data, timeout_sec):
        calls["n"] += 1
        return {"choices": [{"message": {"role": "assistant", "content": '{"ok": true}'}}], "usage": {}}

    model = OpenAICompatibleAiCfoModel(api_key="k", model="openai/gpt-oss-20b", http_post=http_post)
    result = model.smoke_completion()
    assert "telemetry" in result
    assert calls["n"] >= 1

