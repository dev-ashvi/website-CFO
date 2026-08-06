import { calculateProjection } from "../calculateProjection.js";
import { calculateKpis } from "../calculateKpis.js";
import { applyFundingScenario } from "./applyFundingScenario.js";
import { applyCostReductionScenario } from "./applyCostReductionScenario.js";
import { applyRevenueGrowthScenario } from "./applyRevenueGrowthScenario.js";
import { applyPayrollDelayScenario } from "./applyPayrollDelayScenario.js";
import {
  buildScenarioInsight,
  computeDeltas,
  impactLabel,
  snapshotComparisonMetrics,
} from "./compareScenario.js";
import { cloneInputs } from "./types.js";

export { cloneInputs } from "./types.js";
export { applyFundingScenario } from "./applyFundingScenario.js";
export { applyCostReductionScenario } from "./applyCostReductionScenario.js";
export { applyRevenueGrowthScenario } from "./applyRevenueGrowthScenario.js";
export { applyPayrollDelayScenario } from "./applyPayrollDelayScenario.js";
export {
  buildScenarioInsight,
  computeDeltas,
  impactLabel,
  snapshotComparisonMetrics,
} from "./compareScenario.js";

/**
 * Run base + one scenario through the deterministic engine and return comparison.
 * @param {import('../types.js').SimulatorInputs} baseInputs - already normalized
 * @param {{ type: string, params: object, label?: string }} spec
 */
export function runWhatIfScenario(baseInputs, spec) {
  const baseClone = cloneInputs(baseInputs);
  const baseMonths = calculateProjection(baseClone);
  const baseKpis = calculateKpis(baseMonths);
  const baseSim = { months: baseMonths, kpis: baseKpis };
  const base = snapshotComparisonMetrics(baseSim);

  let scenarioInputs;
  let label = spec.label || "";
  const params = { ...(spec.params || {}) };

  switch (spec.type) {
    case "funding":
      scenarioInputs = applyFundingScenario(baseInputs, params);
      label =
        label ||
        `Raise ${params.amount != null ? params.amount : ""} funding`;
      break;
    case "cost-reduction":
      scenarioInputs = applyCostReductionScenario(baseInputs, params);
      {
        const pct = Math.round((params.reductionRate || 0) * 100);
        const scope = params.target === "fixed" ? "fixed" : "variable";
        label = label || `Reduce ${scope} expenses by ${pct}%`;
      }
      break;
    case "revenue-growth": {
      const baseGrowth =
        baseInputs.revenueMode === "detailed"
          ? Number(baseInputs.monthlyVolumeGrowth) || 0
          : Number(baseInputs.monthlyRevenueGrowth) || 0;
      params.baseGrowth = baseGrowth;
      scenarioInputs = applyRevenueGrowthScenario(baseInputs, params);
      label =
        label ||
        `Increase monthly revenue growth by +${Math.round((params.additionalPoints || 0) * 100)}%`;
      break;
    }
    case "payroll-delay":
      scenarioInputs = applyPayrollDelayScenario(baseInputs, params);
      label = label || `Delay payroll growth by ${params.delayMonths || 0} months`;
      break;
    default:
      throw new Error(`Unknown scenario type: ${spec.type}`);
  }

  // Ensure baseInputs was not mutated by apply* (clone inside each apply).
  const scenarioMonths = calculateProjection(scenarioInputs);
  const scenarioKpis = calculateKpis(scenarioMonths);
  const scenarioSim = { months: scenarioMonths, kpis: scenarioKpis };
  const scenario = snapshotComparisonMetrics(scenarioSim);
  const delta = computeDeltas(base, scenario);

  return {
    type: spec.type,
    label,
    params,
    base,
    scenario,
    delta,
    baseMonths: baseMonths,
    scenarioMonths: scenarioMonths,
    insight: buildScenarioInsight({
      type: spec.type,
      label,
      params,
      base,
      scenario,
      delta,
      forecastStartMonth: baseInputs.forecastStartMonth,
      currency: baseInputs.currency,
    }),
    impacts: {
      runway: impactLabel(delta.runwayMonths, "higher-better"),
      netBurn: impactLabel(delta.avgNetBurn, "lower-better"),
      month24Cash: impactLabel(delta.month24ClosingCash, "higher-better"),
    },
  };
}
