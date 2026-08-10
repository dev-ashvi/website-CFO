/**
 * Chart-series helpers — consume projection outputs only (no UI-side formula rebuild).
 */

/**
 * Operating P&L expenses for Revenue vs Total Expenses chart.
 * Excludes CapEx and funding. Equivalent to revenue − EBITDA.
 * @param {import('./types.js').MonthlyProjection} month
 */
export function getChartTotalExpenses(month) {
  if (month.totalOperatingExpenses != null) {
    return month.totalOperatingExpenses;
  }
  return month.revenue - month.ebitda;
}

/**
 * @param {import('./types.js').MonthlyProjection[]} months
 */
export function buildClosingCashChartSeries(months) {
  return months.map((m) => ({
    monthIndex: m.monthIndex,
    label: m.monthLabel,
    includingCapex: m.closingCash ?? 0,
    excludingCapex: m.closingCashExcludingCapex ?? 0,
    monthlyCapex: m.capex ?? 0,
    cumulativeCapex: m.cumulativeCapex ?? 0,
  }));
}

/**
 * @param {import('./types.js').MonthlyProjection[]} months
 */
export function buildRevenueVsExpensesChartSeries(months) {
  return months.map((m) => ({
    monthIndex: m.monthIndex,
    label: m.monthLabel,
    revenue: m.revenue,
    expenses: getChartTotalExpenses(m),
  }));
}

/**
 * First forecast month where closing cash is negative.
 * @param {import('./types.js').MonthlyProjection[]} months
 * @param {{ includingCapex?: boolean }} [opts]
 * @returns {import('./types.js').MonthlyProjection | null}
 */
export function findFirstNegativeCashMonth(months, { includingCapex = true } = {}) {
  const key = includingCapex ? "closingCash" : "closingCashExcludingCapex";
  return months.find((m) => m[key] != null && m[key] < 0) ?? null;
}

/**
 * Invariant: excluding − including = cumulative CapEx (signed).
 * @param {import('./types.js').MonthlyProjection} month
 */
export function closingCashCapexGap(month) {
  return (month.closingCashExcludingCapex ?? 0) - (month.closingCash ?? 0);
}
