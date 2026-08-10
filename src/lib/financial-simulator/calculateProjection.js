import { FORECAST_MONTHS } from "./defaults.js";

/**
 * @param {string} startYm - YYYY-MM
 * @param {number} monthIndex - 1-based
 */
export function monthLabelFromStart(startYm, monthIndex) {
  const [y, m] = String(startYm).split("-").map(Number);
  if (!y || !m) return `M${monthIndex}`;
  const d = new Date(y, m - 1 + (monthIndex - 1), 1);
  return d.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

/**
 * Human-readable forecast month, e.g. "December 2026".
 * @param {string} startYm - YYYY-MM
 * @param {number} monthIndex - 1-based
 */
export function monthFullLabelFromStart(startYm, monthIndex) {
  const [y, m] = String(startYm).split("-").map(Number);
  if (!y || !m) return `Month ${monthIndex}`;
  const d = new Date(y, m - 1 + (monthIndex - 1), 1);
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

/**
 * @param {string} startYm
 * @param {number} [count]
 * @returns {{ monthIndex: number, label: string }[]}
 */
export function forecastMonthOptions(startYm, count = FORECAST_MONTHS) {
  return Array.from({ length: count }, (_, i) => ({
    monthIndex: i + 1,
    label: monthFullLabelFromStart(startYm, i + 1),
  }));
}

/**
 * @param {import('./types.js').CashEvent[]} events
 * @returns {Record<number, number>}
 */
function eventsToSchedule(events) {
  /** @type {Record<number, number>} */
  const map = {};
  for (let i = 1; i <= FORECAST_MONTHS; i++) map[i] = 0;
  (events || []).forEach((ev) => {
    const m = Number(ev?.monthIndex);
    const amt = Number(ev?.amount) || 0;
    if (m >= 1 && m <= FORECAST_MONTHS && amt > 0) {
      map[m] = (map[m] || 0) + amt;
    }
  });
  return map;
}

/**
 * Deterministic 24-month projection mirroring Output Model sheet.
 * @param {import('./types.js').SimulatorInputs} inputs
 * @returns {import('./types.js').MonthlyProjection[]}
 */
export function calculateProjection(inputs) {
  const useDetailed = inputs.revenueMode === "detailed";

  let volume = useDetailed ? Number(inputs.currentVolume) : Number(inputs.currentMonthlyRevenue);
  let aov = useDetailed ? Number(inputs.averageOrderValue) : 1;
  const volumeGrowth = useDetailed
    ? Number(inputs.monthlyVolumeGrowth)
    : Number(inputs.monthlyRevenueGrowth);
  const aovGrowth = useDetailed ? Number(inputs.monthlyAovGrowth) : 0;

  // Golden Excel / approved scenarios: fixed costs use input base in Month 1,
  // then compound MoM from Month 2. (Earlier workbook notes that applied growth in M1
  // are superseded by runway_excel_golden_fixtures.json.)
  let payroll = Number(inputs.monthlyPayroll);
  let otherFixed = Number(inputs.otherFixedCosts);
  const payrollGrowth = Number(inputs.payrollGrowth);
  const otherFixedGrowth = Number(inputs.otherFixedGrowth);
  /** Optional scenario modifiers (default = no change). */
  const payrollGrowthDelayMonths = Math.max(0, Math.floor(Number(inputs.payrollGrowthDelayMonths) || 0));
  const opexReductionRate = Math.min(0.95, Math.max(0, Number(inputs.opexReductionRate) || 0));
  const opexReductionFromMonth = Math.max(0, Math.floor(Number(inputs.opexReductionFromMonth) || 0));
  /** @type {'variable' | 'fixed' | null} */
  const opexReductionTarget =
    inputs.opexReductionTarget === "variable" || inputs.opexReductionTarget === "fixed"
      ? inputs.opexReductionTarget
      : null;

  const cogsPct = Number(inputs.cogsPercent);
  const otherDirectPct = Number(inputs.otherDirectCostsPercent);
  const smPct = Number(inputs.salesMarketingPercent);
  const techPctBase = Number(inputs.productTechPercent);
  const techPctChangeFrom = Math.max(0, Math.floor(Number(inputs.productTechPercentChangeFromMonth) || 0));
  const techPctAfter =
    inputs.productTechPercentAfterChange == null || inputs.productTechPercentAfterChange === ""
      ? null
      : Number(inputs.productTechPercentAfterChange);

  const capex = eventsToSchedule(inputs.capexEvents);
  const equity = eventsToSchedule(inputs.equityEvents);
  const debt = eventsToSchedule(inputs.debtEvents);

  /** @type {import('./types.js').MonthlyProjection[]} */
  const months = [];
  let openingCash = Number(inputs.currentCashBalance);
  let openingCashExcludingCapex = Number(inputs.currentCashBalance);
  let cashExhausted = false;
  let cashExhaustedExcludingCapex = false;
  let cumulativeCapex = 0;

  for (let m = 1; m <= FORECAST_MONTHS; m++) {
    if (m > 1) {
      volume = Math.round(volume * (1 + volumeGrowth));
      aov = aov * (1 + aovGrowth);
      // Flat payroll during delay window; resume MoM growth after delay months.
      if (payrollGrowthDelayMonths === 0 || m > payrollGrowthDelayMonths) {
        payroll = payroll * (1 + payrollGrowth);
      }
      otherFixed = otherFixed * (1 + otherFixedGrowth);
    }

    const reductionActive =
      opexReductionRate > 0 && opexReductionFromMonth > 0 && m >= opexReductionFromMonth && opexReductionTarget;
    const variableFactor = reductionActive && opexReductionTarget === "variable" ? 1 - opexReductionRate : 1;
    const fixedFactor = reductionActive && opexReductionTarget === "fixed" ? 1 - opexReductionRate : 1;

    const techPct =
      techPctAfter != null && techPctChangeFrom > 0 && m >= techPctChangeFrom ? techPctAfter : techPctBase;

    const revenue = volume * aov;
    const cogs = revenue * cogsPct * variableFactor;
    const grossProfit = revenue - cogs;
    const otherDirectCosts = revenue * otherDirectPct * variableFactor;
    const afterDirect = grossProfit - otherDirectCosts;
    const salesAndMarketing = revenue * smPct * variableFactor;
    // Match Input month-1 CM1 path for all months (Excel M2+ formula drops other direct).
    const cm1 = afterDirect - salesAndMarketing;
    const productAndTechnology = revenue * techPct * variableFactor;
    const cm2 = cm1 - productAndTechnology;
    const payrollEff = payroll * fixedFactor;
    const otherFixedEff = otherFixed * fixedFactor;
    // P&L "Total Opex" line used for EBITDA remains payroll + other fixed (Excel).
    const fixedOpexForEbitda = payrollEff + otherFixedEff;
    const ebitda = cm2 - fixedOpexForEbitda;
    const totalVariableExpenses = cogs + otherDirectCosts + salesAndMarketing + productAndTechnology;
    const totalFixedExpenses = payrollEff + otherFixedEff;
    // Reporting total: all operating cash costs (excludes CapEx).
    const totalOperatingExpenses = totalVariableExpenses + totalFixedExpenses;
    const capexAmt = capex[m] || 0;
    const equityAmt = equity[m] || 0;
    const debtAmt = debt[m] || 0;
    const totalCashBurn = -ebitda + capexAmt;
    const fundsInflow = equityAmt + debtAmt;
    const netCashFlow = -totalCashBurn + fundsInflow;
    // Operating + funding only (no CapEx). Independent of including-CapEx series.
    const netCashFlowExcludingCapex = ebitda + fundsInflow;
    // Gross burn = total cash operating outflow (all P&L cost lines). CapEx is excluded (capital).
    const grossBurn = totalOperatingExpenses;
    // Net burn = operating cash loss after revenue (= −EBITDA). CapEx / funding excluded.
    const netBurn = -ebitda;
    // Net burn including CapEx (= totalCashBurn). Funding excluded.
    const netBurnIncludingCapex = totalCashBurn;

    const open = openingCash;
    const raw = open + netCashFlow;
    // Keep the signed closing balance so the UI can show funding shortfall (not null / not floored to 0).
    // cashOut marks the first month balance goes negative and every month thereafter.
    if (raw < 0) cashExhausted = true;
    const cashOut = cashExhausted;
    const closingCash = raw;

    const openEx = openingCashExcludingCapex;
    const rawEx = openEx + netCashFlowExcludingCapex;
    if (rawEx < 0) cashExhaustedExcludingCapex = true;
    const cashOutExcludingCapex = cashExhaustedExcludingCapex;
    const closingCashExcludingCapex = rawEx;
    cumulativeCapex += capexAmt;

    months.push({
      monthIndex: m,
      monthLabel: monthLabelFromStart(inputs.forecastStartMonth, m),
      volume,
      averageOrderValue: aov,
      revenue,
      cogs,
      otherDirectCosts,
      grossProfit,
      grossMargin: revenue === 0 ? 0 : grossProfit / revenue,
      salesAndMarketing,
      cm1,
      cm1Margin: revenue === 0 ? 0 : cm1 / revenue,
      productAndTechnology,
      payroll: payrollEff,
      otherFixedCosts: otherFixedEff,
      totalVariableExpenses,
      totalFixedExpenses,
      totalOperatingExpenses,
      ebitda,
      ebitdaMargin: revenue === 0 ? 0 : ebitda / revenue,
      capex: capexAmt,
      cumulativeCapex,
      equityFunding: equityAmt,
      debtOrOtherFunding: debtAmt,
      totalCashBurn,
      netCashFlow,
      netCashFlowExcludingCapex,
      grossBurn,
      netBurn,
      netBurnIncludingCapex,
      openingCash: open,
      closingCash,
      closingCashIncludingCapex: closingCash,
      openingCashExcludingCapex: openEx,
      closingCashExcludingCapex,
      cashOut,
      cashOutExcludingCapex,
    });

    openingCash = closingCash;
    openingCashExcludingCapex = closingCashExcludingCapex;
  }

  return months;
}
