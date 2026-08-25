"""Benchmark progress / status helpers (no financial logic)."""

from __future__ import annotations

from typing import Any, Callable

INFRA_STATUS = {
    "auth": "AUTH_FAIL",
    "rate_limit": "RATE_LIMIT",
    "timeout": "TIMEOUT",
    "invalid_model": "INVALID_MODEL",
    "invalid_request": "PROVIDER_ERROR",
    "provider_unavailable": "PROVIDER_ERROR",
    "provider_error": "PROVIDER_ERROR",
    "model_answer_failure": "PROVIDER_ERROR",
    "cancelled": "CANCELLED",
    "tool_loop_exhausted": "TOOL_FAIL",
    "latency_unsuitable": "LATENCY_UNSUITABLE",
}


def classify_case_status(case_result: dict[str, Any]) -> str:
    if case_result.get("latency_status") == "LATENCY_UNSUITABLE_FOR_V1":
        return "LATENCY_UNSUITABLE"
    if case_result.get("infra_failure"):
        code = str((case_result.get("infra_failure") or {}).get("code") or "provider_error")
        return INFRA_STATUS.get(code, "PROVIDER_ERROR")
    categories = case_result.get("categories") or {}
    if categories.get("tool_behavior") == 0:
        return "TOOL_FAIL"
    if (
        categories.get("numerical_grounding") == 0
        or categories.get("filter_adherence") == 0
        or categories.get("hallucination_scope") == 0
    ):
        return "REASONING_FAIL"
    if case_result.get("material_violation"):
        return "REASONING_FAIL"
    return "PASS"


def make_progress_logger(*, verbose: bool = False, enabled: bool = True) -> Callable[[dict[str, Any]], None]:
    def _log(event: dict[str, Any]) -> None:
        if not enabled:
            return
        level = str(event.get("level") or "info")
        if level == "verbose" and not verbose:
            return
        prefix = event.get("prefix") or ""
        message = event.get("message") or ""
        line = f"{prefix}{message}" if prefix else message
        try:
            print(line, flush=True)
        except UnicodeEncodeError:
            print(line.encode("ascii", errors="replace").decode("ascii"), flush=True)

    return _log


def format_progress_prefix(index: int, total: int) -> str:
    return f"[{index}/{total}] "
