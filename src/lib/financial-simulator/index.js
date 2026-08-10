export { getDefaultInputs, HEALTH_THRESHOLDS, FORECAST_MONTHS, INDUSTRY_OPTIONS, STAGE_OPTIONS, BUSINESS_MODEL_OPTIONS, CURRENCY, DEFAULT_CURRENCY, CURRENCY_OPTIONS, getCurrencyOption, currencySymbol, RUNWAY_FORM_SCHEMA_VERSION } from "./defaults.js";
export { validateSimulatorInputs } from "./validation.js";
export { calculateProjection, monthLabelFromStart, monthFullLabelFromStart, forecastMonthOptions } from "./calculateProjection.js";
export { calculateKpis, getHealthStatus, computeCfoHeadlineRunwayMonths, computeCfoRunwayAtMonth, findExpectedCashOutMonth, computeCashSeriesRunwayMonths } from "./calculateKpis.js";
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
export {
  buildClosingCashChartSeries,
  buildRevenueVsExpensesChartSeries,
  closingCashCapexGap,
  findFirstNegativeCashMonth,
  getChartTotalExpenses,
} from "./chartSeries.js";
export { buildCashMovementInsight, buildOperatingLeverageStats } from "./cashMovementInsight.js";
export {
  buildMonth1OperatingExpenseMix,
  getMonth1OperatingExpenseAmounts,
  OPERATING_EXPENSE_CATEGORY_LABELS,
  FULFILMENT_OPERATING_LABEL,
} from "./buildMonth1OperatingExpenseMix.js";
export {
  buildRunwayUiDiagnostic,
  compareScenario1Diagnostic,
  SCENARIO_1_UI_EXPECTED,
} from "./runwayUiDiagnostic.js";
export {
  getScenario1FormInputs,
  getScenario2FormInputs,
  getScenario4FormInputs,
  cloneFormInputs,
  SCENARIO_1_FORM_TEMPLATE,
  SCENARIO_2_FORM_TEMPLATE,
  SCENARIO_4_FORM_TEMPLATE,
} from "./scenarioFormPresets.js";
export {
  createInitialFormInputs,
  migrateOrResetFormInputs,
  loadStoredFormInputs,
  persistFormInputs,
  clearStoredFormInputs,
  RUNWAY_FORM_STORAGE_KEY,
} from "./runwayFormState.js";
export { normalizeFormInputs } from "./normalizeFormInputs.js";
export {
  summarizePlannedFunding,
  stripFutureFundingEvents,
  withFundingAwareRunway,
  buildProjectedRunwayFundingNote,
  buildFundingDependencyInsight,
} from "./plannedFunding.js";
export { mapExcelInputsToSimulator, mapScenario1ExcelToSimulator } from "./excelScenarioMapper.js";
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
import { withFundingAwareRunway } from "./plannedFunding.js";

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
  const baseKpis = calculateKpis(months);
  const kpis = withFundingAwareRunway(validated.data, months, baseKpis);
  return { ok: true, inputs: validated.data, months, kpis };
}
