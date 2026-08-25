"""Assemble canonical frames into the engine SourceTables contract."""

from __future__ import annotations

import polars as pl

from wyz_analytics.contracts.columns import SourceTables
from wyz_analytics.schemas.roles import FileRole
from wyz_analytics.transform.apply import TransformError


_ROLE_ATTR = {
    FileRole.ORDER_LINES: "order_lines",
    FileRole.SKU_MASTER: "sku_master",
    FileRole.CHANNEL_SETTLEMENTS: "channel_settlements",
    FileRole.MARKETING_SPEND: "marketing_spend",
}


def assemble_source_tables(frames_by_role: dict[FileRole, pl.DataFrame]) -> SourceTables:
    missing = [role.value for role in _ROLE_ATTR if role not in frames_by_role]
    if missing:
        raise TransformError(f"Canonical ingest is missing roles: {missing}")
    return SourceTables(
        order_lines=frames_by_role[FileRole.ORDER_LINES],
        sku_master=frames_by_role[FileRole.SKU_MASTER],
        channel_settlements=frames_by_role[FileRole.CHANNEL_SETTLEMENTS],
        marketing_spend=frames_by_role[FileRole.MARKETING_SPEND],
    )
