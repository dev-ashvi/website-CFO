"""Structured answer contract, claim budget, and normalization helpers."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class DriverStage(str, Enum):
    PRODUCT = "PRODUCT"
    CHANNEL = "CHANNEL"
    MARKETING = "MARKETING"
    REVENUE_QUALITY = "REVENUE_QUALITY"
    MIXED = "MIXED"
    UNKNOWN = "UNKNOWN"


DEFAULT_EVIDENCE_BUDGET = 3
DEFAULT_NUMERIC_CLAIM_BUDGET = 3
DETAILED_EVIDENCE_BUDGET = 10
DETAILED_NUMERIC_CLAIM_BUDGET = 10

UNSTRUCTURED_PLACEHOLDER_HEADLINE = "The model did not return a structured answer."


@dataclass(frozen=True)
class ClaimBudget:
    evidence_items_max: int
    numeric_claims_max: int
    mode: str


def resolve_claim_budget(message: str) -> ClaimBudget:
    lower = (message or "").lower()
    detailed_markers = (
        "detailed breakdown",
        "all skus",
        "all products",
        "comparison table",
        "detailed analysis",
        "full list",
    )
    if any(marker in lower for marker in detailed_markers):
        return ClaimBudget(
            evidence_items_max=DETAILED_EVIDENCE_BUDGET,
            numeric_claims_max=DETAILED_NUMERIC_CLAIM_BUDGET,
            mode="expanded",
        )
    return ClaimBudget(
        evidence_items_max=DEFAULT_EVIDENCE_BUDGET,
        numeric_claims_max=DEFAULT_NUMERIC_CLAIM_BUDGET,
        mode="default",
    )


def normalize_driver_stage(raw: Any) -> DriverStage:
    text = str(raw or "").strip().upper().replace(" ", "_")
    aliases = {
        "PRODUCT_ECONOMICS": "PRODUCT",
        "CHANNEL_COSTS": "CHANNEL",
        "MARKETING_ATTRIBUTION": "MARKETING",
        "REVENUEQUALITY": "REVENUE_QUALITY",
        "REVENUE_QUALITY": "REVENUE_QUALITY",
        "UNKNOWN": "UNKNOWN",
    }
    canonical = aliases.get(text, text)
    for stage in DriverStage:
        if stage.value == canonical:
            return stage
    return DriverStage.UNKNOWN


def build_markdown(answer: dict[str, Any]) -> str:
    headline = str(answer.get("headline") or "").strip() or "Verified financial interpretation."
    evidence = list(answer.get("evidence") or [])
    driver_stage = str(answer.get("driver_stage") or answer.get("drivers") or "").strip()
    interpretation = str(answer.get("interpretation") or answer.get("drivers") or "").strip()
    caveat = answer.get("caveat")

    lines = [f"**{headline}**", "", "**Evidence**"]
    if evidence:
        for item in evidence[:10]:
            if isinstance(item, dict):
                metric = item.get("metric")
                value = item.get("value")
                unit = item.get("unit") or ""
                interp = item.get("interpretation") or ""
                display = f"{metric}: {value}{unit}".strip(": ")
                if interp:
                    display = f"{display} — {interp}"
                lines.append(f"- {display}")
            else:
                lines.append(f"- {item}")
    else:
        lines.append("- No explicit numeric evidence listed.")

    if driver_stage:
        lines.extend(["", "**Driver**", driver_stage])
    if interpretation:
        lines.extend(["", "**Interpretation**", interpretation])
    if caveat:
        lines.extend(["", "**Caveat**", str(caveat)])
    return "\n".join(lines)
