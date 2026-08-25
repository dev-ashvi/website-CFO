/**
 * Revenue & Margin explorer selectors.
 * Presentation only — values come from persisted `result.explorers` payloads.
 */

export const ANALYSIS_VIEWS = {
  OVERVIEW: "overview",
  REVENUE: "revenue",
  MARGIN: "margin",
  DATA_QUALITY: "data_quality",
};

export const DIMENSIONS = [
  { id: "channel", label: "Channel", entityKey: "channel" },
  { id: "category", label: "Category", entityKey: "category" },
  { id: "sku", label: "SKU", entityKey: "sku_id" },
  { id: "month", label: "Month", entityKey: "month" },
];

export const REVENUE_METRICS = [
  { id: "net_revenue", label: "Net Revenue", kind: "currency" },
  { id: "gross_revenue", label: "Gross Revenue", kind: "currency" },
  { id: "orders", label: "Orders", kind: "count" },
  { id: "units", label: "Units", kind: "count" },
  { id: "customers", label: "Customers", kind: "count" },
  { id: "net_aov", label: "Net AOV", kind: "currency" },
  { id: "gross_aov", label: "Gross AOV", kind: "currency" },
  { id: "units_per_order", label: "Units / Order", kind: "ratio" },
  { id: "discount_pct", label: "Discount %", kind: "pct" },
  { id: "return_pct", label: "Return %", kind: "pct" },
  { id: "rto_pct", label: "RTO %", kind: "pct" },
  { id: "revenue_realisation_pct", label: "Revenue Realisation %", kind: "pct" },
  { id: "revenue_share", label: "Revenue Share", kind: "pct" },
];

export const MARGIN_METRICS = [
  { id: "net_revenue", label: "Net Revenue", kind: "currency" },
  { id: "gross_margin", label: "Gross Margin", kind: "currency" },
  { id: "gross_margin_pct", label: "GM %", kind: "pct" },
  { id: "cm1", label: "CM1", kind: "currency" },
  { id: "cm1_pct", label: "CM1 %", kind: "pct" },
  { id: "marketing_cost", label: "Attributed Marketing", kind: "currency", fallback: "marketing_spend" },
  { id: "marketing_pct", label: "Attributed Marketing %", kind: "pct", tooltip: "Marketing spend allocated using the active WYZ attribution methodology." },
  { id: "cm2", label: "CM2", kind: "currency" },
  { id: "cm2_pct", label: "CM2 %", kind: "pct" },
];

export const TREND_METRICS = [
  { id: "net_revenue", label: "Net Revenue", kind: "currency" },
  { id: "gross_margin_pct", label: "GM %", kind: "pct" },
  { id: "cm1_pct", label: "CM1 %", kind: "pct" },
  { id: "cm2_pct", label: "CM2 %", kind: "pct" },
];

export const PROFITABILITY_LABELS = {
  negative_gross_margin: "Negative Gross Margin",
  positive_gm_negative_cm1: "Positive GM / Negative CM1",
  positive_cm1_negative_cm2: "Positive CM1 / Negative CM2",
  profitable: "Profitable through CM2",
};

export function explorerPayload(result) {
  return result?.explorers || null;
}

export function metricValue(row, metricId, spec) {
  if (!row) return null;
  if (row[metricId] != null) return row[metricId];
  if (spec?.fallback && row[spec.fallback] != null) return row[spec.fallback];
  return null;
}

export function metricSupported(row, metricId, spec) {
  const value = metricValue(row, metricId, spec);
  return value != null && !Number.isNaN(Number(value));
}

export function dimensionRows(result, dimensionId) {
  const payload = explorerPayload(result);
  return payload?.dimensions?.[dimensionId]?.rows || [];
}

export function sortRows(rows, sortKey, direction = "desc") {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sortKey === "growth_materiality") {
      const av = materialityScore(a);
      const bv = materialityScore(b);
      return direction === "asc" ? av - bv : bv - av;
    }
    if (sortKey === "contribution_delta") {
      const av = Math.abs(Number(a?.growth?.contribution_delta ?? 0));
      const bv = Math.abs(Number(b?.growth?.contribution_delta ?? 0));
      return direction === "asc" ? av - bv : bv - av;
    }
    const av = Number(metricValue(a, sortKey) ?? 0);
    const bv = Number(metricValue(b, sortKey) ?? 0);
    return direction === "asc" ? av - bv : bv - av;
  });
  return copy;
}

export function materialityScore(row, revenueKey = "net_revenue") {
  const revenue = Math.abs(Number(row?.[revenueKey] || 0));
  const growthDelta = Math.abs(Number(row?.growth?.contribution_delta || 0));
  return revenue + growthDelta;
}

export function compareGrowthDisplay(row) {
  const growth = row?.growth;
  if (!growth?.available) {
    return { supported: false, reason: growth?.reason || "Growth not available for this slice" };
  }
  const pct = growth.net_revenue?.pct;
  const delta = growth.contribution_delta;
  return {
    supported: true,
    pct,
    delta,
    materiality: materialityScore(row),
  };
}

export function overviewSections(result) {
  const company = explorerPayload(result)?.company || {};
  const waterfall = result?.waterfall || result?.company || {};
  return {
    revenue: [
      { key: "gross_revenue", label: "Gross Revenue", value: company.gross_revenue ?? waterfall.gross_revenue, kind: "currency" },
      { key: "net_revenue", label: "Net Revenue", value: company.net_revenue ?? waterfall.net_revenue, kind: "currency" },
      { key: "orders", label: "Orders", value: company.orders ?? result?.orders, kind: "count" },
      { key: "units", label: "Units", value: company.units ?? result?.units, kind: "count" },
      { key: "customers", label: "Customers", value: company.customers ?? result?.customers, kind: "count" },
      { key: "gross_aov", label: "Gross AOV", value: company.gross_aov, kind: "currency" },
      { key: "net_aov", label: "Net AOV", value: company.net_aov, kind: "currency" },
      { key: "units_per_order", label: "Units / Order", value: company.units_per_order, kind: "ratio" },
    ],
    profitability: [
      { key: "gross_margin", label: "Gross Margin", value: company.gross_margin ?? waterfall.gross_margin, kind: "currency" },
      { key: "gross_margin_pct", label: "GM %", value: company.gross_margin_pct ?? waterfall.gross_margin_pct, kind: "pct" },
      { key: "cm1", label: "CM1", value: company.cm1 ?? waterfall.cm1, kind: "currency" },
      { key: "cm1_pct", label: "CM1 %", value: company.cm1_pct ?? waterfall.cm1_pct, kind: "pct" },
      { key: "marketing_spend", label: "Marketing Spend", value: company.marketing_spend ?? waterfall.marketing_spend, kind: "currency" },
      { key: "marketing_pct", label: "Marketing % of Net Revenue", value: company.marketing_pct ?? waterfall.marketing_pct, kind: "pct" },
      { key: "cm2", label: "CM2", value: company.cm2 ?? waterfall.cm2, kind: "currency" },
      { key: "cm2_pct", label: "CM2 %", value: company.cm2_pct ?? waterfall.cm2_pct, kind: "pct" },
    ],
    quality: [
      { key: "discount_pct", label: "Discount %", value: company.discount_pct, kind: "pct" },
      { key: "return_pct", label: "Return %", value: company.return_pct, kind: "pct" },
      { key: "rto_pct", label: "RTO %", value: company.rto_pct, kind: "pct" },
      { key: "revenue_realisation_pct", label: "Revenue Realisation %", value: company.revenue_realisation_pct, kind: "pct" },
    ],
  };
}

export function monthlyTrendSeries(result, metricId) {
  const rows = explorerPayload(result)?.monthly_trend || result?.by_month || [];
  return rows.map((row) => ({
    month: row.month || row.order_month,
    value: row[metricId] ?? null,
  }));
}

export function drillHierarchy() {
  return ["company", "channel", "category", "sku"];
}

export function nextDrillLevel(current) {
  const hierarchy = drillHierarchy();
  const index = hierarchy.indexOf(current);
  return index >= 0 && index < hierarchy.length - 1 ? hierarchy[index + 1] : null;
}

export function filterRowsByParent(rows, parentKey, parentValue) {
  if (!parentValue || !parentKey) return rows;
  return rows.filter((row) => String(row[parentKey] || "") === String(parentValue));
}

export function dimensionEntityKey(dimensionId) {
  return DIMENSIONS.find((item) => item.id === dimensionId)?.entityKey || dimensionId;
}

export function rowEntityLabel(row, dimensionId) {
  if (!row) return "";
  const key = dimensionEntityKey(dimensionId);
  return row._entity ?? row[key] ?? "";
}

export function pushDrillTrail(trail, level, label, value) {
  const hierarchy = drillHierarchy();
  const levelIndex = hierarchy.indexOf(level);
  const base = trail.filter((item) => hierarchy.indexOf(item.level) < levelIndex);
  return [...base, { level, label, value }];
}

export function drillGapForDimension(trail, dimensionId) {
  const channelFilter = trail.find((item) => item.level === "channel" && item.value);
  if (channelFilter && (dimensionId === "category" || dimensionId === "sku")) {
    return "Channel-scoped category and SKU views require cross-dimensional aggregates not yet persisted.";
  }
  return null;
}

export function filterRowsForExplorer(rows, { dimensionId, trail }) {
  const gap = drillGapForDimension(trail, dimensionId);
  if (gap) return { rows: [], gap };

  let filtered = rows;
  const channelFilter = trail.find((item) => item.level === "channel")?.value;
  const categoryFilter = trail.find((item) => item.level === "category")?.value;

  if (channelFilter && dimensionId === "channel") {
    filtered = filterRowsByParent(filtered, "channel", channelFilter);
  }
  if (categoryFilter && dimensionId === "sku") {
    filtered = filterRowsByParent(filtered, "category", categoryFilter);
  }
  return { rows: filtered, gap: null };
}

export function canDrillRow(dimensionId) {
  // SKU is terminal: click still narrows the filter; nextExplorerDimension is null.
  return dimensionId === "channel" || dimensionId === "category" || dimensionId === "sku";
}

/**
 * Legacy clicked-dimension step. Prefer nextExplorerDimension(filters) from
 * investigation.js after narrowScope — that respects already-resolved levels.
 * channel → category (fixes prior bug returning "channel").
 */
export function nextDrillDimension(dimensionId) {
  if (dimensionId === "channel") return "category";
  if (dimensionId === "category") return "sku";
  return null;
}

export {
  INVESTIGATION_HIERARCHY,
  narrowScope,
  nextExplorerDimension,
  resolveInvestigation,
  resolveInvestigationSurface,
} from "./investigation.js";

export function sortRowsByMateriality(rows) {
  return [...rows].sort((a, b) => materialityScore(b) - materialityScore(a));
}

export function growthMaterialityWeight(row, maxMateriality) {
  const score = materialityScore(row);
  if (!maxMateriality || maxMateriality <= 0) return 0;
  return Math.min(1, score / maxMateriality);
}

export function dataQualityItems(result) {
  const validation = result?.validation || {};
  const recon = result?.reconciliation || {};
  const limitations = result?.limitations || [];
  const gaps = explorerPayload(result)?.gaps || [];
  return {
    reconciled: result?.reconciled === true || recon.ok === true,
    failedChecks: recon.failed_checks || [],
    limitations,
    gaps,
    joins: validation.joins || [],
    missingRequired: validation.missing_required_fields || [],
    grainWarnings: validation.grain_warnings || [],
    relationshipWarnings: validation.relationship_warnings || [],
  };
}
