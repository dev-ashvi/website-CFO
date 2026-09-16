#!/usr/bin/env python3
"""P2 Docker Compose acceptance smoke (offline AI via fake provider).

Run against a live stack on localhost:8788. Does not use docker compose down -v.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("WYZ_P2_BASE", "http://127.0.0.1:8788/api/v1/analytics").rstrip("/")
DATA = Path(os.environ.get("WYZ_ANALYTICS_GOLDEN_DIR", Path.home() / "Downloads"))


def _req(method: str, path: str, *, data: bytes | None = None, headers: dict | None = None, timeout: float = 120):
    url = f"{BASE}{path}"
    hdrs = dict(headers or {})
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, json.loads(body.decode("utf-8")) if body else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        raise RuntimeError(f"{method} {path} -> {exc.code}: {payload}") from exc


def get(path: str, **kw):
    return _req("GET", path, **kw)


def post_json(path: str, payload: dict, **kw):
    data = json.dumps(payload).encode("utf-8")
    return _req("POST", path, data=data, headers={"Content-Type": "application/json"}, **kw)


def post_multipart(path: str, files: list[tuple[str, Path]], timeout: float = 600):
    boundary = "----wyzp2boundary7MA4YWxkTrZu0gW"
    chunks: list[bytes] = []
    for filename, file_path in files:
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(
            f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n".encode()
        )
        chunks.append(file_path.read_bytes())
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    body = b"".join(chunks)
    return _req(
        "POST",
        path,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        timeout=timeout,
    )


def wait_dataset(dataset_id: str, *, want: set[str], timeout: float = 900) -> dict:
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        _, last = get(f"/datasets/{dataset_id}")
        status = str(last.get("status") or "")
        if status in want:
            return last
        if status in {"FAILED", "ERROR"}:
            raise RuntimeError(f"dataset failed: {last}")
        time.sleep(2)
    raise TimeoutError(f"dataset {dataset_id} not in {want}; last={last}")


def wait_job(job_id: str, *, timeout: float = 900) -> dict:
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        _, last = get(f"/jobs/{job_id}")
        stage = str(last.get("stage") or last.get("status") or "")
        if stage in {"COMPLETED", "FAILED", "NEEDS_REVIEW"}:
            return last
        time.sleep(2)
    raise TimeoutError(f"job {job_id} timeout; last={last}")


def main() -> int:
    print("P2 acceptance against", BASE)
    status, health = get("/health")
    assert status == 200, health
    print("health", health)

    status, ready = get("/ready")
    assert status == 200 and ready.get("ready") is True, ready
    print("ready", ready)

    files = [
        ("01_ORDER_LINES.csv", DATA / "01_ORDER_LINES.csv"),
        ("02_SKU_MASTER_COGS.csv", DATA / "02_SKU_MASTER_COGS.csv"),
        ("03_CHANNEL_SETTLEMENTS.csv", DATA / "03_CHANNEL_SETTLEMENTS.csv"),
        ("04_MARKETING_SPEND.csv", DATA / "04_MARKETING_SPEND.csv"),
    ]
    for _, path in files:
        if not path.exists():
            raise SystemExit(f"missing fixture {path}")

    _, created = post_json("/datasets", {"name": "P2 Compose Smoke", "workspace_id": "local"})
    dataset_id = created["dataset_id"]
    print("created", dataset_id)

    _, uploaded = post_multipart(f"/datasets/{dataset_id}/files", files)
    print("upload status", uploaded.get("status"), "job", uploaded.get("latest_job_id"))

    record = wait_dataset(dataset_id, want={"READY", "NEEDS_REVIEW", "COMPLETED"})
    if record.get("status") == "NEEDS_REVIEW":
        raise SystemExit(f"mapping needs review — unexpected for BeautyCo: {record.get('mapping_status')}")
    print("ingest ready", record.get("status"))

    _, job = post_json(f"/datasets/{dataset_id}/jobs", {})
    job_id = job["job_id"]
    print("queued analyse", job_id)
    finished = wait_job(job_id)
    if finished.get("stage") != "COMPLETED":
        raise SystemExit(f"analysis failed: {finished}")
    print("analysis completed")

    _, result = get(f"/datasets/{dataset_id}/result")
    assert result.get("job_id") or result.get("result_id"), result
    print("result ok", result.get("result_id") or result.get("job_id"))

    _, ask = post_json(
        f"/datasets/{dataset_id}/ai-cfo/ask",
        {
            "message": "What is driving contribution margin?",
            "analytical": {"filters": {}, "surface": "overview", "dimension": "channel"},
        },
        timeout=180,
    )
    turn_id = (ask.get("conversation") or {}).get("turn_id") or ask.get("turn_id")
    print("ai ask turn", turn_id, "source", (ask.get("answer") or {}).get("telemetry", {}).get("answer_source") or ask.get("telemetry"))

    _, tracked = post_json(
        f"/datasets/{dataset_id}/strategic-decisions",
        {
            "analytical": {"filters": {}, "surface": "overview", "dimension": "channel"},
            "decision_theme": "MARKETING_SPEND",
            "selected_action": "EXPERIMENT",
            "action_strength": "MODERATE",
            "rationale": "P2 compose persistence smoke",
        },
    )
    decision_id = (tracked.get("decision") or {}).get("decision_id")
    print("tracked decision", decision_id)

    _, fb = post_json(
        f"/datasets/{dataset_id}/ai-feedback",
        {"turn_id": turn_id or "t_p2_smoke", "rating": "USEFUL"},
    )
    print("feedback", fb.get("feedback", {}).get("feedback_id") or fb)

    _, lib = get("/datasets?workspace_id=local")
    ids = [d.get("dataset_id") for d in (lib.get("datasets") or [])]
    assert dataset_id in ids, lib
    print("library lists dataset", ids)

    # Second dataset for multi-dataset listing
    _, created2 = post_json("/datasets", {"name": "P2 Second Dataset", "workspace_id": "local"})
    ds2 = created2["dataset_id"]
    _, lib2 = get("/datasets?workspace_id=local")
    ids2 = [d.get("dataset_id") for d in (lib2.get("datasets") or [])]
    assert dataset_id in ids2 and ds2 in ids2, lib2
    print("multi-dataset ok", len(ids2))

    out = {
        "dataset_id": dataset_id,
        "job_id": job_id,
        "decision_id": decision_id,
        "turn_id": turn_id,
        "dataset_id_2": ds2,
    }
    Path("services/analytics/.p2-acceptance-ids.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print("WROTE services/analytics/.p2-acceptance-ids.json")
    print("PASS pre-restart journey")
    return 0


if __name__ == "__main__":
    sys.exit(main())
