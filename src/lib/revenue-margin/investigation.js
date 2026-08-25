/**
 * Shared investigation / drill-down contract for Revenue & Margin.
 *
 * Single path for:
 * - explorer row drill-down
 * - Key Financial Signal → Investigate
 *
 * Narrows canonical UI filters only (never broadens).
 * Does NOT compute scope_hash — filters change through the existing path;
 * FinancialScope/scope_hash is derived by the backend from query filters.
 */

import { FILTER_DIMENSION_KEYS, applyDrillFilter } from "./filters.js";

/** Canonical investigation hierarchy (company → channel → category → sku). */
export const INVESTIGATION_HIERARCHY = ["channel", "category", "sku"];

/**
 * Multi-value semantics (documented):
 * When narrowing a dimension that already has multiple selected values,
 * applyDrillFilter REPLACES that dimension with the single investigated entity.
 * Other dimensions and period are preserved. Scope never broadens.
 */

/**
 * Narrow UI filters to a single dimension value.
 * Preserves unrelated filters and period. Replaces multi-value on the target
 * dimension with the selected entity (narrow-only).
 *
 * @param {object} filters
 * @param {string} dimension - channel | category | sku | …
 * @param {string} value
 * @returns {object} new filters
 */
export function narrowScope(filters, dimension, value) {
  return applyDrillFilter(filters, dimension, value);
}

function dimensionValues(filters, dimension) {
  const key = dimension === "sku" ? "sku" : dimension;
  return Array.isArray(filters?.[key]) ? filters[key].map(String).filter(Boolean) : [];
}

/**
 * Next useful explorer dimension from ACTIVE FILTERS after narrowing.
 * Returns the first hierarchy level that is not yet a singleton selection.
 * When channel+category+sku are all singletons → null (terminal).
 *
 * @param {object} filters
 * @returns {"channel"|"category"|"sku"|null}
 */
export function nextExplorerDimension(filters) {
  for (const dim of INVESTIGATION_HIERARCHY) {
    if (dimensionValues(filters, dim).length !== 1) return dim;
  }
  return null;
}

/**
 * @deprecated Prefer nextExplorerDimension(filters) after narrowScope.
 * Kept for call sites that only know the clicked dimension; channel → category
 * (fixes prior bug where channel → channel).
 */
export function nextDrillDimension(dimensionId) {
  if (dimensionId === "channel") return "category";
  if (dimensionId === "category") return "sku";
  return null;
}

export function canDrillInvestigationRow(dimensionId) {
  return dimensionId === "channel" || dimensionId === "category" || dimensionId === "sku";
}

/**
 * Deterministic surface routing from existing signal metadata.
 * Growth / revenue-quality style → Revenue; otherwise Margin (CFO default).
 *
 * @param {object|null|undefined} signal
 * @returns {"revenue"|"margin"}
 */
export function resolveInvestigationSurface(signal) {
  const type = String(signal?.signal_type || "");
  if (/^HIGH_GROWTH_|^DECLINING_REVENUE_|^REVENUE_/i.test(type)) {
    return "revenue";
  }
  if (/GROWTH_WITH_MARGIN_COMPRESSION|REVENUE_QUALITY/i.test(type)) {
    return "revenue";
  }
  return "margin";
}

/**
 * Full investigation step from current UI filters + entity narrow.
 * Signal.filters must NOT replace UI filters — only entity_type + entity narrow.
 *
 * @param {object} params
 * @param {object} params.filters - current authoritative UI filters
 * @param {string} params.dimension - entity_type / row dimension
 * @param {string} params.value - entity / row label
 * @param {object} [params.signal] - optional signal for surface routing
 * @returns {{ filters: object, dimension: string|null, surface: "revenue"|"margin" }}
 */
export function resolveInvestigation({ filters, dimension, value, signal = null }) {
  const nextFilters = narrowScope(filters, dimension, value);
  const nextDimension = nextExplorerDimension(nextFilters);
  const surface = resolveInvestigationSurface(signal);
  return {
    filters: nextFilters,
    dimension: nextDimension,
    surface,
  };
}

/**
 * Guard: investigation must never drop unrelated active dimensions or period.
 * Used in tests; not a second filter system.
 */
export function investigationPreservesUnrelated(before, after, narrowedKey) {
  if (before.month_from !== after.month_from || before.month_to !== after.month_to) {
    return false;
  }
  for (const key of FILTER_DIMENSION_KEYS) {
    if (key === narrowedKey) continue;
    const a = [...(before[key] || [])].map(String).sort();
    const b = [...(after[key] || [])].map(String).sort();
    if (JSON.stringify(a) !== JSON.stringify(b)) return false;
  }
  return true;
}
