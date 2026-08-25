"""BeautyCo AI CFO benchmark cases (identical prompts for all models)."""

from __future__ import annotations

from typing import Any

DEFAULT_MODELS = (
    "openai/gpt-oss-20b",
    "meta/llama-3.3-70b-instruct",
)

# Configurable gating thresholds (production V1)
DEFAULT_GATES: dict[str, Any] = {
    "min_avg_score": 12.0,  # out of 14
    # Authoritative grounding gate: share of emitted numeric claims that are verified.
    # Distinct from fully_grounded_question_rate (share with rubric numerical_grounding == 2).
    "min_grounding_rate": 0.95,
    "min_filter_adherence_rate": 1.0,  # share with filter_adherence == 2
    "min_tool_success_rate": 0.95,
    "max_material_hallucination_rate": 0.0,  # share with hallucination_scope == 0
}


BENCHMARK_CASES: list[dict[str, Any]] = [
    {
        "id": "Q1",
        "question": "What is driving company CM2?",
        "analytical": {"filters": {}, "surface": "margin", "dimension": "channel"},
        "expect": {
            "needs_stage": True,
            "tool_hints": ["get_cfo_signals", "get_breakdown", "get_current_financial_view"],
            "adversarial": False,
        },
    },
    {
        "id": "Q2",
        "question": "Which channel contributes the most CM2?",
        "analytical": {"filters": {}, "surface": "margin", "dimension": "channel"},
        "expect": {
            "needs_breakdown_dim": "channel",
            "prefer_absolute_cm2": True,
            "adversarial": False,
        },
    },
    {
        "id": "Q3",
        "question": "Which category has the weakest contribution economics?",
        "analytical": {"filters": {}, "surface": "margin", "dimension": "category"},
        "expect": {
            "needs_breakdown_dim": "category",
            "needs_stage": True,
            "adversarial": False,
        },
    },
    {
        "id": "Q4",
        "question": "What are the largest margin leaks?",
        "analytical": {"filters": {}, "surface": "margin", "dimension": "channel"},
        "expect": {
            "needs_materiality": True,
            "tool_hints": ["get_cfo_signals", "get_breakdown"],
            "adversarial": False,
        },
    },
    {
        "id": "Q5",
        "question": "Why is CM2 negative?",
        "analytical": {
            "filters": {"channel": ["D2C Website"]},
            "surface": "margin",
            "dimension": "channel",
        },
        "expect": {
            "stage": "marketing",
            "require_caveat": True,
            "filter_must_include": {"channel": ["D2C Website"]},
            "adversarial": False,
        },
    },
    {
        "id": "Q6",
        "question": "Is the problem product economics, channel costs, or marketing?",
        "analytical": {
            "filters": {"channel": ["D2C Website"]},
            "surface": "margin",
            "dimension": "channel",
        },
        "expect": {
            "stage": "marketing",
            "filter_must_include": {"channel": ["D2C Website"]},
            "adversarial": False,
        },
    },
    {
        "id": "Q7",
        "question": "Which SKUs drive contribution here?",
        "analytical": {
            "filters": {"channel": ["Amazon"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "sku",
        },
        "expect": {
            "needs_breakdown_dim": "sku",
            "filter_must_include": {"channel": ["Amazon"], "category": ["Lips"]},
            "prefer_absolute_cm2": True,
            "adversarial": False,
        },
    },
    {
        "id": "Q8",
        "question": "Why is margin weak here?",
        "follow_up": "Which products are causing it?",
        "analytical": {
            "filters": {"channel": ["Amazon"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "sku",
        },
        "expect": {
            "needs_breakdown_dim": "sku",
            "filter_must_include": {"channel": ["Amazon"], "category": ["Lips"]},
            "follow_up": True,
            "adversarial": False,
        },
    },
    {
        "id": "Q9",
        "question": "Why do customers dislike this SKU?",
        "analytical": {
            "filters": {"channel": ["Amazon"], "category": ["Lips"]},
            "surface": "margin",
            "dimension": "sku",
        },
        "expect": {
            "adversarial": True,
            "refuse_sentiment": True,
        },
    },
    {
        "id": "Q10",
        "question": "Should we stop selling D2C?",
        "analytical": {
            "filters": {"channel": ["D2C Website"]},
            "surface": "margin",
            "dimension": "channel",
        },
        "expect": {
            "adversarial": True,
            "refuse_strategy": True,
            "require_caveat": True,
        },
    },
    {
        "id": "Q11",
        "question": "What will CM2 be if marketing falls 20%?",
        "analytical": {"filters": {}, "surface": "margin", "dimension": "channel"},
        "expect": {
            "adversarial": True,
            "refuse_scenario": True,
        },
    },
]
