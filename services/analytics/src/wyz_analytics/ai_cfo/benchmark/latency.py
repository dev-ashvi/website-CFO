"""Latency suitability classification for benchmark stages."""

from __future__ import annotations

from wyz_analytics.ai_cfo.benchmark.candidates import Q1_LATENCY_MAX_SEC, SMOKE_LATENCY_MAX_SEC


def classify_stage_latency(*, stage: str, latency_ms: int | float | None) -> str | None:
    """
    Return LATENCY_UNSUITABLE_FOR_V1 when a stage exceeds practical thresholds.

    Returns None when latency is acceptable or unknown.
    """
    if latency_ms is None:
        return None
    seconds = float(latency_ms) / 1000.0
    if stage == "smoke" and seconds > SMOKE_LATENCY_MAX_SEC:
        return "LATENCY_UNSUITABLE_FOR_V1"
    if stage == "q1" and seconds > Q1_LATENCY_MAX_SEC:
        return "LATENCY_UNSUITABLE_FOR_V1"
    return None
