"""ScenarioSpec contract for AI CFO V1.1 deterministic what-if sensitivity."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ScenarioLever(str, Enum):
    MARKETING_SPEND = "MARKETING_SPEND"
    PRODUCT_COGS = "PRODUCT_COGS"
    CM1_COSTS = "CM1_COSTS"
    # Explicitly unsupported in V1.1 (parse rejects)
    GROSS_REVENUE = "GROSS_REVENUE"
    DISCOUNT = "DISCOUNT"
    RETURNS_RTO = "RETURNS_RTO"
    HEADCOUNT = "HEADCOUNT"
    DEMAND = "DEMAND"


class ScenarioOperation(str, Enum):
    PERCENT_CHANGE = "PERCENT_CHANGE"
    ABSOLUTE_CHANGE = "ABSOLUTE_CHANGE"
    SET_VALUE = "SET_VALUE"


class LeverSupport(str, Enum):
    SUPPORTED = "SUPPORTED"
    PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED"
    UNSUPPORTED = "UNSUPPORTED"


# Support matrix — derived from engine audit (cm2 = cm1 − allocated_marketing).
LEVER_SUPPORT: dict[ScenarioLever, LeverSupport] = {
    ScenarioLever.MARKETING_SPEND: LeverSupport.SUPPORTED,
    ScenarioLever.PRODUCT_COGS: LeverSupport.SUPPORTED,
    ScenarioLever.CM1_COSTS: LeverSupport.SUPPORTED,
    ScenarioLever.GROSS_REVENUE: LeverSupport.UNSUPPORTED,
    ScenarioLever.DISCOUNT: LeverSupport.UNSUPPORTED,
    ScenarioLever.RETURNS_RTO: LeverSupport.UNSUPPORTED,
    ScenarioLever.HEADCOUNT: LeverSupport.UNSUPPORTED,
    ScenarioLever.DEMAND: LeverSupport.UNSUPPORTED,
}

MAX_SCENARIO_CHANGES = 3

# Input safety only — not a business recommendation.
# Reductions: magnitude must be in [0, 100]. Increases: magnitude must be in [0, MAX_PERCENT_INCREASE].
MAX_PERCENT_INCREASE = 100.0

HOLD_CONSTANT_ASSUMPTION = (
    "Revenue and other operating inputs are held constant. "
    "This is a mechanical sensitivity analysis, not a forecast of demand or acquisition."
)

SUPPORTED_LEVERS_UX = (
    "Current scenario analysis supports mechanical changes to Marketing Spend, Product COGS, "
    "and CM1 Costs while holding revenue and other operating inputs constant."
)

METHODOLOGY_BY_LEVER: dict[ScenarioLever, str] = {
    ScenarioLever.MARKETING_SPEND: (
        "Attributed marketing spend is adjusted by the scenario percentage. "
        "CM2 and CM2 Margin are then recomputed while CM1 and revenue remain unchanged."
    ),
    ScenarioLever.PRODUCT_COGS: (
        "Product COGS is adjusted by the scenario percentage. "
        "Gross Margin, CM1, CM2 and their margins are then recomputed using the existing "
        "Revenue & Margin financial model."
    ),
    ScenarioLever.CM1_COSTS: (
        "CM1 costs are adjusted by the scenario percentage. "
        "CM1, CM2 and their margins are then recomputed while Gross Margin and revenue remain unchanged."
    ),
}


@dataclass(frozen=True)
class ScenarioChange:
    lever: ScenarioLever
    operation: ScenarioOperation
    value: float
    unit: str  # PERCENT | INR

    def to_dict(self) -> dict[str, Any]:
        return {
            "lever": self.lever.value,
            "operation": self.operation.value,
            "value": self.value,
            "unit": self.unit,
        }


@dataclass
class ScenarioSpec:
    scope_hash: str
    dataset_id: str | None
    changes: list[ScenarioChange] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=lambda: [HOLD_CONSTANT_ASSUMPTION])
    parse_source: str = "DETERMINISTIC"  # DETERMINISTIC | MODEL | FAILED
    parse_errors: list[str] = field(default_factory=list)
    hold_volume_constant: bool = True
    refusal_code: str | None = None  # e.g. UNSUPPORTED_REVENUE, INVALID_PERCENT, COMPOSITE_UNSUPPORTED

    @property
    def valid(self) -> bool:
        return bool(self.changes) and not self.parse_errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "scope_hash": self.scope_hash,
            "dataset_id": self.dataset_id,
            "changes": [change.to_dict() for change in self.changes],
            "assumptions": list(self.assumptions),
            "parse_source": self.parse_source,
            "parse_errors": list(self.parse_errors),
            "hold_volume_constant": self.hold_volume_constant,
            "refusal_code": self.refusal_code,
            "valid": self.valid,
        }

    def lean_followup_context(self) -> dict[str, Any]:
        """Bounded conversation state for follow-ups — never stores simulated results."""
        first = self.changes[0] if self.changes else None
        if first is None:
            return {"scope_hash": self.scope_hash, "changes": []}
        return {
            "scope_hash": self.scope_hash,
            "lever": first.lever.value,
            "direction": "DECREASE" if float(first.value) < 0 else "INCREASE",
            "percentage": abs(float(first.value)) if first.operation == ScenarioOperation.PERCENT_CHANGE else None,
            "operation": first.operation.value,
            "changes": [c.to_dict() for c in self.changes],
        }


def lever_is_supported(lever: ScenarioLever | str) -> bool:
    try:
        key = lever if isinstance(lever, ScenarioLever) else ScenarioLever(str(lever))
    except ValueError:
        return False
    return LEVER_SUPPORT.get(key) == LeverSupport.SUPPORTED


def methodology_for_spec(spec: ScenarioSpec | dict[str, Any]) -> str:
    """Deterministic lever-specific methodology. Never LLM-authored."""
    if isinstance(spec, ScenarioSpec):
        changes = spec.changes
    else:
        raw = spec.get("changes") or []
        changes = []
        for item in raw:
            try:
                changes.append(
                    ScenarioChange(
                        lever=ScenarioLever(str(item.get("lever"))),
                        operation=ScenarioOperation(str(item.get("operation"))),
                        value=float(item.get("value")),
                        unit=str(item.get("unit") or "PERCENT"),
                    )
                )
            except (TypeError, ValueError, KeyError):
                continue
    if not changes:
        return SUPPORTED_LEVERS_UX
    if len(changes) == 1:
        return METHODOLOGY_BY_LEVER.get(changes[0].lever, SUPPORTED_LEVERS_UX)
    parts = [METHODOLOGY_BY_LEVER[c.lever] for c in changes if c.lever in METHODOLOGY_BY_LEVER]
    return " ".join(parts) if parts else SUPPORTED_LEVERS_UX


def validate_scenario_spec(spec: ScenarioSpec) -> ScenarioSpec:
    """Deterministic validation — rejects unknown levers, bad units, unsafe percentages.

    Any validation failure clears all changes (no partial / silent approximation).
    """
    errors: list[str] = list(spec.parse_errors or [])
    cleaned: list[ScenarioChange] = []
    refusal_code = spec.refusal_code

    if not str(spec.scope_hash or "").strip():
        errors.append("ScenarioSpec requires scope_hash.")
        refusal_code = refusal_code or "MISSING_SCOPE"

    if len(spec.changes) > MAX_SCENARIO_CHANGES:
        errors.append(f"At most {MAX_SCENARIO_CHANGES} scenario changes are supported in V1.1.")
        refusal_code = refusal_code or "TOO_MANY_CHANGES"

    seen_levers: set[str] = set()
    for change in spec.changes[:MAX_SCENARIO_CHANGES]:
        if not isinstance(change, ScenarioChange):
            errors.append("Malformed scenario change.")
            refusal_code = refusal_code or "MALFORMED"
            continue
        if not lever_is_supported(change.lever):
            errors.append(f"Lever {change.lever.value} is not supported for deterministic sensitivity.")
            refusal_code = refusal_code or "UNSUPPORTED_LEVER"
            continue
        if change.lever.value in seen_levers:
            errors.append(f"Duplicate lever {change.lever.value}.")
            refusal_code = refusal_code or "DUPLICATE_LEVER"
            continue
        seen_levers.add(change.lever.value)
        if change.operation == ScenarioOperation.PERCENT_CHANGE and change.unit != "PERCENT":
            errors.append("PERCENT_CHANGE requires unit=PERCENT.")
            refusal_code = refusal_code or "INVALID_UNIT"
            continue
        if change.operation in {ScenarioOperation.ABSOLUTE_CHANGE, ScenarioOperation.SET_VALUE} and change.unit != "INR":
            errors.append(f"{change.operation.value} requires unit=INR.")
            refusal_code = refusal_code or "INVALID_UNIT"
            continue
        if not math.isfinite(float(change.value)):
            errors.append("Scenario value must be a finite number.")
            refusal_code = refusal_code or "NON_FINITE"
            continue
        if change.operation == ScenarioOperation.PERCENT_CHANGE:
            magnitude = abs(float(change.value))
            if float(change.value) < 0 and magnitude > 100:
                errors.append(
                    "Percentage reductions greater than 100% are not supported "
                    "(would create negative spend/cost)."
                )
                refusal_code = refusal_code or "REDUCTION_OVER_100"
                continue
            if float(change.value) > 0 and magnitude > MAX_PERCENT_INCREASE:
                errors.append(
                    f"Percentage increases greater than {MAX_PERCENT_INCREASE:.0f}% are not supported in V1.1."
                )
                refusal_code = refusal_code or "INCREASE_OVER_BOUND"
                continue
        if change.operation == ScenarioOperation.SET_VALUE and float(change.value) < 0:
            errors.append("Setting a cost or spend lever to a negative value is not supported.")
            refusal_code = refusal_code or "NEGATIVE_VALUE"
            continue
        cleaned.append(change)

    if errors:
        cleaned = []

    return ScenarioSpec(
        scope_hash=spec.scope_hash,
        dataset_id=spec.dataset_id,
        changes=cleaned,
        assumptions=list(spec.assumptions) or [HOLD_CONSTANT_ASSUMPTION],
        parse_source=spec.parse_source,
        parse_errors=errors,
        hold_volume_constant=True,
        refusal_code=refusal_code,
    )
