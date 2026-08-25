"""Deterministic fake SchemaMappingModel for tests. No network, no API keys."""

from __future__ import annotations

from wyz_analytics.mapping.ai_contract import SchemaMappingProposal, SchemaMappingRequest, SchemaMappingResponse
from wyz_analytics.mapping.models import MappingOrigin
from wyz_analytics.mapping.names import normalize_name

# Semantic names the deterministic alias catalog does not already cover.
# Ambiguous labels stay below auto-accept and usually below review.
_SEMANTIC: dict[tuple[str, str], tuple[str, float, str]] = {
    ("txn_ref", "ORDER_LINES"): ("order_id", 0.93, "semantic_and_value_pattern"),
    ("txn_ref", "CHANNEL_SETTLEMENTS"): ("order_id", 0.93, "semantic_and_value_pattern"),
    ("item_code", "ORDER_LINES"): ("sku_id", 0.93, "semantic_name"),
    ("item_code", "SKU_MASTER"): ("sku_id", 0.93, "semantic_name"),
    ("fwd_ship", "CHANNEL_SETTLEMENTS"): ("forward_shipping", 0.92, "semantic_name"),
    ("rev_ship", "CHANNEL_SETTLEMENTS"): ("reverse_shipping", 0.92, "semantic_name"),
    ("failed_delivery_charge", "CHANNEL_SETTLEMENTS"): ("rto_cost", 0.91, "semantic_and_value_pattern"),
    ("order_number", "ORDER_LINES"): ("order_id", 0.9, "semantic_name"),
    ("product_sku", "ORDER_LINES"): ("sku_id", 0.9, "semantic_name"),
    ("product_sku", "SKU_MASTER"): ("sku_id", 0.9, "semantic_name"),
    ("net_sales", "ORDER_LINES"): ("net_revenue", 0.72, "ambiguous_net_sales"),
    ("sales", "ORDER_LINES"): ("net_revenue", 0.46, "ambiguous_sales"),
    ("list_value", "ORDER_LINES"): ("gross_revenue", 0.44, "ambiguous_list_value"),
    ("fees", "CHANNEL_SETTLEMENTS"): ("marketplace_commission", 0.42, "ambiguous_fees"),
    ("landed_cost", "SKU_MASTER"): ("unit_total_cogs", 0.47, "ambiguous_landed_cost"),
    ("realised_value", "ORDER_LINES"): ("net_revenue", 0.45, "ambiguous_realised_value"),
    ("platform_deductions", "CHANNEL_SETTLEMENTS"): ("total_cm1_cost", 0.43, "ambiguous_platform_deductions"),
    ("delivery_loss", "CHANNEL_SETTLEMENTS"): ("rto_cost", 0.44, "ambiguous_delivery_loss"),
}


class FakeSchemaMappingModel:
    """Lookup-table stand-in for an LLM. Used by the default test suite."""

    origin = MappingOrigin.AI_PROPOSED

    def propose(self, request: SchemaMappingRequest) -> SchemaMappingResponse:
        allowed_fields = {field.name for field in request.unresolved_canonical_fields}
        required = {
            field.name for field in request.unresolved_canonical_fields if field.supply == "required_source"
        }
        unresolved_names = {col.name for col in request.unresolved_source_columns}
        used_fields: set[str] = set()
        mappings: list[SchemaMappingProposal] = []
        for column in request.unresolved_source_columns:
            token = normalize_name(column.name)
            hit = _SEMANTIC.get((token, request.file_role)) or _SEMANTIC.get((token, "*"))
            if not hit:
                continue
            canonical, confidence, reason = hit
            if canonical not in allowed_fields or canonical in used_fields:
                continue
            used_fields.add(canonical)
            mappings.append(
                SchemaMappingProposal(
                    source_column=column.name,
                    canonical_field=canonical,
                    model_confidence=confidence,
                    reason_code=reason,
                )
            )
        mapped_sources = {item.source_column for item in mappings}
        mapped_fields = {item.canonical_field for item in mappings}
        return SchemaMappingResponse(
            mappings=mappings,
            unmapped_source_columns=sorted(unresolved_names - mapped_sources),
            unresolved_required_fields=sorted(required - mapped_fields),
        )
