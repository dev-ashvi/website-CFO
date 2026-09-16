"""DirLock stale-lock reclaim (local + cross-container safe)."""

from __future__ import annotations

import os
import socket
import time
from pathlib import Path

from wyz_analytics.workers.storage import DirLock


def test_dirlock_basic_acquire_release(tmp_path: Path):
    lock_path = tmp_path / "jobs.lockdir"
    with DirLock(lock_path, timeout=2.0):
        assert lock_path.is_dir()
        text = (lock_path / "holder.pid").read_text(encoding="utf-8").strip()
        assert str(os.getpid()) in text
        assert socket.gethostname() in text
    assert not lock_path.exists()


def test_dirlock_reclaims_stale_lock_from_dead_pid(tmp_path: Path):
    lock_path = tmp_path / "jobs.lockdir"
    lock_path.mkdir()
    # Legacy pid-only format (pre-hostname) with nonexistent pid.
    (lock_path / "holder.pid").write_text("99999999", encoding="utf-8")
    with DirLock(lock_path, timeout=2.0):
        text = (lock_path / "holder.pid").read_text(encoding="utf-8").strip()
        assert str(os.getpid()) in text
    assert not lock_path.exists()


def test_dirlock_reclaims_legacy_lock_without_pid_when_old(tmp_path: Path):
    lock_path = tmp_path / "jobs.lockdir"
    lock_path.mkdir()
    # Age the lock past timeout so reclaim is allowed.
    old = time.time() - 60
    os.utime(lock_path, (old, old))
    with DirLock(lock_path, timeout=1.0):
        assert lock_path.is_dir()
    assert not lock_path.exists()


def test_dirlock_cross_host_does_not_trust_foreign_pid(tmp_path: Path, monkeypatch):
    """Compose API+worker share a volume but have different hostnames/PID namespaces."""
    lock_path = tmp_path / "jobs.lockdir"
    lock_path.mkdir()
    (lock_path / "holder.pid").write_text("other-container\n1", encoding="utf-8")
    monkeypatch.setenv("WYZ_ANALYTICS_LOCK_STALE_SEC", "30")

    # Fresh foreign lock must not be reclaimed via PID confusion.
    try:
        with DirLock(lock_path, timeout=0.2):
            raise AssertionError("should not acquire live foreign lock")
    except TimeoutError:
        pass
    assert lock_path.is_dir()

    # After age gate, reclaim is allowed (crashed peer container).
    old = time.time() - 60
    os.utime(lock_path, (old, old))
    with DirLock(lock_path, timeout=2.0):
        assert lock_path.is_dir()
    assert not lock_path.exists()
