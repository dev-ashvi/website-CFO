import { HEALTH_THRESHOLDS } from "./defaults.js";

/**
 * @param {number|null} runwayMonths
 * @returns {'Critical' | 'Attention required' | 'Stable' | 'Healthy'}
 */
export function getHealthStatus(runwayMonths) {
  if (runwayMonths == null || Number.isNaN(runwayMonths)) return "Critical";
  if (runwayMonths < HEALTH_THRESHOLDS.criticalBelow) return "Critical";
  if (runwayMonths < HEALTH_THRESHOLDS.attentionBelow) return "Attention required";
  if (runwayMonths < HEALTH_THRESHOLDS.stableBelow) return "Stable";
  return "Healthy";
}

/**
 * @param {import('./types.js').MonthlyProjection[]} months
 * @returns {import('./types.js').SimulatorKpis}
 */
export function calculateKpis(months) {
  const cashOutMonth = months.find((m) => m.cashOut) || null;
  const cashOutMonthIndex = cashOutMonth ? cashOutMonth.monthIndex : null;

  let runwayMonths = null;
  if (cashOutMonthIndex != null) {
    // Fractional runway using prior closing cash / that month's burn when available.
    const prior = months[cashOutMonthIndex - 2];
    const burnMonth = months[cashOutMonthIndex - 1];
    if (prior?.closingCash != null && burnMonth && burnMonth.totalCashBurn > 0) {
      runwayMonths = cashOutMonthIndex - 1 + prior.closingCash / burnMonth.totalCashBurn;
    } else {
      runwayMonths = Math.max(0, cashOutMonthIndex - 1);
    }
  } else {
    // No cash-out in horizon: estimate from last positive closing / recent avg burn.
    const last = months[months.length - 1];
    const recent = months.slice(-3);
    const avgBurn = average(
      recent.map((m) => Math.max(m.totalCashBurn, 0)).filter((v) => v > 0),
    );
    if (avgBurn > 0 && last.closingCash != null) {
      runwayMonths = months.length + last.closingCash / avgBurn;
    } else {
      runwayMonths = months.length; // at least full horizon, cash generative
    }
  }

  const avgMonthlyGrossBurn = average(months.map((m) => m.grossBurn));
  const avgMonthlyNetBurn = average(months.map((m) => Math.max(m.netBurn, 0)));
  const month1 = months[0];
  const avgGrossMargin = average(months.map((m) => m.grossMargin));
  const avgEbitda = average(months.map((m) => m.ebitda));

  const six = months[5];
  const twelve = months[11];

  const totalOpexSample = months.slice(0, 6);
  const payrollSum = sum(totalOpexSample.map((m) => m.payroll));
  const marketingSum = sum(totalOpexSample.map((m) => m.salesAndMarketing));
  const techSum = sum(totalOpexSample.map((m) => m.productAndTechnology));
  const expenseBase = payrollSum + marketingSum + techSum + sum(totalOpexSample.map((m) => m.otherFixedCosts));

  return {
    runwayMonths: runwayMonths == null ? null : round1(runwayMonths),
    cashOutMonthLabel: cashOutMonth
      ? cashOutMonth.monthLabel
      : "Beyond 24-month horizon",
    cashOutMonthIndex,
    avgMonthlyGrossBurn,
    avgMonthlyNetBurn,
    month1GrossMargin: month1?.grossMargin ?? 0,
    avgGrossMargin,
    month1Ebitda: month1?.ebitda ?? 0,
    avgEbitda,
    sixMonthClosingCash: six?.closingCash ?? null,
    twelveMonthClosingCash: twelve?.closingCash ?? null,
    healthStatus: getHealthStatus(runwayMonths),
    costMix: {
      payrollPercentOfExpenses: expenseBase ? payrollSum / expenseBase : 0,
      marketingPercentOfExpenses: expenseBase ? marketingSum / expenseBase : 0,
      technologyPercentOfExpenses: expenseBase ? techSum / expenseBase : 0,
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
