"""Canonical column names used by the deterministic engine."""

from __future__ import annotations

from dataclasses import dataclass

import polars as pl


@dataclass(frozen=True)
class SourceTables:
    order_lines: pl.DataFrame
    sku_master: pl.DataFrame
    channel_settlements: pl.DataFrame
    marketing_spend: pl.DataFrame


# Order lines
ORDER_ID = "order_id"
ORDER_LINE_ID = "order_line_id"
ORDER_DATE = "order_date"
CUSTOMER_ID = "customer_id"
CHANNEL = "channel"
PLATFORM = "platform"
SKU_ID = "sku_id"
QUANTITY = "quantity"
MRP_PER_UNIT = "mrp_per_unit"
GROSS_REVENUE = "gross_revenue"
DISCOUNT_AMOUNT = "discount_amount"
NET_SALES_PRE_RETURN = "net_sales_pre_return"
ORDER_STATUS = "order_status"
RETURN_QTY = "return_qty"
RTO_QTY = "rto_qty"
REFUND_AMOUNT = "refund_amount"
NET_REVENUE = "net_revenue"
NEW_REPEAT_FLAG = "new_repeat_flag"
REGION = "region"
CITY = "city"
CITY_TIER = "city_tier"
STATE = "state"
CAMPAIGN_ID = "campaign_id"
PAYMENT_MODE = "payment_mode"

# SKU master
PRODUCT_NAME = "product_name"
CATEGORY = "category"
SUBCATEGORY = "subcategory"
PRODUCT_STATUS = "product_status"
UNIT_MANUFACTURING_COGS = "unit_manufacturing_cogs"
UNIT_PRIMARY_PACKAGING = "unit_primary_packaging"
UNIT_INBOUND_FREIGHT = "unit_inbound_freight"
UNIT_OTHER_DIRECT_COGS = "unit_other_direct_cogs"
UNIT_TOTAL_COGS = "unit_total_cogs"

# Settlements
TOTAL_CM1_COST = "total_cm1_cost"
MARKETPLACE_COMMISSION = "marketplace_commission"
TRANSACTION_FEE = "transaction_fee"
FULFILMENT_FEE = "fulfilment_fee"
FORWARD_SHIPPING = "forward_shipping"
REVERSE_SHIPPING = "reverse_shipping"
RTO_COST = "rto_cost"
PAYMENT_GATEWAY_FEE = "payment_gateway_fee"
COD_FEE = "cod_fee"
PICK_PACK_FEE = "pick_pack_fee"
VARIABLE_WAREHOUSE_FEE = "variable_warehouse_fee"
PACKAGING_COST = "packaging_cost"
PENALTY = "penalty"
OTHER_VARIABLE_CHANNEL_COST = "other_variable_channel_cost"

# Marketing
SPEND_DATE = "spend_date"
CAMPAIGN_NAME = "campaign_name"
CAMPAIGN_TYPE = "campaign_type"
PRODUCT_CATEGORY = "product_category"
SPEND = "spend"
ATTRIBUTED_REVENUE = "attributed_revenue"
NEW_CUSTOMERS = "new_customers"
ATTRIBUTED_CAC = "attributed_cac"
ROAS = "roas"

# Derived line facts
ORDER_MONTH = "order_month"
UNITS_RETAINED = "units_retained"
PRODUCT_COGS = "product_cogs"
CM1_COST = "cm1_cost"
GROSS_MARGIN = "gross_margin"
CM1 = "cm1"
MARKETING_COST = "marketing_cost"
CM2 = "cm2"

CM1_COST_COMPONENTS = (
    MARKETPLACE_COMMISSION,
    TRANSACTION_FEE,
    FULFILMENT_FEE,
    FORWARD_SHIPPING,
    REVERSE_SHIPPING,
    RTO_COST,
    PAYMENT_GATEWAY_FEE,
    COD_FEE,
    PICK_PACK_FEE,
    VARIABLE_WAREHOUSE_FEE,
    PACKAGING_COST,
    PENALTY,
    OTHER_VARIABLE_CHANNEL_COST,
)
