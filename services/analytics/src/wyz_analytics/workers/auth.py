"""Machine authentication for analytics workers. Never log credentials."""

from __future__ import annotations

import hmac
import os
from typing import Mapping


WORKER_AUTH_SCHEME = "Bearer"


def expected_worker_token() -> str | None:
    token = os.environ.get("WYZ_ANALYTICS_WORKER_TOKEN")
    if token is None or token == "":
        return None
    return token


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def token_from_headers(headers: Mapping[str, str]) -> str | None:
    auth = headers.get("Authorization") or headers.get("authorization")
    bearer = extract_bearer_token(auth)
    if bearer:
        return bearer
    alt = headers.get("X-WYZ-Worker-Token") or headers.get("x-wyz-worker-token")
    return alt.strip() if alt else None


def tokens_match(provided: str | None, expected: str | None) -> bool:
    if not expected:
        return False
    if not provided:
        return False
    return hmac.compare_digest(provided, expected)


def authorize_worker_request(headers: Mapping[str, str]) -> bool:
    expected = expected_worker_token()
    if not expected:
        return False
    return tokens_match(token_from_headers(headers), expected)


def auth_headers(token: str | None) -> dict[str, str]:
    if not token:
        return {}
    return {"Authorization": f"{WORKER_AUTH_SCHEME} {token}"}
