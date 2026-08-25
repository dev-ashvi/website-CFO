"""Parser tests for recoverable provider JSON shapes."""

from __future__ import annotations

from wyz_analytics.ai_cfo.json_parse import classify_content_shape, try_parse_structured_json
from wyz_analytics.ai_cfo.openai_compatible import _parse_final_answer


def test_truncated_brace_rejected():
    assert try_parse_structured_json("{") is None
    shape = classify_content_shape("{")
    assert shape["status"] == "truncated"
    assert shape["began_with"] == "{"


def test_fenced_valid_json_accepted():
    raw = """```json
{"headline": "Verified contribution is mixed.", "evidence": [{"metric": "cm2", "value": 1}], "driver_stage": "MIXED"}
```"""
    parsed = try_parse_structured_json(raw)
    assert parsed["headline"] == "Verified contribution is mixed."
    assert parsed["evidence"][0]["value"] == 1
    shape = classify_content_shape(raw)
    assert shape["status"] == "fenced_json"


def test_whitespace_wrapped_json_accepted():
    raw = '\n\n  {"headline": "ok", "evidence": []}  \n'
    parsed = try_parse_structured_json(raw)
    assert parsed["headline"] == "ok"


def test_harmless_wrapper_unwrapped():
    raw = '{"response": {"headline": "wrapped", "evidence": []}}'
    parsed = try_parse_structured_json(raw)
    assert parsed["headline"] == "wrapped"


def test_empty_object_not_an_answer():
    assert try_parse_structured_json("{}") is None


def test_provider_reasoning_cannot_replace_final_content():
    content = [
        {"type": "reasoning", "text": '{"headline": "from reasoning", "evidence": [{"value": 9}]}'},
        {"type": "text", "text": ""},
    ]
    shape = classify_content_shape(content, has_reasoning_metadata=True)
    assert shape["has_reasoning_metadata"] is True
    assert try_parse_structured_json(content) is None
    answer = _parse_final_answer("", {"meta": {}}, {"tool_calls": []})
    assert answer.get("parse_warning") == "non_json_final_answer"


def test_text_part_used_when_reasoning_also_present():
    content = [
        {"type": "reasoning", "text": '{"headline": "from reasoning"}'},
        {"type": "text", "text": '{"headline": "from content", "evidence": []}'},
    ]
    parsed = try_parse_structured_json(content)
    assert parsed["headline"] == "from content"


def test_parse_final_answer_accepts_fenced_json(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "legacy_full_answer")
    raw = """```json
{"headline": "Fenced contribution.", "evidence": [{"metric": "cm2", "value": 2}], "driver_stage": "MIXED", "interpretation": "ok"}
```"""
    answer = _parse_final_answer(raw, {"meta": {}}, {"tool_calls": []})
    assert answer["headline"] == "Fenced contribution."
    assert answer.get("parse_warning") is None


def test_parse_final_answer_semantic_fenced_json(monkeypatch):
    monkeypatch.setenv("WYZ_AI_CFO_ANSWER_MODE", "semantic")
    raw = """```json
{"driver_stage": "MIXED", "evidence_ids": ["summary:cm2"], "interpretation": "ok"}
```"""
    answer = _parse_final_answer(raw, {"meta": {}}, {"tool_calls": []})
    assert answer["semantic"]["evidence_ids"] == ["summary:cm2"]
    assert answer.get("parse_warning") is None


def test_parse_final_answer_rejects_truncated_brace():
    answer = _parse_final_answer("{", {"meta": {}}, {"tool_calls": []})
    assert answer.get("parse_warning") == "non_json_final_answer"
