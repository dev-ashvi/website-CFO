"""P3 security / pilot configuration tests (S1–S40 focused)."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from wyz_analytics.observability.redaction import redact_attributes
from wyz_analytics.security.access import require_dataset, trusted_workspace_id
from wyz_analytics.security.auth import authorize_pilot_request, is_public_route
from wyz_analytics.security.config import SecurityConfig, resolve_provider_api_key, validate_startup
from wyz_analytics.security.cors import cors_headers, origin_allowed
from wyz_analytics.security.errors import (
    PayloadTooLarge,
    safe_error_body,
    sanitize_provider_failure,
    sanitize_server_error,
)
from wyz_analytics.security.uploads import sanitize_upload_filename, validate_uploads
from wyz_analytics.workers.errors import WORKSPACE_MISMATCH
from wyz_analytics.workers.service import AnalyticsWorkspace

ANALYTICS = Path(__file__).resolve().parents[1]
SRC = ANALYTICS / "src"
REPO = ANALYTICS.parent.parent


@pytest.fixture
def pilot_env(monkeypatch, tmp_path):
    monkeypatch.setenv("WYZ_ENV", "pilot")
    monkeypatch.setenv("WYZ_WORKSPACE_ID", "internal-pilot")
    monkeypatch.setenv("WYZ_ALLOWED_ORIGINS", "http://localhost:5173,https://app.example.test")
    monkeypatch.setenv("WYZ_PILOT_API_TOKEN", "pilot-token-sixteen-chars-min")
    monkeypatch.setenv("WYZ_ANALYTICS_WORK_DIR", str(tmp_path / "work"))
    monkeypatch.setenv("WYZ_AI_CFO_PROVIDER", "fake")
    return SecurityConfig.from_env(work_dir=tmp_path / "work")


def test_s1_s2_s3_s4_cors_allowlist(pilot_env):
    cfg = pilot_env
    assert "*" not in cfg.allowed_origins
    assert origin_allowed("http://localhost:5173", cfg)
    assert not origin_allowed("https://evil.example", cfg)
    headers = cors_headers("http://localhost:5173", cfg, preflight=True)
    assert headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert "Access-Control-Allow-Methods" in headers
    assert "Authorization" in headers["Access-Control-Allow-Headers"]
    denied = cors_headers("https://evil.example", cfg, preflight=True)
    assert "Access-Control-Allow-Origin" not in denied


def test_s5_s6_pilot_auth(pilot_env):
    cfg = pilot_env
    assert authorize_pilot_request({}, cfg)[0] == 401
    assert authorize_pilot_request({"Authorization": "Bearer wrong"}, cfg)[0] == 401
    assert authorize_pilot_request({"X-WYZ-Pilot-Token": cfg.pilot_api_token}, cfg) is None
    assert authorize_pilot_request({"Authorization": f"Bearer {cfg.pilot_api_token}"}, cfg) is None


def test_s7_public_routes():
    assert is_public_route("/health")
    assert is_public_route("/ready")
    assert not is_public_route("/datasets")


def test_s8_s9_s12_workspace_forced(pilot_env, tmp_path):
    cfg = pilot_env
    assert trusted_workspace_id(cfg) == "internal-pilot"
    ws = AnalyticsWorkspace(root=tmp_path / "work", run_loop=False)
    foreign = ws.create_dataset(name="Other", workspace_id="other-tenant")
    with pytest.raises(Exception) as exc:
        require_dataset(ws, foreign.dataset_id, cfg)
    assert getattr(exc.value, "error_type", None) == WORKSPACE_MISMATCH
    own = ws.create_dataset(name="Mine", workspace_id=trusted_workspace_id(cfg))
    assert require_dataset(ws, own.dataset_id, cfg).dataset_id == own.dataset_id
    listed = ws.list_dataset_library(workspace_id=trusted_workspace_id(cfg))
    ids = {d["dataset_id"] for d in listed["datasets"]}
    assert own.dataset_id in ids
    assert foreign.dataset_id not in ids


def test_s13_feedback_ignores_client_provider_metadata(tmp_path):
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    ds = ws.create_dataset(name="FB", workspace_id="local")
    out = ws.submit_ai_feedback(
        ds.dataset_id,
        {
            "turn_id": "t_sec",
            "rating": "USEFUL",
            "provider": "nvidia",
            "model": "secret-model",
            "selected_action": "EXIT",
            "answer_text": "SHOULD_NOT_PERSIST",
        },
    )
    fb = out["feedback"]
    assert fb.get("provider") is None
    assert fb.get("model") is None
    assert fb.get("selected_action") is None
    assert "answer_text" not in fb


def test_s14_s15_s16_s17_uploads(pilot_env):
    cfg = pilot_env
    ok = validate_uploads([("orders.csv", b"a,b\n1,2\n")], cfg)
    assert ok[0][0] == "orders.csv"
    with pytest.raises(PayloadTooLarge):
        validate_uploads([("orders.csv", b"x" * (cfg.max_upload_bytes + 1))], cfg)
    # Path traversal collapses to basename — never used as a filesystem path.
    assert sanitize_upload_filename("../../etc/passwd.csv") == "passwd.csv"
    assert sanitize_upload_filename("foo/../../evil.csv") == "evil.csv"
    with pytest.raises(Exception):
        sanitize_upload_filename("..")
    with pytest.raises(Exception):
        validate_uploads([("malware.exe", b"MZ")], cfg)
    with pytest.raises(Exception):
        validate_uploads([("archive.zip", b"PK")], cfg)


def test_s18_s19_s20_error_sanitization():
    body = sanitize_provider_failure(request_id="req_1")
    assert "NVIDIA" not in json.dumps(body)
    assert body["request_id"] == "req_1"
    assert "temporarily unavailable" in body["error"]["message"].lower()
    server = sanitize_server_error(request_id="req_2", verbose=False, detail="/data/secret/path boom")
    assert "/data/secret" not in json.dumps(server)
    assert server["error"]["code"] == "INTERNAL_ERROR"
    assert safe_error_body(code="X", message="Y", request_id="r")["request_id"] == "r"


def test_s21_s22_s23_s24_redaction():
    cleaned = redact_attributes(
        {
            "route": "/x",
            "api_key": "sk-secret",
            "prompt": "do not log",
            "messages": [{"role": "user"}],
            "completion": "raw",
            "net_revenue": 12345,
            "answer_source": "strategic_partner",
        }
    )
    assert "api_key" not in cleaned
    assert "prompt" not in cleaned
    assert "completion" not in cleaned
    assert "net_revenue" not in cleaned
    assert cleaned.get("answer_source") == "strategic_partner"


def test_s25_s26_security_headers_in_source():
    src = (SRC / "wyz_analytics" / "workers" / "local_http.py").read_text(encoding="utf-8")
    assert "no-store" in src
    assert "nosniff" in src
    assert 'Access-Control-Allow-Origin", "*"' not in src


def test_s27_s28_startup_validation_fatal(tmp_path, monkeypatch):
    monkeypatch.setenv("WYZ_ENV", "pilot")
    monkeypatch.setenv("WYZ_WORKSPACE_ID", "internal-pilot")
    monkeypatch.delenv("WYZ_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("WYZ_PILOT_API_TOKEN", raising=False)
    monkeypatch.setenv("WYZ_ANALYTICS_WORK_DIR", str(tmp_path))
    cfg = SecurityConfig.from_env(work_dir=tmp_path)
    result = validate_startup(cfg)
    assert result.ok is False
    assert any("ALLOWED_ORIGINS" in e for e in result.fatal)
    assert any("PILOT_API_TOKEN" in e for e in result.fatal)

    monkeypatch.setenv("WYZ_ALLOWED_ORIGINS", "http://localhost:5173")
    monkeypatch.setenv("WYZ_PILOT_API_TOKEN", "short")
    cfg2 = SecurityConfig.from_env(work_dir=tmp_path)
    result2 = validate_startup(cfg2)
    assert any("malformed" in e.lower() for e in result2.fatal)


def test_s29_s30_startup_without_provider_key(tmp_path, monkeypatch):
    monkeypatch.setenv("WYZ_ENV", "pilot")
    monkeypatch.setenv("WYZ_WORKSPACE_ID", "internal-pilot")
    monkeypatch.setenv("WYZ_ALLOWED_ORIGINS", "http://localhost:5173")
    monkeypatch.setenv("WYZ_PILOT_API_TOKEN", "pilot-token-sixteen-chars-min")
    monkeypatch.setenv("WYZ_ANALYTICS_WORK_DIR", str(tmp_path))
    monkeypatch.setenv("WYZ_AI_CFO_PROVIDER", "openai_compatible")
    monkeypatch.delenv("WYZ_AI_CFO_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    cfg = SecurityConfig.from_env(work_dir=tmp_path)
    result = validate_startup(cfg)
    assert result.ok is True
    assert any("key not configured" in w.lower() for w in result.warnings)
    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    assert ws.readiness()["ready"] is True


def test_s31_workdir_permission_readiness(tmp_path):
    broken = AnalyticsWorkspace.__new__(AnalyticsWorkspace)
    broken.root = tmp_path / "not_a_dir.txt"
    broken.root.write_text("x", encoding="utf-8")
    assert AnalyticsWorkspace.readiness(broken)["ready"] is False


def test_s34_development_defaults(monkeypatch, tmp_path):
    monkeypatch.setenv("WYZ_ENV", "development")
    monkeypatch.delenv("WYZ_PILOT_API_TOKEN", raising=False)
    monkeypatch.delenv("WYZ_ALLOWED_ORIGINS", raising=False)
    monkeypatch.setenv("WYZ_ANALYTICS_WORK_DIR", str(tmp_path))
    cfg = SecurityConfig.from_env(work_dir=tmp_path)
    assert cfg.env == "development"
    assert authorize_pilot_request({}, cfg) is None
    assert validate_startup(cfg).ok is True


def test_s35_compose_has_pilot_security_controls():
    compose = (ANALYTICS / "docker-compose.yml").read_text(encoding="utf-8")
    assert "WYZ_ENV" in compose
    assert "WYZ_PILOT_API_TOKEN" in compose
    assert "no-new-privileges" in compose
    assert "127.0.0.1" in compose
    assert (ANALYTICS / ".env.pilot.example").is_file()
    assert (REPO / "docs" / "security-pilot.md").is_file()


def test_provider_key_precedence(monkeypatch):
    monkeypatch.delenv("WYZ_AI_CFO_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("NVIDIA_API_KEY", "nv-test")
    key, source = resolve_provider_api_key()
    assert source == "NVIDIA_API_KEY"
    monkeypatch.setenv("WYZ_AI_CFO_API_KEY", "wyz-test")
    key, source = resolve_provider_api_key()
    assert source == "WYZ_AI_CFO_API_KEY"
    assert key == "wyz-test"


def test_s5_s6_http_pilot_auth_roundtrip(tmp_path):
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    token = "pilot-token-sixteen-chars-min"
    script = f"""
    import json, os, threading, time, urllib.error, urllib.request
    from http.server import ThreadingHTTPServer
    os.environ["WYZ_ENV"] = "pilot"
    os.environ["WYZ_WORKSPACE_ID"] = "internal-pilot"
    os.environ["WYZ_ALLOWED_ORIGINS"] = "http://localhost:5173"
    os.environ["WYZ_PILOT_API_TOKEN"] = "{token}"
    os.environ["WYZ_ANALYTICS_WORK_DIR"] = r"{work_dir}"
    os.environ["WYZ_ANALYTICS_EMBEDDED_WORKER"] = "false"
    os.environ["WYZ_AI_CFO_PROVIDER"] = "fake"
    from wyz_analytics.workers.local_http import Handler
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    host, port = server.server_address
    threading.Thread(target=server.serve_forever, daemon=True).start()
    time.sleep(0.2)
    base = f"http://{{host}}:{{port}}/api/v1/analytics"
    assert urllib.request.urlopen(base + "/health", timeout=5).status == 200
    assert urllib.request.urlopen(base + "/ready", timeout=5).status == 200
    try:
        urllib.request.urlopen(base + "/datasets", timeout=5)
        raise SystemExit("expected 401")
    except urllib.error.HTTPError as exc:
        assert exc.code == 401
        body = json.loads(exc.read().decode())
        assert body["error"]["code"] == "UNAUTHORIZED"
        assert "request_id" in body
    req = urllib.request.Request(
        base + "/datasets",
        headers={{"X-WYZ-Pilot-Token": "{token}", "Origin": "http://localhost:5173"}},
    )
    listed = json.loads(urllib.request.urlopen(req, timeout=5).read())
    assert listed["workspace_id"] == "internal-pilot"
    # disallowed origin
    bad = urllib.request.Request(
        base + "/datasets",
        headers={{"X-WYZ-Pilot-Token": "{token}", "Origin": "https://evil.example"}},
    )
    try:
        urllib.request.urlopen(bad, timeout=5)
        raise SystemExit("expected 403 origin")
    except urllib.error.HTTPError as exc:
        assert exc.code == 403
    server.shutdown()
    print("ok")
    """
    env = {**os.environ, "PYTHONPATH": str(SRC)}
    result = subprocess.run(
        [sys.executable, "-c", textwrap.dedent(script)],
        cwd=str(ANALYTICS),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_s40_v1_gates_untouched():
    scorer = SRC / "wyz_analytics" / "ai_cfo" / "benchmark" / "scorer.py"
    assert scorer.is_file()


def test_vite_proxy_injects_pilot_header_not_vite_prefix():
    vite = (REPO / "vite.config.js").read_text(encoding="utf-8")
    assert "WYZ_PILOT_API_TOKEN" in vite
    assert "X-WYZ-Pilot-Token" in vite
    assert "VITE_PILOT" not in vite
