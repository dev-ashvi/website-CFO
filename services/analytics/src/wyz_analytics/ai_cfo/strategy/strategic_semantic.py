"""Compact semantic keys for strategic judgment — model selects; Python resolves prose."""

from __future__ import annotations

from wyz_analytics.ai_cfo.strategy.evidence_requirements import DecisionTheme

_REASON_KEYS: dict[DecisionTheme, list[str]] = {
    DecisionTheme.MARKETING: [
        "cm1_healthy_before_marketing",
        "marketing_consumes_contribution",
        "cm2_pressure_material",
        "pressure_persistent",
        "pressure_concentrated",
        "sensitivity_available",
        "demand_response_unknown",
    ],
    DecisionTheme.CHANNEL_EXIT: [
        "channel_economics_weak",
        "channel_below_peers",
        "channel_material",
        "weakness_persistent",
        "weakness_concentrated",
        "marketing_not_primary_driver",
        "insufficient_exit_burden",
        "strategic_value_unknown",
    ],
    DecisionTheme.SKU_EXIT: [
        "sku_contribution_negative",
        "sku_below_peers",
        "weakness_persistent",
        "cost_driver_isolated",
        "insufficient_exit_burden",
    ],
    DecisionTheme.PRICE: [
        "margin_not_primary_constraint",
        "margin_headroom_exists",
        "pricing_not_required_yet",
        "elasticity_unknown",
        "competitive_response_unknown",
    ],
    DecisionTheme.PRODUCT_COST: [
        "cogs_material_pressure",
        "cost_concentrated",
        "reconciliation_ok",
        "operational_feasibility_unknown",
    ],
    DecisionTheme.PRIORITIZE: [
        "marketing_most_material",
        "product_cost_most_material",
        "contribution_most_material",
        "multiple_pressures_competing",
    ],
    DecisionTheme.GENERIC: ["verified_drivers_mixed", "evidence_insufficient_for_strong_move"],
}

_CHANGE_MY_VIEW_KEYS: dict[DecisionTheme, list[str]] = {
    DecisionTheme.MARKETING: [
        "demand_deteriorates_during_reduction",
        "cm2_benefit_outweighed_by_revenue_loss",
        "marketing_pressure_not_persistent",
    ],
    DecisionTheme.CHANNEL_EXIT: [
        "channel_stays_below_peers_after_fixes",
        "persistent_negative_contribution",
        "concentration_does_not_explain_weakness",
        "retention_or_strategic_value_material",
    ],
    DecisionTheme.SKU_EXIT: [
        "persistent_negative_sku_contribution",
        "peer_skus_remain_stronger",
        "portfolio_cross_sell_risk_material",
    ],
    DecisionTheme.PRICE: [
        "bounded_price_test_shows_volume_risk",
        "competitive_response_worsens_economics",
        "margin_headroom_insufficient",
    ],
    DecisionTheme.PRODUCT_COST: [
        "cost_reduction_breaks_quality_or_supply",
        "reconciliation_fails_after_deeper_review",
    ],
    DecisionTheme.PRIORITIZE: [
        "higher_material_pressure_emerges",
        "lower_priority_driver_worsens_faster",
    ],
    DecisionTheme.GENERIC: ["new_verified_driver_materializes"],
}

_TRADEOFF_KEYS: dict[DecisionTheme, list[str]] = {
    DecisionTheme.MARKETING: ["demand_response_unknown", "attribution_limitation"],
    DecisionTheme.CHANNEL_EXIT: ["exit_is_irreversible", "strategic_channel_value_unknown"],
    DecisionTheme.SKU_EXIT: ["portfolio_consequences_unknown"],
    DecisionTheme.PRICE: ["elasticity_unknown", "competitive_response_unknown"],
    DecisionTheme.PRODUCT_COST: ["operational_feasibility_unknown"],
    DecisionTheme.PRIORITIZE: ["multiple_valid_interventions"],
    DecisionTheme.GENERIC: ["multiple_valid_interventions", "growth_quality_vs_topline"],
}

_REASON_COPY: dict[str, str] = {
    "cm1_healthy_before_marketing": "Contribution before marketing is still positive in this view.",
    "marketing_consumes_contribution": "Attributed marketing is consuming a material share of contribution.",
    "cm2_pressure_material": "Post-marketing contribution pressure is material.",
    "channel_economics_weak": "The channel economics look weak on verified contribution margins.",
    "channel_below_peers": "The channel compares unfavorably to peer channels on contribution margin.",
    "insufficient_exit_burden": "The evidence burden for exit is not met from verified facts alone.",
    "margin_not_primary_constraint": "Margin structure alone does not prove pricing is the binding constraint.",
    "elasticity_unknown": "Price elasticity is not observable from margin data alone.",
    "marketing_most_material": "Marketing efficiency looks like the most material verified drag after CM1.",
    "product_cost_most_material": "Product cost pressure looks like the most material verified drag.",
    "contribution_most_material": "Contribution pressure looks like the most material verified drag in this view.",
    "multiple_pressures_competing": "Multiple verified pressures compete and need explicit prioritization.",
}

_CHANGE_MY_VIEW_COPY: dict[str, str] = {
    "demand_deteriorates_during_reduction": "Demand deteriorates materially during a controlled reduction.",
    "cm2_benefit_outweighed_by_revenue_loss": "Any CM2 benefit is outweighed by revenue or order deterioration.",
    "channel_stays_below_peers_after_fixes": "The channel remains materially below peers after controllable pressures are addressed.",
    "persistent_negative_contribution": "Persistent negative contribution continues after driver isolation.",
    "concentration_does_not_explain_weakness": "Category or SKU concentration does not explain the weakness.",
    "bounded_price_test_shows_volume_risk": "A bounded price test shows unacceptable volume response.",
    "competitive_response_worsens_economics": "Competitive or customer response materially worsens economics.",
    "higher_material_pressure_emerges": "A higher-material verified pressure emerges in this view.",
}


def reason_keys_for_theme(theme: DecisionTheme | None) -> list[str]:
    return list(_REASON_KEYS.get(theme or DecisionTheme.GENERIC, _REASON_KEYS[DecisionTheme.GENERIC]))


def change_my_view_keys_for_theme(theme: DecisionTheme | None) -> list[str]:
    return list(
        _CHANGE_MY_VIEW_KEYS.get(theme or DecisionTheme.GENERIC, _CHANGE_MY_VIEW_KEYS[DecisionTheme.GENERIC])
    )


def tradeoff_keys_for_theme(theme: DecisionTheme | None) -> list[str]:
    return list(_TRADEOFF_KEYS.get(theme or DecisionTheme.GENERIC, []))


def resolve_reason_key(key: str | None) -> str | None:
    if not key:
        return None
    return _REASON_COPY.get(str(key).strip())


def resolve_change_my_view_keys(keys: list[str] | None) -> list[str]:
    if not keys:
        return []
    out: list[str] = []
    for key in keys[:4]:
        text = _CHANGE_MY_VIEW_COPY.get(str(key).strip())
        if text:
            out.append(text)
    return out
