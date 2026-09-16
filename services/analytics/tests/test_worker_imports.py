"""Regression tests for worker and mapping import graph."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"


def _run_import(snippet: str) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "PYTHONPATH": str(SRC),
        "WYZ_ENV": "development",
        "WYZ_WORKSPACE_ID": "local",
    }
    env.pop("WYZ_PILOT_API_TOKEN", None)
    return subprocess.run(
        [sys.executable, "-c", snippet],
        cwd=SRC.parent,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_deterministic_mapping_imports_after_ingest_models():
    """Reproduce the live worker cycle: models → deterministic must not fail."""
    result = _run_import(
        "from wyz_analytics.ingest.models import FileProfile\n"
        "from wyz_analytics.mapping.deterministic import propose_deterministic_mappings\n"
        "assert FileProfile is not None and propose_deterministic_mappings is not None"
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_mapping_models_then_worker_views_imports():
    """Worker views import mapping.models; package init must stay lightweight."""
    result = _run_import(
        "from wyz_analytics.mapping.models import MappingStatus\n"
        "from wyz_analytics.workers.views import canonical_fields_catalog\n"
        "assert MappingStatus is not None and callable(canonical_fields_catalog)"
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_worker_local_http_entry_imports():
    result = _run_import("import wyz_analytics.workers.local_http")
    assert result.returncode == 0, result.stderr or result.stdout


def test_worker_runner_entry_imports():
    result = _run_import("import wyz_analytics.workers.runner")
    assert result.returncode == 0, result.stderr or result.stdout
