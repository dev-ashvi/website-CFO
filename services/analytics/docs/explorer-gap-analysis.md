# Revenue & Margin Explorer — result contract gap review

## Already available (engine output)

| Capability | Source |
|---|---|
| Company waterfall | `waterfall` / `company` |
| Orders, units, customers | `company`, dimensional rows |
| Channel / category / SKU P&L | `by_channel`, `by_category`, `by_sku` |
| Monthly company trend | `by_month` |
| Discount / return / RTO rates (dimensional) | engine `_agg` on lines |
| GM / CM1 / CM2 % by dimension | engine dimensional rows |
| Reconciliation & validation | `reconciliation`, `validation` |

## Added in explorer enrichment (`result.explorers`)

| Capability | Module |
|---|---|
| Gross / net AOV, units per order | `analytics/enrichment.py` |
| Company discount / return / RTO / realisation % | `analytics/enrichment.py` |
| Revenue / order / unit / customer share | `analytics/shares.py` |
| MoM growth (company monthly) | `analytics/growth.py` |
| MoM growth + contribution delta (channel/category) | `by_channel_month`, `by_category_month` + `growth.py` |
| Profitability classification | `analytics/classification.py` |
| Contribution concentration | `analytics/enrichment.py` |
| Product COGS + CM1 component breakdown | `analytics/cost_breakdown.py` |

## Still unavailable / architectural gaps

| Capability | Reason |
|---|---|
| YoY growth (default) | Requires 13+ months with aligned prior-year month; exposed as gap when insufficient |
| SKU monthly history | Not aggregated (volume); would require `by_sku_month` |
| Cross-filter Channel × Category matrix | No persisted cross-dimensional cube |
| Simultaneous multi-filter queries | Persisted aggregates only; ad-hoc filtering needs fact-store query layer |
| Time-by-dimension mix comparison | Mix is full-period; monthly mix needs dimensional monthly slices |
| Transaction-level drill-down | Order-line facts not persisted in result blob |
| Channel → Category / SKU drill | Category rows are not channel-scoped; UI shows gap banner instead of client-side filtering |

## UI principle

React selects, sorts, and formats values from `result.explorers` and engine fields. No financial formulas in JavaScript.
