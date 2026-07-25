import { cloneInputs } from "./types.js";

/**
 * Reduce selected operating costs from Month 2 onward.
 * Categories: S&M %, Product/Tech %, Payroll, Other fixed.
 * Excludes: COGS, other direct, CapEx.
 * @param {import('../types.js').SimulatorInputs} inputs
 * @param {{ reductionRate: number }} params - e.g. 0.10 for 10%
 */
export function applyCostReductionScenario(inputs, { reductionRate }) {
  const next = cloneInputs(inputs);
  const rate = Math.min(0.95, Math.max(0, Number(reductionRate) || 0));
  next.opexReductionRate = rate;
  next.opexReductionFromMonth = 2;
  delete next.payrollGrowthDelayMonths;
  return next;
}
