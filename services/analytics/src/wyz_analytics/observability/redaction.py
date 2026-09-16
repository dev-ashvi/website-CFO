"""Allowlist-based redaction for observability attributes."""

from __future__ import annotations

from typing import Any

# Keys that must never appear in observability attributes (case-insensitive match on leaf key).
BLOCKED_KEYS = {
    "api_key",
    "authorization",
    "password",
    "cookie",
    "cookies",
    "secret",
    "token",
    "worker_token",
    "raw_rows",
    "uploaded_contents",
    "file_bytes",
    "prompt",
    "messages",
    "completion",
    "raw_completion",
    "financial_values",
    "evidence_payload",
    "baseline",
    "summary",
    "waterfall",
    "company",
    "net_revenue",
    "cm1",
    "cm2",
    "cogs",
    "rows",
    "answer_text",
    "headline",
    "prose",
}

# Safe attribute keys permitted on ObservabilityEvent.attributes (allowlist).
ALLOWED_ATTRIBUTE_KEYS = {
    "route",
    "method",
    "status_code",
    "error_class",
    "error_code",
    "failure_stage",
    "failure_codes",
    "answer_source",
    "insight_type",
    "intent",
    "decision_type",
    "decision_theme",
    "selected_action",
    "final_selected_action",
    "model_selected_action",
    "recommendation_strength",
    "diagnosis_confidence",
    "decision_confidence",
    "provider",
    "model",
    "provider_calls",
    "call_type",
    "finish_reason",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "parse_valid",
    "validation_valid",
    "strategic_model_called",
    "strategic_fallback_used",
    "confidence_clamped",
    "strength_clamped",
    "signal_context_present",
    "signal_context_valid",
    "signal_context_scope_match",
    "signal_context_source",
    "strategic_thread_present",
    "strategic_followup_type",
    "strategic_thread_status",
    "tools_requested",
    "tools_executed",
    "forced_tools",
    "tool_count",
    "tool_name",
    "evidence_count",
    "evidence_ids",
    "file_count",
    "role_count",
    "mapped_field_count",
    "validation_warning_count",
    "fact_row_count",
    "lever_key",
    "direction",
    "percentage",
    "scenario_ref",
    "revision_disposition",
    "evaluation_status",
    "decision_status",
    "rating",
    "reason",
    "feedback_id",
    "surface",
    "workspace_id",
    "http_status",
    "success",
    "result_count",
    "allowed_actions",
    "capability",
    "evidence_plan",
    "provider_latency_ms",
    "end_to_end_latency_ms",
    "mode_note",
    "isolation",
    "skipped_malformed",
}


def _is_blocked_key(key: str) -> bool:
    lowered = key.lower()
    if lowered in BLOCKED_KEYS:
        return True
    for blocked in BLOCKED_KEYS:
        if blocked in lowered:
            return True
    return False


def redact_attributes(attributes: dict[str, Any] | None, *, strict_allowlist: bool = True) -> dict[str, Any]:
    """Return a safe attribute dict. Prefer allowlist; always drop blocked keys."""
    if not attributes:
        return {}
    out: dict[str, Any] = {}
    for key, value in attributes.items():
        if not isinstance(key, str):
            continue
        if _is_blocked_key(key):
            continue
        if strict_allowlist and key not in ALLOWED_ATTRIBUTE_KEYS:
            continue
        if isinstance(value, dict):
            continue  # nested payloads not allowed
        if isinstance(value, (list, tuple)):
            # Only scalar lists of short strings/numbers.
            cleaned = []
            for item in value[:24]:
                if isinstance(item, (str, int, float, bool)) or item is None:
                    cleaned.append(item)
            out[key] = cleaned
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            if isinstance(value, str) and len(value) > 240:
                out[key] = value[:240] + "…"
            else:
                out[key] = value
    return out


def sanitize_for_log(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Drop blocked keys from a flat dict (non-strict; used by formatters)."""
    if not payload:
        return {}
    return {k: v for k, v in payload.items() if isinstance(k, str) and not _is_blocked_key(k)}
