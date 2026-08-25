"""Worker configuration from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    if raw is None:
        return default
    return float(raw)


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def default_analytics_work_dir() -> Path:
    """Deterministic work dir under services/analytics — independent of process cwd.

    Layout: .../services/analytics/src/wyz_analytics/workers/config.py
    parents[3] == .../services/analytics
    """
    analytics_root = Path(__file__).resolve().parents[3]
    return (analytics_root / ".wyz-analytics-work").resolve()


def resolve_work_dir(raw: str | Path | None = None) -> Path:
    """Resolve work_dir to an absolute path.

    Prefer WYZ_ANALYTICS_WORK_DIR when set; otherwise use package-local default.
    Never leave a relative cwd-dependent path unresolved.
    """
    if raw is None or raw == "":
        env = _env("WYZ_ANALYTICS_WORK_DIR")
        if env:
            return Path(env).expanduser().resolve()
        return default_analytics_work_dir()
    return Path(raw).expanduser().resolve()


@dataclass(frozen=True)
class WorkerConfig:
    """Runtime configuration for the analytics polling worker."""

    mode: str
    api_base_url: str | None
    worker_id: str
    worker_token: str | None
    work_dir: Path
    poll_interval_sec: float
    claim_lease_sec: float
    blob_backend: str
    log_level: str
    embedded_worker: bool

    @classmethod
    def from_env(cls) -> WorkerConfig:
        mode = (_env("WYZ_ANALYTICS_MODE", "local") or "local").strip().lower()
        work_dir = resolve_work_dir()
        api_base = _env("WYZ_ANALYTICS_API_BASE_URL")
        if api_base:
            api_base = api_base.rstrip("/")
        blob_backend = (_env("WYZ_ANALYTICS_BLOB_BACKEND") or ("remote" if mode == "remote" else "filesystem")).lower()
        return cls(
            mode=mode,
            api_base_url=api_base,
            worker_id=_env("WYZ_ANALYTICS_WORKER_ID", "local-worker") or "local-worker",
            worker_token=_env("WYZ_ANALYTICS_WORKER_TOKEN"),
            work_dir=work_dir,
            poll_interval_sec=_env_float("WYZ_ANALYTICS_POLL_INTERVAL_SEC", 2.0),
            claim_lease_sec=_env_float("WYZ_ANALYTICS_CLAIM_LEASE_SEC", 300.0),
            blob_backend=blob_backend,
            log_level=(_env("WYZ_ANALYTICS_LOG_LEVEL", "INFO") or "INFO").upper(),
            embedded_worker=_env_bool("WYZ_ANALYTICS_EMBEDDED_WORKER", mode == "local"),
        )

    def validate(self) -> None:
        if self.mode == "remote":
            if not self.api_base_url:
                raise ValueError("WYZ_ANALYTICS_API_BASE_URL is required when WYZ_ANALYTICS_MODE=remote.")
            if not self.worker_token:
                raise ValueError("WYZ_ANALYTICS_WORKER_TOKEN is required when WYZ_ANALYTICS_MODE=remote.")
        if self.blob_backend == "remote" and self.mode != "remote":
            raise ValueError("WYZ_ANALYTICS_BLOB_BACKEND=remote requires WYZ_ANALYTICS_MODE=remote.")

