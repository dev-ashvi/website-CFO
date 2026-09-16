#!/usr/bin/env python3
"""P3 pilot-mode acceptance against Compose on 127.0.0.1:8788 (fake AI)."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("WYZ_P2_BASE", "http://127.0.0.1:8788/api/v1/analytics").rstrip("/")
TOKEN = os.environ.get("WYZ_PILOT_API_TOKEN", "").strip()
ORIGIN = os.environ.get("WYZ_P3_ORIGIN", "http://localhost:5173")
DATA = Path(os.environ.get("WYZ_ANALYTICS_GOLDEN_DIR", Path.home() / "Downloads"))


def _req(method: str, path: str, *, data: bytes | None = None, headers: dict | None = None, auth: bool = True, timeout: float = 120):
    url = f"{BASE}{path}"
    hdrs = {"Origin": ORIGIN, **(headers or {})}
    if auth:
        if not TOKEN:
            raise SystemExit("WYZ_PILOT_API_TOKEN is required for P3 acceptance")
        hdrs["X-WYZ-Pilot-Token"] = TOKEN
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, json.loads(body.decode("utf-8")) if body else {}, dict(resp.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return exc.code, payload, dict(exc.headers)


def post_json(path: str, payload: dict, **kw):
    data = json.dumps(payload).encode("utf-8")
    return _req("POST", path, data=data, headers={"Content-Type": "application/json"}, **kw)


def post_multipart(path: str, files: list[tuple[str, Path]], timeout: float = 600):
    boundary = "----wyzp3boundary"
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
    return _req(
        "POST",
        path,
        data=b"".join(chunks),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        timeout=timeout,
    )


def wait_dataset(dataset_id: str, *, want: set[str], timeout: float = 900) -> dict:
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        _, last, _ = _req("GET", f"/datasets/{dataset_id}")
        if str(last.get("status") or "") in want:
            return last
        time.sleep(2)
    raise TimeoutError(last)


def wait_job(job_id: str, *, timeout: float = 900) -> dict:
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        _, last, _ = _req("GET", f"/jobs/{job_id}")
        if str(last.get("stage") or "") in {"COMPLETED", "FAILED", "NEEDS_REVIEW"}:
            return last
        time.sleep(2)
    raise TimeoutError(last)


def main() -> int:
    print("P3 pilot acceptance", BASE)
    st, health, _ = _req("GET", "/health", auth=False)
    assert st == 200 and health.get("ok") is True, health
    st, ready, _ = _req("GET", "/ready", auth=False)
    assert st == 200 and ready.get("ready") is True, ready
    print("health/ready ok", ready.get("env"), ready.get("workspace_id"))

    st, body, _ = _req("GET", "/datasets", auth=False)
    assert st == 401, body
    print("unauthenticated rejected")

    st, body, hdrs = _req("GET", "/datasets", auth=True)
    assert st == 200, body
    assert hdrs.get("Access-Control-Allow-Origin") == ORIGIN or hdrs.get("access-control-allow-origin") == ORIGIN
    print("authenticated + CORS ok")

    st, body, hdrs = _req(
        "GET",
        "/datasets",
        auth=True,
        headers={"Origin": "https://evil.example"},
    )
    assert st == 403, body
    print("disallowed origin rejected")

    files = [
        ("01_ORDER_LINES.csv", DATA / "01_ORDER_LINES.csv"),
        ("02_SKU_MASTER_COGS.csv", DATA / "02_SKU_MASTER_COGS.csv"),
        ("03_CHANNEL_SETTLEMENTS.csv", DATA / "03_CHANNEL_SETTLEMENTS.csv"),
        ("04_MARKETING_SPEND.csv", DATA / "04_MARKETING_SPEND.csv"),
    ]
    for _, path in files:
        if not path.exists():
            raise SystemExit(f"missing {path}")

    _, created, _ = post_json("/datasets", {"name": "P3 Pilot Smoke", "workspace_id": "evil-tenant"})
    dataset_id = created["dataset_id"]
    assert created.get("workspace_id") != "evil-tenant"
    print("created", dataset_id, "workspace", created.get("workspace_id"))

    _, uploaded, _ = post_multipart(f"/datasets/{dataset_id}/files", files)
    wait_dataset(dataset_id, want={"READY", "COMPLETED", "NEEDS_REVIEW"})
    _, job, _ = post_json(f"/datasets/{dataset_id}/jobs", {})
    finished = wait_job(job["job_id"])
    assert finished.get("stage") == "COMPLETED", finished
    _, result, _ = _req("GET", f"/datasets/{dataset_id}/result")
    assert result.get("result_id") or result.get("job_id")
    print("analyse ok")

    _, ask, _ = post_json(
        f"/datasets/{dataset_id}/ai-cfo/ask",
        {"message": "What is driving contribution margin?", "analytical": {"filters": {}, "surface": "overview", "dimension": "channel"}},
        timeout=180,
    )
    turn_id = (ask.get("conversation") or {}).get("turn_id") or "t1"
    _, tracked, _ = post_json(
        f"/datasets/{dataset_id}/strategic-decisions",
        {
            "analytical": {"filters": {}, "surface": "overview", "dimension": "channel"},
            "decision_theme": "MARKETING_SPEND",
            "selected_action": "EXPERIMENT",
            "action_strength": "MODERATE",
            "rationale": "P3 pilot",
        },
    )
    decision_id = (tracked.get("decision") or {}).get("decision_id")
    _, fb, _ = post_json(f"/datasets/{dataset_id}/ai-feedback", {"turn_id": turn_id, "rating": "USEFUL"})
    assert fb.get("feedback", {}).get("provider") is None
    print("ai/decision/feedback ok", decision_id)

    Path("services/analytics/.p3-acceptance-ids.json").write_text(
        json.dumps({"dataset_id": dataset_id, "decision_id": decision_id, "turn_id": turn_id}, indent=2),
        encoding="utf-8",
    )
    print("PASS P3 pre-restart")
    return 0


if __name__ == "__main__":
    sys.exit(main())
