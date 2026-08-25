"""File roles the ingestion layer can assign. Not inferred from filenames."""

from __future__ import annotations

from enum import Enum


class FileRole(str, Enum):
    ORDER_LINES = "ORDER_LINES"
    SKU_MASTER = "SKU_MASTER"
    CHANNEL_SETTLEMENTS = "CHANNEL_SETTLEMENTS"
    MARKETING_SPEND = "MARKETING_SPEND"
    UNKNOWN = "UNKNOWN"


ENGINE_ROLES = (
    FileRole.ORDER_LINES,
    FileRole.SKU_MASTER,
    FileRole.CHANNEL_SETTLEMENTS,
    FileRole.MARKETING_SPEND,
)
