"""HTTP boundary regression tests for the local analytics worker."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"


def _run_http_script(script: str) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "PYTHONPATH": str(SRC),
        "WYZ_ANALYTICS_EMBEDDED_WORKER": "false",
    }
    return subprocess.run(
        [sys.executable, "-c", textwrap.dedent(script)],
        cwd=SRC.parent,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_local_http_lists_and_creates_datasets_via_http(tmp_path):
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    script = f"""
    import json
    import threading
    import time
    import urllib.error
    import urllib.request
    from http.server import ThreadingHTTPServer

    import os
    os.environ["WYZ_ANALYTICS_WORK_DIR"] = r"{work_dir}"
    os.environ["WYZ_ANALYTICS_EMBEDDED_WORKER"] = "false"

    from wyz_analytics.workers.local_http import Handler

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    host, port = server.server_address
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.2)
    base = f"http://{{host}}:{{port}}/api/v1/analytics"

    health = urllib.request.urlopen(base + "/health", timeout=5)
    assert health.status == 200
    assert json.loads(health.read())["ok"] is True

    listed = json.loads(urllib.request.urlopen(base + "/datasets", timeout=5).read())
    assert listed["datasets"] == []

    create_req = urllib.request.Request(
        base + "/datasets",
        data=json.dumps({{"name": "HTTP dataset", "workspace_id": "local"}}).encode("utf-8"),
        headers={{"Content-Type": "application/json"}},
        method="POST",
    )
    created = json.loads(urllib.request.urlopen(create_req, timeout=5).read())
    assert created["name"] == "HTTP dataset"
    assert created["dataset_id"].startswith("ds_")

    listed_after = json.loads(urllib.request.urlopen(base + "/datasets", timeout=5).read())
    assert len(listed_after["datasets"]) == 1
    assert listed_after["datasets"][0]["dataset_id"] == created["dataset_id"]
    assert "mappings" not in listed_after["datasets"][0]
    assert "canonical_fields" not in listed_after["datasets"][0]
    assert listed_after.get("workspace_id") == "local"

    fetched = json.loads(
        urllib.request.urlopen(base + "/datasets/" + created["dataset_id"], timeout=5).read()
    )
    assert fetched["dataset_id"] == created["dataset_id"]
    assert isinstance(fetched.get("canonical_fields"), dict)

    server.shutdown()
    print("ok")
    """
    result = _run_http_script(script)
    assert result.returncode == 0, result.stderr or result.stdout


def test_local_http_dataset_list_skips_malformed_records(tmp_path):
    work_dir = tmp_path / "work"
    datasets_dir = work_dir / "datasets"
    datasets_dir.mkdir(parents=True)
    (datasets_dir / "ds_bad.json").write_text("{not-json", encoding="utf-8")
    good = {
        "workspace_id": "local",
        "dataset_id": "ds_gooddd123456",
        "dataset_version": 1,
        "name": "Good",
        "status": "COMPLETED",
        "created_at": "2026-08-25T10:00:00+00:00",
        "mapping_version": "m1",
        "source_files": [],
        "mapping_status": "READY",
        "analysis_status": "COMPLETED",
    }
    (datasets_dir / "ds_gooddd123456.json").write_text(json.dumps(good), encoding="utf-8")
    script = f"""
    import json
    import threading
    import time
    import urllib.request
    from http.server import ThreadingHTTPServer

    import os
    os.environ["WYZ_ANALYTICS_WORK_DIR"] = r"{work_dir}"
    os.environ["WYZ_ANALYTICS_EMBEDDED_WORKER"] = "false"

    from wyz_analytics.workers.local_http import Handler

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    host, port = server.server_address
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.2)
    base = f"http://{{host}}:{{port}}/api/v1/analytics"

    listed = json.loads(urllib.request.urlopen(base + "/datasets", timeout=5).read())
    assert listed["count"] == 1
    assert listed["datasets"][0]["dataset_id"] == "ds_gooddd123456"
    assert "mappings" not in listed["datasets"][0]

    server.shutdown()
    print("ok")
    """
    result = _run_http_script(script)
    assert result.returncode == 0, result.stderr or result.stdout


def test_local_http_returns_json_500_when_single_dataset_payload_is_malformed(tmp_path):
    work_dir = tmp_path / "work"
    datasets_dir = work_dir / "datasets"
    datasets_dir.mkdir(parents=True)
    (datasets_dir / "ds_badxxxxx123.json").write_text("{not-json", encoding="utf-8")
    script = f"""
    import json
    import threading
    import time
    import urllib.error
    import urllib.request
    from http.server import ThreadingHTTPServer

    import os
    os.environ["WYZ_ANALYTICS_WORK_DIR"] = r"{work_dir}"
    os.environ["WYZ_ANALYTICS_EMBEDDED_WORKER"] = "false"

    from wyz_analytics.workers.local_http import Handler

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    host, port = server.server_address
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.2)
    base = f"http://{{host}}:{{port}}/api/v1/analytics"

    try:
        urllib.request.urlopen(base + "/datasets/ds_badxxxxx123", timeout=5)
        raise AssertionError("expected HTTP 500")
    except urllib.error.HTTPError as exc:
        assert exc.code == 500
        body = json.loads(exc.read().decode("utf-8"))
        assert body["message"] == "Analytics worker error."
        assert "Malformed dataset record" in body["detail"]

    server.shutdown()
    print("ok")
    """
    result = _run_http_script(script)
    assert result.returncode == 0, result.stderr or result.stdout