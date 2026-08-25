"""Deterministic file-role classification with a pluggable supplement hook."""

from __future__ import annotations

from typing import Protocol

from wyz_analytics.ingest.models import FileProfile, RoleClassification
from wyz_analytics.mapping.names import normalize_name
from wyz_analytics.schemas.roles import FileRole

# Distinctive tokens. Filenames are never used.
_ROLE_TOKENS: dict[FileRole, tuple[str, ...]] = {
    FileRole.ORDER_LINES: (
        "order_line_id",
        "gross_revenue",
        "net_revenue",
        "quantity",
        "return_qty",
        "rto_qty",
        "order_id",
        "sku_id",
    ),
    FileRole.SKU_MASTER: (
        "unit_total_cogs",
        "unit_manufacturing_cogs",
        "unit_cogs",
        "product_name",
        "sku_id",
        "subcategory",
    ),
    FileRole.CHANNEL_SETTLEMENTS: (
        "total_cm1_cost",
        "marketplace_commission",
        "net_settlement",
        "settlement_id",
        "fulfilment_fee",
        "fulfillment_fee",
        "forward_shipping",
    ),
    FileRole.MARKETING_SPEND: (
        "spend",
        "attributed_revenue",
        "impressions",
        "roas",
        "campaign_name",
        "campaign_id",
        "ad_spend",
    ),
}

_NEGATIVE: dict[FileRole, tuple[str, ...]] = {
    FileRole.SKU_MASTER: ("order_id", "order_line_id", "gross_revenue"),
    FileRole.MARKETING_SPEND: ("order_line_id", "unit_total_cogs", "total_cm1_cost"),
    FileRole.CHANNEL_SETTLEMENTS: ("order_line_id", "unit_total_cogs", "impressions"),
    FileRole.ORDER_LINES: ("unit_total_cogs", "total_cm1_cost", "impressions"),
}


class RoleClassifier(Protocol):
    def classify(self, profile: FileProfile) -> RoleClassification:
        ...


class HeuristicRoleClassifier:
    """Score column-name overlap. Designed so an LLM classifier can replace/supplement it."""

    def classify(self, profile: FileProfile) -> RoleClassification:
        tokens = {normalize_name(name) for name in profile.column_names()}
        scored: list[tuple[FileRole, float, list[str]]] = []
        for role, positives in _ROLE_TOKENS.items():
            hits = [token for token in positives if token in tokens]
            misses = [token for token in _NEGATIVE.get(role, ()) if token in tokens]
            raw = len(hits) / max(len(positives), 1)
            penalty = 0.15 * len(misses)
            score = max(0.0, raw - penalty)
            evidence = [f"matched:{token}" for token in hits]
            evidence.extend(f"conflict:{token}" for token in misses)
            scored.append((role, score, evidence))
        scored.sort(key=lambda item: item[1], reverse=True)
        best_role, best_score, best_evidence = scored[0]
        if best_score < 0.25:
            return RoleClassification(
                role=FileRole.UNKNOWN.value,
                confidence=round(1.0 - best_score, 4),
                evidence=["No role crossed the minimum token threshold"],
                alternatives=[
                    {"role": role.value, "confidence": round(score, 4)}
                    for role, score, _ in scored[:3]
                ],
            )
        runner_up = scored[1][1] if len(scored) > 1 else 0.0
        confidence = round(min(1.0, best_score + 0.15 * (best_score - runner_up)), 4)
        if best_score - runner_up < 0.08:
            confidence = round(min(confidence, 0.72), 4)
        return RoleClassification(
            role=best_role.value,
            confidence=confidence,
            evidence=best_evidence,
            alternatives=[
                {"role": role.value, "confidence": round(score, 4)}
                for role, score, _ in scored[1:3]
            ],
        )


class CompositeRoleClassifier:
    """Deterministic first; optional supplement may only add alternatives, not replace high-confidence hits."""

    def __init__(self, primary: RoleClassifier | None = None, supplement: RoleClassifier | None = None):
        self.primary = primary or HeuristicRoleClassifier()
        self.supplement = supplement

    def classify(self, profile: FileProfile) -> RoleClassification:
        result = self.primary.classify(profile)
        if self.supplement is None or result.confidence >= 0.85:
            return result
        extra = self.supplement.classify(profile)
        alternatives = list(result.alternatives)
        alternatives.append({"role": extra.role, "confidence": extra.confidence, "origin": "supplement"})
        result.alternatives = alternatives
        return result
