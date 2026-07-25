import { cloneInputs } from "./types.js";

/**
 * Keep payroll flat for N months, then resume original MoM payroll growth.
 * @param {import('../types.js').SimulatorInputs} inputs
 * @param {{ delayMonths: number }} params
 */
export function applyPayrollDelayScenario(inputs, { delayMonths }) {
  const next = cloneInputs(inputs);
  next.payrollGrowthDelayMonths = Math.max(0, Math.floor(Number(delayMonths) || 0));
  delete next.opexReductionRate;
  delete next.opexReductionFromMonth;
  return next;
}
