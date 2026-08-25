"""DirLock stale-lock reclaim (Windows-friendly local worker)."""

from __future__ import annotations

import os
import time
from pathlib import Path

from wyz_analytics.workers.storage import DirLock


def test_dirlock_basic_acquire_release(tmp_path: Path):
    lock_path = tmp_path / "jobs.lockdir"
    with DirLock(lock_path, timeout=2.0):
        assert lock_path.is_dir()
        assert (lock_path / "holder.pid").read_text(encoding="utf-8").strip() == str(os.getpid())
    assert not lock_path.exists()


def test_dirlock_reclaims_stale_lock_from_dead_pid(tmp_path: Path):
    lock_path = tmp_path / "jobs.lockdir"
    lock_path.mkdir()
    (lock_path / "holder.pid").write_text("99999999", encoding="utf-8")  # nonexistent pid
    with DirLock(lock_path, timeout=2.0):
        assert (lock_path / "holder.pid").read_text(encoding="utf-8").strip() == str(os.getpid())
    assert not lock_path.exists()


def test_dirlock_reclaims_legacy_lock_without_pid_when_old(tmp_path: Path):
    lock_path = tmp_path / "jobs.lockdir"
    lock_path.mkdir()
    # Age the lock past timeout so reclaim is allowed.
    old = time.time() - 30
    os.utime(lock_path, (old, old))
    with DirLock(lock_path, timeout=1.0):
        assert lock_path.is_dir()
    assert not lock_path.exists()
