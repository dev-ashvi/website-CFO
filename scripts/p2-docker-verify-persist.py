#!/usr/bin/env python3
"""Verify P2 persistence after compose restart (reads .p2-acceptance-ids.json)."""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

BASE = os.environ.get("WYZ_P2_BASE", "http://127.0.0.1:8788/api/v1/analytics").rstrip("/")
IDS = Path("services/analytics/.p2-acceptance-ids.json")


def get(path: str):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    ids = json.loads(IDS.read_text(encoding="utf-8"))
    ds = ids["dataset_id"]
    record = get(f"/datasets/{ds}")
    assert record["status"] == "COMPLETED", record
    result = get(f"/datasets/{ds}/result")
    assert result.get("result_id") or result.get("job_id"), result
    decisions = get(f"/datasets/{ds}/strategic-decisions")
    decision_list = decisions.get("decisions") or decisions.get("items") or []
    if isinstance(decisions, list):
        decision_list = decisions
    decision_ids = {
        (d.get("decision") or d).get("decision_id") if isinstance(d, dict) else None for d in decision_list
    }
    # flatten
    flat = []
    for d in decision_list:
        if isinstance(d, dict) and "decision_id" in d:
            flat.append(d["decision_id"])
        elif isinstance(d, dict) and isinstance(d.get("decision"), dict):
            flat.append(d["decision"]["decision_id"])
    assert ids["decision_id"] in flat or ids["decision_id"] in decision_ids, decisions
    feedback = get(f"/datasets/{ds}/ai-feedback")
    fb_list = feedback.get("feedback") or feedback.get("items") or feedback.get("records") or []
    if isinstance(feedback, list):
        fb_list = feedback
    print("dataset", record["status"], "result", result.get("result_id"), "decisions", flat, "feedback", feedback)
    assert flat or decision_list, "missing decisions"
    assert fb_list or feedback.get("count", 0) > 0 or "feedback" in feedback, feedback
    print("PASS post-restart persistence")
    return 0


if __name__ == "__main__":
    sys.exit(main())
