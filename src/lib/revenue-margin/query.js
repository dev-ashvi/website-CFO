/**
 * Central query builder and cache for dynamic financial fact queries.
 */

import { queryFinancialFacts } from "../../api/revenueMargin.js";
import { filtersToQueryFilters } from "./filters.js";
import { dimensionEntityKey } from "./explorers.js";

const queryCache = new Map();

export const REVENUE_QUERY_METRIC_IDS = [
  "gross_revenue",
  "net_revenue",
  "orders",
  "units",
  "customers",
  "gross_aov",
  "net_aov",
  "units_per_order",
  "discount_pct",
  "return_pct",
  "rto_pct",
  "revenue_realisation_pct",
];

export const MARGIN_QUERY_METRIC_IDS = [
  "net_revenue",
  "orders",
  "net_aov",
  "gross_margin",
  "gross_margin_pct",
  "cm1",
  "cm1_pct",
  "allocated_marketing",
  "marketing_pct",
  "cm2",
  "cm2_pct",
];

export const OVERVIEW_QUERY_METRIC_IDS = [
  "gross_revenue",
  "net_revenue",
  "orders",
  "units",
  "customers",
  "gross_aov",
  "net_aov",
  "units_per_order",
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
  "discount",
  "refund",
  "discount_pct",
  "return_pct",
  "rto_pct",
  "revenue_realisation_pct",
];

export const TREND_QUERY_METRIC_IDS = [
  "net_revenue",
  "gross_margin_pct",
  "cm1_pct",
  "cm2_pct",
];

export function hasFactsUri(result) {
  return Boolean(result?.facts_uri || result?.lineage?.facts_uri);
}

export function buildFactQueryPayload({
  result,
  filters,
  groupBy = [],
  metrics,
  sort = null,
  limit = null,
}) {
  const payload = {
    workspace_id: result?.workspace_id,
    analysis_job_id: result?.job_id,
    filters: filtersToQueryFilters(filters),
    group_by: Array.isArray(groupBy) ? groupBy : groupBy ? [groupBy] : [],
    metrics: metrics || ["net_revenue"],
  };
  if (sort) payload.sort = sort;
  if (limit != null) payload.limit = limit;
  return payload;
}

export function buildQueryCacheKey(datasetId, payload) {
  return JSON.stringify({
    datasetId,
    workspace_id: payload.workspace_id,
    analysis_job_id: payload.analysis_job_id,
    filters: payload.filters,
    group_by: payload.group_by,
    metrics: payload.metrics,
    sort: payload.sort ?? null,
    limit: payload.limit ?? null,
  });
}

export function clearFactQueryCache() {
  queryCache.clear();
}

export async function executeFactQuery(datasetId, payload, { queryFn = queryFinancialFacts, useCache = true } = {}) {
  const cacheKey = buildQueryCacheKey(datasetId, payload);
  if (useCache && queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey);
  }
  const response = await queryFn(datasetId, payload);
  if (useCache) queryCache.set(cacheKey, response);
  return response;
}

export function createStaleGuard() {
  let latestId = 0;
  return {
    next() {
      latestId += 1;
      return latestId;
    },
    isCurrent(id) {
      return id === latestId;
    },
  };
}

export function mapQueryRows(rows, dimensionId) {
  const entityKey = dimensionEntityKey(dimensionId);
  const mapped = (rows || []).map((row) => ({
    ...row,
    _entity: row._entity ?? row[dimensionId] ?? row[entityKey] ?? row.month,
    marketing_cost: row.allocated_marketing ?? row.marketing_cost,
    marketing_spend: row.allocated_marketing ?? row.marketing_spend,
    aov: row.net_aov ?? row.aov,
  }));
  const totalRevenue = mapped.reduce((sum, row) => sum + Number(row.net_revenue || 0), 0);
  const totalOrders = mapped.reduce((sum, row) => sum + Number(row.orders || 0), 0);
  const totalUnits = mapped.reduce((sum, row) => sum + Number(row.units || 0), 0);
  const totalCustomers = mapped.reduce((sum, row) => sum + Number(row.customers || 0), 0);
  return mapped.map((row) => ({
    ...row,
    revenue_share: totalRevenue === 0 ? null : Number(row.net_revenue || 0) / totalRevenue,
    order_share: totalOrders === 0 ? null : Number(row.orders || 0) / totalOrders,
    unit_share: totalUnits === 0 ? null : Number(row.units || 0) / totalUnits,
    customer_share: totalCustomers === 0 ? null : Number(row.customers || 0) / totalCustomers,
  }));
}

export function mixFromQueryRows(rows) {
  return {
    revenue: rows.filter((row) => row.revenue_share != null).map((row) => ({ entity: row._entity, share: row.revenue_share })),
    orders: rows.filter((row) => row.order_share != null).map((row) => ({ entity: row._entity, share: row.order_share })),
    units: rows.filter((row) => row.unit_share != null).map((row) => ({ entity: row._entity, share: row.unit_share })),
    customers: rows.filter((row) => row.customer_share != null).map((row) => ({ entity: row._entity, share: row.customer_share })),
  };
}

export function trendSeriesFromQueryRows(rows, metricId) {
  return [...rows]
    .sort((a, b) => String(a.month).localeCompare(String(b.month)))
    .map((row) => ({
      month: row.month,
      value: row[metricId] ?? null,
    }));
}

export function facetValuesFromRows(rows, dimensionId) {
  return [...new Set(rows.map((row) => row[dimensionId] ?? row[dimensionEntityKey(dimensionId)]).filter(Boolean))].sort();
}

export async function fetchPeriodRange(datasetId, result, { queryFn = queryFinancialFacts } = {}) {
  const payload = buildFactQueryPayload({
    result,
    filters: createPeriodProbeFilters(),
    groupBy: ["month"],
    metrics: ["net_revenue"],
  });
  const response = await executeFactQuery(datasetId, payload, { queryFn, useCache: true });
  const months = facetValuesFromRows(response.rows || [], "month");
  if (!months.length) return null;
  return { min: months[0], max: months[months.length - 1], months };
}

function createPeriodProbeFilters() {
  return {
    month_from: null,
    month_to: null,
    channel: [],
    category: [],
    sku: [],
    region: [],
    state: [],
    city_tier: [],
    new_repeat: [],
    platform: [],
  };
}

export async function fetchFilterFacets(datasetId, result, { queryFn = queryFinancialFacts } = {}) {
  const dimensions = ["channel", "category", "sku", "region", "state", "city_tier", "platform", "new_repeat"];
  const entries = await Promise.all(
    dimensions.map(async (dimension) => {
      const payload = buildFactQueryPayload({
        result,
        filters: createPeriodProbeFilters(),
        groupBy: [dimension],
        metrics: ["net_revenue"],
        sort: { metric: "net_revenue", direction: "desc" },
      });
      const response = await executeFactQuery(datasetId, payload, { queryFn, useCache: true });
      return [dimension, facetValuesFromRows(response.rows || [], dimension)];
    }),
  );
  return Object.fromEntries(entries);
}
