"""Deterministic natural-language → ScenarioSpec parser (GPT-OSS only as fallback later)."""

from __future__ import annotations

import re
from typing import Any

from wyz_analytics.ai_cfo.scenario.spec import (
    HOLD_CONSTANT_ASSUMPTION,
    SUPPORTED_LEVERS_UX,
    ScenarioChange,
    ScenarioLever,
    ScenarioOperation,
    ScenarioSpec,
    validate_scenario_spec,
)


_INR_L = re.compile(
    r"(?P<num>\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lacs?|l)\b",
    re.I,
)
_INR_CR = re.compile(
    r"(?P<num>\d+(?:\.\d+)?)\s*(?:cr|crore|crores)\b",
    re.I,
)
_INR_PLAIN = re.compile(
    r"(?:₹|rs\.?\s*)?(?P<num>\d[\d,]*(?:\.\d+)?)",
    re.I,
)

_DEMAND_RESPONSE = re.compile(
    r"\b(how many customers|customers? (will we )?lose|customer acquisition|demand response|conversion rate)\b",
    re.I,
)
_UNSUPPORTED_LEVER = re.compile(
    r"\b(headcount|payroll|hiring|employees?)\b",
    re.I,
)
_REVENUE_RESPONSE = re.compile(
    r"\b(revenue|sales|top[\s-]?line)\b.{0,30}\b(grows?|growth|increases?|rises?|drops?|falls?|up|down)\b"
    r"|\b(grows?|increases?|rises?|drops?|falls?)\b.{0,30}\b(revenue|sales|top[\s-]?line)\b",
    re.I,
)
_PRICE_VOLUME = re.compile(
    r"\b(price|pricing|volume|units sold|elasticity|cac)\b",
    re.I,
)
_NEGATIVE_COST = re.compile(
    r"\b(cogs|marketing|cm1 costs?|costs?)\b.{0,40}\b(negative|below zero|-ve)\b"
    r"|\b(negative|below zero)\b.{0,40}\b(cogs|marketing|cm1)\b",
    re.I,
)
_MALFORMED_PCT = re.compile(
    r"\b(drops?|falls?|decreases?|reduces?|increases?|rises?|cut)\s+(?P<bad>(?![\d.]+)[\w]+)\s*%",
    re.I,
)

_MARKETING = re.compile(r"\b(marketing|ad spend|ads? spend|attributed marketing)\b", re.I)
_COGS = re.compile(r"\b(cogs|product cogs|product cost|product costs)\b", re.I)
_CM1_COST = re.compile(r"\b(cm1 costs?|channel costs?|fulfilment|variable costs?)\b", re.I)

_DROP = re.compile(r"\b(drops?|falls?|decreases?|reduces?|cut|cuts|down|lower|decline)\b", re.I)
_RISE = re.compile(r"\b(increases?|rises?|grows?|up|higher)\b", re.I)
_IMPROVE = re.compile(r"\bimprove[sd]?\b", re.I)
_PCT = re.compile(r"(?P<num>\d+(?:\.\d+)?)\s*%")
_WHAT_IF = re.compile(
    r"\b(what happens if|what if|what will .{0,40} if|simulate|scenario|assume|suppose)\b",
    re.I,
)
_FOLLOWUP_PCT = re.compile(
    r"^(what about|and|how about)\s+(?P<num>\d+(?:\.\d+)?)\s*%\??$",
    re.I,
)
_FOLLOWUP_DIRECTION = re.compile(
    r"^(what about|how about)\s+(?P<dir>increasing|raising|decreasing|reducing|cutting)\s+(?:it\s+)?(?P<num>\d+(?:\.\d+)?)\s*%\??$",
    re.I,
)


def is_scenario_question(message: str) -> bool:
    text = message or ""
    if _WHAT_IF.search(text):
        return True
    if _FOLLOWUP_PCT.match(text.strip()) or _FOLLOWUP_DIRECTION.match(text.strip()):
        return True
    if _MARKETING.search(text) and (_DROP.search(text) or _RISE.search(text)) and _PCT.search(text):
        return True
    if _COGS.search(text) and (_DROP.search(text) or _RISE.search(text) or _IMPROVE.search(text)) and _PCT.search(text):
        return True
    return False


def is_demand_response_question(message: str) -> bool:
    return bool(_DEMAND_RESPONSE.search(message or ""))


def _parse_inr(fragment: str) -> float | None:
    text = fragment.replace(",", "")
    m = _INR_CR.search(text)
    if m:
        return float(m.group("num")) * 1e7
    m = _INR_L.search(text)
    if m:
        return float(m.group("num")) * 1e5
    m = _INR_PLAIN.search(text)
    if m:
        return float(m.group("num").replace(",", ""))
    return None


def _signed_percent(message: str) -> float | None:
    m = _PCT.search(message or "")
    if not m:
        return None
    magnitude = float(m.group("num"))
    if _DROP.search(message):
        return -magnitude
    if _RISE.search(message):
        return magnitude
    if re.search(r"\b(drop|fall|decrease|reduce|cut)\b", message or "", re.I):
        return -magnitude
    if re.search(r"\b(increase|rise|grow)\b", message or "", re.I):
        return magnitude
    return -magnitude


def _failed(
    scope_hash: str,
    dataset_id: str | None,
    error: str,
    *,
    refusal_code: str | None = None,
) -> ScenarioSpec:
    return ScenarioSpec(
        scope_hash=scope_hash,
        dataset_id=dataset_id,
        changes=[],
        parse_source="FAILED",
        parse_errors=[error],
        refusal_code=refusal_code,
    )


def _percent_after_keyword(message: str, keyword: str) -> float | None:
    """Return the percent magnitude tied to a lever keyword (avoids cross-lever bleed)."""
    m = re.search(rf"(?:{keyword}).{{0,48}}?(?P<num>\d+(?:\.\d+)?)\s*%", message or "", re.I)
    if m and m.group("num") is not None:
        return float(m.group("num"))
    return None


def _signed_percent_for(message: str, keyword: str, *, improve_means_cost_down: bool = False) -> float | None:
    magnitude = _percent_after_keyword(message, keyword)
    if magnitude is None:
        m = _PCT.search(message or "")
        if not m:
            return None
        magnitude = float(m.group("num"))
    if improve_means_cost_down and _IMPROVE.search(message) and not _RISE.search(message):
        return -magnitude
    window = re.search(rf".{{0,24}}(?:{keyword}).{{0,48}}", message or "", re.I)
    fragment = window.group(0) if window else message
    if _DROP.search(fragment) or re.search(r"\b(drop|fall|decrease|reduce|cut)\b", fragment or "", re.I):
        return -magnitude
    if _IMPROVE.search(fragment) and improve_means_cost_down:
        return -magnitude
    if _RISE.search(fragment):
        return magnitude
    if _DROP.search(message):
        return -magnitude
    if _RISE.search(message):
        return magnitude
    return -magnitude


def _has_supported_lever_language(text: str) -> bool:
    return bool(_MARKETING.search(text) or _COGS.search(text) or _CM1_COST.search(text))


def parse_scenario_spec(
    message: str,
    *,
    scope_hash: str,
    dataset_id: str | None = None,
    previous_scenario: dict[str, Any] | None = None,
) -> ScenarioSpec:
    """Parse common scenario phrases deterministically. No LLM arithmetic."""
    text = (message or "").strip()
    prior = previous_scenario if isinstance(previous_scenario, dict) else None

    if is_demand_response_question(text):
        return _failed(
            scope_hash,
            dataset_id,
            "This scenario requires a demand-response assumption that AI CFO V1.1 does not model.",
            refusal_code="DEMAND_RESPONSE",
        )

    if _MALFORMED_PCT.search(text):
        return _failed(
            scope_hash,
            dataset_id,
            "Could not parse a numeric percentage for this scenario.",
            refusal_code="MALFORMED_PERCENT",
        )

    if _NEGATIVE_COST.search(text):
        return _failed(
            scope_hash,
            dataset_id,
            "Negative cost or spend scenarios are not supported in AI CFO V1.1.",
            refusal_code="NEGATIVE_VALUE",
        )

    # Prefer A: reject composites that mix supported + unsupported levers.
    revenue_ask = bool(_REVENUE_RESPONSE.search(text))
    price_volume_ask = bool(_PRICE_VOLUME.search(text) and (_DROP.search(text) or _RISE.search(text) or _PCT.search(text)))
    if revenue_ask and _has_supported_lever_language(text):
        return _failed(
            scope_hash,
            dataset_id,
            "This composite scenario includes an unsupported revenue-response lever. "
            + SUPPORTED_LEVERS_UX,
            refusal_code="COMPOSITE_UNSUPPORTED",
        )
    if revenue_ask:
        return _failed(
            scope_hash,
            dataset_id,
            "Revenue-response scenarios are not supported in AI CFO V1.1. " + SUPPORTED_LEVERS_UX,
            refusal_code="UNSUPPORTED_REVENUE",
        )
    if price_volume_ask and not _has_supported_lever_language(text):
        return _failed(
            scope_hash,
            dataset_id,
            "Price/volume scenarios are not supported in AI CFO V1.1. " + SUPPORTED_LEVERS_UX,
            refusal_code="UNSUPPORTED_LEVER",
        )

    if _UNSUPPORTED_LEVER.search(text) and not _has_supported_lever_language(text):
        return _failed(
            scope_hash,
            dataset_id,
            "Headcount scenarios are not supported in AI CFO V1.1. " + SUPPORTED_LEVERS_UX,
            refusal_code="UNSUPPORTED_LEVER",
        )

    # Follow-up with explicit direction: "What about increasing it 10%?"
    followup_dir = _FOLLOWUP_DIRECTION.match(text)
    if followup_dir and prior and (prior.get("changes") or prior.get("lever")):
        first = (prior.get("changes") or [{}])[0]
        lever_raw = first.get("lever") or prior.get("lever")
        try:
            lever = ScenarioLever(str(lever_raw))
        except ValueError:
            return _failed(scope_hash, dataset_id, "Prior scenario lever is not reusable.", refusal_code="FOLLOWUP_INVALID")
        magnitude = float(followup_dir.group("num"))
        direction = followup_dir.group("dir").lower()
        signed = magnitude if direction in {"increasing", "raising"} else -magnitude
        return validate_scenario_spec(
            ScenarioSpec(
                scope_hash=scope_hash,
                dataset_id=dataset_id,
                changes=[
                    ScenarioChange(
                        lever=lever,
                        operation=ScenarioOperation.PERCENT_CHANGE,
                        value=signed,
                        unit="PERCENT",
                    )
                ],
                assumptions=[HOLD_CONSTANT_ASSUMPTION],
                parse_source="DETERMINISTIC",
            )
        )

    # Follow-up: "What about 30%?" — inherit lever + direction; always from baseline.
    followup_pct = _FOLLOWUP_PCT.match(text)
    if followup_pct and prior and (prior.get("changes") or prior.get("lever")):
        first = (prior.get("changes") or [{}])[0]
        lever_raw = first.get("lever") or prior.get("lever")
        try:
            lever = ScenarioLever(str(lever_raw))
        except ValueError:
            return _failed(scope_hash, dataset_id, "Prior scenario lever is not reusable.", refusal_code="FOLLOWUP_INVALID")
        magnitude = float(followup_pct.group("num"))
        prior_val = first.get("value")
        if prior_val is None and prior.get("direction") == "INCREASE":
            prior_val = magnitude
        elif prior_val is None:
            prior_val = -magnitude
        signed = -magnitude if float(prior_val) <= 0 else magnitude
        return validate_scenario_spec(
            ScenarioSpec(
                scope_hash=scope_hash,
                dataset_id=dataset_id,
                changes=[
                    ScenarioChange(
                        lever=lever,
                        operation=ScenarioOperation.PERCENT_CHANGE,
                        value=signed,
                        unit="PERCENT",
                    )
                ],
                assumptions=[HOLD_CONSTANT_ASSUMPTION],
                parse_source="DETERMINISTIC",
            )
        )

    if followup_pct or followup_dir:
        return _failed(
            scope_hash,
            dataset_id,
            "No prior scenario in the current view to continue from. Ask a full what-if question first.",
            refusal_code="FOLLOWUP_NO_PRIOR",
        )

    changes: list[ScenarioChange] = []

    if _MARKETING.search(text) and _PCT.search(text):
        mkt_pct = _percent_after_keyword(text, r"marketing|ad spend")
        if mkt_pct is not None or not (_COGS.search(text) or _CM1_COST.search(text)):
            signed = _signed_percent_for(text, r"marketing|ad spend")
            if signed is not None:
                changes.append(
                    ScenarioChange(
                        lever=ScenarioLever.MARKETING_SPEND,
                        operation=ScenarioOperation.PERCENT_CHANGE,
                        value=signed,
                        unit="PERCENT",
                    )
                )

    if _MARKETING.search(text) and not any(c.lever == ScenarioLever.MARKETING_SPEND for c in changes) and not _PCT.search(text):
        amount = _parse_inr(text)
        if amount is not None:
            if re.search(r"\b(is|to|at|=)\b", text, re.I) and not _DROP.search(text) and not _RISE.search(text):
                changes.append(
                    ScenarioChange(
                        lever=ScenarioLever.MARKETING_SPEND,
                        operation=ScenarioOperation.SET_VALUE,
                        value=amount,
                        unit="INR",
                    )
                )
            elif _DROP.search(text) or _RISE.search(text) or re.search(r"\bincreases?\b|\bby\b", text, re.I):
                sign = -1.0 if _DROP.search(text) else 1.0
                changes.append(
                    ScenarioChange(
                        lever=ScenarioLever.MARKETING_SPEND,
                        operation=ScenarioOperation.ABSOLUTE_CHANGE,
                        value=sign * amount,
                        unit="INR",
                    )
                )

    if _COGS.search(text) and _PCT.search(text):
        cogs_pct = _percent_after_keyword(text, r"cogs|product cogs|product cost")
        if cogs_pct is not None or not any(c.lever == ScenarioLever.MARKETING_SPEND for c in changes):
            signed = _signed_percent_for(text, r"cogs|product cogs|product cost", improve_means_cost_down=True)
            if signed is not None:
                changes.append(
                    ScenarioChange(
                        lever=ScenarioLever.PRODUCT_COGS,
                        operation=ScenarioOperation.PERCENT_CHANGE,
                        value=signed,
                        unit="PERCENT",
                    )
                )

    if _CM1_COST.search(text) and _PCT.search(text) and not any(c.lever == ScenarioLever.PRODUCT_COGS for c in changes):
        signed = _signed_percent_for(text, r"cm1 costs?|channel costs?|fulfilment|variable costs?")
        if signed is not None:
            changes.append(
                ScenarioChange(
                    lever=ScenarioLever.CM1_COSTS,
                    operation=ScenarioOperation.PERCENT_CHANGE,
                    value=signed,
                    unit="PERCENT",
                )
            )

    if not changes and prior and re.search(r"\bcogs\b", text, re.I) and re.search(r"\binstead\b", text, re.I):
        prior_pct = prior.get("percentage")
        for raw in prior.get("changes") or []:
            if str(raw.get("operation")) == "PERCENT_CHANGE":
                prior_pct = float(raw.get("value") or 0)
                break
        if prior_pct is not None:
            changes.append(
                ScenarioChange(
                    lever=ScenarioLever.PRODUCT_COGS,
                    operation=ScenarioOperation.PERCENT_CHANGE,
                    value=float(prior_pct),
                    unit="PERCENT",
                )
            )

    if not changes:
        return _failed(
            scope_hash,
            dataset_id,
            "Could not parse a supported numeric scenario. " + SUPPORTED_LEVERS_UX,
            refusal_code="UNPARSED",
        )

    return validate_scenario_spec(
        ScenarioSpec(
            scope_hash=scope_hash,
            dataset_id=dataset_id,
            changes=changes,
            assumptions=[HOLD_CONSTANT_ASSUMPTION],
            parse_source="DETERMINISTIC",
        )
    )
