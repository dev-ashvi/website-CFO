"""Strategic action types, severity, evidence burden, and CfoAction payloads."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class ActionType(str, Enum):
    """Bounded strategic action catalog (judgment chooses among these later)."""

    INVESTIGATE = "INVESTIGATE"
    MONITOR = "MONITOR"
    EXPERIMENT = "EXPERIMENT"
    OPTIMIZE = "OPTIMIZE"
    REDUCE = "REDUCE"
    INCREASE = "INCREASE"
    REALLOCATE = "REALLOCATE"
    MAINTAIN = "MAINTAIN"
    PAUSE = "PAUSE"
    EXIT = "EXIT"


class ActionSeverity(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    VERY_HIGH = "VERY_HIGH"


class EvidenceBurden(str, Enum):
    """Evidence burden category — qualification rules come in Phase 2B."""

    MINIMAL = "MINIMAL"
    STANDARD = "STANDARD"
    STRONG = "STRONG"
    VERY_STRONG = "VERY_STRONG"


class CfoActionType(str, Enum):
    """UI/backend follow-up actions (not strategic ActionType)."""

    ASK_FOLLOWUP = "ASK_FOLLOWUP"
    RUN_SCENARIO = "RUN_SCENARIO"
    INVESTIGATE_DIMENSION = "INVESTIGATE_DIMENSION"
    SHOW_COST_BREAKDOWN = "SHOW_COST_BREAKDOWN"
    COMPARE_ENTITIES = "COMPARE_ENTITIES"
    MONITOR_METRICS = "MONITOR_METRICS"
    TRACK_STRATEGIC_DECISION = "TRACK_STRATEGIC_DECISION"
    REVIEW_STRATEGIC_DECISION = "REVIEW_STRATEGIC_DECISION"


_SEVERITY_RANK = {
    ActionSeverity.LOW: 1,
    ActionSeverity.MODERATE: 2,
    ActionSeverity.HIGH: 3,
    ActionSeverity.VERY_HIGH: 4,
}

_ACTION_META: dict[ActionType, dict[str, Any]] = {
    ActionType.INVESTIGATE: {
        "severity": ActionSeverity.LOW,
        "evidence_burden": EvidenceBurden.MINIMAL,
        "reversible": True,
        "requires_causal_unknown_check": False,
        "requires_multi_evidence": False,
        "requires_scenario_or_experiment": False,
    },
    ActionType.MONITOR: {
        "severity": ActionSeverity.LOW,
        "evidence_burden": EvidenceBurden.MINIMAL,
        "reversible": True,
        "requires_causal_unknown_check": False,
        "requires_multi_evidence": False,
        "requires_scenario_or_experiment": False,
    },
    ActionType.EXPERIMENT: {
        "severity": ActionSeverity.LOW,
        "evidence_burden": EvidenceBurden.STANDARD,
        "reversible": True,
        "requires_causal_unknown_check": True,
        "requires_multi_evidence": False,
        "requires_scenario_or_experiment": True,
    },
    ActionType.OPTIMIZE: {
        "severity": ActionSeverity.MODERATE,
        "evidence_burden": EvidenceBurden.STANDARD,
        "reversible": True,
        "requires_causal_unknown_check": True,
        "requires_multi_evidence": False,
        "requires_scenario_or_experiment": False,
    },
    ActionType.REDUCE: {
        "severity": ActionSeverity.MODERATE,
        "evidence_burden": EvidenceBurden.STRONG,
        "reversible": True,
        "requires_causal_unknown_check": True,
        "requires_multi_evidence": True,
        "requires_scenario_or_experiment": True,
    },
    ActionType.INCREASE: {
        "severity": ActionSeverity.MODERATE,
        "evidence_burden": EvidenceBurden.STRONG,
        "reversible": True,
        "requires_causal_unknown_check": True,
        "requires_multi_evidence": True,
        "requires_scenario_or_experiment": True,
    },
    ActionType.REALLOCATE: {
        "severity": ActionSeverity.MODERATE,
        "evidence_burden": EvidenceBurden.STRONG,
        "reversible": True,
        "requires_causal_unknown_check": True,
        "requires_multi_evidence": True,
        "requires_scenario_or_experiment": False,
    },
    ActionType.MAINTAIN: {
        "severity": ActionSeverity.LOW,
        "evidence_burden": EvidenceBurden.STANDARD,
        "reversible": True,
        "requires_causal_unknown_check": False,
        "requires_multi_evidence": False,
        "requires_scenario_or_experiment": False,
    },
    ActionType.PAUSE: {
        "severity": ActionSeverity.HIGH,
        "evidence_burden": EvidenceBurden.VERY_STRONG,
        "reversible": True,
        "requires_causal_unknown_check": True,
        "requires_multi_evidence": True,
        "requires_scenario_or_experiment": True,
    },
    ActionType.EXIT: {
        "severity": ActionSeverity.VERY_HIGH,
        "evidence_burden": EvidenceBurden.VERY_STRONG,
        "reversible": False,
        "requires_causal_unknown_check": True,
        "requires_multi_evidence": True,
        "requires_scenario_or_experiment": True,
    },
}

# Typed payload keys allowed per CfoActionType — never arbitrary filter dicts from the model.
_ALLOWED_PAYLOAD_KEYS: dict[CfoActionType, frozenset[str]] = {
    CfoActionType.ASK_FOLLOWUP: frozenset({"question_key", "question"}),
    CfoActionType.RUN_SCENARIO: frozenset({"lever", "operation", "value", "unit"}),
    CfoActionType.INVESTIGATE_DIMENSION: frozenset({"dimension", "hint_entity", "preserve_filters"}),
    CfoActionType.SHOW_COST_BREAKDOWN: frozenset({"section"}),
    CfoActionType.COMPARE_ENTITIES: frozenset({"dimension", "metric"}),
    CfoActionType.MONITOR_METRICS: frozenset({"metrics"}),
    CfoActionType.TRACK_STRATEGIC_DECISION: frozenset({"thread_id", "decision_theme"}),
    CfoActionType.REVIEW_STRATEGIC_DECISION: frozenset({"decision_id"}),
}

_FORBIDDEN_PAYLOAD_KEYS = frozenset(
    {
        "filters",
        "override_filters",
        "month_from",
        "month_to",
        "channel",
        "category",
        "sku",
        "raw_sql",
        "scope_override",
    }
)


def action_metadata(action: ActionType) -> dict[str, Any]:
    return dict(_ACTION_META[action])


def action_severity(action: ActionType) -> ActionSeverity:
    return _ACTION_META[action]["severity"]


def evidence_burden_for(action: ActionType) -> EvidenceBurden:
    return _ACTION_META[action]["evidence_burden"]


def severity_rank(severity: ActionSeverity | ActionType) -> int:
    if isinstance(severity, ActionType):
        sev = action_severity(severity)
    else:
        sev = severity
    return _SEVERITY_RANK[sev]


def max_severity(actions: list[ActionType]) -> ActionSeverity | None:
    if not actions:
        return None
    return max((action_severity(a) for a in actions), key=lambda s: _SEVERITY_RANK[s])



@dataclass
class CfoAction:
    id: str
    type: CfoActionType
    label: str
    payload: dict[str, Any] = field(default_factory=dict)
    requires_confirmation: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "label": self.label,
            "payload": dict(self.payload),
            "requires_confirmation": bool(self.requires_confirmation),
        }

    @staticmethod
    def from_dict(raw: dict[str, Any] | None) -> CfoAction | None:
        if not isinstance(raw, dict):
            return None
        try:
            action_type = CfoActionType(str(raw.get("type") or ""))
        except ValueError:
            return None
        return CfoAction(
            id=str(raw.get("id") or "")[:80],
            type=action_type,
            label=str(raw.get("label") or "")[:200],
            payload=dict(raw.get("payload") or {}),
            requires_confirmation=bool(raw.get("requires_confirmation")),
        )


def validate_cfo_action_payload(action: CfoAction) -> list[str]:
    errors: list[str] = []
    payload = action.payload or {}
    for key in payload:
        if key in _FORBIDDEN_PAYLOAD_KEYS or str(key).endswith("_filters"):
            errors.append(f"CfoAction payload forbids key '{key}' (no model filters).")
    allowed = _ALLOWED_PAYLOAD_KEYS.get(action.type, frozenset())
    for key in payload:
        if key not in allowed and key not in _FORBIDDEN_PAYLOAD_KEYS:
            # Unknown keys are soft-rejected for forward-compat strictness in 2A
            errors.append(f"CfoAction payload key '{key}' not allowed for {action.type.value}.")
    return errors


def default_candidate_actions_for_decide() -> list[ActionType]:
    """Illustrative catalog for DECIDE control-plane scaffolding (eligibility in 2B)."""
    return [
        ActionType.INVESTIGATE,
        ActionType.MONITOR,
        ActionType.EXPERIMENT,
        ActionType.OPTIMIZE,
        ActionType.REDUCE,
        ActionType.MAINTAIN,
        ActionType.PAUSE,
        ActionType.EXIT,
    ]
