"""Deterministic Revenue & Margin Intelligence engine.

Financial outputs are computed only from source tables. No LLM path exists
in this package.
"""

from wyz_analytics.config import ENGINE_ID, ENGINE_VERSION
from wyz_analytics.engine.pipeline import run_revenue_margin_engine

__all__ = [
    "ENGINE_ID",
    "ENGINE_VERSION",
    "run_revenue_margin_engine",
]
