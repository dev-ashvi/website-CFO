"""Documented financial definitions for the Revenue & Margin engine.

These rules reproduce the BeautyCo golden workbook. They are data-driven:
nothing here hard-codes company totals.

Waterfall
    Gross Revenue
      − Discounts
      − Returns / RTO / Cancellations
    = Net Revenue
      − Product COGS (retained units × unit total COGS)
    = Gross Margin
      − CM1 costs (order-level, allocated to lines by pre-return sales value)
    = CM1
      − Directly attributable marketing spend
    = CM2

CM1 allocation
    Order-level TOTAL_CM1_COST × (line NET_SALES_PRE_RETURN / order NET_SALES_PRE_RETURN).
    If the order sales base is 0, split equally across lines so settlement cost is not dropped.

Product COGS
    Cancelled lines: 0.
    Otherwise max(quantity − return_qty − rto_qty, 0) × unit_total_cogs.

Marketing → CM2
    Campaign spend is not joined onto order lines by CAMPAIGN_ID for CM2.
    CAMPAIGN_ID remains available for campaign performance (ROAS / CAC).
    CM2 uses platform → channel mapping, then SKU / category / channel net-revenue
    allocation over the full analysis period (not campaign-month matched).
"""

from __future__ import annotations

CANCELLED_STATUS = "Cancelled"
ALL_CATEGORIES = "All Categories"
