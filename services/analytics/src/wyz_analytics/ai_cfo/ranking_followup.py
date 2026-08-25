"""Deterministic ranking answers (top / weakest) from scoped get_breakdown."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.answer_composer import compose_cfo_answer
from wyz_analytics.ai_cfo.evidence.envelope import build_evidence_envelope
from wyz_analytics.ai_cfo.followup import FollowUpResolution, RankDirection
from wyz_analytics.ai_cfo.presentation import dedupe_evidence_items, present_evidence_item
from wyz_analytics.ai_cfo.semantic_contract import InsightType


def _pick_ranked_rows(
    payload: dict[str, Any],
    *,
    metric: str,
    direction: RankDirection,
    limit: int = 3,
) -> list[dict[str, Any]]:
    rows = [row for row in (payload.get("rows") or []) if isinstance(row, dict)]
    if not rows:
        return []
    reverse = direction == RankDirection.BEST
    try:
        ranked = sorted(rows, key=lambda row: float(row.get(metric) or 0), reverse=reverse)
    except (TypeError, ValueError):
        ranked = rows
    return ranked[:limit]


def _row_entity(row: dict[str, Any], dimension: str) -> str | None:
    if dimension in row and row.get(dimension) not in (None, ""):
        return str(row.get(dimension))
    for dim in ("sku", "channel", "category", "subcategory"):
        if dim in row and row.get(dim) not in (None, ""):
            return str(row.get(dim))
    return None


def _tool_evidence_for_entity(
    envelope: dict[str, Any],
    *,
    entity: str,
    metric: str,
    dimension: str,
) -> dict[str, Any] | None:
    for item in envelope.get("tool_results") or []:
        if str(item.get("metric")) != metric:
            continue
        if str(item.get("entity") or "") != entity:
            continue
        scope_dim = str((item.get("scope") or {}).get("dimension") or "")
        if scope_dim and scope_dim != dimension:
            continue
        return item
    for item in envelope.get("tool_results") or []:
        if str(item.get("entity") or "") == entity and str(item.get("metric")) == metric:
            return item
    return None


def compose_ranking_followup_answer(
    *,
    resolution: FollowUpResolution,
    tools: Any,
    context: dict[str, Any],
    message: str,
) -> dict[str, Any]:
    """Force scoped breakdown and select best/worst rows — never channel signals for SKU questions."""
    if resolution.referent_invalidated_by_scope:
        answer = compose_cfo_answer(
            semantic={
                "driver_stage": "UNKNOWN",
                "insight_type": InsightType.INSUFFICIENT_EVIDENCE.value,
                "evidence_ids": [],
            },
            envelope=context.get("evidence_envelope") or {},
            context=context,
            capability="BREAKDOWN_REQUIRED",
            message=message,
            tool_calls=[],
            answer_source="deterministic_followup",
            forced_tool=False,
        )
        answer["interpretation"] = (
            "The previous ranking referent is not valid under the current UI scope. "
            "Ask again for the active view."
        )
        answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
        answer.setdefault("telemetry", {})["intent_source"] = resolution.intent_source
        return answer

    dimension = resolution.dimension or "sku"
    metric = resolution.rank_metric or "cm2"
    direction = resolution.rank_direction or RankDirection.WORST
    sort_dir = "asc" if direction == RankDirection.WORST else "desc"
    args = {
        "dimension": dimension,
        "sort": {"metric": metric, "direction": sort_dir},
        "limit": 20,
    }
    payload = tools.get_breakdown(
        dimension=dimension,
        sort=args["sort"],
        limit=args["limit"],
    )
    tool_calls = [{"tool": "get_breakdown", "arguments": args}]
    working = dict(context)
    forced = dict(working.get("forced_evidence") or {})
    forced["get_breakdown"] = payload
    working["forced_evidence"] = forced
    # Ranking answers must not be grounded on wrong-dimension contributor signals.
    working["signals"] = [
        signal
        for signal in (working.get("signals") or [])
        if str(signal.get("entity_type") or "") == dimension
        and (
            direction != RankDirection.WORST
            or not str(signal.get("signal_type") or "").startswith("TOP_")
        )
    ]
    working["dimension"] = dimension
    working["evidence_envelope"] = build_evidence_envelope(message, working)
    envelope = working["evidence_envelope"]
    # Keep only tool rows for the requested dimension in selection pool.
    envelope["verified_signals"] = [
        item
        for item in (envelope.get("verified_signals") or [])
        if str((item.get("scope") or {}).get("dimension") or item.get("entity_type") or "") == dimension
    ]
    envelope["tool_results"] = [
        item
        for item in (envelope.get("tool_results") or [])
        if str((item.get("scope") or {}).get("dimension") or "") in {dimension, ""}
        or str(item.get("entity") or "")
    ]

    rows = _pick_ranked_rows(payload, metric=metric, direction=direction, limit=3)
    if not rows:
        answer = compose_cfo_answer(
            semantic={
                "driver_stage": "UNKNOWN",
                "insight_type": InsightType.INSUFFICIENT_EVIDENCE.value,
                "evidence_ids": [],
            },
            envelope=envelope,
            context=working,
            capability="BREAKDOWN_REQUIRED",
            message=message,
            tool_calls=tool_calls,
            answer_source="deterministic_followup",
            forced_tool=True,
        )
        answer["interpretation"] = (
            f"Verified {dimension} breakdown under the active scope does not contain enough "
            f"rows to identify the {'weakest' if direction == RankDirection.WORST else 'strongest'} contributor."
        )
        answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
        answer.setdefault("telemetry", {})["intent_source"] = resolution.intent_source
        answer.setdefault("telemetry", {})["resolved_dimension"] = dimension
        answer.setdefault("telemetry", {})["rank_direction"] = direction.value
        return answer

    selected_ids: list[str] = []
    entities: list[str] = []
    for row in rows:
        entity = _row_entity(row, dimension)
        if not entity:
            continue
        entities.append(entity)
        item = _tool_evidence_for_entity(envelope, entity=entity, metric=metric, dimension=dimension)
        if item and item.get("evidence_id"):
            selected_ids.append(str(item["evidence_id"]))

    insight = (
        InsightType.CONTRIBUTION_LAGGARD.value
        if direction == RankDirection.WORST
        else InsightType.CONTRIBUTION_LEADER.value
    )
    answer = compose_cfo_answer(
        semantic={
            "driver_stage": "UNKNOWN",
            "insight_type": insight,
            "evidence_ids": selected_ids[:3],
        },
        envelope=envelope,
        context=working,
        capability="BREAKDOWN_REQUIRED",
        message=message,
        tool_calls=tool_calls,
        answer_source="deterministic_followup",
        forced_tool=True,
    )

    # Harden headline to state the dimension explicitly for SKU/product questions.
    lead = entities[0] if entities else "The selected segment"
    if direction == RankDirection.WORST:
        answer["headline"] = f"{lead} is the weakest verified {dimension.upper() if dimension == 'sku' else dimension} contributor in this view."
        if dimension == "sku":
            answer["headline"] = f"{lead} is the weakest verified SKU contributor in this view."
        answer["interpretation"] = (
            f"{lead} ranks among the weaker verified {dimension} contribution sources under the active scope."
        )
    else:
        if dimension == "sku":
            answer["headline"] = f"{lead} is the leading verified SKU contributor in this view."
        else:
            answer["headline"] = f"{lead} is the leading verified {dimension} contributor in this view."
        answer["interpretation"] = (
            f"{lead} is one of the strongest verified {dimension} contribution sources under the active scope."
        )

    evidence = [present_evidence_item(item) for item in (answer.get("evidence") or [])]
    # Ensure primary metric rows for selected entities if composer returned fewer.
    if len(evidence) < min(3, len(entities)):
        rebuilt = []
        for entity in entities:
            item = _tool_evidence_for_entity(envelope, entity=entity, metric=metric, dimension=dimension)
            if item:
                rebuilt.append(present_evidence_item(item))
        if rebuilt:
            evidence = rebuilt
    answer["evidence"] = dedupe_evidence_items(evidence)
    answer.setdefault("telemetry", {})["followup"] = resolution.to_dict()
    answer.setdefault("telemetry", {})["intent_source"] = resolution.intent_source
    answer.setdefault("telemetry", {})["resolved_intent"] = resolution.intent.value
    answer.setdefault("telemetry", {})["resolved_dimension"] = dimension
    answer.setdefault("telemetry", {})["rank_direction"] = direction.value
    answer.setdefault("telemetry", {})["evidence_source"] = "get_breakdown"
    answer.setdefault("telemetry", {})["guard"] = {
        "capability": "BREAKDOWN_REQUIRED",
        "forced_tools": [{"tool": "get_breakdown", "arguments": args}],
        "interventions": [{"phase": "deterministic_ranking"}],
        "tool_dimensions": [dimension],
    }
    return answer
