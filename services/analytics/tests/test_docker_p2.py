"""P2 Docker / Linux portability focused checks (D1–D30 subset runnable offline)."""

from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

ANALYTICS = Path(__file__).resolve().parents[1]
REPO = ANALYTICS.parent.parent


def test_d1_dockerfile_and_compose_exist():
    assert (ANALYTICS / "Dockerfile").is_file()
    assert (ANALYTICS / "docker-compose.yml").is_file()
    assert (ANALYTICS / "docker" / "entrypoint.sh").is_file()
    assert (ANALYTICS / ".dockerignore").is_file()
    assert (ANALYTICS / ".env.docker.example").is_file()
    assert (REPO / "docs" / "docker-analytics.md").is_file()


def test_d2_dockerignore_excludes_runtime_and_secrets():
    text = (ANALYTICS / ".dockerignore").read_text(encoding="utf-8")
    for pattern in [
        ".wyz-analytics-work",
        ".env",
        "**/__pycache__",
        ".benchmark-results",
        "node_modules",
        "tests",
    ]:
        assert pattern in text


def test_d3_d4_d5_dockerfile_copies_src_not_env_or_work():
    df = (ANALYTICS / "Dockerfile").read_text(encoding="utf-8")
    assert "COPY src ./src" in df
    assert "COPY .env" not in df
    assert "COPY" in df and ".wyz-analytics-work" not in "\n".join(
        line for line in df.splitlines() if line.strip().startswith("COPY")
    )
    assert "python:3.11-slim" in df
    assert "local_http" in df
    assert "PYTHONUNBUFFERED=1" in df
    assert "requirements.prod.txt" in df


def test_d8_ready_uses_work_dir(tmp_path):
    from wyz_analytics.workers.service import AnalyticsWorkspace

    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    payload = ws.readiness()
    assert payload["ready"] is True
    assert payload["work_dir_writable"] is True


def test_d18_d19_no_hardcoded_windows_production_paths_in_runtime_src():
    runtime_roots = [
        ANALYTICS / "src" / "wyz_analytics" / "workers",
        ANALYTICS / "src" / "wyz_analytics" / "observability",
        ANALYTICS / "src" / "wyz_analytics" / "security",
        ANALYTICS / "src" / "wyz_analytics" / "config.py",
    ]
    # Drive-letter paths or Windows user profiles — allow SystemExit message colons.
    bad = re.compile(r"[A-Za-z]:\\(?:Users|Windows|Program)|C:/Users|\\\\Users\\\\")
    offenders: list[str] = []
    for root in runtime_roots:
        paths = [root] if root.is_file() else list(root.rglob("*.py"))
        for path in paths:
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8")
            if bad.search(text):
                offenders.append(str(path.relative_to(ANALYTICS)))
    assert offenders == []


def test_d20_local_windows_launcher_still_present():
    launcher = REPO / "scripts" / "run-analytics-worker.js"
    assert launcher.is_file()
    text = launcher.read_text(encoding="utf-8")
    assert "wyz_analytics.workers.local_http" in text
    assert "WYZ_ANALYTICS_WORK_DIR" in text


def test_d23_dataset_library_lightweight_contract_preserved():
    from wyz_analytics.workers.datasets import DatasetRecord

    record = DatasetRecord(
        workspace_id="local",
        dataset_id="ds_docker123456",
        dataset_version=1,
        name="Compose",
        status="COMPLETED",
        created_at="2026-08-25T00:00:00+00:00",
    )
    lib = record.library_dict()
    assert "mappings" not in lib
    assert "canonical_fields" not in lib
    assert lib["dataset_id"] == "ds_docker123456"


def test_d28_compose_restart_policy_and_shared_volume():
    compose = (ANALYTICS / "docker-compose.yml").read_text(encoding="utf-8")
    assert "unless-stopped" in compose
    assert "wyz_analytics_data" in compose
    assert "WYZ_ANALYTICS_EMBEDDED_WORKER: \"false\"" in compose or "WYZ_ANALYTICS_EMBEDDED_WORKER: 'false'" in compose
    assert "wyz_analytics.workers.local_http" in compose
    assert "wyz_analytics.workers.runner" in compose
    assert "/ready" in compose
    assert "WYZ_ENV" in compose
    assert "127.0.0.1" in compose


def test_d29_env_examples_have_no_real_secrets():
    for name in (".env.example", ".env.docker.example"):
        text = (ANALYTICS / name).read_text(encoding="utf-8")
        assert "sk-" not in text
        assert "nvapi-" not in text.lower()
        # Placeholders only — empty assignments ok
        assert "PLACEHOLDER" in text.upper() or "API_KEY=" in text or "fake" in text.lower()


def test_d17_fake_provider_not_required_for_readiness(tmp_path, monkeypatch):
    monkeypatch.delenv("WYZ_AI_CFO_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.setenv("WYZ_AI_CFO_PROVIDER", "fake")
    from wyz_analytics.workers.service import AnalyticsWorkspace

    ws = AnalyticsWorkspace(root=tmp_path, run_loop=False)
    assert ws.readiness()["ready"] is True


def test_d10_compose_shares_single_named_volume():
    compose = (ANALYTICS / "docker-compose.yml").read_text(encoding="utf-8")
    assert compose.count("wyz_analytics_data:/data/wyz-analytics-work") >= 2


def test_d30_financial_engine_not_rewritten_by_docker_files():
    from wyz_analytics.engine import pipeline  # noqa: F401

    df = (ANALYTICS / "Dockerfile").read_text(encoding="utf-8")
    assert "engine/pipeline" not in df


def test_d18_dirlock_is_cross_container_aware():
    from wyz_analytics.workers import storage as storage_mod

    src = Path(storage_mod.__file__).read_text(encoding="utf-8")
    assert "gethostname" in src
    assert "WYZ_ANALYTICS_LOCK_STALE_SEC" in src
