import { cloneInputs } from "./types.js";

/**
 * Add percentage points to monthly revenue (or volume) growth.
 * Example: base 5% + 2pp → 7% (not 5% × 1.02).
 * @param {import('../types.js').SimulatorInputs} inputs
 * @param {{ additionalPoints: number }} params - decimal points, e.g. 0.02 for +2%
 */
export function applyRevenueGrowthScenario(inputs, { additionalPoints }) {
  const next = cloneInputs(inputs);
  const add = Number(additionalPoints) || 0;
  if (next.revenueMode === "detailed") {
    next.monthlyVolumeGrowth = Number(next.monthlyVolumeGrowth || 0) + add;
  } else {
    next.monthlyRevenueGrowth = Number(next.monthlyRevenueGrowth || 0) + add;
  }
  delete next.opexReductionRate;
  delete next.opexReductionFromMonth;
  delete next.payrollGrowthDelayMonths;
  return next;
}
