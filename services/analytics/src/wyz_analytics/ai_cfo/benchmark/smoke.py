"""Lightweight live provider smoke test (connectivity / auth / basic completion)."""

from __future__ import annotations

import time
from typing import Any, Callable

from wyz_analytics.ai_cfo.benchmark.latency import classify_stage_latency
from wyz_analytics.ai_cfo.openai_compatible import OpenAICompatibleAiCfoModel, ProviderError


def run_provider_smoke(
    *,
    model: str,
    base_url: str | None = None,
    api_key: str | None = None,
    timeout_sec: float | None = None,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """
    Validate provider reachability, auth, model acceptance, and a basic completion.
    Does not run the full CFO benchmark.
    """
    log = on_progress or (lambda _event: None)
    agent = OpenAICompatibleAiCfoModel(
        model=model,
        base_url=base_url,
        api_key=api_key,
        timeout_sec=timeout_sec,
        on_progress=on_progress,
    )
    started = time.perf_counter()
    log({"message": "provider request started", "level": "info"})
    try:
        result = agent.smoke_completion()
        latency_ms = int((time.perf_counter() - started) * 1000)
        log({"message": "provider response received", "level": "info"})
        log({"message": f"model: {model}", "level": "info"})
        log({"message": f"latency: {latency_ms / 1000:.1f}s", "level": "info"})
        if result.get("tool_probe"):
            log({"message": f"tool probe: {result['tool_probe']}", "level": "info"})
        latency_status = classify_stage_latency(stage="smoke", latency_ms=latency_ms)
        if latency_status:
            log({"message": f"SMOKE LATENCY_UNSUITABLE ({latency_ms / 1000:.1f}s)", "level": "info"})
            return {
                "ok": False,
                "model": model,
                "latency_ms": latency_ms,
                "status": "LATENCY_UNSUITABLE",
                "latency_status": latency_status,
                "detail": result,
            }
        log({"message": "SMOKE PASS", "level": "info"})
        return {
            "ok": True,
            "model": model,
            "latency_ms": latency_ms,
            "status": "SMOKE_PASS",
            "detail": result,
        }
    except ProviderError as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        status = {
            "auth": "AUTH_FAIL",
            "rate_limit": "RATE_LIMIT",
            "timeout": "TIMEOUT",
            "invalid_model": "INVALID_MODEL",
        }.get(exc.code, "PROVIDER_ERROR")
        log({"message": f"SMOKE FAIL - {status}: {exc}", "level": "info"})
        return {
            "ok": False,
            "model": model,
            "latency_ms": latency_ms,
            "status": status,
            "error": {"code": exc.code, "message": str(exc), "status": exc.status},
        }
