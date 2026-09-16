"""CORS allowlist helpers — exact origin match only."""

from __future__ import annotations

from typing import Mapping

from wyz_analytics.security.config import SecurityConfig

CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, OPTIONS, HEAD"
CORS_ALLOW_HEADERS = "Authorization, Content-Type, X-Request-Id, X-WYZ-Pilot-Token, Accept"


def request_origin(headers: Mapping[str, str]) -> str | None:
    raw = headers.get("Origin") or headers.get("origin")
    if not raw:
        return None
    return raw.strip().rstrip("/")


def origin_allowed(origin: str | None, config: SecurityConfig) -> bool:
    if origin is None:
        # Non-browser clients (curl, Vite server-side proxy without Origin).
        return True
    return origin in config.allowed_origins


def cors_headers(origin: str | None, config: SecurityConfig, *, preflight: bool = False) -> dict[str, str]:
    """Build CORS headers. Never reflect arbitrary Origin. Never combine * with credentials."""
    headers: dict[str, str] = {
        "Vary": "Origin",
    }
    if origin and origin_allowed(origin, config):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "false"
    # Disallowed / missing browser Origin: omit Allow-Origin (browser blocks).
    if preflight:
        headers["Access-Control-Allow-Methods"] = CORS_ALLOW_METHODS
        headers["Access-Control-Allow-Headers"] = CORS_ALLOW_HEADERS
        headers["Access-Control-Max-Age"] = "600"
    return headers
