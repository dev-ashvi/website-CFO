"""Bounded AI CFO conversation context for V1 follow-ups.

UI filters remain the authoritative financial scope. Previous turns never
override current_scope. Evidence IDs from a different scope_hash cannot ground
the current answer.
"""

from __future__ import annotations

import uuid
from typing import Any

MAX_PREVIOUS_TURNS = 4


def previous_turns_from_client_payload(body: dict[str, Any] | None) -> list[dict[str, Any]] | None:
    """Normalize client conversation payload into previous_turns for follow-ups.

    The SPA echoes a conversation shell with `scenario_spec` on the object itself and
    often without `previous_turns`. Promote that shell into a prior turn so scenario
    anaphora / strategic context can resolve safely.
    """
    if not isinstance(body, dict):
        return None
    conv = body.get("conversation") if isinstance(body.get("conversation"), dict) else {}
    if isinstance(body.get("previous_turns"), list):
        turns: list[Any] = list(body.get("previous_turns") or [])
    elif isinstance(conv.get("previous_turns"), list):
        turns = list(conv.get("previous_turns") or [])
    else:
        turns = []

    has_scenario = any(
        isinstance(t, dict) and isinstance(t.get("scenario_spec"), dict) and t.get("scenario_spec", {}).get("changes")
        for t in turns
    )
    shell_spec = conv.get("scenario_spec")
    if (
        not has_scenario
        and isinstance(shell_spec, dict)
        and shell_spec.get("changes")
    ):
        turns.append(
            {
                "question": str(conv.get("question") or "")[:500],
                "scope_hash": str(conv.get("scope_hash") or shell_spec.get("scope_hash") or ""),
                "same_scope": True,
                "intent": conv.get("intent"),
                "insight_type": conv.get("insight_type"),
                "driver_stage": conv.get("driver_stage"),
                "dimension": conv.get("dimension"),
                "rank_direction": conv.get("rank_direction"),
                "rank_metric": conv.get("rank_metric"),
                "selected_entities": conv.get("selected_entities") or [],
                "selected_evidence_ids": conv.get("selected_evidence_ids") or [],
                "scenario_spec": shell_spec,
                "signal_context": conv.get("signal_context"),
                "strategic": conv.get("strategic"),
                "strategic_thread": conv.get("strategic_thread"),
            }
        )
    return turns or None


def build_conversation_context(
    *,
    current_scope: dict[str, Any],
    conversation_id: str | None = None,
    previous_turns: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    cid = str(conversation_id or "").strip() or str(uuid.uuid4())
    current_hash = str(current_scope.get("scope_hash") or "")
    cleaned: list[dict[str, Any]] = []
    for raw in list(previous_turns or [])[-MAX_PREVIOUS_TURNS:]:
        if not isinstance(raw, dict):
            continue
        turn_hash = str(raw.get("scope_hash") or "")
        same_scope = bool(turn_hash and turn_hash == current_hash)
        evidence_ids = [str(item) for item in (raw.get("selected_evidence_ids") or []) if str(item)][:3]
        entities = [str(item) for item in (raw.get("selected_entities") or []) if str(item)][:8]
        signal_context = None
        raw_signal = raw.get("signal_context")
        if isinstance(raw_signal, dict):
            signal_context = {
                "signal_id": str(raw_signal.get("signal_id") or "")[:80] or None,
                "signal_type": str(raw_signal.get("signal_type") or "")[:80] or None,
                "entity": str(raw_signal.get("entity") or "")[:120] or None,
                "dimension": str(raw_signal.get("dimension") or "")[:40] or None,
                "stage": str(raw_signal.get("stage") or "")[:40] or None,
                "economic_role": str(raw_signal.get("economic_role") or "")[:80] or None,
                "scope_hash": str(raw_signal.get("scope_hash") or "")[:80] or None,
                "label": str(raw_signal.get("label") or "")[:200] or None,
                "dataset_id": str(raw_signal.get("dataset_id") or "")[:120] or None,
            }
            # Never persist evidence / filters / numeric payloads on conversation turns.
            for banned in ("evidence", "filters", "materiality", "caveats", "cm2", "net_revenue"):
                signal_context.pop(banned, None)
        cleaned.append(
            {
                "question": str(raw.get("question") or "")[:500],
                "scope_hash": turn_hash or None,
                "same_scope": same_scope,
                "intent": raw.get("intent"),
                "insight_type": raw.get("insight_type"),
                "driver_stage": raw.get("driver_stage"),
                "dimension": raw.get("dimension"),
                "rank_direction": raw.get("rank_direction"),
                "rank_metric": raw.get("rank_metric"),
                "selected_entities": entities if same_scope else [],
                "selected_evidence_ids": evidence_ids if same_scope else [],
                # Bounded scenario context (separate from financial evidence).
                "scenario_spec": (raw.get("scenario_spec") if same_scope else None),
                # Topic metadata only; grounding gated by same_scope in resolve_signal_context.
                "signal_context": signal_context,
                # Phase 2A lean strategic memory — historical only when cross-scope.
                "strategic": (
                    _lean_strategic_turn(raw.get("strategic"), same_scope=same_scope)
                    if raw.get("strategic") is not None
                    else None
                ),
                # Phase 2D decision thread — status HISTORICAL when cross-scope.
                "strategic_thread": _lean_strategic_thread(
                    raw.get("strategic_thread"), same_scope=same_scope
                ),
            }
        )
    return {
        "conversation_id": cid,
        "turn_id": f"t{len(cleaned) + 1}",
        "current_scope": {
            "dataset_id": current_scope.get("dataset_id"),
            "filters": current_scope.get("filters") or {},
            "scope_hash": current_hash,
        },
        "current_scope_hash": current_hash,
        "previous_turns": cleaned,
    }


def _lean_strategic_turn(raw: Any, *, same_scope: bool) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    # Cross-scope: keep historical markers only; cannot ground current recommendation.
    return {
        "decision_type": raw.get("decision_type"),
        "decision_theme": raw.get("decision_theme"),
        "subject": raw.get("subject") if same_scope else None,
        "prior_recommendation_action": raw.get("prior_recommendation_action") if same_scope else None,
        "recommendation_strength": raw.get("recommendation_strength") if same_scope else None,
        "diagnosis_confidence": raw.get("diagnosis_confidence") if same_scope else None,
        "decision_confidence": raw.get("decision_confidence") if same_scope else None,
        "scenario_ref_digest": raw.get("scenario_ref_digest") if same_scope else None,
        "unknowns": list(raw.get("unknowns") or [])[:6] if same_scope else [],
        "scope_hash": raw.get("scope_hash"),
        "historical_only": not same_scope,
    }


def _lean_strategic_thread(raw: Any, *, same_scope: bool) -> dict[str, Any] | None:
    """Persist lean StrategicDecisionThread; never promote cross-scope to ACTIVE."""
    if not isinstance(raw, dict) or not raw.get("thread_id"):
        return None
    from wyz_analytics.ai_cfo.strategy.thread import StrategicDecisionThread, ThreadStatus

    thread = StrategicDecisionThread.from_dict(raw)
    if thread is None:
        return None
    if not same_scope:
        thread.status = ThreadStatus.HISTORICAL
        thread.latest_scenario_ref = None
        thread.supporting_evidence_ids = []
        thread.monitoring_metric_keys = []
        thread.change_my_view_keys = []
        # Keep theme markers only — no grounding fields.
        thread.selected_action = None
        thread.current_position = None
        thread.decision_confidence = None
        thread.recommendation_strength = None
    return thread.to_lean_dict()


def history_for_model(conversation: dict[str, Any]) -> list[dict[str, Any]]:
    """Compact prior-turn summaries. No numeric values, no cross-scope evidence IDs."""
    history: list[dict[str, Any]] = []
    for turn in conversation.get("previous_turns") or []:
        history.append(
            {
                "question": turn.get("question"),
                "same_scope": bool(turn.get("same_scope")),
                "intent": turn.get("intent"),
                "insight_type": turn.get("insight_type"),
                "driver_stage": turn.get("driver_stage"),
                "dimension": turn.get("dimension"),
                "rank_direction": turn.get("rank_direction"),
                "selected_entities": list(turn.get("selected_entities") or []),
                "signal_topic": (
                    {
                        "signal_type": (turn.get("signal_context") or {}).get("signal_type"),
                        "entity": (turn.get("signal_context") or {}).get("entity"),
                        "dimension": (turn.get("signal_context") or {}).get("dimension"),
                        "stage": (turn.get("signal_context") or {}).get("stage"),
                        "label": (turn.get("signal_context") or {}).get("label"),
                    }
                    if turn.get("same_scope") and turn.get("signal_context")
                    else None
                ),
                "strategic": (
                    {
                        "decision_type": (turn.get("strategic") or {}).get("decision_type"),
                        "historical_only": bool((turn.get("strategic") or {}).get("historical_only")),
                    }
                    if turn.get("strategic")
                    else None
                ),
            }
        )
    return history


def selected_entities_from_answer(answer: dict[str, Any]) -> list[str]:
    entities: list[str] = []
    seen: set[str] = set()
    for item in answer.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        scope = item.get("scope") or {}
        value = item.get("entity") or scope.get("dimension_value")
        if value in (None, ""):
            continue
        text = str(value)
        if text in seen:
            continue
        seen.add(text)
        entities.append(text)
        if len(entities) >= 8:
            break
    return entities


def selected_evidence_ids_from_answer(answer: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    for item in answer.get("evidence") or []:
        if isinstance(item, dict) and item.get("evidence_id"):
            ids.append(str(item["evidence_id"]))
        if len(ids) >= 3:
            break
    return ids
