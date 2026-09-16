"""Internal observability summary from optional JSONL sink (dev/pilot)."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

from wyz_analytics.observability.config import ObservabilityConfig


def summarize_jsonl(path: Path) -> dict:
    turns = 0
    fallbacks = 0
    feedback = Counter()
    themes = Counter()
    actions = Counter()
    latencies: list[int] = []
    provider_calls = 0
    if not path.is_file():
        return {"path": str(path), "exists": False}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            name = event.get("event_name")
            attrs = event.get("attributes") or {}
            if name == "ai_cfo_turn_completed":
                turns += 1
                if attrs.get("end_to_end_latency_ms") is not None:
                    latencies.append(int(attrs["end_to_end_latency_ms"]))
                if attrs.get("provider_calls"):
                    provider_calls += int(attrs["provider_calls"])
                if attrs.get("decision_theme"):
                    themes[str(attrs["decision_theme"])] += 1
                if attrs.get("final_selected_action"):
                    actions[str(attrs["final_selected_action"])] += 1
            elif name == "ai_strategic_fallback_used":
                fallbacks += 1
            elif name == "ai_answer_feedback_submitted":
                feedback[str(attrs.get("rating") or "UNKNOWN")] += 1
    latencies.sort()
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else None
    avg = int(sum(latencies) / len(latencies)) if latencies else None
    return {
        "path": str(path),
        "exists": True,
        "ai_turns": turns,
        "provider_calls": provider_calls,
        "fallback_count": fallbacks,
        "fallback_rate": (fallbacks / turns) if turns else 0.0,
        "latency_avg_ms": avg,
        "latency_p95_ms": p95,
        "feedback": dict(feedback),
        "decision_themes": dict(themes),
        "selected_actions": dict(actions),
    }


def main() -> None:
    cfg = ObservabilityConfig.from_env()
    path = cfg.file_path
    if path is None:
        print("No WYZ_OBSERVABILITY_FILE_PATH configured.", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(summarize_jsonl(path), indent=2))


if __name__ == "__main__":
    main()
