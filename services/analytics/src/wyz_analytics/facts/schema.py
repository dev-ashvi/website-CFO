"""Canonical fact schema, dimensions, and column mappings."""

from __future__ import annotations

from wyz_analytics.contracts.columns import (
    CAMPAIGN_ID,
    CATEGORY,
    CHANNEL,
    CITY,
    CITY_TIER,
    CM1,
    CM1_COST,
    CM1_COST_COMPONENTS,
    COD_FEE,
    CUSTOMER_ID,
    DISCOUNT_AMOUNT,
    FORWARD_SHIPPING,
    FULFILMENT_FEE,
    GROSS_MARGIN,
    GROSS_REVENUE,
    MARKETING_COST,
    MARKETPLACE_COMMISSION,
    NET_REVENUE,
    NET_SALES_PRE_RETURN,
    NEW_REPEAT_FLAG,
    ORDER_DATE,
    ORDER_ID,
    ORDER_LINE_ID,
    ORDER_MONTH,
    OTHER_VARIABLE_CHANNEL_COST,
    PACKAGING_COST,
    PAYMENT_GATEWAY_FEE,
    PAYMENT_MODE,
    PENALTY,
    PICK_PACK_FEE,
    PLATFORM,
    PRODUCT_COGS,
    QUANTITY,
    REFUND_AMOUNT,
    REGION,
    RETURN_QTY,
    RTO_COST,
    RTO_QTY,
    REVERSE_SHIPPING,
    SKU_ID,
    STATE,
    SUBCATEGORY,
    TRANSACTION_FEE,
    UNIT_INBOUND_FREIGHT,
    UNIT_MANUFACTURING_COGS,
    UNIT_OTHER_DIRECT_COGS,
    UNIT_PRIMARY_PACKAGING,
    UNITS_RETAINED,
    VARIABLE_WAREHOUSE_FEE,
    CM2,
)

# Persisted fact column names (analytical schema)
DATE = "date"
MONTH = "month"
QUARTER = "quarter"
NEW_REPEAT = "new_repeat"
DISCOUNT = "discount"
REFUND = "refund"
ALLOCATED_MARKETING = "allocated_marketing"
RETURN_QTY_COL = "return_qty"
RTO_QTY_COL = "rto_qty"

PRODUCT_COGS_COMPONENTS = (
    ("manufacturing_cogs", UNIT_MANUFACTURING_COGS),
    ("primary_packaging", UNIT_PRIMARY_PACKAGING),
    ("inbound_freight", UNIT_INBOUND_FREIGHT),
    ("other_direct_cogs", UNIT_OTHER_DIRECT_COGS),
)

CM1_COMPONENT_MAP = {
    "marketplace_commission": MARKETPLACE_COMMISSION,
    "transaction_fee": TRANSACTION_FEE,
    "fulfilment": FULFILMENT_FEE,
    "forward_shipping": FORWARD_SHIPPING,
    "reverse_shipping": REVERSE_SHIPPING,
    "rto_cost": RTO_COST,
    "payment_gateway_fee": PAYMENT_GATEWAY_FEE,
    "cod_fee": COD_FEE,
    "pick_pack_fee": PICK_PACK_FEE,
    "warehouse_fee": VARIABLE_WAREHOUSE_FEE,
    "packaging_cost": PACKAGING_COST,
    "penalty": PENALTY,
    "other_variable_cost": OTHER_VARIABLE_CHANNEL_COST,
}

# Query dimension id → fact column
DIMENSION_COLUMNS: dict[str, str] = {
    "month": MONTH,
    "quarter": QUARTER,
    "channel": CHANNEL,
    "platform": PLATFORM,
    "category": CATEGORY,
    "subcategory": SUBCATEGORY,
    "sku": SKU_ID,
    "region": REGION,
    "state": STATE,
    "city_tier": CITY_TIER,
    "new_repeat": NEW_REPEAT,
    "campaign_id": CAMPAIGN_ID,
}

GROUP_BY_DIMENSIONS = frozenset(DIMENSION_COLUMNS)

FILTER_DIMENSIONS = frozenset(DIMENSION_COLUMNS)

RANGE_FILTER_KEYS = frozenset({"month_from", "month_to", "date_from", "date_to"})

ADDITIVE_FACT_COLUMNS = (
    QUANTITY,
    UNITS_RETAINED,
    GROSS_REVENUE,
    DISCOUNT,
    REFUND,
    NET_REVENUE,
    "manufacturing_cogs",
    "primary_packaging",
    "inbound_freight",
    "other_direct_cogs",
    PRODUCT_COGS,
    GROSS_MARGIN,
    *CM1_COMPONENT_MAP.keys(),
    CM1_COST,
    CM1,
    ALLOCATED_MARKETING,
    CM2,
    RETURN_QTY_COL,
    RTO_QTY_COL,
)

DISTINCT_ID_COLUMNS = {
    "order_id": ORDER_ID,
    "customer_id": CUSTOMER_ID,
}

SUMMARY_METRICS = (
    "gross_revenue",
    "discount",
    "refund",
    "net_revenue",
    "product_cogs",
    "gross_margin",
    "gross_margin_pct",
    "cm1_cost",
    "cm1",
    "cm1_pct",
    "allocated_marketing",
    "marketing_pct",
    "cm2",
    "cm2_pct",
    "orders",
    "customers",
    "units",
    "gross_aov",
    "net_aov",
    "units_per_order",
    "discount_pct",
    "return_pct",
    "rto_pct",
    "revenue_realisation_pct",
)
