"""AI CFO model provider protocol and resolver."""

from __future__ import annotations

import os
from typing import Any, Protocol

from wyz_analytics.ai_cfo.fake_model import FakeAiCfoModel


class AiCfoModel(Protocol):
    id: str

    def run_turn(
        self,
        *,
        message: str,
        context: dict[str, Any],
        tools: Any,
        get_signals: Any,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]: ...


def resolve_ai_cfo_model(
    model_id: str | None = None,
    *,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> AiCfoModel:
    """
    Resolve an AI CFO model.

    Default (tests / no live config): fake model, no network.

    Live OpenAI-compatible (NVIDIA NIM, OpenRouter, local, etc.):
      WYZ_AI_CFO_PROVIDER=openai_compatible
      WYZ_AI_CFO_BASE_URL=https://integrate.api.nvidia.com/v1
      WYZ_AI_CFO_MODEL=openai/gpt-oss-20b
      WYZ_AI_CFO_API_KEY=<key>
    """
    selected_provider = (provider or os.environ.get("WYZ_AI_CFO_PROVIDER") or model_id or "fake").lower()
    selected_model = model or os.environ.get("WYZ_AI_CFO_MODEL")

    if selected_provider in {"fake", "mock", "test"}:
        return FakeAiCfoModel()

    if selected_provider in {"openai_compatible", "openai", "nvidia", "nim", "openrouter"}:
        from wyz_analytics.ai_cfo.openai_compatible import OpenAICompatibleAiCfoModel

        return OpenAICompatibleAiCfoModel(
            api_key=api_key,
            model=selected_model,
            base_url=base_url,
        )

    # Allow resolving by model name alone when provider env is openai_compatible
    env_provider = (os.environ.get("WYZ_AI_CFO_PROVIDER") or "").lower()
    if env_provider in {"openai_compatible", "openai", "nvidia", "nim"} and (model_id or selected_model):
        from wyz_analytics.ai_cfo.openai_compatible import OpenAICompatibleAiCfoModel

        return OpenAICompatibleAiCfoModel(
            api_key=api_key,
            model=model_id or selected_model,
            base_url=base_url,
        )

    raise ValueError(
        f"Unknown AI CFO provider '{selected_provider}'. "
        "Use 'fake' for tests or 'openai_compatible' with WYZ_AI_CFO_* env vars for live models."
    )
