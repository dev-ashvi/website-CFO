"""Regression tests for benchmark --out checkpoint path handling."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.ai_cfo.benchmark.output import resolve_output_path, write_benchmark_output
from wyz_analytics.ai_cfo.benchmark.runner import run_benchmark
from wyz_analytics.engine.pipeline import build_line_facts
from wyz_analytics.facts.persist import build_fact_frame


@pytest.fixture
def beautyco_facts(beautyco_paths):
    sources = load_beautyco_sources(beautyco_paths[0].parent)
    lines, _ = build_line_facts(sources)
    return build_fact_frame(lines)


def test_write_creates_missing_parent_directory(tmp_path):
    out = tmp_path / "nested" / "dir" / "result.json"
    write_result = write_benchmark_output(out, {"hello": "world"})
    assert write_result.ok is True
    assert out.exists()
    assert json.loads(out.read_text(encoding="utf-8")) == {"hello": "world"}


def test_write_nested_parent_directories(tmp_path):
    out = tmp_path / "a" / "b" / "c" / "checkpoint.json"
    write_result = write_benchmark_output(out, {"nested": True})
    assert write_result.ok is True
    assert out.parent.exists()
    assert out.is_file()


def test_write_into_existing_directory(tmp_path):
    parent = tmp_path / "existing"
    parent.mkdir()
    out = parent / "result.json"
    write_result = write_benchmark_output(out, {"ok": True})
    assert write_result.ok is True
    assert out.exists()


def test_resolve_output_path_relative_to_base_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    resolved = resolve_output_path(".benchmark-results/run.json", base_dir=tmp_path)
    assert resolved == (tmp_path / ".benchmark-results" / "run.json").resolve()


def test_checkpoint_after_first_question_creates_parent(beautyco_facts, tmp_path):
    out = tmp_path / "new-results" / "checkpoint.json"
    result = run_benchmark(
        models=["openai/gpt-oss-20b"],
        live=False,
        facts=beautyco_facts,
        limit=1,
        out_path=str(out),
    )
    assert out.exists()
    saved = json.loads(out.read_text(encoding="utf-8"))
    assert saved["case_ids"] == ["Q1"]
    assert len(saved["models"][0]["cases"]) == 1
    assert result["models"][0]["cases"][0]["scored"] is True
    assert result.get("output_path")
    assert not result.get("output_write_errors")


def test_keyboard_interrupt_partial_checkpoint_creates_parent(beautyco_facts, tmp_path, monkeypatch):
    out = tmp_path / "partial" / "nested" / "checkpoint.json"
    calls = {"n": 0}
    import wyz_analytics.ai_cfo.benchmark.runner as runner

    original = runner.run_case

    def flaky(facts, case, *, model):
        calls["n"] += 1
        if calls["n"] == 2:
            raise KeyboardInterrupt()
        return original(facts, case, model=model)

    monkeypatch.setattr(runner, "run_case", flaky)
    result = run_benchmark(
        models=["openai/gpt-oss-20b"],
        live=False,
        facts=beautyco_facts,
        limit=3,
        out_path=str(out),
    )
    assert result["cancelled"] is True
    assert out.exists()
    saved = json.loads(out.read_text(encoding="utf-8"))
    assert saved["cancelled"] is True
    assert len(saved["models"][0]["cases"]) == 1


def test_unwritable_output_path_does_not_fail_benchmark(beautyco_facts, tmp_path):
    blocked = tmp_path / "is-a-directory"
    blocked.mkdir()
    events = []
    result = run_benchmark(
        models=["openai/gpt-oss-20b"],
        live=False,
        facts=beautyco_facts,
        limit=1,
        out_path=str(blocked),
        on_progress=lambda event: events.append(event),
    )
    assert result["models"]
    assert result["models"][0]["cases"][0]["scored"] is True
    assert result.get("output_write_errors")
    assert any(err.get("code") == "output_write_failed" for err in result["output_write_errors"])
    assert any("OUTPUT_WRITE_FAIL" in (event.get("message") or "") for event in events)
    assert not blocked.is_file()
