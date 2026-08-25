"""OpenAI-compatible HTTP provider for AI CFO (NVIDIA NIM, OpenRouter, local, etc.)."""

from __future__ import annotations

import json
import os
import socket
import time
import urllib.error
import urllib.request
from typing import Any, Callable

from wyz_analytics.ai_cfo.answer_contract import (
    UNSTRUCTURED_PLACEHOLDER_HEADLINE,
    build_markdown,
    normalize_driver_stage,
)
from wyz_analytics.ai_cfo.json_parse import classify_content_shape, try_parse_structured_json
from wyz_analytics.ai_cfo.prompt import (
    ALLOWED_TOOL_NAMES,
    LEGACY_FULL_ANSWER_SYSTEM_PROMPT,
    SEMANTIC_PROSE_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    TOOL_DEFINITIONS,
    build_user_message,
)
from wyz_analytics.ai_cfo.strategy.strategic_prompt import (
    STRATEGIC_JUDGMENT_SYSTEM_PROMPT,
    build_strategic_user_message,
    strategic_prompt_char_counts,
)
from wyz_analytics.ai_cfo.semantic_contract import (
    ANSWER_MODE_LEGACY,
    ANSWER_MODE_SEMANTIC_PROSE,
    looks_like_semantic_contract,
    parse_semantic_output,
    resolve_answer_mode,
)
from wyz_analytics.workers.errors import AnalyticsError, INVALID_QUERY

DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_MODEL = "openai/gpt-oss-20b"
MAX_TOOL_ITERATIONS = 3
DEFAULT_TIMEOUT_SEC = 90
DEFAULT_MAX_RETRIES = 2
DEFAULT_MAX_TOKENS = 900
DEFAULT_TEMPERATURE = 0.1
DEFAULT_STRATEGIC_MAX_TOKENS = 1200
RETRYABLE_CODES = frozenset({"rate_limit", "provider_unavailable"})
RETRYABLE_STATUS = frozenset({429, 502, 503, 504})


class ProviderError(RuntimeError):
    """Infrastructure / auth / rate-limit failures — not financial reasoning failures."""

    def __init__(self, code: str, message: str, *, status: int | None = None):
        super().__init__(message)
        self.code = code
        self.status = status


def resolve_strategic_max_tokens(explicit: int | None = None) -> int:
    """Strategic JSON completions — separate budget from semantic run_turn.

    GPT-OSS on NVIDIA may consume completion tokens on reasoning before JSON.
    Default 1200 is enough for compact schema while avoiding run_turn's 900 cap.
    Override via WYZ_AI_CFO_STRATEGIC_MAX_TOKENS.
    """
    if explicit is not None:
        return max(128, int(explicit))
    raw = os.environ.get("WYZ_AI_CFO_STRATEGIC_MAX_TOKENS")
    if raw:
        try:
            return max(128, int(raw))
        except ValueError:
            pass
    return DEFAULT_STRATEGIC_MAX_TOKENS


def resolve_http_timeout_sec(explicit: float | None = None) -> float:
    if explicit is not None:
        return float(explicit)
    raw = os.environ.get("WYZ_AI_CFO_HTTP_TIMEOUT_SEC")
    if raw:
        try:
            return float(raw)
        except ValueError:
            pass
    return float(DEFAULT_TIMEOUT_SEC)


def resolve_http_retries(explicit: int | None = None) -> int:
    if explicit is not None:
        return max(0, int(explicit))
    raw = os.environ.get("WYZ_AI_CFO_HTTP_RETRIES")
    if raw:
        try:
            return max(0, int(raw))
        except ValueError:
            pass
    return DEFAULT_MAX_RETRIES


class OpenAICompatibleAiCfoModel:
    """Provider-neutral OpenAI chat-completions client with tool calling."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        timeout_sec: float | None = None,
        max_retries: int | None = None,
        http_post: Callable[[str, dict[str, str], bytes, float], dict[str, Any]] | None = None,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ):
        self.api_key = (
            api_key
            or os.environ.get("WYZ_AI_CFO_API_KEY")
            or os.environ.get("NVIDIA_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
        )
        self.model = model or os.environ.get("WYZ_AI_CFO_MODEL") or DEFAULT_MODEL
        self.base_url = (
            base_url or os.environ.get("WYZ_AI_CFO_BASE_URL") or DEFAULT_BASE_URL
        ).rstrip("/")
        self.temperature = DEFAULT_TEMPERATURE if temperature is None else temperature
        self.max_tokens = DEFAULT_MAX_TOKENS if max_tokens is None else max_tokens
        self.timeout_sec = resolve_http_timeout_sec(timeout_sec)
        self.max_retries = resolve_http_retries(max_retries)
        self._http_post = http_post or _default_http_post
        self._on_progress = on_progress
        self.id = f"openai_compatible:{self.model}"

    def _emit(self, message: str, *, level: str = "info", **extra: Any) -> None:
        if not self._on_progress:
            return
        event = {"message": message, "level": level, "model": self.model, **extra}
        self._on_progress(event)

    def smoke_completion(self) -> dict[str, Any]:
        """Minimal completion + optional tool-schema probe for connectivity checks."""
        if not self.api_key:
            raise ProviderError(
                "auth",
                "No AI CFO API key configured. Set WYZ_AI_CFO_API_KEY (or NVIDIA_API_KEY).",
            )
        telemetry: dict[str, Any] = {
            "model": self.model,
            "base_url": self.base_url,
            "model_calls": 0,
            "tool_calls": [],
            "input_tokens": 0,
            "output_tokens": 0,
            "errors": [],
            "retries": 0,
            "malformed_tool_calls": 0,
            "latency_ms": 0,
            "http_statuses": [],
        }
        body = {
            "model": self.model,
            "temperature": 0,
            "max_tokens": 64,
            "messages": [
                {"role": "system", "content": "Reply with JSON only: {\"ok\": true}"},
                {"role": "user", "content": "ping"},
            ],
        }
        started = time.perf_counter()
        payload = self._post_completion(body, telemetry, allow_retry=True)
        content = _extract_text_content((payload.get("choices") or [{}])[0].get("message") or {})
        tool_probe = "skipped"
        try:
            tool_body = {
                **body,
                "tools": TOOL_DEFINITIONS[:1],
                "tool_choice": "none",
                "messages": [
                    {"role": "system", "content": "Acknowledge tools are available. Reply JSON {\"ok\": true}."},
                    {"role": "user", "content": "ping with tools declared"},
                ],
            }
            self._post_completion(tool_body, telemetry, allow_retry=True)
            tool_probe = "ok"
        except ProviderError as exc:
            # Tool declaration unsupported is informational for smoke, not a hard fail if basic chat works.
            tool_probe = f"unsupported:{exc.code}"
            self._emit(f"tool probe skipped ({exc.code})", level="verbose")
        telemetry["latency_ms"] = int((time.perf_counter() - started) * 1000)
        return {
            "content_preview": (content or "")[:120],
            "tool_probe": tool_probe,
            "telemetry": _safe_telemetry(telemetry),
        }

    def run_turn(
        self,
        *,
        message: str,
        context: dict[str, Any],
        tools: Any,
        get_signals: Any,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise ProviderError(
                "auth",
                "No AI CFO API key configured. Set WYZ_AI_CFO_API_KEY (or NVIDIA_API_KEY).",
            )

        mode = resolve_answer_mode()
        if mode == ANSWER_MODE_LEGACY:
            system_prompt = LEGACY_FULL_ANSWER_SYSTEM_PROMPT
        elif mode == ANSWER_MODE_SEMANTIC_PROSE:
            system_prompt = SEMANTIC_PROSE_SYSTEM_PROMPT
        else:
            system_prompt = SYSTEM_PROMPT
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": build_user_message(message, context, history)},
        ]
        telemetry: dict[str, Any] = {
            "model": self.model,
            "base_url": self.base_url,
            "model_calls": 0,
            "tool_calls": [],
            "input_tokens": 0,
            "output_tokens": 0,
            "errors": [],
            "retries": 0,
            "malformed_tool_calls": 0,
            "latency_ms": 0,
            "http_statuses": [],
            "started_at": time.time(),
        }
        started = time.perf_counter()
        final_content = None

        for _iteration in range(MAX_TOOL_ITERATIONS + 1):
            self._emit("model request started")
            payload = self._chat(messages, telemetry)
            self._emit("model response received", level="verbose")
            choice = (payload.get("choices") or [{}])[0]
            assistant = choice.get("message") or {}
            assistant = _normalize_assistant_message(assistant)
            telemetry["finish_reason"] = choice.get("finish_reason")
            telemetry["has_reasoning_metadata"] = bool(assistant.get("_provider_reasoning"))
            messages.append(assistant)

            tool_calls = assistant.get("tool_calls") or []
            if not tool_calls:
                final_content = _extract_text_content(assistant)
                telemetry["parse"] = classify_content_shape(
                    assistant.get("content"),
                    has_reasoning_metadata=bool(assistant.get("_provider_reasoning")),
                )
                telemetry["parse"]["finish_reason"] = choice.get("finish_reason")
                break

            for call in tool_calls:
                name = str(((call.get("function") or {}).get("name")) or "unknown")
                self._emit(f"tool call: {name}")
                executed = self._execute_tool_call(call, tools, telemetry)
                self._emit(f"tool result returned ({executed['name']})")
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": executed["tool_call_id"],
                        "name": executed["name"],
                        "content": json.dumps(executed["content"], default=str),
                    }
                )
        else:
            telemetry["errors"].append({"code": "tool_loop_exhausted", "message": "Exceeded max tool iterations"})

        telemetry["latency_ms"] = int((time.perf_counter() - started) * 1000)
        answer = _parse_final_answer(final_content or "", context, telemetry)
        answer["provider"] = {
            "id": self.id,
            "model": self.model,
            "base_url": self.base_url,
        }
        answer["telemetry"] = _safe_telemetry(telemetry)
        _ = get_signals
        return answer

    def run_strategic_turn(
        self,
        *,
        message: str,
        model_input: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Single JSON strategic judgment call — no tools, separate from semantic run_turn."""
        if not self.api_key:
            raise ProviderError(
                "auth",
                "No AI CFO API key configured. Set WYZ_AI_CFO_API_KEY (or NVIDIA_API_KEY).",
            )
        telemetry: dict[str, Any] = {
            "model": self.model,
            "base_url": self.base_url,
            "model_calls": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "errors": [],
            "retries": 0,
            "latency_ms": 0,
            "http_statuses": [],
            "strategic_turn": True,
        }
        started = time.perf_counter()
        user_content = build_strategic_user_message(message=message, model_input=model_input)
        strategic_max_tokens = resolve_strategic_max_tokens()
        messages = [
            {"role": "system", "content": STRATEGIC_JUDGMENT_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]
        body = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": strategic_max_tokens,
            "messages": messages,
        }
        telemetry["strategic_request"] = {
            "max_tokens": strategic_max_tokens,
            "temperature": self.temperature,
            "response_format": "json_object",
            **strategic_prompt_char_counts(message=message, model_input=model_input),
        }
        body_with_json = {**body, "response_format": {"type": "json_object"}}
        telemetry["model_calls"] += 1
        try:
            payload = self._post_completion(body_with_json, telemetry, allow_retry=True)
        except ProviderError as exc:
            if exc.code in {"invalid_request", "provider_error"} or (
                exc.status == 400 and "json" in str(exc).lower()
            ):
                telemetry["retries"] += 1
                payload = self._post_completion(body, telemetry, allow_retry=True)
            else:
                raise
        choice = (payload.get("choices") or [{}])[0]
        assistant = _normalize_assistant_message(choice.get("message") or {})
        finish_reason = choice.get("finish_reason")
        telemetry["finish_reason"] = finish_reason
        telemetry["has_reasoning_metadata"] = bool(assistant.get("_provider_reasoning"))
        content = _extract_text_content(assistant)
        telemetry["parse"] = classify_content_shape(
            assistant.get("content"),
            has_reasoning_metadata=bool(assistant.get("_provider_reasoning")),
        )
        telemetry["latency_ms"] = int((time.perf_counter() - started) * 1000)
        if finish_reason == "length":
            telemetry["parse_warning"] = "strategic_output_truncated"
            return {
                "selected_action": None,
                "_strategic_truncated": True,
                "_provider_telemetry": _safe_telemetry(telemetry),
            }
        parsed = try_parse_structured_json(content)
        if not isinstance(parsed, dict):
            telemetry["parse_warning"] = "non_json_strategic_response"
            return {
                "selected_action": None,
                "_provider_telemetry": _safe_telemetry(telemetry),
            }
        if "strategic" in parsed and isinstance(parsed.get("strategic"), dict):
            parsed = parsed["strategic"]
        parsed["_provider_telemetry"] = _safe_telemetry(telemetry)
        return parsed

    def _chat(self, messages: list[dict[str, Any]], telemetry: dict[str, Any]) -> dict[str, Any]:
        body = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "messages": messages,
            "tools": TOOL_DEFINITIONS,
            "tool_choice": "auto",
        }
        body_with_json = {**body, "response_format": {"type": "json_object"}}
        telemetry["model_calls"] += 1
        try:
            return self._post_completion(body_with_json, telemetry, allow_retry=True)
        except ProviderError as exc:
            if exc.code in {"invalid_request", "provider_error"} and "response_format" in str(exc).lower():
                telemetry["retries"] += 1
                self._emit("retrying without response_format", level="verbose")
                return self._post_completion(body, telemetry, allow_retry=True)
            if exc.status == 400 and "json" in str(exc).lower():
                telemetry["retries"] += 1
                self._emit("retrying without response_format", level="verbose")
                return self._post_completion(body, telemetry, allow_retry=True)
            raise

    def _post_completion(
        self,
        body: dict[str, Any],
        telemetry: dict[str, Any],
        *,
        allow_retry: bool,
    ) -> dict[str, Any]:
        data = json.dumps(body).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }
        url = f"{self.base_url}/chat/completions"
        attempts = 0
        while True:
            try:
                payload = self._http_post(url, headers, data, self.timeout_sec)
                telemetry.setdefault("http_statuses", []).append(200)
                usage = payload.get("usage") or {}
                telemetry["input_tokens"] += int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
                telemetry["output_tokens"] += int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
                return payload
            except ProviderError as exc:
                telemetry.setdefault("http_statuses", []).append(exc.status)
                telemetry["errors"].append({"code": exc.code, "message": str(exc), "status": exc.status})
                retryable = allow_retry and (
                    exc.code in RETRYABLE_CODES or (exc.status in RETRYABLE_STATUS if exc.status else False)
                )
                # Never retry auth / invalid model / malformed client requests
                if exc.code in {"auth", "invalid_model", "invalid_request"}:
                    retryable = False
                if not retryable or attempts >= self.max_retries:
                    raise
                attempts += 1
                telemetry["retries"] += 1
                backoff = min(2**attempts, 4)
                self._emit(f"transient error {exc.code}; retry {attempts}/{self.max_retries} in {backoff}s", level="verbose")
                time.sleep(backoff)

    def _execute_tool_call(
        self,
        call: dict[str, Any],
        tools: Any,
        telemetry: dict[str, Any],
    ) -> dict[str, Any]:
        call_id = str(call.get("id") or f"call_{len(telemetry['tool_calls'])}")
        function = call.get("function") or {}
        name = str(function.get("name") or "")
        raw_args = function.get("arguments") or "{}"
        record: dict[str, Any] = {
            "tool_call_id": call_id,
            "name": name,
            "raw_arguments": raw_args if isinstance(raw_args, str) else json.dumps(raw_args),
            "parsed_arguments": None,
            "validation": "pending",
            "executed": False,
            "error": None,
        }
        try:
            arguments = _parse_tool_arguments(raw_args)
            record["parsed_arguments"] = arguments
            if name not in ALLOWED_TOOL_NAMES:
                raise AnalyticsError(INVALID_QUERY, f"Unknown AI CFO tool: {name}")
            _reject_unsafe_arguments(arguments)
            result = tools.dispatch(name, arguments)
            record["validation"] = "ok"
            record["executed"] = True
            content = _compact_tool_result(result)
        except AnalyticsError as exc:
            record["validation"] = "rejected"
            record["error"] = str(exc)
            telemetry["malformed_tool_calls"] += 1
            content = {"error": "tool_validation_failed", "message": str(exc)}
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            record["validation"] = "malformed"
            record["error"] = str(exc)
            telemetry["malformed_tool_calls"] += 1
            content = {"error": "malformed_tool_call", "message": str(exc)}
        telemetry["tool_calls"].append(record)
        return {"tool_call_id": call_id, "name": name or "unknown", "content": content}


def _safe_telemetry(telemetry: dict[str, Any]) -> dict[str, Any]:
    """Drop anything that could leak credentials; keep operational metrics only."""
    return {
        "model": telemetry.get("model"),
        "base_url": telemetry.get("base_url"),
        "model_calls": telemetry.get("model_calls"),
        "tool_calls": [
            {
                "name": item.get("name"),
                "validation": item.get("validation"),
                "executed": item.get("executed"),
                "error": item.get("error"),
                "parsed_arguments": item.get("parsed_arguments"),
            }
            for item in (telemetry.get("tool_calls") or [])
        ],
        "input_tokens": telemetry.get("input_tokens"),
        "output_tokens": telemetry.get("output_tokens"),
        "errors": telemetry.get("errors") or [],
        "retries": telemetry.get("retries"),
        "malformed_tool_calls": telemetry.get("malformed_tool_calls"),
        "latency_ms": telemetry.get("latency_ms"),
        "http_statuses": telemetry.get("http_statuses") or [],
        "started_at": telemetry.get("started_at"),
        "finish_reason": telemetry.get("finish_reason"),
        "has_reasoning_metadata": telemetry.get("has_reasoning_metadata"),
        "strategic_request": telemetry.get("strategic_request"),
        "parse": telemetry.get("parse"),
        "parse_warning": telemetry.get("parse_warning"),
    }


def _default_http_post(url: str, headers: dict[str, str], data: bytes, timeout_sec: float) -> dict[str, Any]:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = str(exc)
        code = _classify_http_error(exc.code, body)
        raise ProviderError(code, f"Provider HTTP {exc.code}: {body[:500]}", status=exc.code) from exc
    except TimeoutError as exc:
        raise ProviderError("timeout", f"Provider request timed out after {timeout_sec}s") from exc
    except socket.timeout as exc:
        raise ProviderError("timeout", f"Provider request timed out after {timeout_sec}s") from exc
    except urllib.error.URLError as exc:
        reason = str(exc.reason if hasattr(exc, "reason") else exc)
        lower = reason.lower()
        if "timed out" in lower or "timeout" in lower:
            raise ProviderError("timeout", f"Provider request timed out: {reason}") from exc
        raise ProviderError("provider_unavailable", f"Provider unavailable: {reason}") from exc


def _classify_http_error(status: int, body: str) -> str:
    lower = body.lower()
    if status in {401, 403}:
        return "auth"
    if status == 429:
        return "rate_limit"
    if status == 404 or ("model" in lower and ("not found" in lower or "does not exist" in lower or "unknown" in lower)):
        return "invalid_model"
    if status == 400:
        if "model" in lower and ("not found" in lower or "invalid" in lower or "does not exist" in lower):
            return "invalid_model"
        return "invalid_request"
    if status >= 500:
        return "provider_unavailable"
    if "rate" in lower and "limit" in lower:
        return "rate_limit"
    return "provider_error"


def _normalize_assistant_message(message: dict[str, Any]) -> dict[str, Any]:
    """Normalize provider-specific tool-call / reasoning shapes into OpenAI chat format."""
    out = {
        "role": "assistant",
        "content": message.get("content"),
    }
    for key in ("reasoning_content", "reasoning", "thinking"):
        if key in message and message[key]:
            out["_provider_reasoning"] = True
            break

    tool_calls = message.get("tool_calls")
    if not tool_calls and message.get("function_call"):
        fc = message["function_call"]
        tool_calls = [
            {
                "id": "call_0",
                "type": "function",
                "function": {
                    "name": fc.get("name"),
                    "arguments": fc.get("arguments") or "{}",
                },
            }
        ]
    if tool_calls:
        normalized = []
        for index, call in enumerate(tool_calls):
            function = call.get("function") or {}
            args = function.get("arguments", "{}")
            if isinstance(args, dict):
                args = json.dumps(args)
            normalized.append(
                {
                    "id": str(call.get("id") or f"call_{index}"),
                    "type": "function",
                    "function": {
                        "name": function.get("name") or call.get("name"),
                        "arguments": args,
                    },
                }
            )
        out["tool_calls"] = normalized
    return out


def _extract_text_content(message: dict[str, Any]) -> str:
    from wyz_analytics.ai_cfo.json_parse import _coerce_text

    return _coerce_text(message.get("content")).strip()


def _parse_tool_arguments(raw: Any) -> dict[str, Any]:
    if raw is None or raw == "":
        return {}
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise ValueError("Tool arguments must be a JSON object string")
    parsed = json.loads(raw)
    if parsed is None:
        return {}
    if not isinstance(parsed, dict):
        raise ValueError("Tool arguments must decode to an object")
    return parsed


def _reject_unsafe_arguments(arguments: dict[str, Any]) -> None:
    banned_keys = {"sql", "expression", "python", "code", "query_sql", "raw_sql"}
    for key in arguments:
        if key in banned_keys:
            raise AnalyticsError(INVALID_QUERY, f"Unsafe tool argument rejected: {key}")
        value = arguments[key]
        if isinstance(value, str) and any(
            token in value.lower() for token in ("select ", " drop ", "exec(", "import ", "__import__")
        ):
            raise AnalyticsError(INVALID_QUERY, "Unsafe expression rejected in tool arguments")


def _compact_tool_result(result: dict[str, Any]) -> dict[str, Any]:
    rows = result.get("rows")
    if isinstance(rows, list) and len(rows) > 25:
        result = {**result, "rows": rows[:25], "truncated": True}
    for banned in ("transactions", "lines", "parquet", "raw_rows"):
        result.pop(banned, None)
    return result


def _parse_final_answer(content: str, context: dict[str, Any], telemetry: dict[str, Any]) -> dict[str, Any]:
    mode = resolve_answer_mode()
    parsed = try_parse_structured_json(content)
    tool_calls = [
        {"tool": item["name"], "arguments": item.get("parsed_arguments") or {}}
        for item in telemetry.get("tool_calls") or []
        if item.get("executed")
    ]
    meta = {"context_version": (context.get("meta") or {}).get("context_version")}

    if mode != ANSWER_MODE_LEGACY:
        if parsed and (looks_like_semantic_contract(parsed) or "evidence_ids" in parsed or (
            "insight_type" in parsed and "driver_stage" in parsed
        ) or (
            "interpretation" in parsed and "headline" not in parsed
        )):
            semantic = parse_semantic_output(parsed)
            return {
                "semantic": {
                    "driver_stage": semantic.driver_stage,
                    "insight_type": semantic.insight_type,
                    "evidence_ids": list(semantic.evidence_ids),
                    "interpretation": semantic.interpretation,
                    "comparison_type": semantic.comparison_type,
                    "confidence": semantic.confidence,
                },
                "driver_stage": semantic.driver_stage,
                "insight_type": semantic.insight_type,
                "interpretation": semantic.interpretation,
                "tool_calls": tool_calls,
                "context_version": meta["context_version"],
                "parse_warning": None if semantic.parse_ok else "invalid_semantic_contract",
            }
        if parsed and ("headline" in parsed or "evidence" in parsed):
            # Legacy payload under semantic mode — do not treat numbers as final answer.
            return {
                "semantic": {
                    "driver_stage": normalize_driver_stage(
                        parsed.get("driver_stage") or parsed.get("drivers")
                    ).value,
                    "insight_type": parsed.get("insight_type"),
                    "evidence_ids": [
                        str(item.get("evidence_id"))
                        for item in (parsed.get("evidence") or [])
                        if isinstance(item, dict) and item.get("evidence_id")
                    ],
                    "interpretation": str(parsed.get("interpretation") or "").strip(),
                },
                "tool_calls": tool_calls,
                "context_version": meta["context_version"],
                "parse_warning": "legacy_payload_under_semantic_mode",
            }
        text = (content or "").strip() or UNSTRUCTURED_PLACEHOLDER_HEADLINE
        return {
            "semantic": {
                "driver_stage": "UNKNOWN",
                "insight_type": None,
                "evidence_ids": [],
                "interpretation": "",
            },
            "tool_calls": tool_calls,
            "context_version": meta["context_version"],
            "parse_warning": "non_json_final_answer",
            "headline": text.split("\n", 1)[0][:240],
        }

    if parsed:
        headline = str(parsed.get("headline") or "").strip() or "Verified financial interpretation"
        evidence = parsed.get("evidence") or []
        if isinstance(evidence, str):
            evidence = [evidence]
        evidence_items = []
        for item in list(evidence)[:10]:
            if isinstance(item, dict):
                evidence_items.append(
                    {
                        "evidence_id": item.get("evidence_id"),
                        "metric": item.get("metric"),
                        "value": item.get("value"),
                        "unit": item.get("unit"),
                        "scope": item.get("scope") or {},
                        "interpretation": item.get("interpretation") or "",
                    }
                )
            else:
                evidence_items.append(
                    {"metric": None, "value": None, "unit": None, "scope": {}, "interpretation": str(item)}
                )
        driver_stage = normalize_driver_stage(
            parsed.get("driver_stage") or parsed.get("drivers") or parsed.get("driver")
        ).value
        interpretation = str(parsed.get("interpretation") or parsed.get("drivers") or "").strip()
        caveat = parsed.get("caveat")
        answer = {
            "headline": headline,
            "evidence": evidence_items[:10],
            "driver_stage": driver_stage,
            "interpretation": interpretation,
            "drivers": driver_stage,
            "caveat": caveat,
            "tool_calls": tool_calls,
            "context_version": meta["context_version"],
        }
        answer["markdown"] = build_markdown(answer)
        return answer

    text = content.strip() or UNSTRUCTURED_PLACEHOLDER_HEADLINE
    answer = {
        "headline": text.split("\n", 1)[0][:240],
        "evidence": [{"metric": None, "value": None, "unit": None, "scope": {}, "interpretation": text[:180]}],
        "driver_stage": "UNKNOWN",
        "interpretation": text,
        "drivers": "UNKNOWN",
        "caveat": None,
        "tool_calls": tool_calls,
        "context_version": meta["context_version"],
        "parse_warning": "non_json_final_answer",
    }
    answer["markdown"] = build_markdown(answer)
    return answer
