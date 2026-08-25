"""Shared system prompt and OpenAI-compatible tool schemas for AI CFO."""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = """You are WYZ AI CFO — a read-only financial interpretation assistant.

Rules:
- Interpret verified financial facts and CFO signals. Never invent or recalculate GM, CM1, CM2, or other totals.
- Use only the provided tools for additional breakdowns, trends, or signals.
- Preserve the active filter scope unless the user explicitly asks for a valid comparison.
- Prefer absolute contribution (₹) over percentages when ranking contributors.
- Distinguish product economics (GM), channel/fulfilment costs (CM1), and attributed marketing (CM2).
- Do not prescribe strategy, price changes, budget reallocations, or scenarios.
- Do not invent customer sentiment or unsupported causation.
- If a question requires scenario modelling or strategic recommendation, refuse and explain that AI CFO V1 is read-only interpretation only.

You do NOT write financial numbers, evidence objects, units, headlines, or interpretation prose.
Python composes the final CFO answer from the EvidenceEnvelope using your controlled semantic selection.

CONTROLLED SEMANTIC OUTPUT — return ONLY this JSON object, nothing else:
{
  "driver_stage": "PRODUCT | CHANNEL | MARKETING | REVENUE_QUALITY | MIXED | UNKNOWN",
  "insight_type": "CONTRIBUTION_LEADER | CONTRIBUTION_LAGGARD | MARGIN_PRESSURE | NEGATIVE_CONTRIBUTOR | PRODUCT_COST_PRESSURE | CHANNEL_COST_PRESSURE | MARKETING_PRESSURE | REVENUE_QUALITY_PRESSURE | POSITIVE_CM1_NEGATIVE_CM2 | GROWTH_DRIVER | GROWTH_WITH_MARGIN_COMPRESSION | MIXED_ECONOMICS | NEUTRAL_OBSERVATION | INSUFFICIENT_EVIDENCE",
  "evidence_ids": ["id-from-EvidenceEnvelope-1", "id-from-EvidenceEnvelope-2"]
}

Optional fields (only if useful):
{
  "comparison_type": "short label",
  "confidence": "HIGH | MEDIUM | LOW"
}

Constraints:
- evidence_ids MUST be copied from the EvidenceEnvelope ids provided in context.
- Select at most 3 evidence_ids.
- insight_type MUST be supported by the selected evidence roles/signals.
- TOP_CONTRIBUTOR alone supports CONTRIBUTION_LEADER — not MARGIN_PRESSURE or MARKETING_PRESSURE.
- COST_CONCENTRATION alone does not imply weak economics / MARGIN_PRESSURE.
- Do NOT emit interpretation, headline, evidence values, digits, currency, or percentages.
- Do not invent evidence_ids, metrics, values, or dimensions.
"""

# Deprecated debug path: free-form interpretation prose (WYZ_AI_CFO_ANSWER_MODE=semantic_prose).
SEMANTIC_PROSE_SYSTEM_PROMPT = """You are WYZ AI CFO — a read-only financial interpretation assistant.

Rules:
- Interpret verified financial facts and CFO signals. Never invent or recalculate GM, CM1, CM2, or other totals.
- Use only the provided tools for additional breakdowns, trends, or signals.
- Preserve the active filter scope unless the user explicitly asks for a valid comparison.
- Prefer absolute contribution (₹) over percentages when ranking contributors.
- Distinguish product economics (GM), channel/fulfilment costs (CM1), and attributed marketing (CM2).
- Do not prescribe strategy, price changes, budget reallocations, or scenarios.
- Do not invent customer sentiment or unsupported causation.

You do NOT write financial numbers, evidence objects, units, or headlines.
Python will compose the final CFO answer from the EvidenceEnvelope using your semantic selection.

SEMANTIC OUTPUT CONTRACT — return ONLY this JSON object, nothing else:
{
  "driver_stage": "PRODUCT | CHANNEL | MARKETING | REVENUE_QUALITY | MIXED | UNKNOWN",
  "evidence_ids": ["id-from-EvidenceEnvelope-1", "id-from-EvidenceEnvelope-2"],
  "interpretation": "short evidence-grounded interpretation with NO numbers"
}

Constraints:
- evidence_ids MUST be copied from the EvidenceEnvelope ids provided in context.
- Select at most 3 evidence_ids.
- interpretation must contain NO digits / currency / percentages.
- Do not invent evidence_ids, metrics, values, or dimensions.
"""

# Deprecated: full structured answer contract (WYZ_AI_CFO_ANSWER_MODE=legacy_full_answer).
LEGACY_FULL_ANSWER_SYSTEM_PROMPT = """You are WYZ AI CFO — a read-only financial interpretation assistant.

Rules:
- Interpret verified financial facts and CFO signals. Never invent or recalculate GM, CM1, CM2, or other totals.
- Use only the provided tools for additional breakdowns, trends, or signals.
- Preserve the active filter scope unless the user explicitly asks for a valid comparison.
- Prefer absolute contribution (₹) over percentages when ranking contributors.
- Distinguish product economics (GM), channel/fulfilment costs (CM1), and attributed marketing (CM2).
- Mention the attributed-marketing caveat only when it materially affects the interpretation.
- Do not prescribe strategy, price changes, budget reallocations, or scenarios.
- Do not invent customer sentiment or unsupported causation.
- If a question requires scenario modelling or strategic recommendation, refuse and explain that AI CFO V1 is read-only interpretation only.

CLAIM BUDGET (strictly enforced):
- Return AT MOST 3 evidence items in "evidence".
- The TOTAL number of distinct numeric values across the ENTIRE response (evidence + headline + interpretation + caveat) must not exceed 3.
- Do NOT repeat numeric values from evidence[] in headline, interpretation, or caveat. Refer to metrics by name only in prose sections.
- If you need to highlight more than 3 metrics, pick the 3 most material ones.

Final answer format — return ONLY this JSON object, nothing else:
{
  "headline": "one concise CFO conclusion (no numbers here if already in evidence)",
  "evidence": [
    {
      "evidence_id": "id from EvidenceEnvelope when available",
      "metric": "metric name",
      "value": 123.45,
      "unit": "INR | PCT | COUNT",
      "scope": {"dimension": "channel", "dimension_value": "Amazon"},
      "interpretation": "short evidence interpretation"
    }
  ],
  "driver_stage": "PRODUCT | CHANNEL | MARKETING | REVENUE_QUALITY | MIXED | UNKNOWN",
  "interpretation": "what the verified evidence means — no numbers, no unsupported causality",
  "caveat": "optional, only when materially relevant — no numbers"
}
"""

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_current_financial_view",
            "description": "Return the verified filtered financial summary for the current analytical context.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_breakdown",
            "description": (
                "Return a grouped breakdown under the current active filters. "
                "Use for channel/category/sku contribution analysis."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dimension": {
                        "type": "string",
                        "enum": [
                            "channel",
                            "category",
                            "subcategory",
                            "sku",
                            "region",
                            "platform",
                            "month",
                        ],
                        "description": "Grouping dimension.",
                    },
                    "metrics": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional allowlisted metric ids.",
                    },
                    "sort": {
                        "type": "object",
                        "properties": {
                            "metric": {"type": "string"},
                            "direction": {"type": "string", "enum": ["asc", "desc"]},
                        },
                    },
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50},
                },
                "required": ["dimension"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_trend",
            "description": "Return month-grouped metrics while preserving active business filters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "metrics": {
                        "type": "array",
                        "items": {"type": "string"},
                    }
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cfo_signals",
            "description": "Return deterministic CFO signals for the current analytical context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dimension": {
                        "type": "string",
                        "enum": ["channel", "category", "sku", "region", "platform"],
                    }
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cost_breakdown",
            "description": (
                "Return scoped Product COGS and CM1 cost component totals for the current "
                "FinancialScope only. No filter arguments — inherits active UI scope."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
]

ALLOWED_TOOL_NAMES = frozenset(item["function"]["name"] for item in TOOL_DEFINITIONS)


def compact_context_for_prompt(context: dict[str, Any]) -> dict[str, Any]:
    """Shrink Financial Intelligence Context for model input (no raw transactions)."""
    summary = context.get("summary") or {}
    keep_summary_keys = (
        "gross_revenue",
        "net_revenue",
        "orders",
        "units",
        "customers",
        "gross_aov",
        "net_aov",
        "gross_margin",
        "gross_margin_pct",
        "cm1",
        "cm1_pct",
        "allocated_marketing",
        "marketing_pct",
        "cm2",
        "cm2_pct",
        "discount_pct",
        "return_pct",
        "rto_pct",
        "revenue_realisation_pct",
    )
    signals = []
    for signal in (context.get("signals") or [])[:5]:
        signals.append(
            {
                "signal_type": signal.get("signal_type"),
                "severity": signal.get("severity"),
                "entity": signal.get("entity"),
                "label": signal.get("label"),
                "stage": signal.get("stage"),
                "evidence": signal.get("evidence"),
                "materiality": signal.get("materiality"),
            }
        )
    return {
        "meta": {
            "dataset_id": (context.get("meta") or {}).get("dataset_id"),
            "context_version": (context.get("meta") or {}).get("context_version"),
            "reconciled": (context.get("meta") or {}).get("reconciled"),
        },
        "period": context.get("period"),
        "filters": context.get("filters"),
        "scope_hash": (context.get("financial_scope") or {}).get("scope_hash") or context.get("scope_hash"),
        "surface": context.get("surface"),
        "dimension": context.get("dimension"),
        "summary": {key: summary.get(key) for key in keep_summary_keys if key in summary},
        "signals": signals,
        "caveats": context.get("caveats") or [],
        "guard": context.get("guard"),
        "forced_evidence": _compact_forced_evidence(context.get("forced_evidence")),
        "evidence_envelope": _compact_evidence_envelope(context.get("evidence_envelope")),
        "active_signal_topic": context.get("active_signal_topic"),
        "active_signal_verified": bool(context.get("active_signal_verified")),
        "signal_topic_status": (context.get("signal_context_resolution") or {}).get("source"),
    }


def _compact_forced_evidence(forced: dict[str, Any] | None) -> dict[str, Any] | None:
    if not forced:
        return None
    compact: dict[str, Any] = {}
    for tool_name, payload in forced.items():
        if not isinstance(payload, dict):
            continue
        if tool_name == "get_breakdown":
            rows = payload.get("rows") or []
            compact[tool_name] = {"row_count": len(rows), "rows": rows[:8]}
        elif tool_name == "get_trend":
            rows = payload.get("rows") or []
            compact[tool_name] = {"row_count": len(rows), "rows": rows[:6]}
        elif tool_name == "get_cfo_signals":
            highlighted = payload.get("highlighted") or []
            compact[tool_name] = {"signal_count": len(highlighted), "highlighted": highlighted[:5]}
        elif tool_name == "get_cost_breakdown":
            recon = payload.get("reconciliation") or {}
            compact[tool_name] = {
                "available": payload.get("available"),
                "reconciliation_status": recon.get("status"),
                "scope_hash": payload.get("scope_hash"),
            }
        else:
            compact[tool_name] = {"summary": payload.get("summary")}
    return compact or None


def _compact_evidence_envelope(envelope: dict[str, Any] | None) -> dict[str, Any] | None:
    if not envelope:
        return None
    compact = {
        "current_scope": envelope.get("current_scope"),
        "scope_hash": envelope.get("scope_hash"),
        "allowed_metrics": list(envelope.get("allowed_metrics") or [])[:30],
        "methodology_caveats": list(envelope.get("methodology_caveats") or [])[:6],
        "allowed_driver_stages": list(envelope.get("allowed_driver_stages") or []),
        "claim_budget": envelope.get("claim_budget"),
    }
    items = []
    for section in ("verified_facts", "verified_signals", "tool_results"):
        for item in (envelope.get(section) or [])[:40]:
            items.append(
                {
                    "evidence_id": item.get("evidence_id"),
                    "metric": item.get("metric"),
                    "value": item.get("value"),
                    "unit": item.get("unit"),
                    "scope": item.get("scope"),
                    "source": item.get("source"),
                    "semantic_roles": item.get("semantic_roles") or [],
                    "signal_type": item.get("signal_type"),
                    "stage": item.get("stage"),
                    "entity": item.get("entity"),
                }
            )
    compact["evidence_items"] = items[:60]
    return compact


def build_user_message(message: str, context: dict[str, Any], history: list[dict[str, str]] | None = None) -> str:
    import json

    payload = {
        "question": message,
        "current_view": compact_context_for_prompt(context),
    }
    if context.get("active_signal_topic"):
        payload["active_signal_topic"] = context.get("active_signal_topic")
        payload["signal_topic_note"] = (
            "Topic metadata only. Financial facts must come from current_view / EvidenceEnvelope. "
            "If active_signal_verified is false, do not treat the topic as verified evidence."
        )
        payload["active_signal_verified"] = bool(context.get("active_signal_verified"))
    if history:
        payload["prior_turns"] = history[-4:]
    return json.dumps(payload, default=str)
