/**
 * Canonical metric presentation for Revenue & Margin AI CFO surfaces.
 * Storage: fact-layer ratios are 0–1; never double-scale by `_pct` name alone.
 */
import { formatInrCompact } from "../../planning/scenarioDisplayFormat.js";

/** @typedef {'currency'|'percentage'|'count'|'ratio'|'number'|'text'} FormatType */
/** @typedef {'ratio_0_1'|'percent_0_100'|'absolute'|'count'|'text'} StorageKind */

/**
 * @type {Record<string, { label: string, formatType: FormatType, storage: StorageKind, percentageScale?: number, description?: string }>}
 */
export const METRIC_PRESENTATION = {
  gross_revenue: { label: "Gross Revenue", formatType: "currency", storage: "absolute" },
  net_revenue: { label: "Net Revenue", formatType: "currency", storage: "absolute" },
  discount: { label: "Discount", formatType: "currency", storage: "absolute" },
  refund: { label: "Refund", formatType: "currency", storage: "absolute" },
  product_cogs: { label: "Product COGS", formatType: "currency", storage: "absolute" },
  gross_margin: { label: "Gross Margin", formatType: "currency", storage: "absolute" },
  gm_pct: { label: "Gross Margin %", formatType: "percentage", storage: "ratio_0_1", percentageScale: 100 },
  gross_margin_pct: { label: "Gross Margin %", formatType: "percentage", storage: "ratio_0_1", percentageScale: 100 },
  cm1_cost: { label: "CM1 Costs", formatType: "currency", storage: "absolute" },
  cm1: { label: "CM1", formatType: "currency", storage: "absolute" },
  cm1_pct: { label: "CM1 Margin", formatType: "percentage", storage: "ratio_0_1", percentageScale: 100 },
  allocated_marketing: { label: "Attributed Marketing Spend", formatType: "currency", storage: "absolute" },
  marketing_spend: { label: "Attributed Marketing Spend", formatType: "currency", storage: "absolute" },
  marketing_cost: { label: "Attributed Marketing Spend", formatType: "currency", storage: "absolute" },
  marketing_pct: {
    label: "Marketing % of Net Revenue",
    formatType: "percentage",
    storage: "ratio_0_1",
    percentageScale: 100,
  },
  cm2: { label: "CM2", formatType: "currency", storage: "absolute" },
  cm2_pct: { label: "CM2 Margin", formatType: "percentage", storage: "ratio_0_1", percentageScale: 100 },
  orders: { label: "Orders", formatType: "count", storage: "count" },
  customers: { label: "Customers", formatType: "count", storage: "count" },
  units: { label: "Units", formatType: "count", storage: "count" },
  gross_aov: { label: "Gross AOV", formatType: "currency", storage: "absolute" },
  net_aov: { label: "Net AOV", formatType: "currency", storage: "absolute" },
  units_per_order: { label: "Units per Order", formatType: "ratio", storage: "absolute" },
  discount_pct: { label: "Discount %", formatType: "percentage", storage: "ratio_0_1", percentageScale: 100 },
  return_pct: { label: "Return %", formatType: "percentage", storage: "ratio_0_1", percentageScale: 100 },
  rto_pct: { label: "RTO %", formatType: "percentage", storage: "ratio_0_1", percentageScale: 100 },
  revenue_realisation_pct: {
    label: "Revenue Realisation %",
    formatType: "percentage",
    storage: "ratio_0_1",
    percentageScale: 100,
  },
  share_of_total: {
    label: "Share of Total",
    formatType: "percentage",
    storage: "ratio_0_1",
    percentageScale: 100,
  },
};

export function getMetricPresentation(metricKey) {
  const key = String(metricKey || "").trim();
  if (METRIC_PRESENTATION[key]) return { key, ...METRIC_PRESENTATION[key] };
  if (key.endsWith("_pct")) {
    return {
      key,
      label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      formatType: "percentage",
      storage: "ratio_0_1",
      percentageScale: 100,
    };
  }
  return {
    key: key || "value",
    label: key ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Value",
    formatType: key ? "currency" : "text",
    storage: key ? "absolute" : "text",
  };
}

export function formatExplorerValue(value, kind) {
  if (value == null || Number.isNaN(Number(value))) return { text: "—", supported: false };
  const n = Number(value);
  if (kind === "pct") return { text: `${(n * 100).toFixed(1)}%`, supported: true };
  if (kind === "count") {
    return { text: new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n), supported: true };
  }
  if (kind === "ratio") return { text: n.toFixed(2), supported: true };
  return { text: formatInrCompact(n), supported: true };
}

export function formatMetricValue(metricKey, value) {
  const meta = getMetricPresentation(metricKey);
  if (value == null || Number.isNaN(Number(value))) {
    return { label: meta.label, formatted: "—", formatType: meta.formatType, storage: meta.storage };
  }
  const n = Number(value);
  if (meta.formatType === "percentage") {
    const scale = meta.storage === "ratio_0_1" ? (meta.percentageScale ?? 100) : 1;
    return {
      label: meta.label,
      formatted: `${(n * scale).toFixed(1)}%`,
      formatType: meta.formatType,
      storage: meta.storage,
    };
  }
  if (meta.formatType === "currency") {
    return { label: meta.label, formatted: formatInrCompact(n), formatType: meta.formatType, storage: meta.storage };
  }
  if (meta.formatType === "count") {
    return {
      label: meta.label,
      formatted: new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n),
      formatType: meta.formatType,
      storage: meta.storage,
    };
  }
  if (meta.formatType === "ratio") {
    return { label: meta.label, formatted: n.toFixed(2), formatType: meta.formatType, storage: meta.storage };
  }
  return { label: meta.label, formatted: String(n), formatType: meta.formatType, storage: meta.storage };
}

export function formatGrowthPct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function displayEntityName(raw) {
  const text = String(raw || "").trim();
  if (!text || /^(filtered population|the active segment|population)$/i.test(text)) {
    return "This view";
  }
  return text;
}
