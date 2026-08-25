"""Canonical WYZ schemas for the four commerce/finance source types.

ENGINE_CALCULATED fields (GM, CM1, CM2, product COGS, …) must not be required
from clients. The financial engine remains the only source of those metrics.
"""

from __future__ import annotations

from wyz_analytics.schemas.fields import CanonicalSchema, FieldDtype, FieldSpec, FieldSupply
from wyz_analytics.schemas.roles import FileRole

R = FieldSupply.REQUIRED_SOURCE
O = FieldSupply.OPTIONAL_SOURCE
D = FieldSupply.DERIVABLE
E = FieldSupply.ENGINE_CALCULATED
S = FieldDtype


def _f(
    name: str,
    dtype: FieldDtype,
    supply: FieldSupply,
    description: str,
    aliases: tuple[str, ...] = (),
    used_for: tuple[str, ...] = (),
) -> FieldSpec:
    return FieldSpec(name, dtype, supply, description, aliases, used_for)


ORDER_LINES_SCHEMA = CanonicalSchema(
    role=FileRole.ORDER_LINES.value,
    description="One row = one SKU on one customer order.",
    expected_grain="order_line",
    fields=(
        _f("order_id", S.UTF8, R, "Order identifier", ("ord_no", "order_number", "order_no", "orderid"), ("joins", "orders")),
        _f("order_line_id", S.UTF8, R, "Order line identifier", ("line_id", "order_item_id", "item_id"), ("grain",)),
        _f("order_date", S.DATE, R, "Order date", ("date", "txn_date", "transaction_date", "order_dt"), ("month",)),
        _f("customer_id", S.UTF8, R, "Customer identifier", ("cust_id", "customerid", "user_id"), ("customer",)),
        _f("channel", S.UTF8, R, "Selling channel", ("sales_channel", "channel_name"), ("cm2_allocation", "dimensions")),
        _f("sku_id", S.UTF8, R, "SKU identifier", ("sku", "item_sku", "product_sku", "product_id"), ("joins", "cogs")),
        _f("quantity", S.FLOAT, R, "Units sold on the line", ("qty", "units", "unit_sold"), ("cogs", "gross_revenue")),
        _f("order_status", S.UTF8, R, "Delivered / Returned / RTO / Cancelled", ("status", "line_status"), ("cogs",)),
        _f("return_qty", S.FLOAT, R, "Returned units", ("returned_qty", "return_quantity"), ("cogs", "net_revenue")),
        _f("rto_qty", S.FLOAT, R, "RTO units", ("rto_quantity",), ("cogs", "net_revenue")),
        _f("gross_revenue", S.FLOAT, R, "Gross merchandise value (usually qty × MRP)", ("gmv", "gross_sales", "gross_amount"), ("gross_revenue",)),
        _f("discount_amount", S.FLOAT, R, "Discount in currency", ("discount", "discount_value", "markdown"), ("net_revenue",)),
        _f("net_sales_pre_return", S.FLOAT, R, "Sales value before returns; CM1 allocation base", ("nsv_pre_return", "pre_return_net_sales", "net_sales"), ("cm1_allocation",)),
        _f("refund_amount", S.FLOAT, R, "Returns / RTO / cancellation leakage", ("refunds", "return_amount"), ("net_revenue",)),
        _f("net_revenue", S.FLOAT, R, "Recognised net revenue", ("nsv", "net_sales_value", "net_amount"), ("net_revenue", "cm2_allocation")),
        _f("mrp_per_unit", S.FLOAT, O, "List price per unit; used to validate gross revenue", ("mrp", "list_price", "unit_mrp"), ("validation",)),
        _f("platform", S.UTF8, O, "Platform within channel", ("marketplace",), ("dimensions",)),
        _f("campaign_id", S.UTF8, O, "Attributed campaign; not the CM2 allocation join", ("campaign", "utm_campaign"), ("marketing_analytics",)),
        _f("payment_mode", S.UTF8, O, "COD / prepaid etc.", ("payment_type", "payment_method"), ("dimensions",)),
        _f("new_repeat_flag", S.UTF8, O, "New vs repeat customer", ("customer_type", "new_repeat"), ("dimensions",)),
        _f("region", S.UTF8, O, "Region", (), ("geography",)),
        _f("state", S.UTF8, O, "State", (), ("geography",)),
        _f("city", S.UTF8, O, "City", (), ("geography",)),
        _f("city_tier", S.UTF8, O, "City tier", ("tier",), ("geography",)),
        _f("pincode", S.UTF8, O, "Pincode", ("zip", "postal_code"), ("geography",)),
        _f("selling_price_per_unit", S.FLOAT, O, "Selling price per unit", ("selling_price", "asp"), ()),
        _f("tax_amount", S.FLOAT, O, "Tax amount", ("tax", "gst"), ()),
        _f("return_flag", S.UTF8, O, "Return flag", (), ()),
        _f("rto_flag", S.UTF8, O, "RTO flag", (), ()),
        _f("customer_order_number", S.INT, O, "Lifetime order number for the customer", (), ("customer",)),
        _f("fulfilment_location", S.UTF8, O, "FC / warehouse", ("warehouse", "fc"), ()),
        _f("coupon_code", S.UTF8, O, "Coupon", ("promo_code",), ()),
        _f("marketing_source", S.UTF8, O, "Marketing source on the order", ("source", "utm_source"), ()),
        _f("device_type", S.UTF8, O, "Device", ("device",), ()),
        _f("order_month", S.UTF8, E, "YYYY-MM derived by the engine from order_date", (), ("month",)),
        _f("units_retained", S.FLOAT, E, "Units kept after returns/RTO/cancel", (), ("cogs",)),
        _f("product_cogs", S.FLOAT, E, "Retained units × unit total COGS", (), ("cogs", "gross_margin")),
        _f("gross_margin", S.FLOAT, E, "Net revenue − product COGS", (), ("gross_margin",)),
        _f("cm1_cost", S.FLOAT, E, "Allocated order-level CM1 cost", (), ("cm1",)),
        _f("cm1", S.FLOAT, E, "Gross margin − allocated CM1 costs", (), ("cm1",)),
        _f("marketing_cost", S.FLOAT, E, "Allocated marketing spend", (), ("cm2",)),
        _f("cm2", S.FLOAT, E, "CM1 − allocated marketing", (), ("cm2",)),
    ),
)

SKU_MASTER_SCHEMA = CanonicalSchema(
    role=FileRole.SKU_MASTER.value,
    description="One row = one SKU with product hierarchy and unit COGS.",
    expected_grain="sku",
    fields=(
        _f("sku_id", S.UTF8, R, "SKU identifier", ("sku", "item_sku", "product_sku", "product_id"), ("joins",)),
        _f("unit_total_cogs", S.FLOAT, R, "Total landed unit COGS", ("unit_cogs", "cogs", "total_cogs"), ("cogs",)),
        _f("category", S.UTF8, R, "Product category", ("product_category", "cat"), ("cm2_allocation", "dimensions")),
        _f("product_name", S.UTF8, O, "Product name", ("name", "sku_name", "item_name"), ("dimensions",)),
        _f("subcategory", S.UTF8, O, "Subcategory", ("sub_category", "subcat"), ("dimensions",)),
        _f("product_status", S.UTF8, O, "Active / discontinued", ("status",), ()),
        _f("brand", S.UTF8, O, "Brand", (), ()),
        _f("product_type", S.UTF8, O, "Product type", (), ()),
        _f("variant", S.UTF8, O, "Variant", ("shade",), ()),
        _f("size", S.UTF8, O, "Size", (), ()),
        _f("pack_type", S.UTF8, O, "Pack type", (), ()),
        _f("mrp", S.FLOAT, O, "SKU list price", ("list_price",), ()),
        _f("launch_date", S.DATE, O, "Launch date", (), ()),
        _f("discontinuation_date", S.DATE, O, "Discontinuation date", (), ()),
        _f("unit_manufacturing_cogs", S.FLOAT, O, "Manufacturing COGS component", ("mfg_cogs",), ("cogs", "validation")),
        _f("unit_primary_packaging", S.FLOAT, O, "Packaging COGS component", ("packaging_cogs",), ("cogs", "validation")),
        _f("unit_inbound_freight", S.FLOAT, O, "Inbound freight component", ("inbound_cogs",), ("cogs", "validation")),
        _f("unit_other_direct_cogs", S.FLOAT, O, "Other direct COGS", (), ("cogs", "validation")),
        _f("unit_total_cogs_derived", S.FLOAT, D, "Sum of COGS components when unit_total_cogs is absent", (), ("cogs",)),
    ),
)

CHANNEL_SETTLEMENTS_SCHEMA = CanonicalSchema(
    role=FileRole.CHANNEL_SETTLEMENTS.value,
    description="One row = one order's variable channel / fulfilment economics.",
    expected_grain="order",
    fields=(
        _f("order_id", S.UTF8, R, "Order identifier", ("ord_no", "order_number", "order_no"), ("joins", "cm1")),
        _f("total_cm1_cost", S.FLOAT, R, "Total variable CM1 cost for the order", ("cm1_cost", "variable_cost", "total_variable_cost"), ("cm1",)),
        _f("settlement_id", S.UTF8, O, "Settlement identifier", (), ()),
        _f("settlement_date", S.DATE, O, "Settlement date", (), ()),
        _f("channel", S.UTF8, O, "Channel", (), ("dimensions",)),
        _f("platform", S.UTF8, O, "Platform", (), ("dimensions",)),
        _f("gross_order_value", S.FLOAT, O, "Gross order value", ("gov",), ()),
        _f("platform_discount", S.FLOAT, O, "Platform-funded discount", (), ()),
        _f("brand_discount", S.FLOAT, O, "Brand-funded discount", (), ()),
        _f("net_settlement", S.FLOAT, O, "Net payout", (), ()),
        _f("settlement_status", S.UTF8, O, "Settled / pending", (), ()),
        _f("marketplace_commission", S.FLOAT, O, "Commission", ("commission",), ("cm1", "validation")),
        _f("transaction_fee", S.FLOAT, O, "Transaction fee", (), ("cm1", "validation")),
        _f("fulfilment_fee", S.FLOAT, O, "Fulfilment fee", ("fulfillment_fee",), ("cm1", "validation")),
        _f("forward_shipping", S.FLOAT, O, "Forward shipping", ("shipping",), ("cm1", "validation")),
        _f("reverse_shipping", S.FLOAT, O, "Reverse shipping", (), ("cm1", "validation")),
        _f("rto_cost", S.FLOAT, O, "RTO cost", (), ("cm1", "validation")),
        _f("payment_gateway_fee", S.FLOAT, O, "PG fee", ("pg_fee",), ("cm1", "validation")),
        _f("cod_fee", S.FLOAT, O, "COD fee", (), ("cm1", "validation")),
        _f("pick_pack_fee", S.FLOAT, O, "Pick & pack", (), ("cm1", "validation")),
        _f("variable_warehouse_fee", S.FLOAT, O, "Variable warehouse", ("warehouse_fee",), ("cm1", "validation")),
        _f("packaging_cost", S.FLOAT, O, "Packaging", (), ("cm1", "validation")),
        _f("penalty", S.FLOAT, O, "Penalties", (), ("cm1", "validation")),
        _f("other_variable_channel_cost", S.FLOAT, O, "Other variable channel cost", (), ("cm1", "validation")),
        _f("total_cm1_cost_derived", S.FLOAT, D, "Sum of CM1 components when total_cm1_cost is absent", (), ("cm1",)),
    ),
)

MARKETING_SPEND_SCHEMA = CanonicalSchema(
    role=FileRole.MARKETING_SPEND.value,
    description="One row = campaign × month spend and reported outcomes.",
    expected_grain="campaign_month",
    fields=(
        _f("spend", S.FLOAT, R, "Marketing spend", ("cost", "amount", "ad_spend", "media_spend"), ("cm2",)),
        _f("platform", S.UTF8, R, "Media platform used for channel attribution", ("media_platform", "ad_platform"), ("cm2_allocation",)),
        _f("spend_date", S.DATE, O, "Campaign date / month start", ("date", "month", "period"), ("marketing_analytics",)),
        _f("campaign_id", S.UTF8, O, "Campaign identifier", ("campaign",), ("marketing_analytics",)),
        _f("campaign_name", S.UTF8, O, "Campaign name", (), ("marketing_analytics",)),
        _f("campaign_type", S.UTF8, O, "Campaign type", (), ()),
        _f("objective", S.UTF8, O, "Campaign objective", (), ()),
        _f("product_category", S.UTF8, O, "Tagged category; All Categories = channel-wide", ("category",), ("cm2_allocation",)),
        _f("sku_id", S.UTF8, O, "Hero SKU tag when present", ("sku",), ("cm2_allocation",)),
        _f("impressions", S.FLOAT, O, "Impressions", (), ()),
        _f("clicks", S.FLOAT, O, "Clicks", (), ()),
        _f("conversions", S.FLOAT, O, "Conversions", (), ()),
        _f("attributed_revenue", S.FLOAT, O, "Platform-attributed revenue", ("revenue",), ("roas",)),
        _f("new_customers", S.FLOAT, O, "Attributed new customers", (), ("cac",)),
        _f("attributed_cac", S.FLOAT, O, "Reported CAC", ("cac",), ()),
        _f("roas", S.FLOAT, O, "Reported ROAS", (), ()),
        _f("gross_margin", S.FLOAT, E, "Not a marketing source field", (), ()),
        _f("cm1", S.FLOAT, E, "Not a marketing source field", (), ()),
        _f("cm2", S.FLOAT, E, "Engine-calculated; clients must not supply this as truth", (), ()),
    ),
)

SCHEMAS_BY_ROLE: dict[FileRole, CanonicalSchema] = {
    FileRole.ORDER_LINES: ORDER_LINES_SCHEMA,
    FileRole.SKU_MASTER: SKU_MASTER_SCHEMA,
    FileRole.CHANNEL_SETTLEMENTS: CHANNEL_SETTLEMENTS_SCHEMA,
    FileRole.MARKETING_SPEND: MARKETING_SPEND_SCHEMA,
}


def schema_for(role: FileRole) -> CanonicalSchema:
    if role not in SCHEMAS_BY_ROLE:
        raise KeyError(f"No canonical schema for {role}")
    return SCHEMAS_BY_ROLE[role]
