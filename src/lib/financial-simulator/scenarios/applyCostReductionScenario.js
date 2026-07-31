import { cloneInputs } from "./types.js";

/**
 * Reduce either variable or fixed operating expenses from Month 2 onward.
 * Variable: COGS, other direct, S&M, product/tech (% of revenue).
 * Fixed: payroll, other fixed costs (₹ amounts).
 * CapEx is never reduced.
 * @param {import('../types.js').SimulatorInputs} inputs
 * @param {{ reductionRate: number, target: 'variable' | 'fixed' }} params
 */
export function applyCostReductionScenario(inputs, { reductionRate, target = "variable" }) {
  const next = cloneInputs(inputs);
  const rate = Math.min(0.95, Math.max(0, Number(reductionRate) || 0));
  const scope = target === "fixed" ? "fixed" : "variable";
  next.opexReductionRate = rate;
  next.opexReductionFromMonth = 2;
  next.opexReductionTarget = scope;
  delete next.payrollGrowthDelayMonths;
  return next;
}
