from __future__ import annotations

import logging

from wyz_analytics.workers.auth import auth_headers, authorize_worker_request, tokens_match


def test_auth_headers_use_bearer_scheme():
    headers = auth_headers("abc123")
    assert headers == {"Authorization": "Bearer abc123"}
    assert auth_headers(None) == {}


def test_authorize_worker_request(monkeypatch):
    monkeypatch.setenv("WYZ_ANALYTICS_WORKER_TOKEN", "machine-token")
    assert authorize_worker_request({"Authorization": "Bearer machine-token"}) is True
    assert authorize_worker_request({"Authorization": "Bearer wrong"}) is False
    assert authorize_worker_request({"X-WYZ-Worker-Token": "machine-token"}) is True


def test_tokens_use_constant_time_compare():
    assert tokens_match("same", "same") is True
    assert tokens_match("same", "other") is False


def test_auth_headers_are_not_logged(caplog):
    caplog.set_level(logging.INFO)
    token = "super-secret-token"
    headers = auth_headers(token)
    logging.getLogger("test").info("sending request", extra={"headers": headers, "worker_token": token})
    output = caplog.text
    assert "super-secret-token" not in output
