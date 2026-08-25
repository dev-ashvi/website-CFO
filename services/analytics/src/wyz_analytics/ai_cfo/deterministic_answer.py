"""Compose a structured CFO answer from verified EvidenceEnvelope items only."""

from __future__ import annotations

from typing import Any

from wyz_analytics.ai_cfo.answer_contract import DriverStage, build_markdown, normalize_driver_stage
from wyz_analytics.ai_cfo.guards.capability import Capability
from wyz_analytics.ai_cfo.guards.responses import STRATEGY_BOUNDARY_SENTENCE

INSUFFICIENT_HEADLINE = "Verified financial interpretation constrained to deterministic evidence."


class DeterministicCfoAnswerBuilder:
    """Compose a structured answer from already-verified envelope evidence only."""

    def build(self, **kwargs: Any) -> dict[str, Any]:
        return build_deterministic_cfo_answer(**kwargs)


SENTIMENT_HEADLINE = (
    "Financial data can show economic performance but does not establish "
    "customer sentiment or causal preference."
)
SCENARIO_HEADLINE = "Scenario modelling is not enabled in AI CFO V1."

_PRESSURE_ROLES = {"MARGIN_PRESSURE", "NEGATIVE_CONTRIBUTOR"}
_TOP_ROLES = {"TOP_CONTRIBUTOR"}
_COST_ROLES = {"COST_CONCENTRATION"}
_MARKETING_METRICS = {
    "allocated_marketing",
    "marketing_pct",
    "marketing",
    "cm2",
    "cm2_pct",
}


def build_deterministic_cfo_answer(
    *,
    envelope: dict[str, Any],
    context: dict[str, Any],
    capability: Capability | str | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
    reason: list[str] | None = None,
    message: str = "",
    answer_source: str = "deterministic_fallback",
) -> dict[str, Any]:
    """Build a structured answer using only already-verified envelope evidence."""
    cap = _as_capability(capability)
    budget = envelope.get("claim_budget") or {}
    max_items = int(budget.get("evidence_items_max") or 3)

    if cap == Capability.UNSUPPORTED_CAUSALITY:
        headline = SENTIMENT_HEADLINE
        interpretation = "Verified metrics cover revenue and margin economics, not customer preference."
        evidence = _select_evidence(envelope, max_items=max_items, prefer="summary")
        driver_stage = DriverStage.UNKNOWN.value
        caveat = "Do not infer customer dislike, satisfaction, or behavior from contribution or sales alone."
    elif cap == Capability.SCENARIO_REQUEST:
        headline = SCENARIO_HEADLINE
        interpretation = "The system interprets verified facts and signals; it does not simulate hypothetical changes."
        evidence = _select_evidence(envelope, max_items=max_items, prefer="summary")
        driver_stage = DriverStage.UNKNOWN.value
        caveat = None
    elif cap == Capability.STRATEGIC_RECOMMENDATION:
        headline = STRATEGY_BOUNDARY_SENTENCE
        interpretation = (
            "Verified economics for the active view can be explained without prescribing "
            "stop/continue decisions."
        )
        evidence = _select_evidence(envelope, max_items=max_items, prefer=_preference(message))
        driver_stage = _driver_stage(envelope, evidence)
        caveat = _attribution_caveat(context, envelope, evidence, interpretation)
    else:
        prefer = _preference(message)
        headline, interpretation, driver_stage, evidence = _compose_financial(
            envelope, prefer=prefer, max_items=max_items
        )
        caveat = _attribution_caveat(context, envelope, evidence, f"{headline} {interpretation}")

    answer = {
        "headline": headline,
        "evidence": evidence[:max_items],
        "driver_stage": driver_stage,
        "interpretation": interpretation,
        "drivers": driver_stage,
        "caveat": caveat,
        "context_version": (context.get("meta") or {}).get("context_version"),
        "tool_calls": list(tool_calls or []),
        "telemetry": {
            "answer_source": answer_source,
            "response_validation": {
                "valid": False,
                "violations": list(reason or []),
                "correction_attempted": True,
                "correction_succeeded": False,
                "deterministic_fallback_used": True,
            },
        },
    }
    answer["markdown"] = build_markdown(answer)
    return answer


def _as_capability(raw: Capability | str | None) -> Capability | None:
    if isinstance(raw, Capability):
        return raw
    if not raw:
        return None
    try:
        return Capability(str(raw))
    except ValueError:
        return None


def _preference(message: str) -> str:
    lower = (message or "").lower()
    if any(token in lower for token in ("weakest", "leak", "pressure", "negative", "why is cm2", "causing")):
        return "pressure"
    if any(token in lower for token in ("sku", "which product", "which products")):
        return "sku"
    if any(token in lower for token in ("most", "top", "contribut", "driving", "drive")):
        return "contributor"
    if "marketing" in lower:
        return "marketing"
    return "auto"


def _compose_financial(
    envelope: dict[str, Any],
    *,
    prefer: str,
    max_items: int,
) -> tuple[str, str, str, list[dict[str, Any]]]:
    top = _first_with_roles(envelope, _TOP_ROLES)
    pressure = _first_with_roles(envelope, _PRESSURE_ROLES)
    marketing = _marketing_pressure_item(envelope)
    sku_item = _first_tool_entity(envelope)

    chosen = None
    headline = INSUFFICIENT_HEADLINE
    interpretation = "Insufficient verified evidence was available for a more specific statement."

    if prefer == "pressure" and pressure:
        chosen = pressure
        entity = _entity_name(pressure)
        headline = f"{entity} is a verified margin-pressure source in the current view."
        interpretation = "Verified signals identify contribution pressure without implying strategy."
    elif prefer in {"pressure", "marketing"} and marketing:
        chosen = marketing
        headline = "Attributed marketing spend is pressuring CM2 in the current view."
        interpretation = "This follows verified marketing-pressure evidence, not a new calculation."
    elif prefer == "pressure" and sku_item:
        chosen = sku_item
        entity = _entity_name(sku_item)
        dim = str((sku_item.get("scope") or {}).get("dimension") or "segment")
        headline = f"{entity} is the verified {dim} returned by the retrieved breakdown."
        interpretation = "The breakdown ranking is copied from the verified tool result."
    elif prefer == "contributor" and top:
        chosen = top
        entity = _entity_name(top)
        headline = f"{entity} is the top verified contributor in the current view."
        interpretation = "Ranking uses already-verified contribution evidence for the active scope."
    elif prefer == "sku" and sku_item:
        chosen = sku_item
        entity = _entity_name(sku_item)
        headline = f"{entity} is a leading verified SKU in the retrieved breakdown."
        interpretation = "SKU ordering is taken from the verified tool result."
    elif prefer == "auto":
        if pressure:
            chosen = pressure
            headline = f"{_entity_name(pressure)} is a verified margin-pressure source in the current view."
            interpretation = "Verified signals identify contribution pressure in the active scope."
        elif top:
            chosen = top
            headline = f"{_entity_name(top)} is the top verified contributor in the current view."
            interpretation = "Ranking uses already-verified contribution evidence for the active scope."
        elif marketing:
            chosen = marketing
            headline = "Attributed marketing spend is pressuring CM2 in the current view."
            interpretation = "This follows verified marketing-pressure evidence, not a new calculation."
        elif sku_item:
            chosen = sku_item
            headline = f"{_entity_name(sku_item)} is a leading verified SKU in the retrieved breakdown."
            interpretation = "SKU ordering is taken from the verified tool result."
        elif envelope.get("verified_facts"):
            headline = "Current-view contribution is summarized from verified financial facts."
            interpretation = "Figures below are copied from the verified financial view."
        else:
            headline = INSUFFICIENT_HEADLINE
            interpretation = "Insufficient verified evidence was available for a more specific statement."
    elif envelope.get("verified_facts") or envelope.get("verified_signals") or envelope.get("tool_results"):
        headline = "Current-view contribution is summarized from verified financial facts."
        interpretation = "Figures below are copied from the verified financial view."

    evidence = _select_evidence(envelope, max_items=max_items, prefer=prefer, anchor=chosen)
    driver_stage = _driver_stage(envelope, evidence, anchor=chosen)
    return headline, interpretation, driver_stage, evidence


def _first_with_roles(envelope: dict[str, Any], roles: set[str]) -> dict[str, Any] | None:
    for item in envelope.get("verified_signals") or []:
        if roles.intersection(set(item.get("semantic_roles") or [])):
            return item
    for item in envelope.get("verified_facts") or []:
        if roles.intersection(set(item.get("semantic_roles") or [])):
            return item
    return None


def _marketing_pressure_item(envelope: dict[str, Any]) -> dict[str, Any] | None:
    for item in list(envelope.get("verified_signals") or []) + list(envelope.get("verified_facts") or []):
        roles = set(item.get("semantic_roles") or [])
        metric = str(item.get("metric") or "")
        stage = str(item.get("stage") or "").upper()
        signal_type = str(item.get("signal_type") or "")
        marketing_like = (
            metric in _MARKETING_METRICS
            or stage == "MARKETING"
            or "MARKETING" in signal_type.upper()
        )
        if marketing_like and roles.intersection(_PRESSURE_ROLES | _COST_ROLES):
            return item
        if signal_type == "MARKETING_PRESSURE":
            return item
    return None


def _first_tool_entity(envelope: dict[str, Any]) -> dict[str, Any] | None:
    for item in envelope.get("tool_results") or []:
        scope = item.get("scope") or {}
        if scope.get("dimension_value"):
            return item
    return None


def _entity_name(item: dict[str, Any]) -> str:
    scope = item.get("scope") or {}
    return str(item.get("entity") or scope.get("dimension_value") or "The active segment")


def _select_evidence(
    envelope: dict[str, Any],
    *,
    max_items: int,
    prefer: str,
    anchor: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    picked: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(item: dict[str, Any] | None, interpretation: str | None = None) -> None:
        if not item or item.get("value") is None:
            return
        key = str(item.get("evidence_id") or f"{item.get('metric')}:{item.get('value')}")
        if key in seen:
            return
        seen.add(key)
        picked.append(_copy_item(item, interpretation))

    add(anchor, "Verified evidence supporting the headline.")
    if prefer in {"pressure", "auto"}:
        for item in envelope.get("verified_signals") or []:
            if _PRESSURE_ROLES.intersection(set(item.get("semantic_roles") or [])):
                add(item, "Verified pressure evidence in the active scope.")
            if len(picked) >= max_items:
                return picked[:max_items]
    if prefer in {"contributor", "auto"}:
        for item in envelope.get("verified_signals") or []:
            if _TOP_ROLES.intersection(set(item.get("semantic_roles") or [])):
                add(item, "Verified contributor evidence in the active scope.")
            if len(picked) >= max_items:
                return picked[:max_items]
    if prefer in {"sku", "auto", "marketing"}:
        if prefer == "sku":
            for item in envelope.get("tool_results") or []:
                add(item, "Copied from the verified tool result.")
                if len(picked) >= max_items:
                    return picked[:max_items]
            if picked:
                return picked[:max_items]
        elif prefer == "auto":
            for item in envelope.get("tool_results") or []:
                add(item, "Copied from the verified tool result.")
                if len(picked) >= max_items:
                    return picked[:max_items]
    for metric in ("cm2", "cm2_pct", "net_revenue", "allocated_marketing", "cm1", "gross_margin"):
        for item in envelope.get("verified_facts") or []:
            if str(item.get("metric")) == metric:
                add(item, "Copied from the verified financial view.")
            if len(picked) >= max_items:
                return picked[:max_items]
    for item in envelope.get("verified_facts") or []:
        add(item, "Copied from the verified financial view.")
        if len(picked) >= max_items:
            return picked[:max_items]
    return picked[:max_items]


def _copy_item(item: dict[str, Any], interpretation: str | None) -> dict[str, Any]:
    return {
        "evidence_id": item.get("evidence_id"),
        "metric": item.get("metric"),
        "value": item.get("value"),
        "unit": item.get("unit"),
        "scope": dict(item.get("scope") or {}),
        "interpretation": interpretation or "Verified evidence.",
    }


def _driver_stage(
    envelope: dict[str, Any],
    evidence: list[dict[str, Any]],
    anchor: dict[str, Any] | None = None,
) -> str:
    for item in [anchor, *(envelope.get("verified_signals") or [])]:
        if not item:
            continue
        stage = normalize_driver_stage(item.get("stage")).value
        if stage != DriverStage.UNKNOWN.value:
            return stage
        signal_type = str(item.get("signal_type") or "")
        if "MARKETING" in signal_type.upper():
            return DriverStage.MARKETING.value
        if "CHANNEL" in signal_type.upper():
            return DriverStage.CHANNEL.value
        if "PRODUCT" in signal_type.upper() or "COGS" in signal_type.upper():
            return DriverStage.PRODUCT.value
    metrics = {str(item.get("metric")) for item in evidence}
    if metrics.intersection({"allocated_marketing", "marketing_pct", "cm2", "cm2_pct"}):
        return DriverStage.MARKETING.value
    if envelope.get("verified_facts") or evidence:
        return DriverStage.MIXED.value
    return DriverStage.UNKNOWN.value


def _attribution_caveat(
    context: dict[str, Any],
    envelope: dict[str, Any],
    evidence: list[dict[str, Any]],
    text: str,
) -> str | None:
    attributed = next(
        (
            str(item)
            for item in list(envelope.get("methodology_caveats") or []) + list(context.get("caveats") or [])
            if "attributed" in str(item).lower()
        ),
        None,
    )
    blob = " ".join(
        [
            text,
            " ".join(str(item.get("metric") or "") for item in evidence),
            " ".join(str(item.get("metric") or "") for item in (envelope.get("verified_facts") or [])[:8]),
            " ".join(str(item.get("metric") or "") for item in (envelope.get("verified_signals") or [])[:8]),
        ]
    ).lower()
    needs = any(token in blob for token in ("marketing", "cm2", "attributed", "allocation"))
    if not needs:
        return None
    return attributed or "Attributed marketing CM2 is not fully-loaded profitability."
