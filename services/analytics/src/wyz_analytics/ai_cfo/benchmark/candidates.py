"""NVIDIA NIM free-tier benchmark candidate configuration.

Model IDs verified against NVIDIA NIM API documentation (integrate.api.nvidia.com):
- https://docs.api.nvidia.com/nim/reference/llm-apis
- https://docs.api.nvidia.com/nim/reference/meta-muse-glimmer-30b-infer
- https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m3-infer
"""

from __future__ import annotations

from typing import Any

# Practical latency thresholds for V1 suitability (separate from reasoning score).
SMOKE_LATENCY_MAX_SEC = 20.0
Q1_LATENCY_MAX_SEC = 30.0

NIM_FREE_CANDIDATES: list[dict[str, Any]] = [
    {
        "id": "gpt-oss-20b",
        "display_name": "GPT-OSS 20B",
        "provider_model_id": "openai/gpt-oss-20b",
        "enabled": True,
        "capability_labels": ["baseline", "tool-calling"],
        "timeout_sec": None,
        "notes": "Baseline WYZ V1 candidate.",
    },
    {
        "id": "minimax-m3",
        "display_name": "MiniMax M3",
        "provider_model_id": "minimaxai/minimax-m3",
        "enabled": True,
        "capability_labels": ["multimodal", "tool-calling", "reasoning"],
        "timeout_sec": None,
        "notes": "Verified via NVIDIA NIM infer docs (minimaxai/minimax-m3).",
    },
    {
        "id": "muse-glimmer-30b",
        "display_name": "Muse Glimmer 30B",
        "provider_model_id": "meta/muse-glimmer-30b",
        "enabled": True,
        "capability_labels": ["multimodal", "tool-calling", "reasoning"],
        "timeout_sec": None,
        "notes": "Verified via NVIDIA NIM meta/muse-glimmer-30b.",
    },
    {
        "id": "glm-5.2",
        "display_name": "GLM-5.2",
        "provider_model_id": "z-ai/glm-5.2",
        "enabled": True,
        "capability_labels": ["reasoning", "tool-calling"],
        "timeout_sec": None,
        "notes": "Verified via NVIDIA NIM z-ai/glm-5.2.",
    },
    {
        "id": "laguna-xs-2.1",
        "display_name": "Laguna XS 2.1",
        "provider_model_id": "poolside/laguna-xs-2-1",
        "enabled": True,
        "capability_labels": ["coding", "tool-calling"],
        "timeout_sec": None,
        "notes": "Verified via NVIDIA NIM poolside/laguna-xs-2-1.",
    },
    {
        "id": "llama-3.3-70b",
        "display_name": "Llama 3.3 70B Instruct",
        "provider_model_id": "meta/llama-3.3-70b-instruct",
        "enabled": False,
        "capability_labels": ["legacy-comparison"],
        "timeout_sec": None,
        "notes": "Disabled by default — repeated >90s timeouts on NIM during V1 evaluation.",
    },
    {
        "id": "gemma-4-31b-it",
        "display_name": "Gemma 4 31B IT",
        "provider_model_id": "google/gemma-4-31b-it",
        "enabled": False,
        "capability_labels": ["optional"],
        "timeout_sec": None,
        "notes": "Not listed on NVIDIA NIM LLM API catalog as of 2026-08-24; enable when exposed.",
    },
]

CANDIDATE_SETS: dict[str, list[str]] = {
    "nim-free": [item["provider_model_id"] for item in NIM_FREE_CANDIDATES if item["enabled"]],
    "legacy": ["openai/gpt-oss-20b", "meta/llama-3.3-70b-instruct"],
}


def get_candidate(provider_model_id: str) -> dict[str, Any] | None:
    for item in NIM_FREE_CANDIDATES:
        if item["provider_model_id"] == provider_model_id:
            return item
    return None


def resolve_candidate_models(*, candidate_set: str | None = None, models: list[str] | None = None) -> list[str]:
    if models:
        return models
    if candidate_set:
        key = candidate_set.strip().lower()
        if key not in CANDIDATE_SETS:
            known = ", ".join(sorted(CANDIDATE_SETS))
            raise ValueError(f"Unknown candidate set '{candidate_set}'. Known sets: {known}")
        return list(CANDIDATE_SETS[key])
    from wyz_analytics.ai_cfo.benchmark.cases import DEFAULT_MODELS

    return list(DEFAULT_MODELS)


def candidate_timeout_sec(provider_model_id: str, default: float | None) -> float | None:
    item = get_candidate(provider_model_id)
    if item and item.get("timeout_sec"):
        return float(item["timeout_sec"])
    return default
