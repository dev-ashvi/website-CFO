"""Read-only AI CFO tools over the fact query engine."""

from __future__ import annotations

from typing import Any

import polars as pl

from wyz_analytics.cfo_signals.generate import generate_cfo_signals
from wyz_analytics.facts.models import validate_query
from wyz_analytics.facts.query import execute_query
from wyz_analytics.workers.errors import AnalyticsError, INVALID_QUERY
from wyz_analytics.ai_cfo.financial_scope import build_financial_scope, normalize_scope_filters
from wyz_analytics.analytics.scoped_cost_breakdown import build_scoped_cost_breakdown


class AiCfoTools:
    def __init__(
        self,
        facts: pl.DataFrame,
        *,
        active_filters: dict[str, Any],
        surface: str = "overview",
        dimension: str = "channel",
        dataset_id: str | None = None,
        financial_scope: dict[str, Any] | None = None,
    ):
        self.facts = facts
        self.financial_scope = financial_scope or build_financial_scope(
            dataset_id=dataset_id, filters=active_filters
        )
        self.active_filters = dict(self.financial_scope.get("filters") or normalize_scope_filters(active_filters))
        self.surface = surface
        self.dimension = dimension
        self.dataset_id = self.financial_scope.get("dataset_id") or dataset_id

    def get_current_financial_view(self) -> dict[str, Any]:
        return execute_query(
            self.facts,
            {
                "filters": self.active_filters,
                "metrics": [
                    "gross_revenue",
                    "net_revenue",
                    "orders",
                    "units",
                    "customers",
                    "gross_aov",
                    "net_aov",
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
                    "discount_pct",
                    "return_pct",
                    "rto_pct",
                    "revenue_realisation_pct",
                ],
            },
        )

    def get_breakdown(
        self,
        *,
        dimension: str,
        metrics: list[str] | None = None,
        sort: dict[str, str] | None = None,
        limit: int | None = 20,
        override_filters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # Active FinancialScope always wins. override_filters is ignored so the
        # model cannot drop or replace UI filters via tool arguments.
        _ = override_filters
        filters = self.active_filters
        query = {
            "filters": filters,
            "group_by": [dimension],
            "metrics": metrics
            or [
                "net_revenue",
                "gross_margin",
                "gross_margin_pct",
                "cm1",
                "cm1_pct",
                "allocated_marketing",
                "marketing_pct",
                "cm2",
                "cm2_pct",
            ],
        }
        if sort:
            query["sort"] = sort
        if limit is not None:
            query["limit"] = limit
        validate_query(query)
        return execute_query(self.facts, query)

    def get_trend(
        self,
        *,
        metrics: list[str] | None = None,
        override_filters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = override_filters
        filters = self.active_filters
        result = execute_query(
            self.facts,
            {
                "filters": filters,
                "group_by": ["month"],
                "metrics": metrics
                or [
                    "net_revenue",
                    "gross_margin",
                    "gross_margin_pct",
                    "cm1",
                    "cm1_pct",
                    "allocated_marketing",
                    "marketing_pct",
                    "cm2",
                    "cm2_pct",
                ],
            },
        )
        # Chronological order for temporal comparisons (documented: metric sort is wrong for months).
        rows = list(result.get("rows") or [])
        rows.sort(key=lambda row: str(row.get("month") or ""))
        result["rows"] = rows
        return result

    def get_cfo_signals(
        self,
        *,
        dimension: str | None = None,
        override_filters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = override_filters
        filters = self.active_filters
        return generate_cfo_signals(
            self.facts,
            filters=filters,
            dimension=str(dimension or self.dimension),
            surface=self.surface,
        )

    def get_cost_breakdown(self) -> dict[str, Any]:
        """Scoped Product COGS / CM1 cost components under active FinancialScope.

        No filter arguments — inherits current FinancialScope only.
        """
        return build_scoped_cost_breakdown(
            self.facts,
            dataset_id=self.dataset_id,
            filters=self.active_filters,
        )

    def dispatch(self, tool_name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        args = dict(arguments or {})
        args.pop("filters", None)
        if tool_name == "get_current_financial_view":
            return self.get_current_financial_view()
        if tool_name == "get_breakdown":
            return self.get_breakdown(
                dimension=str(args.get("dimension") or "channel"),
                metrics=args.get("metrics"),
                sort=args.get("sort"),
                limit=args.get("limit"),
            )
        if tool_name == "get_trend":
            return self.get_trend(metrics=args.get("metrics"))
        if tool_name == "get_cfo_signals":
            return self.get_cfo_signals(dimension=args.get("dimension"))
        if tool_name == "get_cost_breakdown":
            return self.get_cost_breakdown()
        raise AnalyticsError(INVALID_QUERY, f"Unknown AI CFO tool: {tool_name}")
