export { getDefaultInputs, HEALTH_THRESHOLDS, FORECAST_MONTHS, INDUSTRY_OPTIONS, STAGE_OPTIONS, BUSINESS_MODEL_OPTIONS, CURRENCY, DEFAULT_CURRENCY, CURRENCY_OPTIONS, getCurrencyOption, currencySymbol } from "./defaults.js";
export { validateSimulatorInputs } from "./validation.js";
export { calculateProjection, monthLabelFromStart, monthFullLabelFromStart, forecastMonthOptions } from "./calculateProjection.js";
export { calculateKpis, getHealthStatus } from "./calculateKpis.js";
export {
  formatInr,
  formatMoney,
  formatHorizonCash,
  formatPercent,
  formatMonths,
  percentDisplayValue,
  parseInrInput,
  parseMoneyInput,
  formatMoneyInputDisplay,
  stripMoneySymbol,
} from "./format.js";
export { buildFallbackInsight } from "./fallbackInsight.js";
export { buildExpenseInsights } from "./expenseInsights.js";
export { buildClosingCashCaption, buildCapexImpactNote } from "./capexCashInsight.js";
export { buildCashMovementInsight, buildOperatingLeverageStats } from "./cashMovementInsight.js";
export { runWhatIfScenario, cloneInputs } from "./scenarios/index.js";
export {
  runDashboardOverlay,
  SCENARIO_MODES,
  WHATIF_OVERLAYS,
} from "./dashboardOverlays.js";
export { ASK_AI_PROMPTS, answerAskAiCfo } from "./askAiCfo.js";
export {
  askAiCfo,
  buildSuggestedPrompts,
  buildModelContext,
  parseAiCfoQuestion,
  runAiCfoAction,
} from "./aiCfoEngine.js";

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
