"""Pilot access boundary — shared secret injected by same-origin proxy (not browser)."""

from __future__ import annotations

import hmac
from typing import Mapping

from wyz_analytics.security.config import SecurityConfig

PILOT_TOKEN_HEADER = "X-WYZ-Pilot-Token"


def _header(headers: Mapping[str, str], name: str) -> str | None:
    # Case-insensitive lookup for BaseHTTPRequestHandler headers.
    lower = {str(k).lower(): v for k, v in headers.items()}
    return lower.get(name.lower())


def extract_pilot_credential(headers: Mapping[str, str]) -> str | None:
    """Prefer dedicated pilot header; also accept Bearer when it matches the pilot token."""
    dedicated = _header(headers, PILOT_TOKEN_HEADER)
    if dedicated and dedicated.strip():
        return dedicated.strip()
    auth = _header(headers, "Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def authorize_pilot_request(headers: Mapping[str, str], config: SecurityConfig) -> tuple[int, dict] | None:
    """Return (status, body) on failure, else None.

    Development: auth optional (unless WYZ_PILOT_API_TOKEN is set — then enforced).
    Pilot/production: required.
    """
    expected = (config.pilot_api_token or "").strip()
    enforce = config.require_auth or bool(expected)
    if not enforce:
        return None
    if not expected:
        return (
            503,
            {
                "error": {
                    "code": "PILOT_AUTH_MISCONFIGURED",
                    "message": "Pilot access is not configured.",
                }
            },
        )
    provided = extract_pilot_credential(headers)
    if not provided or not hmac.compare_digest(provided, expected):
        return (
            401,
            {
                "error": {
                    "code": "UNAUTHORIZED",
                    "message": "Your session is not authorized for this workspace.",
                }
            },
        )
    return None


def is_public_route(path: str) -> bool:
    """Routes that remain reachable without pilot token."""
    return path in {"/health", "/ready"}
