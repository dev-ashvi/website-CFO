"""HTTPS client for remote analytics worker API calls."""

from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from wyz_analytics.workers.auth import auth_headers


class RemoteApiError(Exception):
    def __init__(self, status: int, message: str, *, details: Any = None):
        self.status = status
        self.message = message
        self.details = details
        super().__init__(message)


class RemoteHttpClient:
    """Outbound-only HTTPS client. Never logs credentials."""

    def __init__(
        self,
        base_url: str,
        *,
        worker_token: str | None = None,
        timeout_sec: float = 60.0,
        ssl_context: ssl.SSLContext | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.worker_token = worker_token
        self.timeout_sec = timeout_sec
        self.ssl_context = ssl_context

    def _url(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base_url}{path}"

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        raw_body: bytes | None = None,
        headers: dict[str, str] | None = None,
        accept: str = "application/json",
    ) -> tuple[int, dict[str, str], bytes]:
        req_headers = {"Accept": accept}
        req_headers.update(auth_headers(self.worker_token))
        if headers:
            req_headers.update(headers)
        body = raw_body
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            self._url(path),
            data=body,
            headers=req_headers,
            method=method.upper(),
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_sec, context=self.ssl_context) as response:
                payload = response.read()
                response_headers = {key.lower(): value for key, value in response.headers.items()}
                return response.status, response_headers, payload
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            message = self._error_message(payload, exc.reason)
            raise RemoteApiError(exc.code, message, details=self._maybe_json(payload)) from exc
        except urllib.error.URLError as exc:
            raise RemoteApiError(0, f"Cannot reach analytics API: {exc.reason}") from exc

    def json_request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        expected_status: tuple[int, ...] = (200,),
    ) -> Any:
        status, _headers, payload = self.request(method, path, json_body=json_body)
        if status not in expected_status:
            raise RemoteApiError(status, self._error_message(payload, "Unexpected response"))
        if not payload:
            return None
        return json.loads(payload.decode("utf-8"))

    @staticmethod
    def _maybe_json(payload: bytes) -> Any:
        if not payload:
            return None
        try:
            return json.loads(payload.decode("utf-8"))
        except json.JSONDecodeError:
            return payload.decode("utf-8", errors="replace")

    @staticmethod
    def _error_message(payload: bytes, fallback: str) -> str:
        parsed = RemoteHttpClient._maybe_json(payload)
        if isinstance(parsed, dict):
            return str(parsed.get("message") or parsed.get("error") or fallback)
        if isinstance(parsed, str) and parsed.strip():
            return parsed
        return fallback

    @staticmethod
    def encode_uri(uri: str) -> str:
        return urllib.parse.quote(uri, safe="")
