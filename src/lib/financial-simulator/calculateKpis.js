import { HEALTH_THRESHOLDS } from "./defaults.js";
import { buildMonth1OperatingExpenseMix } from "./buildMonth1OperatingExpenseMix.js";

/**
 * @param {number|null} runwayMonths
 * @returns {'Critical' | 'Caution' | 'Healthy'}
 */
export function getHealthStatus(runwayMonths) {
  if (runwayMonths == null || Number.isNaN(runwayMonths)) return "Critical";
  if (runwayMonths < HEALTH_THRESHOLDS.criticalBelow) return "Critical";
  if (runwayMonths < HEALTH_THRESHOLDS.cautionBelow) return "Caution";
  return "Healthy";
}

/**
 * Fractional runway from a cash series (cash-out interpolation — CapEx comparison / funding projection).
 * Independent of CFO headline runway.
 * @param {import('./types.js').MonthlyProjection[]} months
 * @param {{ cashKey: string, cashOutKey: string, burnKey: string }} opts
 */
export function computeCashSeriesRunwayMonths(months, { cashKey, cashOutKey, burnKey }) {
  const cashOutMonth = months.find((m) => m[cashOutKey]) || null;
  const cashOutMonthIndex = cashOutMonth ? cashOutMonth.monthIndex : null;

  if (cashOutMonthIndex != null) {
    const prior = months[cashOutMonthIndex - 2];
    const burnMonth = months[cashOutMonthIndex - 1];
    const priorCash = prior?.[cashKey];
    const burn = burnMonth?.[burnKey];
    if (priorCash != null && burnMonth && burn > 0) {
      return cashOutMonthIndex - 1 + priorCash / burn;
    }
    return Math.max(0, cashOutMonthIndex - 1);
  }

  const last = months[months.length - 1];
  const recent = months.slice(-3);
  const avgBurn = average(
    recent.map((m) => Math.max(m[burnKey], 0)).filter((v) => v > 0),
  );
  if (avgBurn > 0 && last?.[cashKey] != null) {
    return months.length + last[cashKey] / avgBurn;
  }
  return months.length;
}

/**
 * CFO / Excel runway at a given 0-based month index:
 * that month's ending cash ÷ forward 3-month average net operating burn (excl. CapEx).
 * Do NOT derive from first-negative cash month.
 * @param {import('./types.js').MonthlyProjection[]} months
 * @param {number} monthIndex0
 * @returns {{
 *   rawMonths: number,
 *   endingCash: number,
 *   threeMonthAvgNetBurn: number,
 *   monthIndex: number,
 *   monthLabel: string,
 * }|null}
 */
export function computeCfoRunwayAtMonth(months, monthIndex0) {
  const m = months[monthIndex0];
  if (!m || m.closingCash == null) return null;
  const window = months.slice(monthIndex0, Math.min(monthIndex0 + 3, months.length));
  if (!window.length) return null;
  const avgNetBurn = average(window.map((row) => row.netBurn));
  if (avgNetBurn <= 0) return null;
  return {
    rawMonths: m.closingCash / avgNetBurn,
    endingCash: m.closingCash,
    threeMonthAvgNetBurn: avgNetBurn,
    monthIndex: m.monthIndex,
    monthLabel: m.monthLabel,
  };
}

/**
 * CFO / Excel headline runway — Month 1 ending cash ÷ forward 3-month average net burn (exc. CapEx).
 * Do NOT derive from first-negative cash month.
 * @param {import('./types.js').MonthlyProjection[]} months
 * @returns {number|null}
 */
export function computeCfoHeadlineRunwayMonths(months) {
  const detail = computeCfoRunwayAtMonth(months, 0);
  return detail ? detail.rawMonths : null;
}

/**
 * Expected cash-out from deterministic forecast — first month with closingCash < 0.
 * Independent of CFO headline runway.
 * @param {import('./types.js').MonthlyProjection[]} months
 * @returns {import('./types.js').MonthlyProjection|null}
 */
export function findExpectedCashOutMonth(months) {
  return months.find((m) => m.closingCash != null && m.closingCash < 0) || null;
}

/**
 * @param {import('./types.js').MonthlyProjection[]} months
 * @returns {import('./types.js').SimulatorKpis}
 */
export function calculateKpis(months) {
  const cashOutMonth = findExpectedCashOutMonth(months);
  const cashOutMonthIndex = cashOutMonth ? cashOutMonth.monthIndex : null;

  const headlineRunwayMonthsRaw = computeCfoHeadlineRunwayMonths(months);
  const cashSeriesRunwayMonthsRaw = computeCashSeriesRunwayMonths(months, {
    cashKey: "closingCash",
    cashOutKey: "cashOut",
    burnKey: "totalCashBurn",
  });

  const cashOutExcluding =
    months.find((m) => m.closingCashExcludingCapex != null && m.closingCashExcludingCapex < 0) ||
    null;
  const cashOutMonthExcludingCapex = cashOutExcluding ? cashOutExcluding.monthIndex : null;

  const runwayMonthsExcludingCapex = computeCashSeriesRunwayMonths(months, {
    cashKey: "closingCashExcludingCapex",
    cashOutKey: "cashOutExcludingCapex",
    burnKey: "netBurn",
  });

  const avgMonthlyGrossBurn = average(months.map((m) => m.grossBurn));
  const avgMonthlyNetBurn = average(months.map((m) => Math.max(m.netBurn, 0)));
  const avgMonthlyNetBurnIncludingCapex = average(
    months.map((m) => Math.max(m.netBurnIncludingCapex ?? m.totalCashBurn, 0)),
  );
  const month1 = months[0];
  const avgGrossMargin = average(months.map((m) => m.grossMargin));
  const avgEbitda = average(months.map((m) => m.ebitda));

  const six = months[5];
  const twelve = months[11];
  const last = months[months.length - 1];

  const financialPerformance = {
    revenue: month1?.revenue ?? 0,
    grossProfit: month1?.grossProfit ?? 0,
    grossMarginPercent: month1?.grossMargin ?? 0,
    cm1: month1?.cm1 ?? 0,
    cm1MarginPercent: month1?.cm1Margin ?? 0,
    ebitda: month1?.ebitda ?? 0,
    ebitdaMarginPercent: month1?.ebitdaMargin ?? 0,
  };

  const monthlyGrossBurn = month1?.grossBurn ?? 0;
  const monthlyNetBurnExcludingCapex = month1?.netBurn ?? 0;
  const monthlyNetBurnIncludingCapex = month1?.netBurnIncludingCapex ?? month1?.totalCashBurn ?? 0;

  const burnMetrics = {
    monthlyNetBurnExcludingCapex,
    monthlyNetBurnIncludingCapex,
    monthlyGrossBurn,
    avgNetBurnExcludingCapex: avgMonthlyNetBurn,
    avgNetBurnIncludingCapex: avgMonthlyNetBurnIncludingCapex,
    avgGrossBurn: avgMonthlyGrossBurn,
  };

  const totalOpexSample = months.slice(0, 6);
  const payrollSum = sum(totalOpexSample.map((m) => m.payroll));
  const marketingSum = sum(totalOpexSample.map((m) => m.salesAndMarketing));
  const techSum = sum(totalOpexSample.map((m) => m.productAndTechnology));
  const expenseBase = payrollSum + marketingSum + techSum + sum(totalOpexSample.map((m) => m.otherFixedCosts));

  const avgMonthlyVariableExpenses = average(months.map((m) => m.totalVariableExpenses));
  const avgMonthlyFixedExpenses = average(months.map((m) => m.totalFixedExpenses));

  const operatingMix = buildMonth1OperatingExpenseMix(month1);

  const headlineRunwayMonths =
    headlineRunwayMonthsRaw == null ? null : round1(headlineRunwayMonthsRaw);
  /** Default primary runway with no future funding = CFO headline methodology. */
  const runwayIncluding = headlineRunwayMonths;
  const cashSeriesRunwayMonths =
    cashSeriesRunwayMonthsRaw == null ? null : round1(cashSeriesRunwayMonthsRaw);
  const runwayIncludingCapexSeries = cashSeriesRunwayMonths;
  const runwayExcluding =
    runwayMonthsExcludingCapex == null ? null : round1(runwayMonthsExcludingCapex);

  let capexRunwayImpactMonths = null;
  if (
    cashOutMonthIndex != null &&
    cashOutMonthExcludingCapex != null &&
    runwayIncludingCapexSeries != null &&
    runwayExcluding != null
  ) {
    capexRunwayImpactMonths = round1(runwayExcluding - runwayIncludingCapexSeries);
  } else if (
    cashOutMonthIndex != null &&
    cashOutMonthExcludingCapex == null &&
    runwayIncludingCapexSeries != null
  ) {
    capexRunwayImpactMonths =
      runwayExcluding != null ? round1(runwayExcluding - runwayIncludingCapexSeries) : null;
  } else if (cashOutMonthIndex == null && cashOutMonthExcludingCapex == null) {
    capexRunwayImpactMonths = 0;
  }

  const cumulativeCapex = last?.cumulativeCapex ?? 0;

  return {
    runwayMonths: runwayIncluding,
    headlineRunwayMonths,
    cashSeriesRunwayMonths,
    projectedRunwayMonths: runwayIncluding,
    runwayBeforePlannedFundingMonths: null,
    runwayAfterPlannedFundingMonths: null,
    plannedFunding: {
      hasFutureFunding: false,
      totalAmount: 0,
      eventCount: 0,
      equityAmount: 0,
      debtOtherAmount: 0,
      firstFundingMonth: null,
      firstFundingDate: null,
      events: [],
    },
    fundingRunwayImpactMonths: null,
    cfoFundingRunway: {
      hasFutureFunding: false,
      runwayBeforeFunding: null,
      runwayAfterFunding: null,
      fundingRunwayImpactMonths: null,
      fundingRunwayImpactDisplayMonths: null,
    },
    cashOutMonthLabel: cashOutMonth
      ? cashOutMonth.monthLabel
      : "Beyond 24-month horizon",
    cashOutMonthIndex,
    avgMonthlyGrossBurn,
    avgMonthlyNetBurn,
    avgMonthlyNetBurnIncludingCapex,
    month1GrossBurn: monthlyGrossBurn,
    month1NetBurnExcludingCapex: monthlyNetBurnExcludingCapex,
    month1NetBurnIncludingCapex: monthlyNetBurnIncludingCapex,
    month1Revenue: financialPerformance.revenue,
    month1GrossProfit: financialPerformance.grossProfit,
    month1GrossMargin: month1?.grossMargin ?? 0,
    month1Cm1: financialPerformance.cm1,
    month1Cm1Margin: financialPerformance.cm1MarginPercent,
    avgGrossMargin,
    month1Ebitda: month1?.ebitda ?? 0,
    month1EbitdaMargin: month1?.ebitdaMargin ?? 0,
    avgEbitda,
    sixMonthClosingCash: six?.closingCash ?? null,
    twelveMonthClosingCash: twelve?.closingCash ?? null,
    healthStatus: getHealthStatus(runwayIncluding),
    financialPerformance,
    burnMetrics,
    costMix: {
      payrollPercentOfExpenses: expenseBase ? payrollSum / expenseBase : 0,
      marketingPercentOfExpenses: expenseBase ? marketingSum / expenseBase : 0,
      technologyPercentOfExpenses: expenseBase ? techSum / expenseBase : 0,
    },
    expenseMix: {
      ...operatingMix,
      averageMonthlyVariableExpenses: avgMonthlyVariableExpenses,
      averageMonthlyFixedExpenses: avgMonthlyFixedExpenses,
    },
    capexComparison: {
      cashOutMonthIncludingCapex: cashOutMonthIndex,
      cashOutMonthExcludingCapex,
      cashOutMonthLabelIncludingCapex: cashOutMonth
        ? cashOutMonth.monthLabel
        : "Beyond 24-month horizon",
      cashOutMonthLabelExcludingCapex: cashOutExcluding
        ? cashOutExcluding.monthLabel
        : "Beyond 24-month horizon",
      excludingCashAtIncludingCashOutMonth: cashOutMonth?.closingCashExcludingCapex ?? null,
      capexInIncludingCashOutMonth: cashOutMonth?.capex ?? 0,
      runwayMonthsIncludingCapex: runwayIncludingCapexSeries,
      runwayMonthsExcludingCapex: runwayExcluding,
      month24CashIncludingCapex: last?.closingCash ?? null,
      month24CashExcludingCapex: last?.closingCashExcludingCapex ?? null,
      capexRunwayImpactMonths,
      cumulativeCapex,
    },
  };
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function average(arr) {
  if (!arr.length) return 0;
  return sum(arr) / arr.length;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
