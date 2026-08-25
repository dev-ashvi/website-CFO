"""Emit structured CfoAction[] from strategic decisions (backend only)."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.strategy.actions import ActionType, CfoAction, CfoActionType
from wyz_analytics.ai_cfo.strategy.assessment import StrategicAssessment
from wyz_analytics.ai_cfo.strategy.diagnosis import DiagnosisPack
from wyz_analytics.ai_cfo.strategy.model_decision import StrategicModelDecision
from wyz_analytics.ai_cfo.strategy.uncertainty import StrategicUnknown


def build_strategic_cfo_actions(
    *,
    decision: StrategicModelDecision,
    assessment: StrategicAssessment,
    pack: DiagnosisPack | None,
    message: str,
) -> list[CfoAction]:
    actions: list[CfoAction] = []
    lower = (message or "").lower()
    selected = decision.selected_action

    if selected == ActionType.EXPERIMENT and StrategicUnknown.DEMAND_RESPONSE in (pack.unknowns if pack else []):
        if "marketing" in lower or "acquisition" in lower:
            actions.append(
                CfoAction(
                    id="run_scenario_marketing_minus_20",
                    type=CfoActionType.RUN_SCENARIO,
                    label="Test marketing -20% sensitivity",
                    payload={"lever": "MARKETING_SPEND", "operation": "PERCENT_CHANGE", "value": -20, "unit": "PERCENT"},
                )
            )

    subject_dim = assessment.subject.dimension if assessment.subject else None
    subject_entity = assessment.subject.entity if assessment.subject else None

    if selected in {ActionType.INVESTIGATE, ActionType.OPTIMIZE} or (
        assessment.decision_type and assessment.decision_type.value == "PRIORITIZE"
    ):
        if subject_dim == "category" and subject_entity:
            actions.append(
                CfoAction(
                    id="investigate_category",
                    type=CfoActionType.INVESTIGATE_DIMENSION,
                    label=f"Investigate {subject_entity}",
                    payload={"dimension": "category", "hint_entity": subject_entity},
                )
            )
        elif "sku" in lower or subject_dim == "sku":
            actions.append(
                CfoAction(
                    id="investigate_sku",
                    type=CfoActionType.INVESTIGATE_DIMENSION,
                    label="Investigate SKUs",
                    payload={"dimension": "sku"},
                )
            )
        elif "category" in lower or "skincare" in lower:
            actions.append(
                CfoAction(
                    id="investigate_category",
                    type=CfoActionType.INVESTIGATE_DIMENSION,
                    label="Investigate categories",
                    payload={"dimension": "category"},
                )
            )

    if pack and pack.cost_context and pack.cost_context.available:
        if selected in {ActionType.OPTIMIZE, ActionType.REDUCE} or "cost" in lower:
            actions.append(
                CfoAction(
                    id="show_cost_breakdown",
                    type=CfoActionType.SHOW_COST_BREAKDOWN,
                    label="Review cost breakdown",
                    payload={"section": "all"},
                )
            )

    monitor_keys = (decision.thesis.monitoring_metric_keys if decision.thesis else []) or [
        "cm2",
        "net_revenue",
        "marketing_pct",
    ]
    if selected in {ActionType.MONITOR, ActionType.EXPERIMENT, ActionType.REDUCE}:
        actions.append(
            CfoAction(
                id="monitor_core_metrics",
                type=CfoActionType.MONITOR_METRICS,
                label="Monitor revenue, orders and CM2",
                payload={"metrics": monitor_keys[:6]},
            )
        )

    if selected == ActionType.INVESTIGATE:
        actions.append(
            CfoAction(
                id="ask_why",
                type=CfoActionType.ASK_FOLLOWUP,
                label="Why is this happening?",
                payload={"question_key": "why_driver"},
            )
        )

    # Phase 2E: emit track affordance only — persistence requires explicit UI action.
    if selected is not None:
        actions.insert(
            0,
            CfoAction(
                id="track_strategic_decision",
                type=CfoActionType.TRACK_STRATEGIC_DECISION,
                label="Track this decision",
                payload={
                    "decision_theme": pack.theme.value if pack and getattr(pack, "theme", None) else None,
                },
            ),
        )

    # Dedupe by id
    seen: set[str] = set()
    out: list[CfoAction] = []
    for action in actions:
        if action.id in seen:
            continue
        seen.add(action.id)
        out.append(action)
    return out[:6]
