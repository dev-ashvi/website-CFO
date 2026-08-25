"""Deterministic safe responses for guarded AI CFO scope boundaries."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.guards.capability import Capability

STRATEGY_BOUNDARY_SENTENCE = (
    "AI CFO V1 can explain the verified economics behind this decision, "
    "but it does not make stop/continue strategic recommendations."
)


def merge_strategy_boundary(model_answer: dict[str, Any], *, context: dict[str, Any]) -> dict[str, Any]:
    """Prepend deterministic strategic boundary; preserve verified economics explanation."""
    economics_headline = (model_answer.get("headline") or "").strip()
    economics_interpretation = (
        model_answer.get("interpretation")
        or model_answer.get("drivers")
        or "Verified economics interpretation under read-only scope."
    )
    # Keep only structured metric evidence objects for the drawer.
    structured = [
        item
        for item in (model_answer.get("evidence") or [])
        if isinstance(item, dict) and (item.get("metric") is not None or item.get("display"))
    ]

    merged = dict(model_answer)
    merged["headline"] = STRATEGY_BOUNDARY_SENTENCE
    merged["evidence"] = structured[:3]
    merged["driver_stage"] = str(model_answer.get("driver_stage") or model_answer.get("drivers") or "MIXED")
    merged["interpretation"] = (
        f"{economics_interpretation}"
        + (f" Underlying view: {economics_headline}" if economics_headline and economics_headline != STRATEGY_BOUNDARY_SENTENCE else "")
    ).strip()
    merged["drivers"] = merged["driver_stage"]
    if not merged.get("caveat"):
        merged["caveat"] = next(
            (item for item in (context.get("caveats") or []) if "attributed" in str(item).lower()),
            "Attributed marketing CM2 is not fully-loaded profitability.",
        )
    merged["methodology"] = merged.get("methodology") or merged.get("caveat")
    merged["markdown"] = (
        f"**{STRATEGY_BOUNDARY_SENTENCE}**\n\n"
        + (f"**Economics**\n{economics_headline}\n\n" if economics_headline else "")
        + f"**Interpretation**\n{merged['interpretation']}"
        + (f"\n\n**Caveat**\n{merged['caveat']}" if merged.get("caveat") else "")
    )
    telemetry = dict(model_answer.get("telemetry") or {})
    guard = dict(telemetry.get("guard") or {})
    guard["strategy_boundary_injected"] = True
    telemetry["guard"] = guard
    telemetry["answer_source"] = "model_with_strategy_boundary"
    merged["telemetry"] = telemetry
    return merged


def _summary_snippet(context: dict[str, Any]) -> str:
    summary = context.get("summary") or {}
    net = summary.get("net_revenue")
    cm2_pct = summary.get("cm2_pct")
    parts = []
    if net is not None:
        parts.append(f"Filtered net revenue is ₹{float(net):,.0f}.")
    if cm2_pct is not None:
        parts.append(f"CM2 is {float(cm2_pct) * 100:.1f}% of net revenue in the active view.")
    return " ".join(parts) if parts else "Verified economics are available for the active filters."


def build_scope_blocked_answer(
    capability: Capability,
    *,
    context: dict[str, Any],
    forced_tool_calls: list[dict[str, Any]] | None = None,
    guard_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a deterministic bounded answer without LLM involvement.

    Guard cards intentionally omit metric evidence rows — interpretation carries
    the bounded explanation. Frontend must not render placeholder Evidence rows.
    """
    tool_calls = list(forced_tool_calls or [])
    guard = dict(guard_meta or {})
    guard["preempted_model"] = True
    snippet = _summary_snippet(context)

    if capability == Capability.UNSUPPORTED_CAUSALITY:
        headline = "Financial data can show economic performance but does not establish customer sentiment or causal preference."
        interpretation = (
            f"{snippet} Verified metrics cover revenue, margin stages, and contribution — "
            "not customer surveys or preference."
        )
        caveat = "Do not infer customer dislike, satisfaction, or behavior from contribution or sales alone."
    elif capability == Capability.SCENARIO_REQUEST:
        headline = "This what-if cannot be calculated safely with AI CFO V1.1."
        interpretation = (
            f"{snippet} Supported sensitivities reuse verified Revenue & Margin facts "
            "(for example marketing spend or product COGS percent changes) while holding "
            "other inputs constant. Unsupported levers and demand-response effects are not modelled."
        )
        caveat = (
            "This is a mechanical sensitivity analysis, not a forecast of demand or acquisition."
        )
    elif capability == Capability.STRATEGIC_RECOMMENDATION:
        headline = STRATEGY_BOUNDARY_SENTENCE
        interpretation = (
            f"{snippet} Economics for the active filters can be explained without "
            "prescribing stop/continue decisions."
        )
        caveat = next(
            (item for item in (context.get("caveats") or []) if "attributed" in str(item).lower()),
            "Attributed marketing CM2 is not fully-loaded profitability.",
        )
    else:
        headline = "This question is outside AI CFO V1 read-only interpretation scope."
        interpretation = snippet
        caveat = None

    return {
        "headline": headline,
        "evidence": [],
        "driver_stage": "UNKNOWN",
        "interpretation": interpretation,
        "drivers": "UNKNOWN",
        "caveat": caveat,
        "methodology": caveat,
        "tool_calls": tool_calls,
        "context_version": (context.get("meta") or {}).get("context_version"),
        "markdown": (
            f"**{headline}**\n\n"
            f"**Interpretation**\n{interpretation}"
            + (f"\n\n**Caveat**\n{caveat}" if caveat else "")
        ),
        "telemetry": {
            "guard": guard,
            "answer_source": "deterministic_guard",
            "intent_source": "guard",
            "tool_calls": [
                {
                    "name": call.get("tool"),
                    "executed": True,
                    "forced": True,
                    "parsed_arguments": call.get("arguments") or {},
                }
                for call in tool_calls
            ],
        },
    }
