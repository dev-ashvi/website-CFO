/** Allowlisted dot-paths into FinancialIntelligenceContext for MetricRef validation. */

export const METRIC_REF_ALLOWLIST = Object.freeze([
  "runway.primaryRunwayMonths",
  "runway.primaryRunwayLabel",
  "runway.headlineRunwayMonths",
  "runway.runwayBeforePlannedFundingMonths",
  "runway.runwayAfterPlannedFundingMonths",
  "runway.cashSeriesRunwayMonths",
  "runway.fundingRunwayImpactMonths",
  "runway.cashOutMonthLabel",
  "runway.cashOutMonthIndex",
  "runway.cashOutBeforeFunding",
  "runway.cashOutWithFunding",
  "runway.healthStatus",
  "runway.healthStatusBeforePlannedFunding",
  "runway.healthStatusAfterPlannedFunding",
  "currentPerformance.revenue",
  "currentPerformance.grossProfit",
  "currentPerformance.grossMarginPercent",
  "currentPerformance.cm1",
  "currentPerformance.cm1MarginPercent",
  "currentPerformance.cm2",
  "currentPerformance.cm2MarginPercent",
  "currentPerformance.ebitda",
  "currentPerformance.ebitdaMarginPercent",
  "burnAndCash.grossBurn",
  "burnAndCash.netBurnExclCapex",
  "burnAndCash.netBurnInclCapex",
  "burnAndCash.month1ClosingCash",
  "burnAndCash.month1OpeningCash",
  "funding.plannedFunding.totalAmount",
  "funding.plannedFunding.firstFundingMonth",
  "trends.closingCash.m12",
  "trends.closingCash.m24",
  "trends.ebitda.m1",
]);

const MONTHS_PATHS = new Set([
  "runway.primaryRunwayMonths",
  "runway.headlineRunwayMonths",
  "runway.runwayBeforePlannedFundingMonths",
  "runway.runwayAfterPlannedFundingMonths",
  "runway.cashSeriesRunwayMonths",
  "runway.fundingRunwayImpactMonths",
]);

/**
 * @param {string} path
 */
export function isAllowlistedMetricPath(path) {
  return METRIC_REF_ALLOWLIST.includes(path);
}

/**
 * @param {object} context FinancialIntelligenceContext
 * @param {string} path
 */
export function resolveContextPath(context, path) {
  if (!isAllowlistedMetricPath(path)) return undefined;
  const parts = path.split(".");
  let cur = context;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * @param {string} path
 */
export function metricPathTolerance(path) {
  return MONTHS_PATHS.has(path) ? 0.05 : 0;
}
