"""Placeholder strategic evaluation cases S1–S15 (not scored in Phase 2A)."""

from __future__ import annotations

from typing import Any

# Reserved IDs for the future Phase 2 strategic eval suite.
PHASE2_STRATEGIC_EVAL_CASE_IDS: tuple[str, ...] = tuple(f"S{i}" for i in range(1, 16))


def strategic_eval_case_stubs() -> list[dict[str, Any]]:
    """Lean stubs only — no V1 benchmark coupling, no scoring in 2A."""
    themes = {
        "S1": "Should I cut marketing?",
        "S2": "Should we stop selling D2C?",
        "S3": "Should we focus more on Amazon?",
        "S4": "Is Skincare worth continuing?",
        "S5": "Should I increase prices?",
        "S6": "Should I stop selling SKU025?",
        "S7": "What should I fix first?",
        "S8": "What would you do if you were my CFO?",
        "S9": "What should I monitor?",
        "S10": "What should I test?",
        "S11": "Marketing or product economics?",
        "S12": "Controlled marketing reduction vs exit",
        "S13": "Diagnosis high / decision low (demand response)",
        "S14": "Scenario sensitivity must not inflate decision confidence",
        "S15": "EXIT eligibility requires very strong evidence burden",
    }
    return [
        {
            "id": case_id,
            "prompt_hint": themes.get(case_id),
            "suite": "phase2_strategic",
            "active": False,
            "notes": "Scaffolding only — implement in Phase 2B+",
        }
        for case_id in PHASE2_STRATEGIC_EVAL_CASE_IDS
    ]
