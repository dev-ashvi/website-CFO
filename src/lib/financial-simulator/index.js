export { getDefaultInputs, HEALTH_THRESHOLDS, FORECAST_MONTHS, INDUSTRY_OPTIONS, STAGE_OPTIONS, BUSINESS_MODEL_OPTIONS } from "./defaults.js";
export { validateSimulatorInputs } from "./validation.js";
export { calculateProjection, monthLabelFromStart, monthFullLabelFromStart, forecastMonthOptions } from "./calculateProjection.js";
export { calculateKpis, getHealthStatus } from "./calculateKpis.js";
export {
  formatInr,
  formatHorizonCash,
  formatPercent,
  formatMonths,
  percentDisplayValue,
  parseInrInput,
} from "./format.js";
export { buildFallbackInsight } from "./fallbackInsight.js";
export { buildExpenseInsights } from "./expenseInsights.js";
export { buildClosingCashCaption, buildCapexImpactNote } from "./capexCashInsight.js";
export { runWhatIfScenario, cloneInputs } from "./scenarios/index.js";

import { validateSimulatorInputs } from "./validation.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";

/**
 * Validate + run full simulation.
 * @param {import('./types.js').SimulatorInputs} inputs
 */
export function runSimulation(inputs) {
  const validated = validateSimulatorInputs(inputs);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors };
  }
  const months = calculateProjection(validated.data);
  const kpis = calculateKpis(months);
  return { ok: true, inputs: validated.data, months, kpis };
}
