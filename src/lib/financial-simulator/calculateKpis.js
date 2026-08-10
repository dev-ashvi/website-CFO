import { HEALTH_THRESHOLDS } from "./defaults.js";

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
 * Fractional runway from a cash series (cash-out interpolation — CapEx comparison / legacy).
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
 * Excel headline runway: Month 1 ending cash ÷ 3-month average net burn (exc. CapEx).
 * Net burn = −EBITDA per month; average uses months 1–3 net burn values.
 * @param {import('./types.js').MonthlyProjection[]} months
 */
function computeHeadlineRunwayMonths(months) {
  const m1 = months[0];
  if (!m1 || m1.closingCash == null) return null;
  const recent = months.slice(0, Math.min(3, months.length));
  if (!recent.length) return null;
  const avgNetBurn = average(recent.map((m) => m.netBurn));
  if (avgNetBurn <= 0) return null;
  return m1.closingCash / avgNetBurn;
}

/**
 * @param {import('./types.js').MonthlyProjection[]} months
 * @returns {import('./types.js').SimulatorKpis}
 */
export function calculateKpis(months) {
  const cashOutMonth = months.find((m) => m.cashOut) || null;
  const cashOutMonthIndex = cashOutMonth ? cashOutMonth.monthIndex : null;

  const runwayMonths = computeHeadlineRunwayMonths(months);

  const cashOutExcluding = months.find((m) => m.cashOutExcludingCapex) || null;
  const cashOutMonthExcludingCapex = cashOutExcluding ? cashOutExcluding.monthIndex : null;

  const runwayMonthsIncludingCapexSeries = computeRunwayMonths(months, {
    cashKey: "closingCash",
    cashOutKey: "cashOut",
    burnKey: "totalCashBurn",
  });

  // Excluding CapEx: burn for fractional runway is operating cash burn only (no CapEx).
  const runwayMonthsExcludingCapex = computeRunwayMonths(months, {
    cashKey: "closingCashExcludingCapex",
    cashOutKey: "cashOutExcludingCapex",
    burnKey: "netBurn",
  });

  const avgMonthlyGrossBurn = average(months.map((m) => m.grossBurn));
  // Forecast averages retained for runway / internal use (not primary displayed KPIs).
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

  // Displayed Burn & Cash KPIs: Month 1 / current-period (signed; not averages).
  const monthlyGrossBurn = month1?.grossBurn ?? 0;
  const monthlyNetBurnExcludingCapex = month1?.netBurn ?? 0;
  const monthlyNetBurnIncludingCapex = month1?.netBurnIncludingCapex ?? month1?.totalCashBurn ?? 0;

  const burnMetrics = {
    monthlyNetBurnExcludingCapex,
    monthlyNetBurnIncludingCapex,
    monthlyGrossBurn,
    // Backward-compatible aliases (forecast averages) — not shown as primary KPIs.
    avgNetBurnExcludingCapex: avgMonthlyNetBurn,
    avgNetBurnIncludingCapex: avgMonthlyNetBurnIncludingCapex,
    avgGrossBurn: avgMonthlyGrossBurn,
  };

  const totalOpexSample = months.slice(0, 6);
  const payrollSum = sum(totalOpexSample.map((m) => m.payroll));
  const marketingSum = sum(totalOpexSample.map((m) => m.salesAndMarketing));
  const techSum = sum(totalOpexSample.map((m) => m.productAndTechnology));
  const expenseBase = payrollSum + marketingSum + techSum + sum(totalOpexSample.map((m) => m.otherFixedCosts));

  // Forecast averages retained separately (not shown in Expense Breakdown).
  const avgMonthlyVariableExpenses = average(months.map((m) => m.totalVariableExpenses));
  const avgMonthlyFixedExpenses = average(months.map((m) => m.totalFixedExpenses));

  // Displayed Expense Breakdown: Month 1 snapshot only (CapEx / funding excluded).
  const month1VariableExpenses = month1?.totalVariableExpenses ?? 0;
  const month1FixedExpenses = month1?.totalFixedExpenses ?? 0;
  const month1OperatingExpenses =
    month1?.totalOperatingExpenses ?? month1VariableExpenses + month1FixedExpenses;
  const variableShare =
    month1OperatingExpenses > 0 ? month1VariableExpenses / month1OperatingExpenses : 0;
  const fixedShare =
    month1OperatingExpenses > 0 ? month1FixedExpenses / month1OperatingExpenses : 0;

  const categoryTotals = {
    COGS: month1?.cogs ?? 0,
    "Other direct costs": month1?.otherDirectCosts ?? 0,
    "Sales & marketing": month1?.salesAndMarketing ?? 0,
    "Product & technology": month1?.productAndTechnology ?? 0,
    Payroll: month1?.payroll ?? 0,
    "Other fixed costs": month1?.otherFixedCosts ?? 0,
  };
  const largestEntry =
    Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0] || ["Payroll", 0];
  const largestExpenseCategory = largestEntry[0];
  const largestExpenseCategoryAmount = largestEntry[1];
  const largestExpenseCategoryPercent =
    month1OperatingExpenses > 0 ? largestExpenseCategoryAmount / month1OperatingExpenses : 0;

  const runwayIncluding = runwayMonths == null ? null : round1(runwayMonths);
  const runwayIncludingCapexSeries =
    runwayMonthsIncludingCapexSeries == null ? null : round1(runwayMonthsIncludingCapexSeries);
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
    healthStatus: getHealthStatus(runwayMonths),
    financialPerformance,
    burnMetrics,
    costMix: {
      payrollPercentOfExpenses: expenseBase ? payrollSum / expenseBase : 0,
      marketingPercentOfExpenses: expenseBase ? marketingSum / expenseBase : 0,
      technologyPercentOfExpenses: expenseBase ? techSum / expenseBase : 0,
    },
    expenseMix: {
      period: "month1",
      variableExpenses: month1VariableExpenses,
      fixedExpenses: month1FixedExpenses,
      variableSharePercent: variableShare,
      fixedSharePercent: fixedShare,
      largestExpenseCategory,
      largestExpenseCategoryAmount,
      largestExpenseCategoryPercent,
      // Backward-compatible aliases (Month 1 shares / values — not averages).
      variableExpensePercent: variableShare,
      fixedExpensePercent: fixedShare,
      // Forecast averages kept separately for internal / legacy consumers.
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
