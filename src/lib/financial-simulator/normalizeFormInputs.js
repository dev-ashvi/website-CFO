import { FORECAST_MONTHS } from "./defaults.js";

/**
 * Normalize raw form state into engine-ready simulator inputs.
 * Mirrors RunwaySimulatorPage before runSimulation().
 * @param {import('./types.js').SimulatorInputs} raw
 */
export function normalizeFormInputs(raw) {
  const toNum = (v) => (v === "" || v == null ? 0 : Number(v));
  const cleanEvents = (arr) =>
    (arr || [])
      .map((e) => ({ monthIndex: Number(e.monthIndex), amount: toNum(e.amount) }))
      .filter((e) => e.amount > 0 && e.monthIndex >= 1 && e.monthIndex <= FORECAST_MONTHS);

  const flat = {
    ...raw,
    currentCashBalance: toNum(raw.currentCashBalance),
    currentMonthlyRevenue: toNum(raw.currentMonthlyRevenue),
    monthlyRevenueGrowth: toNum(raw.monthlyRevenueGrowth),
    currentVolume: toNum(raw.currentVolume),
    monthlyVolumeGrowth: toNum(raw.monthlyVolumeGrowth),
    averageOrderValue: toNum(raw.averageOrderValue),
    monthlyAovGrowth: toNum(raw.monthlyAovGrowth),
    cogsPercent: toNum(raw.cogsPercent),
    otherDirectCostsPercent: toNum(raw.otherDirectCostsPercent),
    salesMarketingPercent: toNum(raw.salesMarketingPercent),
    productTechPercent: toNum(raw.productTechPercent),
    monthlyPayroll: toNum(raw.monthlyPayroll),
    payrollGrowth: toNum(raw.payrollGrowth),
    otherFixedCosts: toNum(raw.otherFixedCosts),
    otherFixedGrowth: toNum(raw.otherFixedGrowth),
    capexEvents: cleanEvents(raw.capexEvents),
    equityEvents: cleanEvents(raw.equityEvents),
    debtEvents: cleanEvents(raw.debtEvents),
  };

  return {
    ...flat,
    variableExpenses: {
      cogsPercent: flat.cogsPercent,
      otherDirectCostsPercent: flat.otherDirectCostsPercent,
      salesAndMarketingPercent: flat.salesMarketingPercent,
      productAndTechnologyPercent: flat.productTechPercent,
    },
    fixedExpenses: {
      monthlyPayroll: flat.monthlyPayroll,
      payrollGrowthPercent: flat.payrollGrowth,
      otherFixedCosts: flat.otherFixedCosts,
      otherFixedCostGrowthPercent: flat.otherFixedGrowth,
    },
  };
}
