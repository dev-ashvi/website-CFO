from __future__ import annotations

import polars as pl

from wyz_analytics.ingest.pipeline import ingest_loaded_tables
from wyz_analytics.mapping.fake_model import FakeSchemaMappingModel
from wyz_analytics.mapping.models import MappingStatus
from wyz_analytics.schemas.roles import FileRole


def _orders(**overrides) -> pl.DataFrame:
    base = {
        "order_id": ["O1", "O2"],
        "order_line_id": ["L1", "L2"],
        "order_date": ["01-04-2025", "02-04-2025"],
        "customer_id": ["C1", "C2"],
        "channel": ["Amazon", "Amazon"],
        "sku_id": ["SKU1", "SKU2"],
        "quantity": [1.0, 1.0],
        "order_status": ["Delivered", "Delivered"],
        "return_qty": [0.0, 0.0],
        "rto_qty": [0.0, 0.0],
        "gross_revenue": [100.0, 80.0],
        "discount_amount": [0.0, 0.0],
        "net_sales_pre_return": [100.0, 80.0],
        "refund_amount": [0.0, 0.0],
        "net_revenue": [100.0, 80.0],
    }
    base.update(overrides)
    return pl.DataFrame(base)


def _sku() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "sku_id": ["SKU1", "SKU2"],
            "unit_total_cogs": [10.0, 12.0],
            "category": ["Makeup", "Makeup"],
            "product_name": ["A", "B"],
        }
    )


def _settle() -> pl.DataFrame:
    return pl.DataFrame({"order_id": ["O1", "O2"], "total_cm1_cost": [5.0, 4.0], "marketplace_commission": [1.0, 1.0]})


def _mkt() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "spend": [10.0],
            "platform": ["Amazon Ads"],
            "campaign_id": ["CAMP1"],
            "spend_date": ["2025-04-01"],
            "attributed_revenue": [50.0],
        }
    )


def _ingest(*tables):
    return ingest_loaded_tables(tables, mapping_model=FakeSchemaMappingModel())


def _mapping(result, role: FileRole):
    return next(item for item in result.file_mappings if item.file_role == role.value)


def test_two_plausible_revenue_columns_require_confirmation():
    orders = _orders(nsv=[100.0, 80.0])
    result = _ingest(("orders.csv", orders), ("sku.csv", _sku()), ("settle.csv", _settle()), ("mkt.csv", _mkt()))
    mapping = _mapping(result, FileRole.ORDER_LINES)
    net = next(item for item in mapping.mappings if item.canonical_field == "net_revenue")
    assert net.status == MappingStatus.USER_CONFIRMATION_REQUIRED
    assert "net_revenue" in mapping.missing_required_fields
    assert result.sources is None


def test_settlement_without_stable_order_key_is_not_auto_mapped():
    settle = pl.DataFrame(
        {
            "row_seq": [1, 2],
            "total_cm1_cost": [5.0, 4.0],
            "marketplace_commission": [1.0, 1.0],
            "net_settlement": [90.0, 70.0],
            "settlement_id": ["S1", "S2"],
        }
    )
    result = _ingest(("orders.csv", _orders()), ("sku.csv", _sku()), ("settle.csv", settle), ("mkt.csv", _mkt()))
    mapping = _mapping(result, FileRole.CHANNEL_SETTLEMENTS)
    assert "order_id" in mapping.missing_required_fields
    order_hits = [item for item in mapping.mappings if item.canonical_field == "order_id"]
    assert not order_hits or order_hits[0].status != MappingStatus.AUTO_ACCEPTED
    assert result.sources is None


def test_duplicate_sku_keys_are_not_auto_accepted():
    sku = pl.DataFrame(
        {
            "sku_id": ["SKU1", "SKU1", "SKU2"],
            "unit_total_cogs": [10.0, 10.0, 12.0],
            "category": ["Makeup", "Makeup", "Makeup"],
            "product_name": ["A", "A", "B"],
        }
    )
    result = _ingest(("orders.csv", _orders()), ("sku.csv", sku), ("settle.csv", _settle()), ("mkt.csv", _mkt()))
    mapping = _mapping(result, FileRole.SKU_MASTER)
    sku_map = next(item for item in mapping.mappings if item.canonical_field == "sku_id")
    assert sku_map.status in {MappingStatus.REJECTED, MappingStatus.USER_CONFIRMATION_REQUIRED, MappingStatus.REVIEW_RECOMMENDED}
    assert sku_map.status != MappingStatus.AUTO_ACCEPTED
    assert result.sources is None or "sku_id" in mapping.missing_required_fields or sku_map.status == MappingStatus.REVIEW_RECOMMENDED
    assert sku_map.final_confidence <= 0.4 or sku_map.status != MappingStatus.AUTO_ACCEPTED


def test_low_join_coverage_blocks_auto_accept():
    sku = pl.DataFrame(
        {
            "sku_id": ["OTHER"],
            "unit_total_cogs": [10.0],
            "category": ["Makeup"],
            "product_name": ["X"],
        }
    )
    result = _ingest(("orders.csv", _orders()), ("sku.csv", sku), ("settle.csv", _settle()), ("mkt.csv", _mkt()))
    mapping = _mapping(result, FileRole.ORDER_LINES)
    sku_map = next(item for item in mapping.mappings if item.canonical_field == "sku_id")
    assert sku_map.status in {MappingStatus.REJECTED, MappingStatus.USER_CONFIRMATION_REQUIRED}
    assert sku_map.status != MappingStatus.AUTO_ACCEPTED
    assert result.sources is None


def test_ambiguous_sales_field_is_not_auto_accepted():
    orders = _orders().drop("net_revenue").with_columns(pl.Series("sales", [100.0, 80.0]))
    result = _ingest(("orders.csv", orders), ("sku.csv", _sku()), ("settle.csv", _settle()), ("mkt.csv", _mkt()))
    mapping = _mapping(result, FileRole.ORDER_LINES)
    sales_maps = [item for item in mapping.mappings if item.source_column == "sales"]
    assert not sales_maps or sales_maps[0].status != MappingStatus.AUTO_ACCEPTED
    assert "net_revenue" in mapping.missing_required_fields
    assert result.sources is None


def test_missing_quantity_is_not_guessed():
    orders = _orders().drop("quantity")
    result = _ingest(("orders.csv", orders), ("sku.csv", _sku()), ("settle.csv", _settle()), ("mkt.csv", _mkt()))
    mapping = _mapping(result, FileRole.ORDER_LINES)
    assert "quantity" in mapping.missing_required_fields
    assert not any(item.canonical_field == "quantity" and item.status == MappingStatus.AUTO_ACCEPTED for item in mapping.mappings)
    assert result.sources is None
