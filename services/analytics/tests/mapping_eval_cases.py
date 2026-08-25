"""Synthetic mapping-eval fixtures. Derived from BeautyCo semantics, not live files."""

from __future__ import annotations

import polars as pl

from wyz_analytics.mapping.evaluate import MappingEvalCase
from wyz_analytics.schemas.roles import FileRole


def _lines(**cols) -> pl.DataFrame:
    return pl.DataFrame(cols)


def easy_order_lines() -> MappingEvalCase:
    frame = _lines(
        **{
            "Order Number": ["O1"],
            "Order Line ID": ["L1"],
            "Order Date": ["01-04-2025"],
            "Customer ID": ["C1"],
            "Channel": ["D2C Website"],
            "Product SKU": ["SKU001"],
            "Qty": [1.0],
            "Order Status": ["Delivered"],
            "Return Qty": [0.0],
            "RTO Qty": [0.0],
            "Gross Revenue": [100.0],
            "Discount Amount": [10.0],
            "Net Sales": [90.0],
            "Refund Amount": [0.0],
            "Net Revenue": [90.0],
        }
    )
    return MappingEvalCase(
        name="easy_order_lines",
        difficulty="easy",
        expected_role=FileRole.ORDER_LINES.value,
        frame=frame,
        expected_required={
            "order_id": "Order Number",
            "order_line_id": "Order Line ID",
            "sku_id": "Product SKU",
            "quantity": "Qty",
            "net_sales_pre_return": "Net Sales",
            "net_revenue": "Net Revenue",
        },
    )


def medium_order_and_settlement() -> list[MappingEvalCase]:
    orders = _lines(
        txn_ref=["O1"],
        order_line_id=["L1"],
        order_date=["01-04-2025"],
        customer_id=["C1"],
        channel=["Amazon"],
        item_code=["SKU001"],
        quantity=[1.0],
        order_status=["Delivered"],
        return_qty=[0.0],
        rto_qty=[0.0],
        gross_revenue=[100.0],
        discount_amount=[10.0],
        net_sales_pre_return=[90.0],
        refund_amount=[0.0],
        nsv=[90.0],
    )
    settlements = _lines(
        txn_ref=["O1"],
        total_cm1_cost=[12.0],
        marketplace_commission=[5.0],
        pg_fee=[1.0],
        fwd_ship=[3.0],
        rev_ship=[0.0],
        failed_delivery_charge=[0.0],
        net_settlement=[80.0],
        settlement_id=["S1"],
    )
    return [
        MappingEvalCase(
            name="medium_order_lines",
            difficulty="medium",
            expected_role=FileRole.ORDER_LINES.value,
            frame=orders,
            expected_required={
                "order_id": "txn_ref",
                "sku_id": "item_code",
                "net_revenue": "nsv",
            },
        ),
        MappingEvalCase(
            name="medium_settlements",
            difficulty="medium",
            expected_role=FileRole.CHANNEL_SETTLEMENTS.value,
            frame=settlements,
            expected_required={"order_id": "txn_ref", "total_cm1_cost": "total_cm1_cost"},
            expected_optional={
                "payment_gateway_fee": "pg_fee",
                "forward_shipping": "fwd_ship",
                "reverse_shipping": "rev_ship",
                "rto_cost": "failed_delivery_charge",
            },
        ),
    ]


def hard_ambiguous_cases() -> list[MappingEvalCase]:
    sales = _lines(
        order_id=["O1"],
        order_line_id=["L1"],
        order_date=["01-04-2025"],
        customer_id=["C1"],
        channel=["Amazon"],
        sku_id=["SKU001"],
        quantity=[1.0],
        order_status=["Delivered"],
        return_qty=[0.0],
        rto_qty=[0.0],
        gross_revenue=[100.0],
        discount_amount=[10.0],
        net_sales_pre_return=[90.0],
        refund_amount=[0.0],
        sales=[90.0],
        realised_value=[88.0],
        list_value=[120.0],
    )
    fees = _lines(
        order_id=["O1"],
        total_cm1_cost=[12.0],
        marketplace_commission=[5.0],
        fees=[4.0],
        platform_deductions=[12.0],
        delivery_loss=[1.0],
        net_settlement=[80.0],
        settlement_id=["S1"],
    )
    sku = _lines(
        sku_id=["SKU001"],
        unit_total_cogs=[20.0],
        category=["Makeup"],
        product_name=["Lip"],
        landed_cost=[22.0],
    )
    return [
        MappingEvalCase(
            name="hard_sales_ambiguous",
            difficulty="hard",
            expected_role=FileRole.ORDER_LINES.value,
            frame=sales,
            expected_required={},
            expected_unresolved_required=("net_revenue",),
            never_auto_accept_sources=("sales", "realised_value", "list_value"),
        ),
        MappingEvalCase(
            name="hard_fees_ambiguous",
            difficulty="hard",
            expected_role=FileRole.CHANNEL_SETTLEMENTS.value,
            frame=fees,
            expected_required={"order_id": "order_id", "total_cm1_cost": "total_cm1_cost"},
            never_auto_accept_sources=("fees", "platform_deductions", "delivery_loss"),
        ),
        MappingEvalCase(
            name="hard_landed_cost",
            difficulty="hard",
            expected_role=FileRole.SKU_MASTER.value,
            frame=sku,
            expected_required={"sku_id": "sku_id", "unit_total_cogs": "unit_total_cogs", "category": "category"},
            never_auto_accept_sources=("landed_cost",),
        ),
    ]


def all_eval_cases() -> list[MappingEvalCase]:
    return [easy_order_lines(), *medium_order_and_settlement(), *hard_ambiguous_cases()]
