"""Safe HTTP / provider error envelopes for pilot/production."""

from __future__ import annotations

from typing import Any

from wyz_analytics.workers.errors import AnalyticsError

SAFE_PROVIDER_MESSAGE = "AI CFO is temporarily unavailable. Verified analytics remain available."
SAFE_SERVER_MESSAGE = "Analytics request failed. Please retry or contact support."
SAFE_UPLOAD_TOO_LARGE = "This upload is too large."
SAFE_UNAUTHORIZED = "Your session is not authorized for this workspace."


class PayloadTooLarge(Exception):
    def __init__(self, message: str = SAFE_UPLOAD_TOO_LARGE):
        super().__init__(message)
        self.message = message


class UploadRejected(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def safe_error_body(
    *,
    code: str,
    message: str,
    request_id: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if request_id:
        body["request_id"] = request_id
    return body


def sanitize_analytics_error(exc: AnalyticsError, *, request_id: str | None = None) -> dict[str, Any]:
    return safe_error_body(code=exc.error_type, message=exc.message, request_id=request_id)


def sanitize_provider_failure(*, request_id: str | None = None) -> dict[str, Any]:
    return safe_error_body(code="AI_PROVIDER_UNAVAILABLE", message=SAFE_PROVIDER_MESSAGE, request_id=request_id)


def sanitize_server_error(*, request_id: str | None = None, verbose: bool = False, detail: str | None = None) -> dict[str, Any]:
    if verbose and detail:
        return safe_error_body(code="INTERNAL_ERROR", message=detail[:300], request_id=request_id)
    return safe_error_body(code="INTERNAL_ERROR", message=SAFE_SERVER_MESSAGE, request_id=request_id)


def looks_like_provider_error(exc: BaseException) -> bool:
    name = exc.__class__.__name__.lower()
    text = str(exc).lower()
    needles = ("provider", "openai", "nvidia", "api key", "401", "403", "timeout", "urllib", "http error")
    return any(n in name or n in text for n in needles)
