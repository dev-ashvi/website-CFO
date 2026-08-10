import { findFirstNegativeCashMonth } from "./chartSeries.js";
import { monthLabelFromStart } from "./calculateProjection.js";

/**
 * Snapshot of normalized form → engine → KPI pipeline for dev debugging.
 * @param {import('./types.js').SimulatorInputs} normalized
 * @param {{ months: import('./types.js').MonthlyProjection[], kpis: import('./types.js').SimulatorKpis }} sim
 */
export function buildRunwayUiDiagnostic(normalized, sim) {
  const months = sim.months || [];
  const m12 = months[11];
  const m13 = months[12];
  const firstNeg = findFirstNegativeCashMonth(months, { includingCapex: true });
  const mix = sim.kpis?.expenseMix || {};
  const capex = normalized.capexEvents?.[0] || null;

  const pct = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 10000) / 100);

  return {
    normalizedInputs: {
      openingCash: normalized.currentCashBalance,
      forecastStartMonth: normalized.forecastStartMonth,
      revenueMode: normalized.revenueMode,
      startingVolume: normalized.currentVolume,
      volumeGrowthPercent: pct(normalized.monthlyVolumeGrowth),
      aov: normalized.averageOrderValue,
      aovGrowthPercent: pct(normalized.monthlyAovGrowth),
      cogsPercent: pct(normalized.cogsPercent),
      otherDirectCostsPercent: pct(normalized.otherDirectCostsPercent),
      fulfillmentPercent: pct(normalized.productTechPercent),
      salesAndMarketingPercent: pct(normalized.salesMarketingPercent),
      payroll: normalized.monthlyPayroll,
      payrollGrowthPercent: pct(normalized.payrollGrowth),
      otherFixedCosts: normalized.otherFixedCosts,
      otherFixedCostGrowthPercent: pct(normalized.otherFixedGrowth),
      capexEvents: normalized.capexEvents,
      equityEvents: normalized.equityEvents,
      debtEvents: normalized.debtEvents,
    },
    engineOutputs: {
      month12ClosingCashIncludingCapex: m12?.closingCash ?? null,
      month13ClosingCashIncludingCapex: m13?.closingCash ?? null,
      month13ClosingCashExcludingCapex: m13?.closingCashExcludingCapex ?? null,
      firstNegativeMonthIndex: firstNeg?.monthIndex ?? null,
      cashOutLabel: sim.kpis?.cashOutMonthLabel ?? null,
      largestExpenseCategoryKey: mix.largestExpenseCategoryKey ?? null,
      largestExpenseCategoryLabel:
        mix.largestExpenseCategoryLabel ?? mix.largestExpenseCategory ?? null,
    },
    renderedKpis: {
      cashOutMonthLabel: sim.kpis?.cashOutMonthLabel,
      cashOutMonthIndex: sim.kpis?.cashOutMonthIndex,
      expenseMixLargestLabel:
        mix.largestExpenseCategoryLabel ?? mix.largestExpenseCategory,
      expenseMixLargestKey: mix.largestExpenseCategoryKey,
      cumulativeCapex: sim.kpis?.capexComparison?.cumulativeCapex,
    },
    capexInPayload: capex,
    firstNegativeMonthLabel: firstNeg?.monthLabel ?? null,
    month13Label: m13 ? monthLabelFromStart(normalized.forecastStartMonth, 13) : null,
  };
}

/** Scenario 1 expected checkpoints for dev comparison. */
export const SCENARIO_1_UI_EXPECTED = {
  month12ClosingCashIncludingCapex: 270_101.11,
  month13ClosingCashIncludingCapex: 39_641.31,
  month13ClosingCashExcludingCapex: 39_641.31,
  firstNegativeMonthIndex: 14,
  cashOutLabel: "Aug 2027",
  largestExpenseCategoryKey: "productAndTechnology",
  largestExpenseCategoryLabel: "Fulfilment / other variable operating costs",
};

/**
 * @param {ReturnType<typeof buildRunwayUiDiagnostic>} diagnostic
 */
export function compareScenario1Diagnostic(diagnostic) {
  const out = diagnostic.engineOutputs;
  const tol = 1;
  const near = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= tol;
  return {
    month12Cash: near(out.month12ClosingCashIncludingCapex, SCENARIO_1_UI_EXPECTED.month12ClosingCashIncludingCapex),
    month13CashIncl: near(out.month13ClosingCashIncludingCapex, SCENARIO_1_UI_EXPECTED.month13ClosingCashIncludingCapex),
    month13CashExcl: near(out.month13ClosingCashExcludingCapex, SCENARIO_1_UI_EXPECTED.month13ClosingCashExcludingCapex),
    firstNegativeMonth: out.firstNegativeMonthIndex === SCENARIO_1_UI_EXPECTED.firstNegativeMonthIndex,
    cashOutLabel: out.cashOutLabel === SCENARIO_1_UI_EXPECTED.cashOutLabel,
    largestKey: out.largestExpenseCategoryKey === SCENARIO_1_UI_EXPECTED.largestExpenseCategoryKey,
    largestLabel: out.largestExpenseCategoryLabel === SCENARIO_1_UI_EXPECTED.largestExpenseCategoryLabel,
    noCapex:
      !Array.isArray(diagnostic.normalizedInputs.capexEvents) ||
      diagnostic.normalizedInputs.capexEvents.length === 0 ||
      diagnostic.normalizedInputs.capexEvents.every((e) => !(Number(e.amount) > 0)),
  };
}
