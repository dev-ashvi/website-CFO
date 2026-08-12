import { FORECAST_MONTHS, GROWTH_BOUNDS } from "./defaults.js";

/**
 * @param {import('./types.js').SimulatorInputs} inputs
 * @returns {{ ok: true, data: import('./types.js').SimulatorInputs } | { ok: false, errors: string[] }}
 */
export function validateSimulatorInputs(inputs) {
  const errors = [];

  const requireNumber = (value, label, { min = null, max = null, allowZero = true } = {}) => {
    if (value === "" || value === null || value === undefined || Number.isNaN(Number(value))) {
      errors.push(`${label} is required.`);
      return;
    }
    const n = Number(value);
    if (!allowZero && n === 0) errors.push(`${label} cannot be zero.`);
    if (min !== null && n < min) errors.push(`${label} cannot be less than ${min}.`);
    if (max !== null && n > max) errors.push(`${label} cannot be greater than ${max}.`);
  };

  const requirePct = (value, label) => {
    requireNumber(value, label, { min: 0, max: 1 });
  };

  const requireGrowth = (value, label) => {
    requireNumber(value, label, { min: GROWTH_BOUNDS.min, max: GROWTH_BOUNDS.max });
  };

  if (!inputs.industry) errors.push("Industry is required.");
  if (!inputs.businessModel?.trim()) errors.push("Business model is required.");
  if (!inputs.startupStage) errors.push("Startup stage is required.");
  if (!inputs.forecastStartMonth) errors.push("Forecast start month is required.");

  const email = String(inputs.email || "").trim();
  if (!email) {
    errors.push("Email ID is required.");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Enter a valid Email ID.");
  }

  const phoneDigits = String(inputs.phone || "").replace(/\D/g, "");
  if (!String(inputs.phone || "").trim()) {
    errors.push("Phone is required.");
  } else if (phoneDigits.length < 10) {
    errors.push("Enter a valid phone number.");
  }

  requireNumber(inputs.currentCashBalance, "Current cash balance", { min: 0 });

  if (inputs.revenueMode === "detailed") {
    requireNumber(inputs.currentVolume, "Current monthly sales volume", { min: 0 });
    requireGrowth(inputs.monthlyVolumeGrowth, "Monthly volume growth");
    requireNumber(inputs.averageOrderValue, "Average order value", { min: 0 });
    requireGrowth(inputs.monthlyAovGrowth, "Monthly AOV growth");
  } else {
    requireNumber(inputs.currentMonthlyRevenue, "Current monthly revenue", { min: 0 });
    requireGrowth(inputs.monthlyRevenueGrowth, "Monthly revenue growth");
  }

  requirePct(inputs.cogsPercent, "COGS % of revenue");
  requirePct(inputs.otherDirectCostsPercent, "Other direct costs % of revenue");
  requirePct(inputs.salesMarketingPercent, "Sales & marketing % of revenue");
  requirePct(inputs.productTechPercent, "Fulfillment & other variable costs % of revenue");

  requireNumber(inputs.monthlyPayroll, "Monthly payroll", { min: 0 });
  requireGrowth(inputs.payrollGrowth, "Payroll growth");
  requireNumber(inputs.otherFixedCosts, "Other fixed costs", { min: 0 });
  requireGrowth(inputs.otherFixedGrowth, "Other fixed cost growth");

  const validateEvents = (events, label) => {
    if (!Array.isArray(events)) return;
    events.forEach((ev, i) => {
      if (!ev) return;
      const amount = Number(ev.amount);
      if (ev.amount === 0 || ev.amount === "" || ev.amount == null) return;
      requireNumber(ev.amount, `${label} #${i + 1} amount`, { min: 0 });
      const m = Number(ev.monthIndex);
      if (!Number.isInteger(m) || m < 1 || m > FORECAST_MONTHS) {
        errors.push(
          `${label} #${i + 1} month is required (1–${FORECAST_MONTHS}) when an amount is entered.`,
        );
      }
    });
  };

  validateEvents(inputs.capexEvents, "CapEx event");
  validateEvents(inputs.equityEvents, "Equity funding event");
  validateEvents(inputs.debtEvents, "Debt/grant funding event");

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: inputs };
}
