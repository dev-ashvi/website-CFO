"""Cost component breakdown from source/settlement facts."""

from __future__ import annotations

from typing import Any

from wyz_analytics.contracts.columns import (
    CM1_COST_COMPONENTS,
    NET_REVENUE,
    UNITS_RETAINED,
    UNIT_INBOUND_FREIGHT,
    UNIT_MANUFACTURING_COGS,
    UNIT_OTHER_DIRECT_COGS,
    UNIT_PRIMARY_PACKAGING,
)

COGS_COMPONENTS = (
    (UNIT_MANUFACTURING_COGS, "Manufacturing"),
    (UNIT_PRIMARY_PACKAGING, "Primary Packaging"),
    (UNIT_INBOUND_FREIGHT, "Inbound Freight"),
    (UNIT_OTHER_DIRECT_COGS, "Other Direct COGS"),
)

CM1_LABELS = {
    "marketplace_commission": "Marketplace Commission",
    "transaction_fee": "Transaction Fee",
    "fulfilment_fee": "Fulfilment",
    "forward_shipping": "Forward Shipping",
    "reverse_shipping": "Reverse Shipping",
    "rto_cost": "RTO",
    "payment_gateway_fee": "Payment Gateway",
    "cod_fee": "COD",
    "pick_pack_fee": "Pick & Pack",
    "variable_warehouse_fee": "Warehouse",
    "packaging_cost": "Packaging",
    "penalty": "Penalty",
    "other_variable_channel_cost": "Other Variable Costs",
}


def _pct_of_net(value: float, net_revenue: float | None) -> float | None:
    if net_revenue is None or net_revenue == 0:
        return None
    return value / net_revenue


def build_cost_breakdown(*, lines=None, sources=None, net_revenue: float | None) -> dict[str, Any] | None:
    product_rows = []
    cm1_rows = []

    if lines is not None:
        for key, label in COGS_COMPONENTS:
            if key not in lines.columns:
                continue
            value = float((lines[UNITS_RETAINED] * lines[key]).sum())
            product_rows.append({"key": key, "label": label, "value": value, "pct_of_net_revenue": _pct_of_net(value, net_revenue)})

    if sources is not None and hasattr(sources, "channel_settlements"):
        settlements = sources.channel_settlements
        for key in CM1_COST_COMPONENTS:
            if key not in settlements.columns:
                continue
            value = float(settlements[key].sum())
            cm1_rows.append(
                {
                    "key": key,
                    "label": CM1_LABELS.get(key, key),
                    "value": value,
                    "pct_of_net_revenue": _pct_of_net(value, net_revenue),
                }
            )

    if not product_rows and not cm1_rows:
        return None
    return {"product_cogs": product_rows, "cm1_costs": cm1_rows, "net_revenue": net_revenue}
