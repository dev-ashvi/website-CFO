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
 * Fractional runway from a cash series (same definition as primary runway).
 * @param {import('./types.js').MonthlyProjection[]} months
 * @param {{ cashKey: string, cashOutKey: string, burnKey: string }} opts
 */
function computeRunwayMonths(months, { cashKey, cashOutKey, burnKey }) {
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
 * @param {import('./types.js').MonthlyProjection[]} months
 * @returns {import('./types.js').SimulatorKpis}
 */
export function calculateKpis(months) {
  const cashOutMonth = months.find((m) => m.cashOut) || null;
  const cashOutMonthIndex = cashOutMonth ? cashOutMonth.monthIndex : null;

  const runwayMonths = computeRunwayMonths(months, {
    cashKey: "closingCash",
    cashOutKey: "cashOut",
    burnKey: "totalCashBurn",
  });

  const cashOutExcluding = months.find((m) => m.cashOutExcludingCapex) || null;
  const cashOutMonthExcludingCapex = cashOutExcluding ? cashOutExcluding.monthIndex : null;

  // Excluding CapEx: burn for fractional runway is operating cash burn only (no CapEx).
  const runwayMonthsExcludingCapex = computeRunwayMonths(months, {
    cashKey: "closingCashExcludingCapex",
    cashOutKey: "cashOutExcludingCapex",
    burnKey: "netBurn",
  });

  const avgMonthlyGrossBurn = average(months.map((m) => m.grossBurn));
  const avgMonthlyNetBurn = average(months.map((m) => Math.max(m.netBurn, 0)));
  const month1 = months[0];
  const avgGrossMargin = average(months.map((m) => m.grossMargin));
  const avgEbitda = average(months.map((m) => m.ebitda));

  const six = months[5];
  const twelve = months[11];
  const last = months[months.length - 1];

  const totalOpexSample = months.slice(0, 6);
  const payrollSum = sum(totalOpexSample.map((m) => m.payroll));
  const marketingSum = sum(totalOpexSample.map((m) => m.salesAndMarketing));
  const techSum = sum(totalOpexSample.map((m) => m.productAndTechnology));
  const expenseBase = payrollSum + marketingSum + techSum + sum(totalOpexSample.map((m) => m.otherFixedCosts));

  const avgMonthlyVariableExpenses = average(months.map((m) => m.totalVariableExpenses));
  const avgMonthlyFixedExpenses = average(months.map((m) => m.totalFixedExpenses));
  const avgTotal = avgMonthlyVariableExpenses + avgMonthlyFixedExpenses;
  const variableExpensePercent = avgTotal > 0 ? avgMonthlyVariableExpenses / avgTotal : 0;
  const fixedExpensePercent = avgTotal > 0 ? avgMonthlyFixedExpenses / avgTotal : 0;

  const categoryTotals = {
    "COGS / cost of services": average(months.map((m) => m.cogs)),
    "Other direct costs": average(months.map((m) => m.otherDirectCosts)),
    "Sales & marketing": average(months.map((m) => m.salesAndMarketing)),
    "Product & technology": average(months.map((m) => m.productAndTechnology)),
    Payroll: average(months.map((m) => m.payroll)),
    "Other fixed costs": average(months.map((m) => m.otherFixedCosts)),
  };
  const largestExpenseCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "Payroll";

  const runwayIncluding = runwayMonths == null ? null : round1(runwayMonths);
  const runwayExcluding =
    runwayMonthsExcludingCapex == null ? null : round1(runwayMonthsExcludingCapex);

  let capexRunwayImpactMonths = null;
  if (
    cashOutMonthIndex != null &&
    cashOutMonthExcludingCapex != null &&
    runwayIncluding != null &&
    runwayExcluding != null
  ) {
    capexRunwayImpactMonths = round1(runwayExcluding - runwayIncluding);
  } else if (cashOutMonthIndex != null && cashOutMonthExcludingCapex == null && runwayIncluding != null) {
    // Including hits cash-out; excluding stays positive in horizon — impact is at least the remaining buffer.
    capexRunwayImpactMonths =
      runwayExcluding != null ? round1(runwayExcluding - runwayIncluding) : null;
  } else if (cashOutMonthIndex == null && cashOutMonthExcludingCapex == null) {
    capexRunwayImpactMonths = 0;
  }

  const cumulativeCapex = last?.cumulativeCapex ?? 0;

  return {
    runwayMonths: runwayIncluding,
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
    expenseMix: {
      averageMonthlyVariableExpenses: avgMonthlyVariableExpenses,
      averageMonthlyFixedExpenses: avgMonthlyFixedExpenses,
      variableExpensePercent,
      fixedExpensePercent,
      largestExpenseCategory,
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
      runwayMonthsIncludingCapex: runwayIncluding,
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
