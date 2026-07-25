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

  // Excel applies growth in month 1 for fixed costs.
  let payroll = Number(inputs.monthlyPayroll) * (1 + Number(inputs.payrollGrowth));
  let otherFixed = Number(inputs.otherFixedCosts) * (1 + Number(inputs.otherFixedGrowth));
  const payrollGrowth = Number(inputs.payrollGrowth);
  const otherFixedGrowth = Number(inputs.otherFixedGrowth);
  /** Optional scenario modifiers (default = no change). */
  const payrollGrowthDelayMonths = Math.max(0, Math.floor(Number(inputs.payrollGrowthDelayMonths) || 0));
  const opexReductionRate = Math.min(0.95, Math.max(0, Number(inputs.opexReductionRate) || 0));
  const opexReductionFromMonth = Math.max(0, Math.floor(Number(inputs.opexReductionFromMonth) || 0));

  const cogsPct = Number(inputs.cogsPercent);
  const otherDirectPct = Number(inputs.otherDirectCostsPercent);
  const smPct = Number(inputs.salesMarketingPercent);
  const techPct = Number(inputs.productTechPercent);

  const capex = eventsToSchedule(inputs.capexEvents);
  const equity = eventsToSchedule(inputs.equityEvents);
  const debt = eventsToSchedule(inputs.debtEvents);

  /** @type {import('./types.js').MonthlyProjection[]} */
  const months = [];
  let openingCash = Number(inputs.currentCashBalance);
  let cashExhausted = false;

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

    const opexFactor =
      opexReductionRate > 0 && opexReductionFromMonth > 0 && m >= opexReductionFromMonth
        ? 1 - opexReductionRate
        : 1;

    const revenue = volume * aov;
    const cogs = revenue * cogsPct;
    const grossProfit = revenue - cogs;
    const otherDirectCosts = revenue * otherDirectPct;
    const afterDirect = grossProfit - otherDirectCosts;
    const salesAndMarketing = revenue * smPct * opexFactor;
    // Match Input month-1 CM1 path for all months (Excel M2+ formula drops other direct).
    const cm1 = afterDirect - salesAndMarketing;
    const productAndTechnology = revenue * techPct * opexFactor;
    const cm2 = cm1 - productAndTechnology;
    const payrollEff = payroll * opexFactor;
    const otherFixedEff = otherFixed * opexFactor;
    const totalOperatingExpenses = payrollEff + otherFixedEff;
    const ebitda = cm2 - totalOperatingExpenses;
    const capexAmt = capex[m] || 0;
    const equityAmt = equity[m] || 0;
    const debtAmt = debt[m] || 0;
    const totalCashBurn = -ebitda + capexAmt;
    const fundsInflow = equityAmt + debtAmt;
    const netCashFlow = -totalCashBurn + fundsInflow;
    // Gross burn = total cash operating outflow (all P&L cost lines). CapEx is excluded (capital).
    const grossBurn =
      cogs + otherDirectCosts + salesAndMarketing + productAndTechnology + payrollEff + otherFixedEff;
    // Net burn = operating cash loss after revenue (= −EBITDA). CapEx / funding excluded.
    const netBurn = -ebitda;

    const open = openingCash;
    const raw = open + netCashFlow;
    // Keep the signed closing balance so the UI can show funding shortfall (not null / not floored to 0).
    // cashOut marks the first month balance goes negative and every month thereafter.
    if (raw < 0) cashExhausted = true;
    const cashOut = cashExhausted;
    const closingCash = raw;

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
      productAndTechnology,
      payroll: payrollEff,
      otherFixedCosts: otherFixedEff,
      totalOperatingExpenses,
      ebitda,
      ebitdaMargin: revenue === 0 ? 0 : ebitda / revenue,
      capex: capexAmt,
      equityFunding: equityAmt,
      debtOrOtherFunding: debtAmt,
      totalCashBurn,
      netCashFlow,
      grossBurn,
      netBurn,
      openingCash: open,
      closingCash,
      cashOut,
    });

    openingCash = closingCash;
  }

  return months;
}
