"""Recoverable JSON extraction for provider-neutral structured answers.

Only syntactically recoverable wrappers are accepted. Truncated or empty
objects such as "{" are rejected. Reasoning metadata is never treated as
the final answer.
"""

from __future__ import annotations

import json
from typing import Any


def classify_content_shape(content: Any, *, has_reasoning_metadata: bool = False) -> dict[str, Any]:
    text = _coerce_text(content)
    stripped = text.strip()
    if not stripped:
        began = "empty"
    elif stripped.startswith("```"):
        began = "```"
    elif stripped.startswith("{"):
        began = "{"
    else:
        began = "prose"
    parsed = try_parse_structured_json(text)
    if parsed is not None:
        status = "fenced_json" if "```" in stripped else "json_object"
    elif not stripped:
        status = "empty"
    elif stripped.startswith("{") and "}" not in stripped:
        status = "truncated"
    elif began == "prose":
        status = "prose"
    else:
        status = "malformed"
    content_type = "empty"
    if content is None:
        content_type = "empty"
    elif isinstance(content, list):
        content_type = "list"
    elif isinstance(content, dict):
        content_type = "json_object"
    elif isinstance(content, str) and stripped:
        content_type = "text"
    return {
        "status": status,
        "began_with": began,
        "content_type": content_type,
        "has_reasoning_metadata": bool(has_reasoning_metadata),
        "parsed": parsed is not None,
        "char_count": len(stripped),
    }


def try_parse_structured_json(content: Any) -> dict[str, Any] | None:
    """Parse one JSON object if the payload is syntactically recoverable."""
    text = _coerce_text(content).strip().lstrip("\ufeff")
    if not text:
        return None
    candidates: list[str] = []
    fenced = _extract_fenced_json(text)
    if fenced:
        candidates.append(fenced)
    candidates.append(text)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        candidates.append(text[start : end + 1])
    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        parsed = _loads_object(candidate)
        if parsed is None:
            continue
        unwrapped = _unwrap_harmless_wrapper(parsed)
        if _looks_like_answer(unwrapped):
            return unwrapped
    return None


def _extract_fenced_json(text: str) -> str | None:
    start_fence = text.find("```")
    if start_fence < 0:
        return None
    after = text[start_fence + 3 :]
    if after[:4].lower().startswith("json"):
        after = after.split("\n", 1)[-1] if "\n" in after else after[4:]
    end_fence = after.find("```")
    body = after if end_fence < 0 else after[:end_fence]
    start = body.find("{")
    end = body.rfind("}")
    if start >= 0 and end > start:
        return body[start : end + 1].strip()
    return None


def _coerce_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                kind = str(item.get("type") or "").lower()
                if kind in {"reasoning", "thinking", "reasoning_content"}:
                    continue
                if kind in {"text", ""} or "text" in item:
                    parts.append(str(item.get("text") or item.get("content") or ""))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts)
    if isinstance(content, dict):
        try:
            return json.dumps(content)
        except (TypeError, ValueError):
            return str(content)
    return str(content)


def _loads_object(candidate: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _unwrap_harmless_wrapper(obj: dict[str, Any]) -> dict[str, Any]:
    if _looks_like_answer(obj):
        return obj
    dict_values = [value for value in obj.values() if isinstance(value, dict)]
    if len(dict_values) == 1 and _looks_like_answer(dict_values[0]):
        return dict_values[0]
    return obj


def _looks_like_answer(obj: dict[str, Any]) -> bool:
    if not obj:
        return False
    if "evidence_ids" in obj:
        return True
    if "selected_action" in obj and ("recommendation_strength" in obj or "thesis" in obj):
        return True
    if "insight_type" in obj and "driver_stage" in obj:
        return True
    if "interpretation" in obj and "driver_stage" in obj:
        return True
    return any(key in obj for key in ("headline", "evidence", "driver_stage", "interpretation", "insight_type"))
