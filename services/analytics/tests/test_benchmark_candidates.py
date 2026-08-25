"""Offline tests for NIM candidate benchmark configuration and latency gating."""

from __future__ import annotations

from wyz_analytics.ai_cfo.benchmark.candidates import (
    CANDIDATE_SETS,
    NIM_FREE_CANDIDATES,
    get_candidate,
    resolve_candidate_models,
)
from wyz_analytics.ai_cfo.benchmark.latency import classify_stage_latency
from wyz_analytics.ai_cfo.benchmark.progress import classify_case_status
from wyz_analytics.ai_cfo.benchmark.smoke import run_provider_smoke


def test_nim_free_candidate_set_contains_verified_ids():
    models = CANDIDATE_SETS["nim-free"]
    assert "openai/gpt-oss-20b" in models
    assert "minimaxai/minimax-m3" in models
    assert "meta/muse-glimmer-30b" in models
    assert "z-ai/glm-5.2" in models
    assert "poolside/laguna-xs-2-1" in models
    assert "meta/llama-3.3-70b-instruct" not in models


def test_candidate_metadata_has_display_name_and_provider_id():
    baseline = get_candidate("openai/gpt-oss-20b")
    assert baseline is not None
    assert baseline["display_name"]
    assert baseline["provider_model_id"] == "openai/gpt-oss-20b"
    assert baseline["enabled"] is True


def test_resolve_candidate_models_from_set():
    models = resolve_candidate_models(candidate_set="nim-free", models=None)
    assert len(models) >= 5


def test_smoke_latency_unsuitable_classification():
    assert classify_stage_latency(stage="smoke", latency_ms=25_000) == "LATENCY_UNSUITABLE_FOR_V1"
    assert classify_stage_latency(stage="smoke", latency_ms=5_000) is None


def test_q1_latency_unsuitable_classification():
    assert classify_stage_latency(stage="q1", latency_ms=35_000) == "LATENCY_UNSUITABLE_FOR_V1"
    assert classify_stage_latency(stage="q1", latency_ms=10_000) is None


def test_latency_unsuitable_status_separate_from_reasoning_fail():
    case = {
        "scored": True,
        "latency_status": "LATENCY_UNSUITABLE_FOR_V1",
        "categories": {
            "numerical_grounding": 2,
            "filter_adherence": 2,
            "margin_stage": 2,
            "tool_behavior": 2,
            "materiality": 2,
            "caveat_awareness": 2,
            "hallucination_scope": 2,
        },
        "total": 14,
    }
    assert classify_case_status(case) == "LATENCY_UNSUITABLE"


def test_smoke_passes_model_id_unchanged(monkeypatch):
    captured = {}

    class StubAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def smoke_completion(self):
            return {"ok": True, "tool_probe": "ok"}

    monkeypatch.setattr(
        "wyz_analytics.ai_cfo.benchmark.smoke.OpenAICompatibleAiCfoModel",
        StubAgent,
    )
    result = run_provider_smoke(model="z-ai/glm-5.2", api_key="test-key", base_url="http://example")
    assert result["ok"] is True
    assert captured["model"] == "z-ai/glm-5.2"


def test_gemma_candidate_disabled_until_catalog_exposed():
    gemma = get_candidate("google/gemma-4-31b-it")
    assert gemma is not None
    assert gemma["enabled"] is False


def test_llama_70b_disabled_by_default():
    llama = get_candidate("meta/llama-3.3-70b-instruct")
    assert llama is not None
    assert llama["enabled"] is False
