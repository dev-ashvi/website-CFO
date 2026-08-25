"""BeautyCo golden-reference adapter.

Maps the four reference CSVs onto canonical snake_case columns. Later client
datasets go through schema mapping instead of this file.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

from wyz_analytics.contracts.columns import SourceTables

ORDER_LINE_RENAME = {
    "ORDER_ID": "order_id",
    "ORDER_LINE_ID": "order_line_id",
    "ORDER_DATE": "order_date",
    "CUSTOMER_ID": "customer_id",
    "CHANNEL": "channel",
    "PLATFORM": "platform",
    "SKU_ID": "sku_id",
    "QUANTITY": "quantity",
    "MRP_PER_UNIT": "mrp_per_unit",
    "SELLING_PRICE_PER_UNIT": "selling_price_per_unit",
    "GROSS_REVENUE": "gross_revenue",
    "DISCOUNT_AMOUNT": "discount_amount",
    "NET_SALES_PRE_RETURN": "net_sales_pre_return",
    "TAX_AMOUNT": "tax_amount",
    "ORDER_STATUS": "order_status",
    "RETURN_FLAG": "return_flag",
    "RETURN_QTY": "return_qty",
    "RTO_FLAG": "rto_flag",
    "RTO_QTY": "rto_qty",
    "REFUND_AMOUNT": "refund_amount",
    "NET_REVENUE": "net_revenue",
    "PAYMENT_MODE": "payment_mode",
    "NEW_REPEAT_FLAG": "new_repeat_flag",
    "CUSTOMER_ORDER_NUMBER": "customer_order_number",
    "STATE": "state",
    "CITY": "city",
    "PINCODE": "pincode",
    "REGION": "region",
    "CITY_TIER": "city_tier",
    "FULFILMENT_LOCATION": "fulfilment_location",
    "COUPON_CODE": "coupon_code",
    "MARKETING_SOURCE": "marketing_source",
    "CAMPAIGN_ID": "campaign_id",
    "DEVICE_TYPE": "device_type",
}

SKU_RENAME = {
    "SKU_ID": "sku_id",
    "PRODUCT_NAME": "product_name",
    "BRAND": "brand",
    "CATEGORY": "category",
    "SUBCATEGORY": "subcategory",
    "PRODUCT_TYPE": "product_type",
    "VARIANT": "variant",
    "SIZE": "size",
    "PACK_TYPE": "pack_type",
    "MRP": "mrp",
    "LAUNCH_DATE": "launch_date",
    "DISCONTINUATION_DATE": "discontinuation_date",
    "PRODUCT_STATUS": "product_status",
    "UNIT_MANUFACTURING_COGS": "unit_manufacturing_cogs",
    "UNIT_PRIMARY_PACKAGING": "unit_primary_packaging",
    "UNIT_INBOUND_FREIGHT": "unit_inbound_freight",
    "UNIT_OTHER_DIRECT_COGS": "unit_other_direct_cogs",
    "UNIT_TOTAL_COGS": "unit_total_cogs",
}

SETTLEMENT_RENAME = {
    "SETTLEMENT_ID": "settlement_id",
    "ORDER_ID": "order_id",
    "SETTLEMENT_DATE": "settlement_date",
    "CHANNEL": "channel",
    "PLATFORM": "platform",
    "GROSS_ORDER_VALUE": "gross_order_value",
    "PLATFORM_DISCOUNT": "platform_discount",
    "BRAND_DISCOUNT": "brand_discount",
    "MARKETPLACE_COMMISSION": "marketplace_commission",
    "TRANSACTION_FEE": "transaction_fee",
    "FULFILMENT_FEE": "fulfilment_fee",
    "FORWARD_SHIPPING": "forward_shipping",
    "REVERSE_SHIPPING": "reverse_shipping",
    "RTO_COST": "rto_cost",
    "PAYMENT_GATEWAY_FEE": "payment_gateway_fee",
    "COD_FEE": "cod_fee",
    "PICK_PACK_FEE": "pick_pack_fee",
    "VARIABLE_WAREHOUSE_FEE": "variable_warehouse_fee",
    "PACKAGING_COST": "packaging_cost",
    "PENALTY": "penalty",
    "OTHER_VARIABLE_CHANNEL_COST": "other_variable_channel_cost",
    "TOTAL_CM1_COST": "total_cm1_cost",
    "NET_SETTLEMENT": "net_settlement",
    "SETTLEMENT_STATUS": "settlement_status",
}

MARKETING_RENAME = {
    "DATE": "spend_date",
    "PLATFORM": "platform",
    "CAMPAIGN_ID": "campaign_id",
    "CAMPAIGN_NAME": "campaign_name",
    "CAMPAIGN_TYPE": "campaign_type",
    "OBJECTIVE": "objective",
    "PRODUCT_CATEGORY": "product_category",
    "SKU_ID": "sku_id",
    "SPEND": "spend",
    "IMPRESSIONS": "impressions",
    "CLICKS": "clicks",
    "CONVERSIONS": "conversions",
    "ATTRIBUTED_REVENUE": "attributed_revenue",
    "NEW_CUSTOMERS": "new_customers",
    "ATTRIBUTED_CAC": "attributed_cac",
    "ROAS": "roas",
}

# BeautyCo paid-acquisition map used for channel-attributed CM2.
# Nykaa / Myntra / Q-commerce have no directly attributed paid spend in this model.
BEAUTYCO_MARKETING_PLATFORM_TO_CHANNEL = {
    "Meta Prospecting": "D2C Website",
    "Meta Retargeting": "D2C Website",
    "Google Performance": "D2C Website",
    "Google Search": "D2C Website",
    "Influencer": "D2C Website",
    "Affiliate": "D2C Website",
    "Other": "D2C Website",
    "Amazon Ads": "Amazon",
}

REQUIRED_FILES = {
    "order_lines": "01_ORDER_LINES.csv",
    "sku_master": "02_SKU_MASTER_COGS.csv",
    "channel_settlements": "03_CHANNEL_SETTLEMENTS.csv",
    "marketing_spend": "04_MARKETING_SPEND.csv",
}


def _read_csv(path: Path) -> pl.DataFrame:
    return pl.read_csv(path, infer_schema_length=10_000, ignore_errors=False)


def _rename(frame: pl.DataFrame, mapping: dict[str, str]) -> pl.DataFrame:
    missing = [src for src in mapping if src not in frame.columns]
    if missing:
        raise ValueError(f"Missing expected columns {missing} in {sorted(frame.columns)}")
    return frame.rename(mapping)


def load_beautyco_sources(data_dir: str | Path) -> SourceTables:
    root = Path(data_dir)
    paths = {key: root / name for key, name in REQUIRED_FILES.items()}
    missing = [str(path) for path in paths.values() if not path.exists()]
    if missing:
        raise FileNotFoundError("BeautyCo source files not found:\n" + "\n".join(missing))

    order_lines = _rename(_read_csv(paths["order_lines"]), ORDER_LINE_RENAME)
    sku_master = _rename(_read_csv(paths["sku_master"]), SKU_RENAME)
    settlements = _rename(_read_csv(paths["channel_settlements"]), SETTLEMENT_RENAME)
    marketing = _rename(_read_csv(paths["marketing_spend"]), MARKETING_RENAME)

    order_lines = order_lines.with_columns(
        pl.col("order_date").str.strptime(pl.Date, "%d-%m-%Y", strict=True)
    )
    marketing = marketing.with_columns(
        pl.col("sku_id").cast(pl.Utf8),
        pl.col("spend_date").str.strptime(pl.Date, "%Y-%m-%d", strict=True),
    )
    return SourceTables(
        order_lines=order_lines,
        sku_master=sku_master,
        channel_settlements=settlements,
        marketing_spend=marketing,
    )
