import { cloneInputs } from "./types.js";

/**
 * Add an equity funding event (does not mutate base).
 * @param {import('../types.js').SimulatorInputs} inputs
 * @param {{ amount: number, monthIndex: number }} params
 */
export function applyFundingScenario(inputs, { amount, monthIndex }) {
  const next = cloneInputs(inputs);
  const amt = Number(amount) || 0;
  const m = Number(monthIndex);
  const events = Array.isArray(next.equityEvents) ? [...next.equityEvents] : [];
  if (amt > 0 && m >= 1 && m <= 24) {
    events.push({ monthIndex: m, amount: amt });
  }
  next.equityEvents = events;
  // Clear unrelated scenario modifiers
  delete next.opexReductionRate;
  delete next.opexReductionFromMonth;
  delete next.payrollGrowthDelayMonths;
  return next;
}
