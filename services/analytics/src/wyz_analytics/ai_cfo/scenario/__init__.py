"""AI CFO V1.1 deterministic scenario intelligence."""

from __future__ import annotations

from wyz_analytics.ai_cfo.scenario.composer import compose_scenario_answer
from wyz_analytics.ai_cfo.scenario.engine import simulate_scenario
from wyz_analytics.ai_cfo.scenario.parse import (
    is_demand_response_question,
    is_scenario_question,
    parse_scenario_spec,
)
from wyz_analytics.ai_cfo.scenario.spec import (
    HOLD_CONSTANT_ASSUMPTION,
    LEVER_SUPPORT,
    MAX_PERCENT_INCREASE,
    LeverSupport,
    ScenarioChange,
    ScenarioLever,
    ScenarioOperation,
    ScenarioSpec,
    SUPPORTED_LEVERS_UX,
    lever_is_supported,
    methodology_for_spec,
    validate_scenario_spec,
)

__all__ = [
    "HOLD_CONSTANT_ASSUMPTION",
    "LEVER_SUPPORT",
    "MAX_PERCENT_INCREASE",
    "LeverSupport",
    "ScenarioChange",
    "ScenarioLever",
    "ScenarioOperation",
    "ScenarioSpec",
    "SUPPORTED_LEVERS_UX",
    "compose_scenario_answer",
    "is_demand_response_question",
    "is_scenario_question",
    "lever_is_supported",
    "methodology_for_spec",
    "parse_scenario_spec",
    "simulate_scenario",
    "validate_scenario_spec",
]
