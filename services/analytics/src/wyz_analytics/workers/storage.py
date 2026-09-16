"""Blob storage for dataset sources and analysis results.

Logical URIs, not developer filesystem paths. A later object-store
implementation can replace FilesystemBlobStore without touching the engine.
"""

from __future__ import annotations

import io
import json
import os
import socket
import time
from pathlib import Path
from typing import Any, Protocol

import polars as pl

from wyz_analytics.workers.errors import AnalyticsError, MISSING_SOURCE, RESULT_WRITE_FAILURE

URI_PREFIX = "wyz-blob://"


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def atomic_write_json(path: Path, payload: Any) -> None:
    atomic_write_bytes(path, json.dumps(payload, default=str).encode("utf-8"))


def _lock_stale_sec(default: float = 20.0) -> float:
    raw = os.environ.get("WYZ_ANALYTICS_LOCK_STALE_SEC", "").strip()
    if not raw:
        return default
    try:
        return max(1.0, float(raw))
    except ValueError:
        return default


class DirLock:
    """Atomic directory lock. Works on local NTFS/ext filesystems.

    Holder identity is ``hostname\\npid`` so PID liveness checks are only trusted
    inside the same hostname/PID namespace. Across Docker Compose containers that
    share a volume, PIDs are not comparable — reclaim uses lock age instead.
    """

    def __init__(self, path: Path, timeout: float = 30.0):
        self.path = path
        self.timeout = timeout
        self._pid_file = path / "holder.pid"
        self._stale_sec = _lock_stale_sec()

    def __enter__(self) -> DirLock:
        deadline = time.time() + self.timeout
        self.path.parent.mkdir(parents=True, exist_ok=True)
        while True:
            try:
                self.path.mkdir()
                try:
                    host = socket.gethostname()
                    self._pid_file.write_text(f"{host}\n{os.getpid()}", encoding="utf-8")
                except OSError:
                    pass
                return self
            except FileExistsError:
                if self._try_reclaim_stale():
                    continue
                if time.time() > deadline:
                    raise TimeoutError(f"Timed out waiting for lock {self.path}")
                time.sleep(0.05)

    def __exit__(self, *_exc) -> None:
        try:
            if self._pid_file.exists():
                self._pid_file.unlink()
        except OSError:
            pass
        try:
            self.path.rmdir()
        except OSError:
            # Non-empty or already removed — best-effort cleanup of our pid file remnants.
            try:
                for child in self.path.iterdir():
                    child.unlink(missing_ok=True)
                self.path.rmdir()
            except OSError:
                pass

    def _lock_age_sec(self) -> float | None:
        try:
            return time.time() - self.path.stat().st_mtime
        except OSError:
            return None

    def _parse_holder(self) -> tuple[str | None, int | None]:
        """Return (hostname, pid). Legacy single-line PID files use hostname=None."""
        try:
            raw = self._pid_file.read_text(encoding="utf-8").strip()
        except OSError:
            return None, None
        if not raw:
            return None, None
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        if len(lines) >= 2:
            try:
                return lines[0], int(lines[1])
            except ValueError:
                return lines[0], None
        try:
            return None, int(lines[0])
        except (ValueError, IndexError):
            return None, None

    def _try_reclaim_stale(self) -> bool:
        """Return True if a stale lock was removed and the caller should retry mkdir."""
        if not self.path.exists():
            return False

        host, holder_pid = self._parse_holder()
        our_host = socket.gethostname()
        age = self._lock_age_sec()

        if host is not None and host == our_host:
            # Same hostname → same PID namespace (local Windows/Linux process pair).
            if holder_pid is not None:
                if holder_pid == os.getpid() or self._pid_alive(holder_pid):
                    return False
                return self._force_remove()
            if age is None or age < self._stale_sec:
                return False
            return self._force_remove()

        if host is not None and host != our_host:
            # Cross-container / cross-host: never trust PID; age-based only.
            if age is None or age < self._stale_sec:
                return False
            return self._force_remove()

        if holder_pid is not None:
            # Legacy pid-only file (pre-hostname). Safe for same-machine workers.
            if holder_pid == os.getpid() or self._pid_alive(holder_pid):
                return False
            return self._force_remove()

        # No holder metadata: reclaim only when clearly abandoned.
        if age is None or age < max(self.timeout, self._stale_sec):
            return False
        return self._force_remove()

    def _force_remove(self) -> bool:
        try:
            for child in self.path.iterdir():
                child.unlink(missing_ok=True)
            self.path.rmdir()
            return True
        except OSError:
            return False

    @staticmethod
    def _pid_alive(pid: int) -> bool:
        if pid <= 0:
            return False
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            # Process exists but we cannot signal it.
            return True
        except OSError:
            # On Windows, os.kill(pid, 0) may raise OSError for dead PIDs.
            return False
        return True



class BlobStore(Protocol):
    def put_bytes(self, uri: str, data: bytes) -> str: ...
    def get_bytes(self, uri: str) -> bytes: ...
    def put_json(self, uri: str, payload: Any) -> str: ...
    def get_json(self, uri: str) -> Any: ...
    def exists(self, uri: str) -> bool: ...
    def source_uri(self, workspace_id: str, dataset_id: str, dataset_version: int, filename: str) -> str: ...
    def mapping_uri(self, dataset_id: str, mapping_version: str) -> str: ...
    def result_uri(self, job_id: str) -> str: ...
    def facts_uri(self, job_id: str) -> str: ...
    def facts_metadata_uri(self, job_id: str) -> str: ...
    def put_parquet(self, uri: str, frame: pl.DataFrame) -> str: ...
    def get_parquet(self, uri: str) -> pl.DataFrame: ...


class FilesystemBlobStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.blob_root = self.root / "blobs"
        self.blob_root.mkdir(parents=True, exist_ok=True)

    def source_uri(self, workspace_id: str, dataset_id: str, dataset_version: int, filename: str) -> str:
        safe = Path(filename).name
        return f"{URI_PREFIX}sources/{workspace_id}/{dataset_id}/v{dataset_version}/{safe}"

    def mapping_uri(self, dataset_id: str, mapping_version: str) -> str:
        return f"{URI_PREFIX}mappings/{dataset_id}/{mapping_version}.json"

    def result_uri(self, job_id: str) -> str:
        return f"{URI_PREFIX}results/{job_id}.json"

    def facts_uri(self, job_id: str) -> str:
        return f"{URI_PREFIX}facts/{job_id}/financial_facts.parquet"

    def facts_metadata_uri(self, job_id: str) -> str:
        return f"{URI_PREFIX}facts/{job_id}/metadata.json"

    def _path_for(self, uri: str) -> Path:
        if not uri.startswith(URI_PREFIX):
            raise AnalyticsError(MISSING_SOURCE, "Unsupported source reference.")
        rel = uri[len(URI_PREFIX) :]
        path = (self.blob_root / rel).resolve()
        if self.blob_root.resolve() not in path.parents and path != self.blob_root.resolve():
            raise AnalyticsError(MISSING_SOURCE, "Invalid source reference.")
        return path

    def put_bytes(self, uri: str, data: bytes) -> str:
        try:
            atomic_write_bytes(self._path_for(uri), data)
        except OSError as exc:
            raise AnalyticsError(RESULT_WRITE_FAILURE) from exc
        return uri

    def get_bytes(self, uri: str) -> bytes:
        path = self._path_for(uri)
        if not path.is_file():
            raise AnalyticsError(MISSING_SOURCE)
        return path.read_bytes()

    def put_json(self, uri: str, payload: Any) -> str:
        try:
            atomic_write_json(self._path_for(uri), payload)
        except OSError as exc:
            raise AnalyticsError(RESULT_WRITE_FAILURE) from exc
        return uri

    def get_json(self, uri: str) -> Any:
        return json.loads(self.get_bytes(uri).decode("utf-8"))

    def exists(self, uri: str) -> bool:
        try:
            return self._path_for(uri).is_file()
        except AnalyticsError:
            return False

    def put_parquet(self, uri: str, frame: pl.DataFrame) -> str:
        buffer = io.BytesIO()
        try:
            frame.write_parquet(buffer)
        except Exception as exc:
            raise AnalyticsError(RESULT_WRITE_FAILURE) from exc
        return self.put_bytes(uri, buffer.getvalue())

    def get_parquet(self, uri: str) -> pl.DataFrame:
        try:
            return pl.read_parquet(io.BytesIO(self.get_bytes(uri)))
        except Exception as exc:
            raise AnalyticsError(MISSING_SOURCE) from exc
