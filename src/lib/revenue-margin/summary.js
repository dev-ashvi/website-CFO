/**
 * Display helpers for engine-returned Revenue & Margin results.
 * Never recalculate financial metrics in the browser.
 */

export const EXECUTIVE_METRIC_KEYS = [
  { key: "gross_revenue", label: "Gross Revenue", from: "waterfall" },
  { key: "net_revenue", label: "Net Revenue", from: "waterfall" },
  { key: "orders", label: "Orders", from: "identity" },
  { key: "units", label: "Units", from: "identity" },
  { key: "customers", label: "Customers", from: "identity" },
  { key: "gross_margin", label: "Gross Margin", from: "waterfall" },
  { key: "gross_margin_pct", label: "GM %", from: "waterfall", pct: true },
  { key: "cm1", label: "CM1", from: "waterfall" },
  { key: "cm1_pct", label: "CM1 %", from: "waterfall", pct: true },
  { key: "marketing_spend", label: "Marketing Spend", from: "waterfall" },
  { key: "cm2", label: "CM2", from: "waterfall" },
  { key: "cm2_pct", label: "CM2 %", from: "waterfall", pct: true },
];

export const WATERFALL_STEPS = [
  { key: "gross_revenue", label: "Gross Revenue" },
  { key: "discounts", label: "Discounts", leakage: true },
  { key: "returns_rto_cancellations", label: "Returns / RTO / cancellations", leakage: true },
  { key: "net_revenue", label: "Net Revenue" },
  { key: "product_cogs", label: "Product COGS" },
  { key: "gross_margin", label: "Gross Margin" },
  { key: "cm1_costs", label: "CM1 Costs" },
  { key: "cm1", label: "CM1" },
  { key: "marketing_spend", label: "Marketing" },
  { key: "cm2", label: "CM2" },
];

export function selectExecutiveMetrics(result) {
  if (!result || typeof result !== "object") return [];
  const waterfall = result.waterfall || result.company || {};
  const identity = result.company || result;
  return EXECUTIVE_METRIC_KEYS.map((spec) => {
    const value = spec.from === "identity" ? identity[spec.key] ?? result[spec.key] : waterfall[spec.key];
    return {
      key: spec.key,
      label: spec.label,
      value: value == null ? null : value,
      pct: Boolean(spec.pct),
    };
  });
}

export function selectWaterfall(result) {
  const waterfall = result?.waterfall || result?.company || {};
  return WATERFALL_STEPS.map((step) => ({
    ...step,
    value: waterfall[step.key] == null ? null : waterfall[step.key],
  }));
}

/** Build waterfall display steps from a dynamic query summary (no client-side math). */
export function waterfallFromQuerySummary(summary) {
  if (!summary) return selectWaterfall(null);
  const mapped = {
    gross_revenue: summary.gross_revenue,
    discounts: summary.discount,
    returns_rto_cancellations: summary.refund,
    net_revenue: summary.net_revenue,
    product_cogs: summary.product_cogs,
    gross_margin: summary.gross_margin,
    cm1_costs: summary.cm1_cost,
    cm1: summary.cm1,
    marketing_spend: summary.allocated_marketing,
    cm2: summary.cm2,
  };
  return WATERFALL_STEPS.map((step) => ({
    ...step,
    value: mapped[step.key] == null ? null : mapped[step.key],
  }));
}

export function overviewSectionsFromQuerySummary(summary) {
  if (!summary) return null;
  return {
    revenue: [
      { key: "gross_revenue", label: "Gross Revenue", value: summary.gross_revenue, kind: "currency" },
      { key: "net_revenue", label: "Net Revenue", value: summary.net_revenue, kind: "currency" },
      { key: "orders", label: "Orders", value: summary.orders, kind: "count" },
      { key: "units", label: "Units", value: summary.units, kind: "count" },
      { key: "customers", label: "Customers", value: summary.customers, kind: "count" },
      { key: "gross_aov", label: "Gross AOV", value: summary.gross_aov, kind: "currency" },
      { key: "net_aov", label: "Net AOV", value: summary.net_aov, kind: "currency" },
      { key: "units_per_order", label: "Units / Order", value: summary.units_per_order, kind: "ratio" },
    ],
    profitability: [
      { key: "gross_margin", label: "Gross Margin", value: summary.gross_margin, kind: "currency" },
      { key: "gross_margin_pct", label: "GM %", value: summary.gross_margin_pct, kind: "pct" },
      { key: "cm1", label: "CM1", value: summary.cm1, kind: "currency" },
      { key: "cm1_pct", label: "CM1 %", value: summary.cm1_pct, kind: "pct" },
      { key: "marketing_spend", label: "Marketing Spend", value: summary.allocated_marketing, kind: "currency" },
      { key: "marketing_pct", label: "Marketing % of Net Revenue", value: summary.marketing_pct, kind: "pct" },
      { key: "cm2", label: "CM2", value: summary.cm2, kind: "currency" },
      { key: "cm2_pct", label: "CM2 %", value: summary.cm2_pct, kind: "pct" },
    ],
    quality: [
      { key: "discount_pct", label: "Discount %", value: summary.discount_pct, kind: "pct" },
      { key: "return_pct", label: "Return %", value: summary.return_pct, kind: "pct" },
      { key: "rto_pct", label: "RTO %", value: summary.rto_pct, kind: "pct" },
      { key: "revenue_realisation_pct", label: "Revenue Realisation %", value: summary.revenue_realisation_pct, kind: "pct" },
    ],
  };
}

export function explorerSummarySections(summary, mode = "margin") {
  const items = [
    { key: "net_revenue", label: "Net Revenue", value: summary?.net_revenue, kind: "currency" },
    { key: "gross_margin", label: "Gross Margin", value: summary?.gross_margin, kind: "currency" },
    { key: "gross_margin_pct", label: "GM %", value: summary?.gross_margin_pct, kind: "pct" },
    { key: "cm1", label: "CM1", value: summary?.cm1, kind: "currency" },
    { key: "cm1_pct", label: "CM1 %", value: summary?.cm1_pct, kind: "pct" },
    { key: "marketing_spend", label: "Marketing", value: summary?.allocated_marketing, kind: "currency" },
    { key: "marketing_pct", label: "Marketing %", value: summary?.marketing_pct, kind: "pct" },
    { key: "cm2", label: "CM2", value: summary?.cm2, kind: "currency" },
    { key: "cm2_pct", label: "CM2 %", value: summary?.cm2_pct, kind: "pct" },
  ];
  if (mode === "revenue") {
    items.unshift(
      { key: "orders", label: "Orders", value: summary?.orders, kind: "count" },
      { key: "customers", label: "Customers", value: summary?.customers, kind: "count" },
      { key: "net_aov", label: "Net AOV", value: summary?.net_aov, kind: "currency" },
      { key: "units", label: "Units", value: summary?.units, kind: "count" },
    );
  }
  return items;
}

export function reconciliationLabel(result) {
  if (!result) return { ok: false, label: "Analysis not available" };
  if (result.reconciled === true || result.reconciliation?.ok === true) {
    return { ok: true, label: "Financial model reconciled" };
  }
  const failed = result.reconciliation?.failed_checks || [];
  return {
    ok: false,
    label: failed.length ? `Reconciliation warnings: ${failed.join(", ")}` : "Financial model not fully reconciled",
  };
}
