# Financial line facts — inspection

Inspection of `build_line_facts()` output prior to the dynamic query layer (V1).

## Grain

One row per **order line** (`order_line_id`), with parent **order** (`order_id`).

## Available dimensions (after engine + marketing allocation)

| Fact column | Source |
|-------------|--------|
| `date` | `order_date` |
| `month` | derived `%Y-%m` from order date |
| `quarter` | derived `%Y-Q{n}` at persist time |
| `order_id`, `order_line_id`, `customer_id` | order lines |
| `new_repeat` | `new_repeat_flag` |
| `sku_id`, `category`, `subcategory` | order lines + SKU master |
| `channel`, `platform` | order lines |
| `region`, `state`, `city`, `city_tier` | order lines |
| `campaign_id`, `payment_mode` | order lines |

Customer and order IDs remain on every line and support distinct-count metrics.

## Additive financial fields (line-level, SUM reconciles to company waterfall)

| Field | Engine column | Notes |
|-------|---------------|-------|
| `quantity` | `quantity` | Ordered units |
| `units_retained` | `units_retained` | After cancellations / returns / RTO |
| `gross_revenue` | `gross_revenue` | |
| `discount` | `discount_amount` | |
| `refund` | `refund_amount` | Return / RTO / cancellation leakage ($) |
| `net_revenue` | `net_revenue` | |
| `product_cogs` | `product_cogs` | `units_retained × unit_total_cogs` |
| `gross_margin` | `gross_margin` | |
| `cm1_cost` | `cm1_cost` | Order CM1 allocated by net-sales share |
| `cm1` | `cm1` | |
| `allocated_marketing` | `marketing_cost` | Campaign spend allocated to lines |
| `cm2` | `cm2` | |
| `return_qty`, `rto_qty` | order lines | For return / RTO % ratios |

**Mandatory reconciliation (BeautyCo golden):**  
`SUM(gross_revenue)`, `SUM(net_revenue)`, `SUM(product_cogs)`, `SUM(gross_margin)`,  
`SUM(cm1_cost)`, `SUM(cm1)`, `SUM(allocated_marketing)`, `SUM(cm2)` match `company_waterfall()`.

## Product COGS components (materialized at persist)

Dollar columns derived at fact persist (not stored in engine line frame):

- `manufacturing_cogs` = `units_retained × unit_manufacturing_cogs`
- `primary_packaging`, `inbound_freight`, `other_direct_cogs`

These sum to `product_cogs` per line.

## CM1 components (materialized at persist)

Raw settlement component columns on lines are **order-duplicated** and **not additive** if summed directly.

At persist time, each settlement component is allocated to lines with the **same net-sales share** used for `cm1_cost`. Allocated components sum to `cm1_cost` and reconcile to order-level settlements.

## Fields only in source tables (not on line facts)

- Marketing spend detail (`spend_date`, `campaign_name`, `campaign_type`, …) — allocation inputs only
- Full channel settlement rows without line allocation
- SKU master descriptive fields not joined onto every line (`product_status` available on SKU aggregates only)

## Explorer reconstructability

| Explorer slice | Reconstructable from facts? |
|----------------|----------------------------|
| Company waterfall | Yes — filter none, aggregate all |
| By channel / category / SKU / month | Yes — group-by + metric registry |
| Channel + category simultaneously | Yes — multi-filter (not precomputed) |
| Month range | Yes — `month` / `date` range filters |
| CM1 cost breakdown (component $) | Yes — allocated component columns |
| SKU monthly growth | Partial — needs `group_by: [sku, month]` (query layer) |
| Mix / shares / growth enrichment | Derived in query response or UI from aggregated rows |

## Intentionally not duplicated

- Precomputed `revenue_share`, `growth`, `classification` — derived at query or presentation time
- Row-level percentage fields — ratios use aggregate numerators / denominators only
