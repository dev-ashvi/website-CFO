"""P4 deployment artifact checks (offline)."""

from __future__ import annotations

from pathlib import Path

ANALYTICS = Path(__file__).resolve().parents[1]
REPO = ANALYTICS.parent.parent


def test_p4_pilot_compose_and_bff_exist():
    assert (ANALYTICS / "docker-compose.pilot.yml").is_file()
    assert (ANALYTICS / "bff" / "server.js").is_file()
    assert (ANALYTICS / "bff" / "Dockerfile").is_file()
    assert (ANALYTICS / "docker" / "Caddyfile").is_file()
    assert (REPO / "docs" / "oracle-pilot-deployment.md").is_file()
    assert (REPO / "scripts" / "bootstrap-oracle-pilot.sh").is_file()
    assert (REPO / "scripts" / "deploy-pilot.sh").is_file()


def test_p4_pilot_compose_hides_api_port_and_adds_edge():
    text = (ANALYTICS / "docker-compose.pilot.yml").read_text(encoding="utf-8")
    assert "ports: !reset []" in text
    assert "bff:" in text
    assert "caddy:" in text
    assert "/data/wyz-analytics-work" in text
    assert "max-size" in text
    assert "WYZ_PILOT_API_TOKEN" in text


def test_p4_bff_never_reads_vite_secret():
    src = (ANALYTICS / "bff" / "server.js").read_text(encoding="utf-8")
    assert "VITE_" not in src
    assert "X-WYZ-Pilot-Token" in src or "x-wyz-pilot-token" in src
    assert "wyz-demo-" in src  # rejects demo tokens
    assert "ANALYTICS_UPSTREAM" in src


def test_p4_caddy_exposes_health_not_ready_publicly():
    caddy = (ANALYTICS / "docker" / "Caddyfile").read_text(encoding="utf-8")
    assert "/api/v1/analytics/health" in caddy
    assert "bff:8080" in caddy
    assert "120MB" in caddy or "WYZ_PROXY_MAX_BODY" in caddy


def test_p4_release_sha_in_health_source():
    http = (ANALYTICS / "src" / "wyz_analytics" / "workers" / "local_http.py").read_text(encoding="utf-8")
    assert "WYZ_RELEASE_SHA" in http


def test_p4_env_pilot_example_has_placeholders_only():
    text = (ANALYTICS / ".env.pilot.example").read_text(encoding="utf-8")
    assert "WYZ_PILOT_DOMAIN=" in text
    assert "sk-" not in text
    assert "nvapi-" not in text.lower()
    assert "CHANGE_ME" in text or "<secret>" in text


def test_p4_deploy_script_refuses_volume_wipe():
    script = (REPO / "scripts" / "deploy-pilot.sh").read_text(encoding="utf-8")
    assert "down -v" not in script or "Never" in script
    assert "docker-compose.pilot.yml" in script
