"""P6L.1 live validation through http://127.0.0.1:8080 — no secrets printed."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

ANALYTICS = Path(__file__).resolve().parents[1] / "services" / "analytics"
BASE = "http://127.0.0.1:8080"
OUT = ANALYTICS / ".p6l1-live-report.json"


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def req(method, url, token=None, body=None, timeout=600):
    headers = {"Origin": "http://127.0.0.1:8080", "Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"raw": raw[:400]}
        return e.code, payload


def summarize(label, st, payload):
    ans = payload.get("answer") if isinstance(payload.get("answer"), dict) else payload
    if not isinstance(ans, dict):
        ans = {}
    t = ans.get("telemetry") or payload.get("telemetry") or {}
    return {
        "label": label,
        "http": st,
        "headline": (ans.get("headline") or "")[:220],
        "interpretation": (ans.get("interpretation") or "")[:300],
        "answer_source": t.get("answer_source"),
        "intent_source": t.get("intent_source") or t.get("resolved_intent"),
        "scenario_parse_source": t.get("scenario_parse_source"),
        "scenario_reconsider": t.get("scenario_reconsider"),
        "scenario_followup_inherited": t.get("scenario_followup_inherited"),
        "provider_calls": t.get("provider_calls"),
        "model": t.get("model") or t.get("model_id"),
        "tokens": {
            k: t.get(k)
            for k in ("input_tokens", "output_tokens", "total_tokens")
            if t.get(k) is not None
        },
        "provider_latency_ms": t.get("provider_latency_ms") or t.get("end_to_end_latency_ms"),
        "scenario_spec_changes": (ans.get("scenario_spec") or {}).get("changes")
        if isinstance(ans.get("scenario_spec"), dict)
        else None,
        "strategic": bool(ans.get("strategic") or ans.get("strategic_recommendation")),
        "strategic_keys": sorted((ans.get("strategic") or {}).keys())[:20]
        if isinstance(ans.get("strategic"), dict)
        else None,
        "final_selected_action": t.get("final_selected_action")
        or ((ans.get("strategic") or {}) if isinstance(ans.get("strategic"), dict) else {}).get(
            "selected_action"
        ),
        "recommendation_strength": t.get("final_recommendation_strength")
        or ((ans.get("strategic") or {}) if isinstance(ans.get("strategic"), dict) else {}).get(
            "recommendation_strength"
        ),
        "decision_confidence": t.get("final_decision_confidence")
        or ((ans.get("strategic") or {}) if isinstance(ans.get("strategic"), dict) else {}).get(
            "decision_confidence"
        ),
        "interventions": (t.get("interventions") or [])[:8],
        "evidence_metrics": [e.get("metric") for e in (ans.get("evidence") or [])[:8]],
        "evidence_count": len(ans.get("evidence") or []),
        "turn_id": (payload.get("conversation") or {}).get("turn_id"),
        "error": payload.get("error") if isinstance(payload.get("error"), dict) else None,
    }


def main() -> int:
    env = load_env(ANALYTICS / ".env.local-pilot")
    email, pw = env["WYZ_PILOT_USERS"].split(",")[0].split(":", 1)
    st, login = req(
        "POST",
        f"{BASE}/api/v1/pilot-auth/login",
        body={"email": email, "password": pw, "tenant_slug": "internal-pilot"},
    )
    if st != 200:
        print("LOGIN_FAIL", st)
        return 1
    token = login["token"]
    ds = json.loads((ANALYTICS / ".p6l-smoke-ids.json").read_text(encoding="utf-8"))["dataset_id"]
    analytical = {"filters": {}, "surface": "overview", "dimension": "channel"}
    api = f"{BASE}/api/v1/analytics/datasets/{ds}/ai-cfo/ask"

    st0, ready = req("GET", f"{BASE}/api/v1/analytics/ready", token=token)
    connectivity = {
        "ready_http": st0,
        "key_configured": ready.get("provider_key_configured") if isinstance(ready, dict) else None,
        "provider_id": ready.get("provider_id") if isinstance(ready, dict) else None,
        "uses_fake": ready.get("uses_fake_provider") if isinstance(ready, dict) else None,
    }

    conversation = None
    results = {"connectivity": connectivity, "dataset_id": ds, "steps": []}

    steps = [
        ("1_diagnostic", "What is hurting my profitability?"),
        ("2_scenario_15", "What happens if marketing spend decreases by 15%?"),
        ("3_scenario_10_reconsider", "What if instead I reduce it by only 10%?"),
        ("4_strategic", "Given this, what would you recommend?"),
    ]
    for label, message in steps:
        print("ASK", label)
        body = {"message": message, "analytical": analytical}
        if conversation:
            body["conversation"] = conversation
        st, payload = req("POST", api, token=token, body=body, timeout=600)
        if isinstance(payload.get("conversation"), dict):
            conversation = payload["conversation"]
        row = summarize(label, st, payload if isinstance(payload, dict) else {})
        row["message"] = message

        # Semantic gates
        notes = []
        status = "FAIL"
        if label == "3_scenario_10_reconsider":
            ch = (row.get("scenario_spec_changes") or [{}])[0]
            ok = (
                st == 200
                and row.get("answer_source") == "deterministic_scenario"
                and ch.get("lever") == "MARKETING_SPEND"
                and abs(float(ch.get("value") or 0) - (-10.0)) < 1e-6
                and (
                    row.get("scenario_reconsider") is True
                    or row.get("scenario_parse_source") == "DETERMINISTIC_FOLLOWUP"
                )
            )
            status = "PASS" if ok else "FAIL"
            notes = [
                f"lever={ch.get('lever')}",
                f"value={ch.get('value')}",
                f"source={row.get('answer_source')}",
                f"parse={row.get('scenario_parse_source')}",
                f"reconsider={row.get('scenario_reconsider')}",
            ]
        elif label == "4_strategic":
            phases = {
                str((i or {}).get("phase"))
                for i in (row.get("interventions") or [])
                if isinstance(i, dict)
            }
            ok = st == 200 and (
                row.get("strategic")
                or row.get("final_selected_action")
                or "strategic_partner_judgment" in phases
                or "strategic" in str(row.get("answer_source") or "").lower()
            )
            # Grounding: evidence present and no empty generic
            grounded = (row.get("evidence_count") or 0) > 0 or bool(row.get("headline"))
            status = "PASS" if ok and grounded else "FAIL"
            notes = [
                f"source={row.get('answer_source')}",
                f"action={row.get('final_selected_action')}",
                f"strength={row.get('recommendation_strength')}",
                f"confidence={row.get('decision_confidence')}",
                f"phases={sorted(phases)}",
                f"evidence={row.get('evidence_metrics')}",
            ]
        elif label == "2_scenario_15":
            ch = (row.get("scenario_spec_changes") or [{}])[0]
            ok = (
                st == 200
                and row.get("answer_source") == "deterministic_scenario"
                and ch.get("lever") == "MARKETING_SPEND"
                and abs(float(ch.get("value") or 0) - (-15.0)) < 1e-6
            )
            status = "PASS" if ok else "FAIL"
            notes = [f"lever={ch.get('lever')}", f"value={ch.get('value')}"]
        else:
            status = "PASS" if st == 200 and row.get("headline") else "FAIL"
            notes = [f"source={row.get('answer_source')}", f"provider_calls={row.get('provider_calls')}"]

        row["result"] = status
        row["semantic_notes"] = notes
        results["steps"].append(row)
        print(" ", status, row.get("answer_source"), notes[:3])

    # Track + review
    print("TRACK")
    st_t, tracked = req(
        "POST",
        f"{BASE}/api/v1/analytics/datasets/{ds}/strategic-decisions",
        token=token,
        body={
            "analytical": analytical,
            "decision_theme": "MARKETING_SPEND",
            "selected_action": "EXPERIMENT",
            "action_strength": "MODERATE",
            "rationale": "P6L.1 live validation",
            "conversation": conversation,
        },
    )
    decision_id = None
    if isinstance(tracked, dict):
        decision_id = (tracked.get("decision") or {}).get("decision_id")
    track_row = {
        "label": "5_track",
        "http": st_t,
        "decision_id": decision_id,
        "result": "PASS" if decision_id else "FAIL",
    }
    results["steps"].append(track_row)

    print("REVIEW")
    review_row = {"label": "6_review"}
    if decision_id:
        st_r, reviewed = req(
            "POST",
            f"{BASE}/api/v1/analytics/datasets/{ds}/strategic-decisions/{decision_id}/review",
            token=token,
            body={"analytical": analytical, "conversation": conversation},
            timeout=600,
        )
        review_row.update(summarize("6_review", st_r, reviewed if isinstance(reviewed, dict) else {}))
        review_row["result"] = "PASS" if st_r == 200 else "FAIL"
    else:
        review_row["result"] = "FAIL"
        review_row["semantic_notes"] = ["no decision_id"]
    results["steps"].append(review_row)

    fails = [s["label"] for s in results["steps"] if s.get("result") == "FAIL"]
    results["fails"] = fails
    results["ready"] = len(fails) == 0
    OUT.write_text(json.dumps(results, indent=2, ensure_ascii=True), encoding="utf-8")
    print("WROTE", OUT)
    print("FAILS", fails)
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
