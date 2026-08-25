from __future__ import annotations

import os
from pathlib import Path

import pytest

from wyz_analytics.workers.config import WorkerConfig, default_analytics_work_dir, resolve_work_dir


def test_config_defaults_local_mode(monkeypatch):
    monkeypatch.delenv("WYZ_ANALYTICS_MODE", raising=False)
    monkeypatch.delenv("WYZ_ANALYTICS_API_BASE_URL", raising=False)
    monkeypatch.delenv("WYZ_ANALYTICS_WORK_DIR", raising=False)
    config = WorkerConfig.from_env()
    assert config.mode == "local"
    assert config.blob_backend == "filesystem"
    assert config.embedded_worker is True
    assert config.work_dir.is_absolute()
    assert config.work_dir == default_analytics_work_dir()


def test_work_dir_independent_of_launch_cwd(monkeypatch, tmp_path):
    """W15 — default work_dir must not follow process cwd."""
    monkeypatch.delenv("WYZ_ANALYTICS_WORK_DIR", raising=False)
    other = tmp_path / "other-cwd"
    other.mkdir()
    monkeypatch.chdir(other)
    resolved = resolve_work_dir()
    assert resolved == default_analytics_work_dir()
    assert resolved.is_absolute()
    assert resolved.name == ".wyz-analytics-work"
    assert (resolved.parent / "src").exists() or (resolved.parent.name == "analytics")


def test_work_dir_env_resolves_absolute(monkeypatch, tmp_path):
    monkeypatch.setenv("WYZ_ANALYTICS_WORK_DIR", str(tmp_path / "work"))
    resolved = resolve_work_dir()
    assert resolved.is_absolute()
    assert resolved == (tmp_path / "work").resolve()


def test_persisted_dataset_survives_store_reload(tmp_path):
    """W14 — dataset + result metadata remain readable after reopening the same work_dir."""
    from wyz_analytics.workers.datasets import DatasetRecord, FilesystemDatasetStore
    from wyz_analytics.workers.service import AnalyticsWorkspace

    work = tmp_path / "work"
    ws = AnalyticsWorkspace(root=work, run_loop=False)
    created = ws.create_dataset(name="Persist check")
    created.status = "COMPLETED"
    created.latest_job_id = "job_persist_1"
    created.latest_result_uri = "wyz-blob://results/job_persist_1/result.json"
    ws.datasets.put(created)

    reopened = FilesystemDatasetStore(work.resolve())
    loaded = reopened.get(created.dataset_id)
    assert loaded.dataset_id == created.dataset_id
    assert loaded.status == "COMPLETED"
    assert loaded.latest_job_id == "job_persist_1"


def test_live_work_dir_contains_acceptance_dataset_when_present():
    """If local acceptance dataset exists on disk, registry file must be loadable."""
    path = default_analytics_work_dir() / "datasets" / "ds_cbcf43e63b4b.json"
    if not path.exists():
        pytest.skip("acceptance dataset not present in this environment")
    text = path.read_text(encoding="utf-8")
    assert "ds_cbcf43e63b4b" in text
    assert "COMPLETED" in text


def test_config_remote_requires_api_and_token(monkeypatch, tmp_path):
    monkeypatch.setenv("WYZ_ANALYTICS_MODE", "remote")
    monkeypatch.setenv("WYZ_ANALYTICS_WORK_DIR", str(tmp_path))
    config = WorkerConfig.from_env()
    with pytest.raises(ValueError, match="API_BASE_URL"):
        config.validate()
    monkeypatch.setenv("WYZ_ANALYTICS_API_BASE_URL", "https://api.example.com/api/v1/analytics")
    config = WorkerConfig.from_env()
    with pytest.raises(ValueError, match="WORKER_TOKEN"):
        config.validate()


def test_config_remote_parses_intervals(monkeypatch, tmp_path):
    monkeypatch.setenv("WYZ_ANALYTICS_MODE", "remote")
    monkeypatch.setenv("WYZ_ANALYTICS_API_BASE_URL", "https://api.example.com/api/v1/analytics/")
    monkeypatch.setenv("WYZ_ANALYTICS_WORKER_TOKEN", "secret-token")
    monkeypatch.setenv("WYZ_ANALYTICS_POLL_INTERVAL_SEC", "3.5")
    monkeypatch.setenv("WYZ_ANALYTICS_CLAIM_LEASE_SEC", "120")
    monkeypatch.setenv("WYZ_ANALYTICS_WORK_DIR", str(tmp_path))
    config = WorkerConfig.from_env()
    config.validate()
    assert config.api_base_url == "https://api.example.com/api/v1/analytics"
    assert config.poll_interval_sec == 3.5
    assert config.claim_lease_sec == 120.0
    assert config.blob_backend == "remote"
