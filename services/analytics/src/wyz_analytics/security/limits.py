"""Pilot-grade in-process concurrency caps (not distributed)."""

from __future__ import annotations

import threading
from contextlib import contextmanager

from wyz_analytics.security.errors import UploadRejected

_lock = threading.Lock()
_uploads: dict[str, int] = {}
_jobs: dict[str, int] = {}


@contextmanager
def limit_uploads(workspace_id: str, max_concurrent: int):
    with _lock:
        current = _uploads.get(workspace_id, 0)
        if current >= max_concurrent:
            raise UploadRejected(
                "UPLOAD_CONCURRENCY",
                "Too many concurrent uploads for this workspace. Retry shortly.",
            )
        _uploads[workspace_id] = current + 1
    try:
        yield
    finally:
        with _lock:
            _uploads[workspace_id] = max(0, _uploads.get(workspace_id, 1) - 1)


@contextmanager
def limit_jobs(workspace_id: str, max_concurrent: int):
    with _lock:
        current = _jobs.get(workspace_id, 0)
        if current >= max_concurrent:
            raise UploadRejected(
                "JOB_CONCURRENCY",
                "Too many concurrent analysis jobs for this workspace. Retry shortly.",
            )
        _jobs[workspace_id] = current + 1
    try:
        yield
    finally:
        with _lock:
            _jobs[workspace_id] = max(0, _jobs.get(workspace_id, 1) - 1)
