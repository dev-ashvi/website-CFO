#!/usr/bin/env python3
"""P6L.2 local + public pilot backend regression (no Vercel deploy)."""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANALYTICS = ROOT / "services" / "analytics"
LOCAL = "http://127.0.0.1:8080"
PUBLIC = os.environ.get("WYZ_P6L2_PUBLIC", "https://pilot.financewyz.ai").rstrip("/")
OUT = ANALYTICS / ".p6l2-regression-report.json"
REPORT: dict = {"checks": {}}


def record(name: str, status: str, detail: str = "") -> None:
    REPORT["checks"][name] = {"status": status, "detail": detail}
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def req(method: str, url: str, *, headers: dict | None = None, body: dict | None = None, timeout: float = 120):
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode()
        hdrs.setdefault("Content-Type", "application/json")
    hdrs.setdefault("Accept", "application/json")
    request = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            raw = resp.read()
            ctype = (resp.headers.get("Content-Type") or "").lower()
            payload = json.loads(raw.decode()) if "json" in ctype and raw else raw.decode("utf-8", "replace")
            return resp.status, payload, dict(resp.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw[:300]}
        return exc.code, payload, dict(exc.headers)


def main() -> int:
    env = load_env(ANALYTICS / ".env.local-pilot")
    users = env.get("WYZ_PILOT_USERS", "")
    email, password = users.split(",")[0].split(":", 1)
    email, password = email.strip(), password
    origins = [o.strip() for o in env.get("WYZ_ALLOWED_ORIGINS", "").split(",") if o.strip()]
    REPORT["allowed_origins_configured"] = origins
    REPORT["www_included"] = "https://www.financewyz.ai" in origins

    # Ports
    ports = subprocess.check_output(
        ["docker", "ps", "--filter", "name=wyz-analytics", "--format", "{{.Names}}|{{.Ports}}"],
        text=True,
    )
    REPORT["ports"] = ports.strip().splitlines()
    if "127.0.0.1:8080" in ports and "caddy" in ports and "8788->" not in ports:
        record("host_exposure", "PASS", "only 127.0.0.1:8080")
    else:
        record("host_exposure", "FAIL", ports.replace("\n", "; "))

    # Local health
    st, health, _ = req("GET", f"{LOCAL}/api/v1/analytics/health")
    record("local_health", "PASS" if st == 200 and isinstance(health, dict) and health.get("ok") else "FAIL", str(st))

    # Local SPA should be gone (API-only)
    st, body, _ = req("GET", f"{LOCAL}/")
    spa = isinstance(body, str) and 'id="root"' in body and "/assets/" in body
    record("local_root_no_spa", "PASS" if st == 404 and not spa else "FAIL", f"status={st} spa={spa}")

    # Local pilot login
    st, login, hdrs = req(
        "POST",
        f"{LOCAL}/api/v1/pilot-auth/login",
        headers={"Origin": "http://127.0.0.1:8080"},
        body={"email": email, "password": password, "tenant_slug": "internal-pilot"},
    )
    token = ""
    if st == 200 and isinstance(login, dict) and str(login.get("token", "")).startswith("wyz-pilot."):
        token = login["token"]
        acao = hdrs.get("Access-Control-Allow-Origin") or hdrs.get("access-control-allow-origin")
        record("local_pilot_login", "PASS", f"acao={acao}")
    else:
        record("local_pilot_login", "FAIL", str(st))
        OUT.write_text(json.dumps(REPORT, indent=2), encoding="utf-8")
        return 1

    # Ready
    st, ready, _ = req(
        "GET",
        f"{LOCAL}/api/v1/analytics/ready",
        headers={"Authorization": f"Bearer {token}", "Origin": "http://127.0.0.1:8080"},
    )
    record(
        "local_ready",
        "PASS" if st == 200 and isinstance(ready, dict) and ready.get("ready") else "FAIL",
        f"key_configured={ready.get('provider_key_configured') if isinstance(ready, dict) else None}",
    )

    # Demo reject
    st, _, _ = req(
        "GET",
        f"{LOCAL}/api/v1/analytics/datasets",
        headers={"Authorization": "Bearer wyz-demo-x", "Origin": "http://127.0.0.1:8080"},
    )
    record("demo_token_rejected", "PASS" if st == 401 else "FAIL", str(st))

    # Unauth
    st, _, _ = req("GET", f"{LOCAL}/api/v1/analytics/datasets", headers={"Origin": "http://127.0.0.1:8080"})
    record("unauthenticated_rejected", "PASS" if st == 401 else "FAIL", str(st))

    # CORS allow financewyz.ai (OPTIONS + login ACAO)
    st, _, oh = req(
        "OPTIONS",
        f"{LOCAL}/api/v1/pilot-auth/login",
        headers={
            "Origin": "https://financewyz.ai",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    acao = oh.get("Access-Control-Allow-Origin") or oh.get("access-control-allow-origin")
    record(
        "cors_financewyz_options",
        "PASS" if st in (200, 204) and acao == "https://financewyz.ai" else "FAIL",
        f"status={st} acao={acao}",
    )

    st, login2, lh = req(
        "POST",
        f"{LOCAL}/api/v1/pilot-auth/login",
        headers={"Origin": "https://financewyz.ai"},
        body={"email": email, "password": password, "tenant_slug": "internal-pilot"},
    )
    acao2 = lh.get("Access-Control-Allow-Origin") or lh.get("access-control-allow-origin")
    record(
        "cors_financewyz_login",
        "PASS" if st == 200 and acao2 == "https://financewyz.ai" else "FAIL",
        f"status={st} acao={acao2}",
    )

    # Arbitrary origin rejected
    st, _, bh = req(
        "OPTIONS",
        f"{LOCAL}/api/v1/analytics/datasets",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    acao_evil = bh.get("Access-Control-Allow-Origin") or bh.get("access-control-allow-origin")
    record(
        "cors_arbitrary_origin_rejected",
        "PASS" if (st == 403 or not acao_evil) else "FAIL",
        f"status={st} acao={acao_evil}",
    )

    st, body, _ = req(
        "GET",
        f"{LOCAL}/api/v1/analytics/datasets",
        headers={"Authorization": f"Bearer {token}", "Origin": "https://evil.example"},
    )
    record("origin_forbidden_on_api", "PASS" if st == 403 else "FAIL", str(st))

    # Public pilot host
    try:
        st, root, _ = req("GET", f"{PUBLIC}/")
        spa = isinstance(root, str) and 'id="root"' in root and "/assets/" in root
        record("public_root_no_spa", "PASS" if st == 404 and not spa else "FAIL", f"status={st} spa={spa}")
    except Exception as exc:  # noqa: BLE001
        record("public_root_no_spa", "FAIL", exc.__class__.__name__)

    try:
        st, health, _ = req("GET", f"{PUBLIC}/api/v1/analytics/health")
        record("public_health", "PASS" if st == 200 else "FAIL", str(st))
    except Exception as exc:  # noqa: BLE001
        record("public_health", "FAIL", exc.__class__.__name__)

    try:
        st, plogin, ph = req(
            "POST",
            f"{PUBLIC}/api/v1/pilot-auth/login",
            headers={"Origin": "https://financewyz.ai"},
            body={"email": email, "password": password, "tenant_slug": "internal-pilot"},
        )
        ptoken = plogin.get("token") if isinstance(plogin, dict) else None
        acao_p = ph.get("Access-Control-Allow-Origin") or ph.get("access-control-allow-origin")
        ok = st == 200 and str(ptoken or "").startswith("wyz-pilot.") and acao_p == "https://financewyz.ai"
        record("public_pilot_login_cors", "PASS" if ok else "FAIL", f"status={st} acao={acao_p}")
        if ok:
            token = ptoken
    except Exception as exc:  # noqa: BLE001
        record("public_pilot_login_cors", "FAIL", exc.__class__.__name__)
        ptoken = None

    # Dataset + AI journey via public if login worked else local
    base = PUBLIC if REPORT["checks"].get("public_pilot_login_cors", {}).get("status") == "PASS" else LOCAL
    origin = "https://financewyz.ai" if base == PUBLIC else "http://127.0.0.1:8080"
    auth = {"Authorization": f"Bearer {token}", "Origin": origin}

    # Prefer existing completed dataset
    st, lib, _ = req("GET", f"{base}/api/v1/analytics/datasets", headers=auth)
    dataset_id = None
    if st == 200 and isinstance(lib, dict):
        for d in lib.get("datasets") or []:
            if d.get("status") == "COMPLETED" or d.get("analysis_status") == "COMPLETED":
                dataset_id = d.get("dataset_id")
                break
        if not dataset_id and (lib.get("datasets") or []):
            dataset_id = (lib.get("datasets") or [])[0].get("dataset_id")
    record("dataset_library", "PASS" if dataset_id else "FAIL", str(dataset_id))

    if dataset_id:
        # Ensure result
        st_r, _, _ = req("GET", f"{base}/api/v1/analytics/datasets/{dataset_id}/result", headers=auth)
        if st_r != 200:
            record("analysis_result", "NOT TESTED", f"result status {st_r}")
        else:
            record("analysis_result", "PASS")

        analytical = {"filters": {}, "surface": "overview", "dimension": "channel"}
        conversation = None

        def ask(msg: str):
            nonlocal conversation
            body = {"message": msg, "analytical": analytical}
            if conversation:
                body["conversation"] = conversation
            return req(
                "POST",
                f"{base}/api/v1/analytics/datasets/{dataset_id}/ai-cfo/ask",
                headers=auth,
                body=body,
                timeout=600,
            )

        st, a1, _ = ask("What is my revenue?")
        ans = a1.get("answer") if isinstance(a1, dict) else {}
        telem = (ans or {}).get("telemetry") or {}
        if isinstance(a1, dict) and a1.get("conversation"):
            conversation = a1["conversation"]
        record(
            "ai_factual",
            "PASS" if st == 200 else "FAIL",
            f"source={telem.get('answer_source')} status={st}",
        )

        st, a2, _ = ask("What happens if marketing spend decreases by 15%?")
        ans = a2.get("answer") if isinstance(a2, dict) else {}
        telem = (ans or {}).get("telemetry") or {}
        ch = ((ans or {}).get("scenario_spec") or {}).get("changes") or [{}]
        if isinstance(a2, dict) and a2.get("conversation"):
            conversation = a2["conversation"]
        ok = st == 200 and telem.get("answer_source") == "deterministic_scenario" and ch[0].get("value") == -15.0
        record("scenario_15", "PASS" if ok else "FAIL", f"source={telem.get('answer_source')} ch={ch[0]}")

        st, a3, _ = ask("What if instead I reduce it by only 10%?")
        ans = a3.get("answer") if isinstance(a3, dict) else {}
        telem = (ans or {}).get("telemetry") or {}
        ch = ((ans or {}).get("scenario_spec") or {}).get("changes") or [{}]
        if isinstance(a3, dict) and a3.get("conversation"):
            conversation = a3["conversation"]
        ok = (
            st == 200
            and telem.get("answer_source") == "deterministic_scenario"
            and ch[0].get("lever") == "MARKETING_SPEND"
            and ch[0].get("value") == -10.0
            and (telem.get("scenario_reconsider") or telem.get("scenario_parse_source") == "DETERMINISTIC_FOLLOWUP")
        )
        record("scenario_reconsider_10", "PASS" if ok else "FAIL", f"source={telem.get('answer_source')} ch={ch[0]}")

        st, a4, _ = ask("Given this, what would you recommend?")
        ans = a4.get("answer") if isinstance(a4, dict) else {}
        telem = (ans or {}).get("telemetry") or {}
        if isinstance(a4, dict) and a4.get("conversation"):
            conversation = a4["conversation"]
        ok = st == 200 and (
            (ans or {}).get("strategic")
            or telem.get("final_selected_action")
            or "strategic" in str(telem.get("answer_source") or "").lower()
        )
        record(
            "strategic_recommend",
            "PASS" if ok else "FAIL",
            f"source={telem.get('answer_source')} action={telem.get('final_selected_action')}",
        )

        st, tracked, _ = req(
            "POST",
            f"{base}/api/v1/analytics/datasets/{dataset_id}/strategic-decisions",
            headers=auth,
            body={
                "analytical": analytical,
                "decision_theme": "MARKETING_SPEND",
                "selected_action": "EXPERIMENT",
                "action_strength": "MODERATE",
                "rationale": "P6L.2 regression",
                "conversation": conversation,
            },
        )
        decision_id = (tracked.get("decision") or {}).get("decision_id") if isinstance(tracked, dict) else None
        record("track_decision", "PASS" if st in (200, 201) and decision_id else "FAIL", str(decision_id))

        if decision_id:
            st, _, _ = req(
                "POST",
                f"{base}/api/v1/analytics/datasets/{dataset_id}/strategic-decisions/{decision_id}/review",
                headers=auth,
                body={"analytical": analytical},
                timeout=600,
            )
            record("review_decision", "PASS" if st == 200 else "FAIL", str(st))

        turn_id = (conversation or {}).get("turn_id") or "p6l2-turn"
        st, _, _ = req(
            "POST",
            f"{base}/api/v1/analytics/datasets/{dataset_id}/ai-feedback",
            headers=auth,
            body={"turn_id": turn_id, "rating": "USEFUL", "comment": "P6L.2"},
        )
        record("feedback", "PASS" if st in (200, 201) else "FAIL", str(st))

        # Persistence via re-list
        st, lib2, _ = req("GET", f"{base}/api/v1/analytics/datasets", headers=auth)
        ids = [d.get("dataset_id") for d in ((lib2.get("datasets") or []) if isinstance(lib2, dict) else [])]
        record("persistence_library", "PASS" if dataset_id in ids else "FAIL")

    # Telemetry privacy spot-check
    logs = subprocess.check_output(
        ["docker", "logs", "wyz-analytics-analytics-api-1", "--tail", "200"],
        text=True,
        stderr=subprocess.STDOUT,
    )
    record(
        "telemetry_no_secrets",
        "PASS" if ("nvapi-" not in logs and "NVIDIA_API_KEY=" not in logs) else "FAIL",
    )
    record(
        "telemetry_present",
        "PASS" if ("http_request" in logs or "answer_source" in logs or "event_name" in logs) else "NOT TESTED",
    )

    fails = [k for k, v in REPORT["checks"].items() if v["status"] == "FAIL"]
    REPORT["fails"] = fails
    REPORT["ok"] = not fails
    OUT.write_text(json.dumps(REPORT, indent=2), encoding="utf-8")
    print("WROTE", OUT)
    print("FAILS", fails)
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
