"""Initial Financial Intelligence Context evidence vs tool requirements (benchmark scoring)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from wyz_analytics.ai_cfo.evidence.requirements import (
    CONTRIBUTOR_SIGNAL_TYPES,
    PRESSURE_SIGNAL_TYPES,
    PROFITABILITY_SIGNAL_TYPES,
    _signals,
    _signal_has_metric,
    _signals_for_dimension,
    _top_contributor_present,
    collect_verified_numbers,
    resolve_evidence_requirement,
)

__all__ = [
    "EvidencePlan",
    "CONTRIBUTOR_SIGNAL_TYPES",
    "PRESSURE_SIGNAL_TYPES",
    "PROFITABILITY_SIGNAL_TYPES",
    "build_evidence_plan",
    "collect_verified_numbers",
]


@dataclass
class EvidencePlan:
    case_id: str
    available_initially: list[str] = field(default_factory=list)
    requires_tool: bool = False
    required_tool: str | None = None
    required_tool_args: dict[str, Any] | None = None
    allowed_tools: list[str] = field(default_factory=list)
    forbidden_inference: list[str] = field(default_factory=list)
    explanation: str = ""


def _summary_keys(context: dict[str, Any]) -> list[str]:
    summary = context.get("summary") or {}
    return [key for key, value in summary.items() if value is not None]


def build_evidence_plan(case: dict[str, Any], context: dict[str, Any]) -> EvidencePlan:
    """Describe what verified evidence exists before any model tool call."""
    case_id = case["id"]
    expect = case.get("expect") or {}
    analytical = case.get("analytical") or {}
    dimension = str(context.get("dimension") or analytical.get("dimension") or "channel")
    summary_keys = _summary_keys(context)
    signals = _signals(context)
    available = []
    if summary_keys:
        available.append(
            f"filtered summary metrics ({', '.join(summary_keys[:8])}{'...' if len(summary_keys) > 8 else ''})"
        )
    if signals:
        available.append(f"{len(signals)} CFO signal(s) at dimension={dimension}")

    req = resolve_evidence_requirement(
        message=case["question"],
        analytical=analytical,
        context=context,
    )

    return EvidencePlan(
        case_id=case_id,
        available_initially=available,
        requires_tool=req.requires_tool,
        required_tool=req.required_tool,
        required_tool_args=req.required_tool_args,
        allowed_tools=list(expect.get("tool_hints") or req.allowed_tools),
        forbidden_inference=list(req.forbidden_inference),
        explanation=req.explanation,
    )
