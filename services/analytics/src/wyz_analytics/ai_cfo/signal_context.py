"""Signal → AI CFO topic context (Phase 1B).

SignalContext is TOPIC METADATA only.
It never overrides FinancialScope / analytical.filters.
It never injects client-supplied financial values as evidence.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

ALLOWED_DIMENSIONS = frozenset({"channel", "category", "sku"})
MAX_STR = 200
SCOPE_HASH_RE = re.compile(r"^scope_[0-9a-f]{8,64}$", re.I)

SOURCE_CURRENT_SIGNAL = "CURRENT_SIGNAL"
SOURCE_CONVERSATION = "CONVERSATION"
SOURCE_STALE_DROPPED = "STALE_DROPPED"
SOURCE_INVALID = "INVALID"
SOURCE_NONE = "NONE"

TOPIC_KEYS = (
    "signal_type",
    "entity",
    "dimension",
    "stage",
    "economic_role",
    "label",
)

FORBIDDEN_PAYLOAD_KEYS = frozenset(
    {
        "evidence",
        "filters",
        "materiality",
        "caveats",
        "severity",
        "cm2",
        "cm2_pct",
        "cm1",
        "cm1_pct",
        "net_revenue",
        "rows",
        "summary",
    }
)


def build_signal_id(
    *,
    dataset_id: str,
    scope_hash: str,
    signal_type: str,
    dimension: str,
    entity: str,
) -> str:
    raw = "|".join(
        [
            str(dataset_id or "").strip(),
            str(scope_hash or "").strip(),
            str(signal_type or "").strip(),
            str(dimension or "").strip(),
            str(entity or "").strip(),
        ]
    )
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return f"sig_{digest[:16]}"


def _clip(value: Any, max_len: int = MAX_STR) -> str:
    return str(value or "").strip()[:max_len]


def _lean_topic(fields: dict[str, Any]) -> dict[str, Any]:
    return {key: fields.get(key) for key in TOPIC_KEYS}


def _strip_forbidden(raw: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in raw.items() if key not in FORBIDDEN_PAYLOAD_KEYS}


def match_verified_signal(
    topic: dict[str, Any] | None,
    verified_signals: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    if not topic:
        return None
    want_type = str(topic.get("signal_type") or "")
    want_entity = str(topic.get("entity") or "")
    want_dim = str(topic.get("dimension") or "")
    for signal in verified_signals or []:
        if not isinstance(signal, dict):
            continue
        if str(signal.get("signal_type") or "") != want_type:
            continue
        if str(signal.get("entity") or "") != want_entity:
            continue
        dim = str(signal.get("entity_type") or signal.get("dimension") or "")
        if dim != want_dim:
            continue
        return signal
    return None


def _parse_raw_signal_context(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    cleaned = _strip_forbidden(raw)
    dataset_id = _clip(cleaned.get("dataset_id"), 120)
    scope_hash = _clip(cleaned.get("scope_hash"), 80)
    signal_type = _clip(cleaned.get("signal_type"), 80)
    entity = _clip(cleaned.get("entity"), 120)
    dimension = _clip(cleaned.get("dimension") or cleaned.get("entity_type"), 40).lower()
    stage = _clip(cleaned.get("stage"), 40) or None
    label = _clip(cleaned.get("label"), MAX_STR) or None
    economic_role = _clip(cleaned.get("economic_role") or signal_type, 80) or signal_type

    if not dataset_id or not scope_hash or not signal_type or not entity or not dimension:
        return None
    if dimension not in ALLOWED_DIMENSIONS:
        return None
    if not SCOPE_HASH_RE.match(scope_hash):
        return None

    signal_id = build_signal_id(
        dataset_id=dataset_id,
        scope_hash=scope_hash,
        signal_type=signal_type,
        dimension=dimension,
        entity=entity,
    )
    return {
        "signal_id": signal_id,
        "signal_type": signal_type,
        "entity": entity,
        "dimension": dimension,
        "stage": stage,
        "label": label,
        "economic_role": economic_role,
        "scope_hash": scope_hash,
        "dataset_id": dataset_id,
    }


def _inherit_from_conversation(
    previous_turns: list[dict[str, Any]] | None,
    *,
    current_scope_hash: str,
) -> dict[str, Any] | None:
    for turn in reversed(list(previous_turns or [])):
        if not isinstance(turn, dict):
            continue
        turn_hash = str(turn.get("scope_hash") or "")
        if not turn_hash or turn_hash != current_scope_hash:
            continue
        inherited = _parse_raw_signal_context(turn.get("signal_context"))
        if inherited and inherited.get("scope_hash") == current_scope_hash:
            return inherited
    return None


def resolve_signal_context(
    raw: Any,
    *,
    current_scope: dict[str, Any],
    verified_signals: list[dict[str, Any]] | None = None,
    previous_turns: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Resolve signal_context against the already-built FinancialScope.

    Call ONLY after build_financial_scope(analytical.filters).
    Never builds FinancialScope from signal.filters.
    """
    current_hash = str(current_scope.get("scope_hash") or "")
    current_dataset = str(current_scope.get("dataset_id") or "")

    empty = {
        "present": False,
        "valid": False,
        "scope_match": False,
        "source": SOURCE_NONE,
        "signal_context": None,
        "active_signal_topic": None,
        "matched_verified_signal": False,
        "verified_signal": None,
        "grounding_allowed": False,
    }

    parsed = _parse_raw_signal_context(raw)
    source = SOURCE_CURRENT_SIGNAL
    if parsed is None:
        inherited = _inherit_from_conversation(previous_turns, current_scope_hash=current_hash)
        if inherited is None:
            return empty
        parsed = inherited
        source = SOURCE_CONVERSATION

    if str(parsed.get("dataset_id") or "") != current_dataset:
        return {
            **empty,
            "present": True,
            "valid": False,
            "source": SOURCE_INVALID,
        }

    scope_match = bool(current_hash and parsed.get("scope_hash") == current_hash)
    if not scope_match:
        return {
            "present": True,
            "valid": True,
            "scope_match": False,
            "source": SOURCE_STALE_DROPPED,
            "signal_context": parsed,
            "active_signal_topic": None,
            "matched_verified_signal": False,
            "verified_signal": None,
            "grounding_allowed": False,
        }

    matched = match_verified_signal(parsed, verified_signals)
    topic = _lean_topic(parsed)
    return {
        "present": True,
        "valid": True,
        "scope_match": True,
        "source": source,
        "signal_context": parsed,
        "active_signal_topic": topic,
        "matched_verified_signal": matched is not None,
        "verified_signal": (
            {
                "signal_type": matched.get("signal_type"),
                "entity": matched.get("entity"),
                "entity_type": matched.get("entity_type"),
                "stage": matched.get("stage"),
                "label": matched.get("label"),
            }
            if matched
            else None
        ),
        "grounding_allowed": matched is not None,
    }


def lean_signal_context_for_conversation(resolved: dict[str, Any] | None) -> dict[str, Any] | None:
    """Store only topic identity on conversation turns — never evidence."""
    if not resolved or not resolved.get("valid"):
        return None
    if not resolved.get("scope_match"):
        # Do not carry stale context forward as active inheritance seed.
        return None
    ctx = resolved.get("signal_context")
    if not isinstance(ctx, dict):
        return None
    return {
        "signal_id": ctx.get("signal_id"),
        "signal_type": ctx.get("signal_type"),
        "entity": ctx.get("entity"),
        "dimension": ctx.get("dimension"),
        "stage": ctx.get("stage"),
        "economic_role": ctx.get("economic_role"),
        "scope_hash": ctx.get("scope_hash"),
        "label": ctx.get("label"),
        "dataset_id": ctx.get("dataset_id"),
    }


def signal_context_telemetry(resolved: dict[str, Any] | None) -> dict[str, Any]:
    resolved = resolved or {}
    ctx = resolved.get("signal_context") or {}
    return {
        "signal_context_present": bool(resolved.get("present")),
        "signal_context_valid": bool(resolved.get("valid")),
        "signal_context_scope_match": bool(resolved.get("scope_match")),
        "signal_id": ctx.get("signal_id"),
        "signal_type": ctx.get("signal_type"),
        "signal_dimension": ctx.get("dimension"),
        "signal_entity": ctx.get("entity"),
        "signal_stage": ctx.get("stage"),
        "signal_context_source": resolved.get("source") or SOURCE_NONE,
        "signal_context_verified_match": bool(resolved.get("matched_verified_signal")),
    }
