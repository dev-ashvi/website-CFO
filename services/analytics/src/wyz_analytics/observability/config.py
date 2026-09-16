"""Observability configuration from environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class ObservabilityConfig:
    enabled: bool
    log_level: str
    log_format: str  # json | kv
    file_enabled: bool
    file_path: Path | None
    max_bytes: int
    backup_count: int

    @classmethod
    def from_env(cls) -> ObservabilityConfig:
        log_format = (_env("WYZ_LOG_FORMAT") or _env("WYZ_OBSERVABILITY_LOG_FORMAT") or "json").strip().lower()
        if log_format not in {"json", "kv"}:
            log_format = "json"
        file_enabled = _env_bool("WYZ_OBSERVABILITY_FILE_ENABLED", False)
        raw_path = _env("WYZ_OBSERVABILITY_FILE_PATH")
        file_path = Path(raw_path).expanduser() if raw_path else None
        if file_enabled and file_path is None:
            # Keep observability JSONL outside durable financial artifacts when possible.
            work = _env("WYZ_ANALYTICS_WORK_DIR")
            base = Path(work).expanduser().resolve().parent if work else Path.cwd()
            file_path = (base / ".wyz-observability" / "events.jsonl").resolve()
        return cls(
            enabled=_env_bool("WYZ_OBSERVABILITY_ENABLED", True),
            log_level=(_env("WYZ_LOG_LEVEL") or _env("WYZ_ANALYTICS_LOG_LEVEL") or "INFO").upper(),
            log_format=log_format,
            file_enabled=file_enabled,
            file_path=file_path,
            max_bytes=_env_int("WYZ_OBSERVABILITY_MAX_BYTES", 5_000_000),
            backup_count=_env_int("WYZ_OBSERVABILITY_BACKUP_COUNT", 3),
        )
