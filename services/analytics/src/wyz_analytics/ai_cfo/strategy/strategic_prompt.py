"""Compact strategic judgment prompt for GPT-OSS / OpenAI-compatible providers."""

from __future__ import annotations

import json
from typing import Any

# Minimal system prompt — judgment only, Python composes founder-facing prose.
STRATEGIC_JUDGMENT_SYSTEM_PROMPT = """You are a strategic finance partner. Choose ONE action from allowed_actions.

Rules:
1. action must be in allowed_actions; never use forbidden_actions
2. evidence IDs must come from evidence_catalog only
3. no financial numbers in any field
4. use decision.theme reasoning_dimensions and decision_evidence groups
5. pick unknowns from supplied list matching the decision theme
6. use position_key / primary_reason_key / change_my_view_keys from allowed lists
7. for PRIORITIZE: set priority_candidate_id to one candidate_id from prioritize_candidates
8. sensitivity is not a forecast; return JSON only

Schema:
{"action":"EXPERIMENT","strength":"MODERATE","confidence":"MEDIUM","evidence":["id1"],"position_key":"controlled_reduction_test","primary_reason_key":"cm2_pressure_material","unknowns":["DEMAND_RESPONSE"],"change_my_view_keys":["demand_deteriorates_during_reduction"],"priority_candidate_id":"priority:marketing","next":"EXPERIMENT","monitor":["net_revenue","cm2_pct"]}

Optional: "reason" (<=20 words, number-free). Prefer keys over long prose."""


def compact_strategic_context(model_input: dict[str, Any]) -> dict[str, Any]:
    """Trim provider payload to decision essentials."""
    diagnosis = model_input.get("diagnosis") if isinstance(model_input.get("diagnosis"), dict) else {}
    decision = model_input.get("decision") if isinstance(model_input.get("decision"), dict) else {}
    catalog = []
    for item in model_input.get("evidence_catalog") or []:
        if not isinstance(item, dict):
            continue
        catalog.append(
            {
                "id": item.get("evidence_id"),
                "role": item.get("semantic_role"),
                "metric": item.get("metric_label_or_key"),
            }
        )
    payload: dict[str, Any] = {
        "allowed_actions": model_input.get("allowed_actions") or [],
        "forbidden_actions": model_input.get("forbidden_actions") or [],
        "unknowns": model_input.get("unknowns") or [],
        "decision_confidence_ceiling": model_input.get("decision_confidence_ceiling"),
        "decision": decision,
        "decision_evidence": model_input.get("decision_evidence"),
        "diagnosis": {
            "insight": diagnosis.get("insight_type"),
            "driver": diagnosis.get("driver_stage"),
            "confidence": diagnosis.get("diagnosis_confidence"),
            "persistence": diagnosis.get("temporal_persistence"),
            "conflicts": diagnosis.get("conflicts") or [],
        },
        "evidence_catalog": catalog[:16],
        "scenario_refs": model_input.get("scenario_refs") or [],
    }
    # Phase 2D RECONSIDER — prior position + mechanical scenario evidence (no ₹ values).
    if model_input.get("prior_position"):
        payload["prior_position"] = model_input["prior_position"]
    if model_input.get("new_evidence"):
        payload["new_evidence"] = model_input["new_evidence"]
    elif model_input.get("scenario_context"):
        payload["new_evidence"] = model_input["scenario_context"]
    if model_input.get("conversation_context"):
        payload["conversation_context"] = {
            "followup_type": (model_input["conversation_context"] or {}).get("followup_type"),
            "previous_action": (model_input["conversation_context"] or {}).get("previous_action"),
            "previous_strength": (model_input["conversation_context"] or {}).get("previous_strength"),
            "previous_confidence": (model_input["conversation_context"] or {}).get("previous_confidence"),
            "thread_id": (model_input["conversation_context"] or {}).get("thread_id"),
        }
    return payload


def build_strategic_user_message(*, message: str, model_input: dict[str, Any]) -> str:
    """Compact JSON user payload — no pretty-print, no raw financial rows."""
    payload = {
        "question": str(message or "")[:300],
        "ctx": compact_strategic_context(model_input),
    }
    if (model_input.get("conversation_context") or {}).get("followup_type") == "RECONSIDER":
        payload["task"] = (
            "RECONSIDER: compare prior_position with new_evidence (mechanical scenario only). "
            "Decide MAINTAIN/STRENGTHEN/WEAKEN/CHANGE via action+strength choice. "
            "Sensitivity is not demand forecast; keep DEMAND_RESPONSE when relevant."
        )
    return json.dumps(payload, separators=(",", ":"), default=str)


def strategic_prompt_char_counts(*, message: str, model_input: dict[str, Any]) -> dict[str, int]:
    return {
        "system_chars": len(STRATEGIC_JUDGMENT_SYSTEM_PROMPT),
        "user_chars": len(build_strategic_user_message(message=message, model_input=model_input)),
    }
