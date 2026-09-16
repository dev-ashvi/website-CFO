"""Offline checks for local CFO pilot (P6L) artifacts."""

from __future__ import annotations

from pathlib import Path

ANALYTICS = Path(__file__).resolve().parents[1]
REPO = ANALYTICS.parent.parent


def test_local_pilot_compose_entrypoint_and_privacy():
    compose = (ANALYTICS / "docker-compose.local-pilot.yml").read_text(encoding="utf-8")
    assert "127.0.0.1:8080:8080" in compose
    assert "ports: !reset []" in compose
    assert "Caddyfile.local-pilot" in compose
    assert "WYZ_BFF_REJECT_DEMO: ${WYZ_BFF_REJECT_DEMO:-true}" in compose
    assert "WYZ_PILOT_USERS" in compose
    assert "8788:" not in compose  # no host publish of analytics
    caddy = (ANALYTICS / "docker" / "Caddyfile.local-pilot").read_text(encoding="utf-8")
    assert ":8080" in caddy
    assert "acme" not in caddy.lower()
    assert "pilot-auth" in caddy
    # P6L.2: tunnel host is API-only (no SPA / file_server).
    assert "file_server" not in caddy
    assert "WYZ pilot API only" in caddy
    assert "respond" in caddy and "404" in caddy


def test_local_pilot_env_example_has_placeholders_only():
    text = (ANALYTICS / ".env.local-pilot.example").read_text(encoding="utf-8")
    assert "CHANGE_ME" in text
    assert "sk-" not in text
    assert "nvapi-" not in text.lower()
    assert "https://financewyz.ai" in text
    assert "https://www.financewyz.ai" not in text
    assert "*" not in text.split("WYZ_ALLOWED_ORIGINS=", 1)[1].splitlines()[0]


def test_scripts_and_docs_exist():
    assert (REPO / "scripts" / "local-cfo-pilot-up.ps1").is_file()
    assert (REPO / "scripts" / "backup-analytics-work.ps1").is_file()
    assert (REPO / "scripts" / "restore-analytics-work.ps1").is_file()
    assert (REPO / "docs" / "LOCAL_CFO_PILOT_READINESS.md").is_file()
    assert (REPO / "docs" / "LOCAL_CFO_PILOT_TEST_REPORT.md").is_file()
    assert (REPO / "scripts" / "local-cfo-pilot-smoke.py").is_file()
