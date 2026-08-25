"""Strategy mode isolation from frozen V1 boundary behavior."""

from __future__ import annotations

import os

STRATEGY_MODE_V1_BOUNDARY = "v1_boundary"
STRATEGY_MODE_V2_PARTNER = "v2_partner"
_ALLOWED = frozenset({STRATEGY_MODE_V1_BOUNDARY, STRATEGY_MODE_V2_PARTNER})


def resolve_strategy_mode(explicit: str | None = None) -> str:
    """Default remains v1_boundary so frozen V1 benchmark stays unchanged."""
    raw = (explicit or os.environ.get("WYZ_AI_CFO_STRATEGY_MODE") or STRATEGY_MODE_V1_BOUNDARY).strip().lower()
    if raw in {"v1", "boundary", "v1_boundary"}:
        return STRATEGY_MODE_V1_BOUNDARY
    if raw in {"v2", "partner", "v2_partner"}:
        return STRATEGY_MODE_V2_PARTNER
    if raw in _ALLOWED:
        return raw
    return STRATEGY_MODE_V1_BOUNDARY


def is_v2_partner_mode(explicit: str | None = None) -> bool:
    return resolve_strategy_mode(explicit) == STRATEGY_MODE_V2_PARTNER
