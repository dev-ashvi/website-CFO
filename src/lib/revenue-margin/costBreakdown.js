/**
 * Scoped cost breakdown client helpers (Phase 1C).
 *
 * Legacy path (unscoped): result.explorers.cost_breakdown from job enrichment.
 * Dynamic path: POST /cost-breakdown under the same analytical filters / FinancialScope.
 */

import { fetchCostBreakdown } from "../../api/revenueMargin.js";
import { buildAnalyticalContext } from "./analyticalContext.js";
import { filtersToQueryFilters, hasActiveFilters } from "./filters.js";

/**
 * Normalize either scoped API result or legacy explorers payload into panel rows.
 * @returns {{ product_cogs: object[], cm1_costs: object[], net_revenue: number|null, scoped: boolean, limitations: string[], available: boolean, reconciliation: object|null, scope_hash: string|null }}
 */
export function presentCostBreakdown(payload, { scoped = false } = {}) {
  if (!payload) {
    return {
      product_cogs: [],
      cm1_costs: [],
      net_revenue: null,
      scoped,
      limitations: [],
      available: false,
      reconciliation: null,
      scope_hash: null,
    };
  }

  // Scoped API shape
  if (payload.product_cogs && !Array.isArray(payload.product_cogs)) {
    const product = payload.product_cogs.components || [];
    const cm1 = payload.cm1_costs?.components || [];
    return {
      product_cogs: product,
      cm1_costs: cm1,
      net_revenue: payload.net_revenue ?? null,
      scoped: true,
      limitations: payload.limitations || [],
      available: Boolean(payload.available && (product.length || cm1.length)),
      reconciliation: payload.reconciliation || null,
      scope_hash: payload.scope_hash || null,
      empty: payload.reconciliation?.status === "empty" || payload.row_count === 0,
    };
  }

  // Legacy explorers shape
  const product = payload.product_cogs || [];
  const cm1 = payload.cm1_costs || [];
  return {
    product_cogs: product,
    cm1_costs: cm1,
    net_revenue: payload.net_revenue ?? null,
    scoped: false,
    limitations: [],
    available: Boolean(product.length || cm1.length),
    reconciliation: null,
    scope_hash: null,
    empty: false,
  };
}

export function buildCostBreakdownRequest({ result, filters, surface = "margin", dimension = "channel" }) {
  return {
    workspace_id: result?.workspace_id,
    analysis_job_id: result?.job_id,
    analytical: buildAnalyticalContext({
      result,
      filters: filtersToQueryFilters(filters),
      surface,
      dimension,
    }),
  };
}

export async function loadScopedCostBreakdown(datasetId, request) {
  return fetchCostBreakdown(datasetId, request);
}

/**
 * When filters are active, never use legacy company-wide explorers.cost_breakdown.
 */
export function mayUseLegacyCostBreakdown(filters, periodRange) {
  return !hasActiveFilters(filters, periodRange);
}
