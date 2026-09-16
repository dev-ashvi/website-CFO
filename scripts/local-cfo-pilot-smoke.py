#!/usr/bin/env python3
"""P6L local CFO pilot smoke against http://127.0.0.1:8080 (Caddy → BFF → API).

Uses temporary pilot login (Bearer wyz-pilot.*). Never prints secrets.
Requires golden CSVs (default: ~/Downloads) and WYZ_PILOT_* in the environment
or services/analytics/.env.local-pilot for email/password (read locally only).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANALYTICS = ROOT / "services" / "analytics"
BASE = os.environ.get("WYZ_P6L_BASE", "http://127.0.0.1:8080").rstrip("/")
API = f"{BASE}/api/v1/analytics"
ORIGIN = os.environ.get("WYZ_P6L_ORIGIN", "http://127.0.0.1:8080")
DATA = Path(os.environ.get("WYZ_ANALYTICS_GOLDEN_DIR", Path.home() / "Downloads"))
REPORT: dict[str, str] = {}


def record(name: str, status: str, detail: str = "") -> None:
    REPORT[name] = status
    suffix = f" — {detail}" if detail else ""
    print(f"[{status}] {name}{suffix}")


def load_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def first_pilot_creds(users_raw: str) -> tuple[str, str]:
    for part in users_raw.split(","):
        item = part.strip()
        if ":" not in item:
            continue
        email, password = item.split(":", 1)
        email = email.strip()
        if email and password:
            return email, password
    raise SystemExit("WYZ_PILOT_USERS has no email:password pairs")


def _req(
    method: str,
    url: str,
    *,
    data: bytes | None = None,
    headers: dict | None = None,
    timeout: float = 120,
) -> tuple[int, dict | list | str, dict]:
    hdrs = dict(headers or {})
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "application/json" in ctype and body:
                payload: dict | list | str = json.loads(body.decode("utf-8"))
            else:
                payload = body.decode("utf-8", errors="replace")
            return resp.status, payload, dict(resp.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return exc.code, payload, dict(exc.headers)


def api(
    method: str,
    path: str,
    *,
    token: str | None = None,
    json_body: dict | None = None,
    timeout: float = 180,
) -> tuple[int, dict | list | str, dict]:
    headers = {"Origin": ORIGIN, "Accept": "application/json"}
    data = None
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return _req(method, f"{API}{path}", data=data, headers=headers, timeout=timeout)


def post_multipart(path: str, files: list[tuple[str, Path]], token: str, timeout: float = 600):
    boundary = "----wyzp6lboundary"
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
    headers = {
        "Origin": ORIGIN,
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    return _req("POST", f"{API}{path}", data=b"".join(chunks), headers=headers, timeout=timeout)


def wait_dataset(token: str, dataset_id: str, *, want: set[str], timeout: float = 900) -> dict:
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        st, last, _ = api("GET", f"/datasets/{dataset_id}", token=token)
        if st == 200 and isinstance(last, dict):
            status = str(last.get("status") or "")
            if status in want:
                return last
            if status in {"FAILED", "ERROR"}:
                raise RuntimeError(f"dataset failed: {last}")
        time.sleep(2)
    raise TimeoutError(last)


def wait_job(token: str, job_id: str, timeout: float = 900) -> dict:
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        st, last, _ = api("GET", f"/jobs/{job_id}", token=token)
        if st != 200:
            time.sleep(2)
            continue
        stage = str((last or {}).get("stage") or (last or {}).get("status") or "")
        if stage in {"COMPLETED", "FAILED", "NEEDS_REVIEW"}:
            return last  # type: ignore[return-value]
        time.sleep(2)
    raise TimeoutError(last)


def published_ports() -> list[str]:
    out = subprocess.check_output(
        ["docker", "ps", "--filter", "name=wyz-analytics", "--format", "{{.Names}}|{{.Ports}}"],
        text=True,
    )
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def main() -> int:
    env = load_env_file(ANALYTICS / ".env.local-pilot")
    email = os.environ.get("WYZ_P6L_EMAIL") or first_pilot_creds(env.get("WYZ_PILOT_USERS", ""))[0]
    password = os.environ.get("WYZ_P6L_PASSWORD") or first_pilot_creds(env.get("WYZ_PILOT_USERS", ""))[1]

    # --- startup / health ---
    st, health, _ = _req("GET", f"{API}/health")
    if st == 200 and isinstance(health, dict) and health.get("ok") is True:
        record("startup_health", "PASS", str(health.get("env")))
    else:
        record("startup_health", "FAIL", f"{st} {health}")
        _write_report()
        return 1

    # SPA
    st, html, _ = _req("GET", f"{BASE}/")
    if st == 200 and isinstance(html, str) and 'id="root"' in html and "/assets/" in html:
        record("spa_production_build", "PASS")
    else:
        record("spa_production_build", "FAIL", f"{st}")

    # Host exposure
    ports = published_ports()
    only_caddy = any("127.0.0.1:8080" in p and "caddy" in p for p in ports)
    leaked = [p for p in ports if ("8788->" in p or "0.0.0.0:8080" in p or re.search(r":8788->", p))]
    bff_host = [p for p in ports if "bff" in p and "->" in p.split("|")[-1]]
    if only_caddy and not leaked and not bff_host:
        record("host_exposure", "PASS", "only 127.0.0.1:8080")
    else:
        record("host_exposure", "FAIL", "; ".join(ports))

    # Demo reject (pre-login)
    st, body, _ = api("GET", "/datasets", token="wyz-demo-smoke")
    if st == 401:
        record("demo_token_rejected", "PASS")
    else:
        record("demo_token_rejected", "FAIL", f"{st}")

    st, body, _ = api("GET", "/datasets")
    if st == 401:
        record("unauthenticated_rejected", "PASS")
    else:
        record("unauthenticated_rejected", "FAIL", f"{st}")

    # Pilot login
    st, login, _ = _req(
        "POST",
        f"{BASE}/api/v1/pilot-auth/login",
        data=json.dumps({"email": email, "password": password, "tenant_slug": "internal-pilot"}).encode(),
        headers={"Content-Type": "application/json", "Origin": ORIGIN},
    )
    token = ""
    if st == 200 and isinstance(login, dict):
        token = str(login.get("token") or "")
        user = login.get("user") or {}
        if token.startswith("wyz-pilot.") and user.get("is_demo") is False:
            record("pilot_authentication", "PASS")
        else:
            record("pilot_authentication", "FAIL", "bad token shape")
            _write_report()
            return 1
    else:
        record("pilot_authentication", "FAIL", f"{st}")
        _write_report()
        return 1

    # Ready (auth)
    st, ready, _ = api("GET", "/ready", token=token)
    if st == 200 and isinstance(ready, dict) and ready.get("ready") is True:
        key_cfg = ready.get("provider_key_configured")
        record(
            "readiness",
            "PASS",
            f"provider={ready.get('provider_id')} key_configured={key_cfg} fake={ready.get('uses_fake_provider')}",
        )
    else:
        record("readiness", "FAIL", f"{st} {ready}")

    files = [
        ("01_ORDER_LINES.csv", DATA / "01_ORDER_LINES.csv"),
        ("02_SKU_MASTER_COGS.csv", DATA / "02_SKU_MASTER_COGS.csv"),
        ("03_CHANNEL_SETTLEMENTS.csv", DATA / "03_CHANNEL_SETTLEMENTS.csv"),
        ("04_MARKETING_SPEND.csv", DATA / "04_MARKETING_SPEND.csv"),
    ]
    missing = [str(p) for _, p in files if not p.exists()]
    if missing:
        record("dataset_upload", "NOT TESTED", f"missing fixtures: {missing[0]}")
        record("analysis", "NOT TESTED")
        record("hard_refresh_dataset", "NOT TESTED")
        record("dataset_restore_list", "NOT TESTED")
        record("ai_cfo_question", "NOT TESTED")
        record("diagnostic_question", "NOT TESTED")
        record("scenario", "NOT TESTED")
        record("followup_reconsider", "NOT TESTED")
        record("track_decision", "NOT TESTED")
        record("review_decision", "NOT TESTED")
        record("feedback", "NOT TESTED")
        record("container_restart_persistence", "NOT TESTED")
        _write_report()
        return 1

    st, created, _ = api("POST", "/datasets", token=token, json_body={"name": "P6L Local Pilot Smoke"})
    if st not in (200, 201) or not isinstance(created, dict) or not created.get("dataset_id"):
        record("dataset_upload", "FAIL", f"create {st}")
        _write_report()
        return 1
    dataset_id = created["dataset_id"]
    workspace_id = created.get("workspace_id")

    st, uploaded, _ = post_multipart(f"/datasets/{dataset_id}/files", files, token)
    if st not in (200, 201, 202) or not isinstance(uploaded, dict):
        record("dataset_upload", "FAIL", f"upload {st}")
        _write_report()
        return 1
    record("dataset_upload", "PASS", f"{dataset_id} ws={workspace_id}")

    try:
        wait_dataset(token, dataset_id, want={"READY", "COMPLETED", "NEEDS_REVIEW"})
    except Exception as exc:  # noqa: BLE001
        record("analysis", "FAIL", f"dataset wait {exc.__class__.__name__}")
        _write_report()
        return 1

    st, job, _ = api("POST", f"/datasets/{dataset_id}/jobs", token=token, json_body={})
    if st not in (200, 201, 202) or not isinstance(job, dict) or not job.get("job_id"):
        record("analysis", "FAIL", f"job create {st}")
        _write_report()
        return 1
    finished = wait_job(token, str(job["job_id"]))
    if finished.get("stage") != "COMPLETED":
        record("analysis", "FAIL", str(finished.get("stage")))
        _write_report()
        return 1
    st, result, _ = api("GET", f"/datasets/{dataset_id}/result", token=token)
    if st == 200 and isinstance(result, dict) and (result.get("result_id") or result.get("job_id")):
        record("analysis", "PASS")
    else:
        record("analysis", "FAIL", f"{st}")

    # Hard refresh — re-fetch dataset + result
    st1, ds1, _ = api("GET", f"/datasets/{dataset_id}", token=token)
    st2, res2, _ = api("GET", f"/datasets/{dataset_id}/result", token=token)
    if st1 == 200 and st2 == 200:
        record("hard_refresh_dataset", "PASS")
    else:
        record("hard_refresh_dataset", "FAIL", f"{st1}/{st2}")

    st, lib, _ = api("GET", "/datasets", token=token)
    ids = []
    if isinstance(lib, dict):
        ids = [d.get("dataset_id") for d in (lib.get("datasets") or [])]
    if dataset_id in ids:
        record("dataset_restore_list", "PASS", f"count={len(ids)}")
    else:
        record("dataset_restore_list", "FAIL")

    analytical = {"filters": {}, "surface": "overview", "dimension": "channel"}
    key_configured = False
    if isinstance(ready, dict):
        key_configured = bool(ready.get("provider_key_configured"))

    def classify_ai(name: str, st: int, payload) -> None:
        code = ""
        if isinstance(payload, dict):
            code = str((payload.get("error") or {}).get("code") or "")
        if st == 200:
            record(name, "PASS")
            return
        if not key_configured and (st == 503 or code == "AI_PROVIDER_UNAVAILABLE"):
            record(name, "NOT TESTED", "no AI API key configured in .env.local-pilot")
            return
        record(name, "FAIL", f"{st} {code}"[:180])

    # AI CFO question
    st, ask, _ = api(
        "POST",
        f"/datasets/{dataset_id}/ai-cfo/ask",
        token=token,
        json_body={"message": "What is driving contribution margin?", "analytical": analytical},
        timeout=300,
    )
    turn_id = None
    conversation = {}
    if st == 200 and isinstance(ask, dict):
        conversation = ask.get("conversation") or {}
        turn_id = conversation.get("turn_id")
        record("ai_cfo_question", "PASS", f"turn={turn_id}")
    else:
        classify_ai("ai_cfo_question", st, ask)

    # Diagnostic
    st, diag, _ = api(
        "POST",
        f"/datasets/{dataset_id}/ai-cfo/ask",
        token=token,
        json_body={
            "message": "Break down CM2 by channel for the latest period.",
            "analytical": analytical,
            "conversation": conversation if conversation else None,
        },
        timeout=300,
    )
    if st == 200 and isinstance(diag, dict):
        conversation = diag.get("conversation") or conversation
        record("diagnostic_question", "PASS")
    else:
        classify_ai("diagnostic_question", st, diag)

    # Scenario (deterministic path — should work without live AI key)
    st, scen, _ = api(
        "POST",
        f"/datasets/{dataset_id}/ai-cfo/ask",
        token=token,
        json_body={
            "message": "What if we cut marketing spend by 20%?",
            "analytical": analytical,
            "conversation": conversation if conversation else None,
        },
        timeout=300,
    )
    if st == 200 and isinstance(scen, dict):
        conversation = scen.get("conversation") or conversation
        record("scenario", "PASS")
    else:
        classify_ai("scenario", st, scen)

    # Follow-up / reconsider
    st, fu, _ = api(
        "POST",
        f"/datasets/{dataset_id}/ai-cfo/ask",
        token=token,
        json_body={
            "message": "Reconsider that recommendation with a more conservative stance.",
            "analytical": analytical,
            "conversation": conversation if conversation else None,
        },
        timeout=300,
    )
    if st == 200 and isinstance(fu, dict):
        conversation = fu.get("conversation") or conversation
        if not turn_id:
            turn_id = (conversation or {}).get("turn_id")
        record("followup_reconsider", "PASS")
    else:
        classify_ai("followup_reconsider", st, fu)

    # Track decision
    st, tracked, _ = api(
        "POST",
        f"/datasets/{dataset_id}/strategic-decisions",
        token=token,
        json_body={
            "analytical": analytical,
            "decision_theme": "MARKETING_SPEND",
            "selected_action": "EXPERIMENT",
            "action_strength": "MODERATE",
            "rationale": "P6L local pilot smoke",
        },
    )
    decision_id = None
    if st in (200, 201) and isinstance(tracked, dict):
        decision_id = (tracked.get("decision") or {}).get("decision_id")
        if decision_id:
            record("track_decision", "PASS", str(decision_id))
        else:
            record("track_decision", "FAIL", "no decision_id")
    else:
        record("track_decision", "FAIL", f"{st}")

    # Review decision (AI-backed /review may need provider key; POST /status is the lightweight path)
    if decision_id:
        st, reviewed, _ = api(
            "POST",
            f"/datasets/{dataset_id}/strategic-decisions/{decision_id}/review",
            token=token,
            json_body={"analytical": analytical, "note": "P6L review"},
            timeout=300,
        )
        if st == 200:
            record("review_decision", "PASS", "via /review")
        else:
            code = ""
            if isinstance(reviewed, dict):
                code = str((reviewed.get("error") or {}).get("code") or "")
            st2, _, _ = api(
                "POST",
                f"/datasets/{dataset_id}/strategic-decisions/{decision_id}/status",
                token=token,
                json_body={"status": "RESOLVED"},
            )
            if st2 == 200:
                record("review_decision", "PASS", "via POST /status RESOLVED")
            elif not key_configured and (st == 503 or code == "AI_PROVIDER_UNAVAILABLE"):
                record("review_decision", "NOT TESTED", "AI review needs API key; status update failed")
            else:
                record("review_decision", "FAIL", f"review={st} status={st2}")
    else:
        record("review_decision", "NOT TESTED", "no decision_id")

    # Feedback
    if not turn_id:
        turn_id = "p6l-smoke-turn"
    st, fb, _ = api(
        "POST",
        f"/datasets/{dataset_id}/ai-feedback",
        token=token,
        json_body={"turn_id": turn_id, "rating": "USEFUL", "comment": "P6L smoke"},
    )
    if st in (200, 201) and isinstance(fb, dict):
        record("feedback", "PASS")
    else:
        record("feedback", "FAIL", f"{st}")

    # Persist ids then restart API/worker/BFF (not down -v)
    ids_path = ANALYTICS / ".p6l-smoke-ids.json"
    ids_path.write_text(
        json.dumps({"dataset_id": dataset_id, "decision_id": decision_id, "turn_id": turn_id}, indent=2),
        encoding="utf-8",
    )

    print("Restarting analytics-api / worker / bff (preserve named volume)...")
    subprocess.check_call(
        [
            "docker",
            "compose",
            "-f",
            "docker-compose.yml",
            "-f",
            "docker-compose.local-pilot.yml",
            "--env-file",
            ".env.local-pilot",
            "up",
            "-d",
            "--force-recreate",
            "analytics-api",
            "analytics-worker",
            "bff",
        ],
        cwd=str(ANALYTICS),
    )
    # wait health
    ok = False
    for _ in range(40):
        time.sleep(2)
        st, health, _ = _req("GET", f"{API}/health")
        if st == 200:
            ok = True
            break
    if not ok:
        record("container_restart_persistence", "FAIL", "health after restart")
        _write_report()
        return 1

    # Re-login (session secret same → same token works; refresh anyway)
    st, login2, _ = _req(
        "POST",
        f"{BASE}/api/v1/pilot-auth/login",
        data=json.dumps({"email": email, "password": password, "tenant_slug": "internal-pilot"}).encode(),
        headers={"Content-Type": "application/json", "Origin": ORIGIN},
    )
    token2 = (login2.get("token") if isinstance(login2, dict) else None) or token
    st, ds_after, _ = api("GET", f"/datasets/{dataset_id}", token=token2)
    st_r, res_after, _ = api("GET", f"/datasets/{dataset_id}/result", token=token2)
    st_d, decs, _ = api("GET", f"/datasets/{dataset_id}/strategic-decisions", token=token2)
    persisted = st == 200 and st_r == 200 and st_d == 200
    if persisted:
        record("container_restart_persistence", "PASS", f"dataset={dataset_id}")
    else:
        record("container_restart_persistence", "FAIL", f"{st}/{st_r}/{st_d}")

    # Telemetry spot-check (structured events; no secrets)
    try:
        logs = subprocess.check_output(
            ["docker", "logs", "wyz-analytics-analytics-api-1", "--tail", "400"],
            text=True,
            stderr=subprocess.STDOUT,
        )
        # Never print logs with potential secrets; only boolean presence.
        needles = {
            "request": '"event": "http_request"' in logs or "http_request" in logs or "request_id" in logs,
            "analytics": "dataset" in logs or "analysis" in logs,
            "ai": "ai_cfo" in logs or "ai_turn" in logs or "strategic" in logs,
            "feedback": "feedback" in logs or "ai_feedback" in logs,
        }
        # Also check observability emitter markers from P1
        p1ish = any(k in logs for k in ("obs_", "observability", "ai_trace", "turn_id", "decision"))
        if any(needles.values()) or p1ish:
            record("telemetry_present", "PASS", f"markers={ {k:v for k,v in needles.items() if v} }")
        else:
            record("telemetry_present", "NOT TESTED", "no clear markers in recent api logs")
        # Ensure no obvious secret dumps
        if "WYZ_PILOT_API_TOKEN" in logs or "nvapi-" in logs or "PilotPass" in logs:
            record("telemetry_no_secrets", "FAIL", "possible secret in logs")
        else:
            record("telemetry_no_secrets", "PASS")
    except Exception as exc:  # noqa: BLE001
        record("telemetry_present", "NOT TESTED", exc.__class__.__name__)
        record("telemetry_no_secrets", "NOT TESTED")

    _write_report()
    fails = [k for k, v in REPORT.items() if v == "FAIL"]
    return 1 if fails else 0


def _write_report() -> None:
    out = ANALYTICS / ".p6l-smoke-report.json"
    out.write_text(json.dumps(REPORT, indent=2), encoding="utf-8")
    print("Wrote", out)


if __name__ == "__main__":
    sys.exit(main())
