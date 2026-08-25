import { validateSimulatorInputs } from "./validation.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { withFundingAwareRunway } from "./plannedFunding.js";
import { cloneInputs } from "./scenarios/index.js";
import { applyCostReductionScenario } from "./scenarios/applyCostReductionScenario.js";
import { applyRevenueGrowthScenario } from "./scenarios/applyRevenueGrowthScenario.js";
import { applyPayrollDelayScenario } from "./scenarios/applyPayrollDelayScenario.js";
import { formatPercent } from "./format.js";
import { computeContextVersion } from "./contextVersion.js";

const FULFILLMENT_PP = [0.02, 0.03, 0.05];
const SM_PP = [0.02, 0.03, 0.05];
const COGS_PP = [0.02, 0.03, 0.05];
const FIXED_PCT = [0.05, 0.1, 0.15];
const REVENUE_GROWTH_PP = [0.005, 0.01, 0.02];
const DELAY_MONTHS = [3, 6];
const FUNDING_DELAY_MONTHS = [3, 6];

const SHORTLIST_MIN = 3;
const SHORTLIST_MAX = 5;

/**
 * @typedef {{
 *   id: string;
 *   type: string;
 *   label: string;
 *   difficulty: "easy" | "medium" | "hard";
 *   signalIds?: string[];
 *   priority?: number;
 * }} CandidateAction
 */

/**
 * @param {{ deterministicSignals?: { id: string }[]; costStructure?: { largestDriver?: { key?: string } }; funding?: { plannedFunding?: { hasFutureFunding?: boolean } }; capex?: { cumulativeHorizon?: number } }} context
 * @returns {CandidateAction[]}
 */
export function buildCandidateActions(context) {
  /** @type {CandidateAction[]} */
  const actions = [];
  const signalIds = new Set((context.deterministicSignals || []).map((s) => s.id));
  const largestKey = context.costStructure?.largestDriver?.key;
  const hasFunding = context.funding?.plannedFunding?.hasFutureFunding;
  const hasCapex = (context.capex?.cumulativeHorizon ?? 0) > 0;

  for (const pp of FULFILLMENT_PP) {
    actions.push(makeAction({
      id: `reduce_fulfillment_${ppToId(pp)}`,
      type: "reduce_fulfillment_pts",
      label: `Reduce fulfilment & variable costs by ${formatPp(pp)}`,
      difficulty: pp <= 0.02 ? "easy" : pp <= 0.03 ? "medium" : "hard",
      signalIds: largestKey === "productAndTechnology" ? ["largest_cost_driver"] : [],
      priority: largestKey === "productAndTechnology" ? 1 : 0,
      params: { deltaPoints: pp },
    }));
  }

  for (const pp of SM_PP) {
    actions.push(makeAction({
      id: `reduce_sm_${ppToId(pp)}`,
      type: "reduce_sm_pts",
      label: `Reduce sales & marketing by ${formatPp(pp)}`,
      difficulty: pp <= 0.02 ? "easy" : pp <= 0.03 ? "medium" : "hard",
      signalIds: largestKey === "salesMarketing" ? ["largest_cost_driver"] : [],
      priority: largestKey === "salesMarketing" ? 1 : 0,
      params: { deltaPoints: pp },
    }));
  }

  for (const pp of COGS_PP) {
    actions.push(makeAction({
      id: `reduce_cogs_${ppToId(pp)}`,
      type: "improve_gross_margin_pts",
      label: `Reduce COGS by ${formatPp(pp)} (improve gross margin)`,
      difficulty: pp <= 0.02 ? "easy" : pp <= 0.03 ? "medium" : "hard",
      signalIds: signalIds.has("gross_margin_below_benchmark") ? ["gross_margin_below_benchmark"] : [],
      priority: signalIds.has("gross_margin_below_benchmark") ? 1 : 0,
      params: { deltaPoints: pp },
    }));
  }

  for (const pct of FIXED_PCT) {
    actions.push(makeAction({
      id: `reduce_fixed_${Math.round(pct * 100)}`,
      type: "reduce_fixed_pct",
      label: `Reduce fixed costs by ${Math.round(pct * 100)}% from Month 2`,
      difficulty: pct <= 0.05 ? "easy" : pct <= 0.1 ? "medium" : "hard",
      signalIds: signalIds.has("fixed_cost_pressure") ? ["fixed_cost_pressure"] : [],
      priority: signalIds.has("fixed_cost_pressure") ? 1 : 0,
      params: { reductionRate: pct },
    }));
  }

  for (const pp of REVENUE_GROWTH_PP) {
    actions.push(makeAction({
      id: `increase_revenue_growth_${ppToId(pp)}`,
      type: "increase_revenue_growth",
      label: `Increase revenue growth by ${formatPp(pp)}`,
      difficulty: pp <= 0.005 ? "easy" : pp <= 0.01 ? "medium" : "hard",
      signalIds: signalIds.has("costs_growing_faster_than_revenue") ? ["costs_growing_faster_than_revenue"] : [],
      priority: 0,
      params: { additionalPoints: pp },
    }));
  }

  for (const months of DELAY_MONTHS) {
    actions.push(makeAction({
      id: `delay_payroll_${months}mo`,
      type: "delay_payroll_growth",
      label: `Delay payroll growth by ${months} months`,
      difficulty: months <= 3 ? "easy" : "medium",
      signalIds: signalIds.has("fixed_cost_pressure") ? ["fixed_cost_pressure"] : [],
      priority: 0,
      params: { delayMonths: months },
    }));
  }

  if (hasCapex) {
    for (const months of DELAY_MONTHS) {
      actions.push(makeAction({
        id: `delay_capex_${months}mo`,
        type: "delay_capex",
        label: `Delay CapEx by ${months} months`,
        difficulty: "easy",
        signalIds: signalIds.has("capex_material") ? ["capex_material"] : [],
        priority: signalIds.has("capex_material") ? 2 : 0,
        params: { delayMonths: months },
      }));
    }
  }

  if (hasFunding) {
    for (const months of FUNDING_DELAY_MONTHS) {
      actions.push(makeAction({
        id: `delay_funding_${months}mo`,
        type: "delay_funding",
        label: `Delay planned funding by ${months} months`,
        difficulty: "medium",
        signalIds: signalIds.has("funding_dependency_high") ? ["funding_dependency_high"] : [],
        priority: signalIds.has("funding_dependency_high") ? 1 : 0,
        params: { delayMonths: months },
      }));
    }
  }

  return actions;
}

/**
 * @param {{ ok: true, inputs: object, months: object[], kpis: object }} baseSim
 * @param {CandidateAction[]} candidateActions
 */
export function simulateCandidateActions(baseSim, candidateActions) {
  const baseSnapshot = snapshotFromSim(baseSim);
  /** @type {import('./candidateActionEngine.js').VerifiedSimulationResult[]} */
  const results = [];

  for (const action of candidateActions) {
    const scenarioInputs = applyCandidateMutation(baseSim.inputs, action);
    if (!scenarioInputs) continue;

    const validated = validateSimulatorInputs(scenarioInputs);
    if (!validated.ok) continue;

    const scenarioSim = runSimulationInternal(validated.data);
    if (!scenarioSim.ok) continue;

    const after = snapshotFromSim(scenarioSim);
    const delta = diffSnapshots(baseSnapshot, after);
    if (!hasMaterialChange(delta)) continue;

    results.push({
      candidateId: action.id,
      label: action.label,
      difficulty: action.difficulty,
      assumptionChanges: buildAssumptionChanges(baseSim.inputs, validated.data, action),
      before: baseSnapshot,
      after,
      delta,
      scenarioInputs: validated.data,
      simulationHash: computeSimulationHash(action.id, validated.data),
      signalIds: action.signalIds || [],
      candidateType: action.type,
    });
  }

  return results;
}

/**
 * @param {ReturnType<typeof simulateCandidateActions>} results
 * @param {{ deterministicSignals?: { id: string }[] }} [context]
 */
export function scoreCandidateResults(results, context = {}) {
  const activeSignals = new Set((context.deterministicSignals || []).map((s) => s.id));

  return results
    .map((result) => {
      const runwayGain = result.delta.runwayMonths ?? 0;
      const ebitdaGain = result.delta.ebitdaM1 ?? 0;
      const cashGain = result.delta.closingCashM12 ?? 0;
      const magnitude = estimateMagnitude(result);
      const signalBoost = (result.signalIds || []).filter((id) => activeSignals.has(id)).length * 2;
      const difficultyPenalty =
        result.difficulty === "hard" ? 1.5 : result.difficulty === "medium" ? 0.75 : 0;

      const score =
        runwayGain * 10 +
        ebitdaGain / 50_000 +
        cashGain / 500_000 +
        signalBoost -
        magnitude * 3 -
        difficultyPenalty;

      return { ...result, deterministicScore: round2(score) };
    })
    .sort((a, b) => (b.deterministicScore ?? 0) - (a.deterministicScore ?? 0));
}

/**
 * @param {ReturnType<typeof scoreCandidateResults>} scored
 * @param {{ min?: number; max?: number }} [options]
 */
export function shortlistCandidateResults(scored, options = {}) {
  const min = options.min ?? SHORTLIST_MIN;
  const max = options.max ?? SHORTLIST_MAX;
  if (!scored.length) return [];

  /** @type {typeof scored} */
  const picked = [];
  const usedFamilies = new Set();

  for (const result of scored) {
    const family = candidateFamily(result.candidateType);
    if (usedFamilies.has(family) && picked.length >= min) continue;
    if (isNearDuplicate(result, picked)) continue;
    picked.push(result);
    usedFamilies.add(family);
    if (picked.length >= max) break;
  }

  if (picked.length < min) {
    for (const result of scored) {
      if (picked.some((p) => p.candidateId === result.candidateId)) continue;
      if (isNearDuplicate(result, picked)) continue;
      picked.push(result);
      if (picked.length >= min) break;
    }
  }

  return picked.slice(0, max);
}

/**
 * Full deterministic candidate pipeline — no LLM.
 * @param {{ ok: true, inputs: object, months: object[], kpis: object }} baseSim
 * @param {object} [context] — FinancialIntelligenceContext (signals + metadata)
 */
export function runCandidatePipeline(baseSim, context) {
  const candidateActions = context?.candidateActions?.length
    ? context.candidateActions
    : buildCandidateActions(context || {});

  const allResults = simulateCandidateActions(baseSim, candidateActions);
  const scored = scoreCandidateResults(allResults, context);
  const shortlist = shortlistCandidateResults(scored);

  return { candidateActions, allResults, scored, shortlist };
}

/**
 * @param {{ ok: true, inputs: object, months: object[], kpis: object }} baseSim
 * @param {{ includeSimulations?: boolean }} [options]
 */
export function buildCandidatePipelineForSimulation(baseSim, options = {}) {
  const partialContext = {
    funding: { plannedFunding: baseSim.kpis?.plannedFunding },
    capex: {
      cumulativeHorizon: baseSim.kpis?.capexComparison?.cumulativeCapex ?? 0,
    },
    costStructure: {
      largestDriver: largestDriverFromSim(baseSim),
    },
    deterministicSignals: [],
  };
  partialContext.deterministicSignals = [];
  partialContext.candidateActions = buildCandidateActions(partialContext);

  if (!options.includeSimulations) {
    return { candidateActions: partialContext.candidateActions, allResults: [], shortlist: [] };
  }

  return runCandidatePipeline(baseSim, partialContext);
}

function makeAction(spec) {
  return {
    id: spec.id,
    type: spec.type,
    label: spec.label,
    difficulty: spec.difficulty,
    signalIds: spec.signalIds || [],
    priority: spec.priority ?? 0,
    params: spec.params || {},
  };
}

function ppToId(pp) {
  return String(Math.round(pp * 1000));
}

function formatPp(pp) {
  const val = Math.round(pp * 1000) / 10;
  return Number.isInteger(val) ? `${val}pp` : `${val}pp`;
}

/**
 * @param {object} baseInputs
 * @param {CandidateAction} action
 */
function applyCandidateMutation(baseInputs, action) {
  const inputs = cloneInputs(baseInputs);
  const params = action.params || {};

  switch (action.type) {
    case "reduce_fulfillment_pts": {
      inputs.productTechPercent = clampPct(Number(inputs.productTechPercent || 0) - params.deltaPoints);
      return inputs;
    }
    case "reduce_sm_pts": {
      inputs.salesMarketingPercent = clampPct(Number(inputs.salesMarketingPercent || 0) - params.deltaPoints);
      return inputs;
    }
    case "improve_gross_margin_pts": {
      inputs.cogsPercent = clampPct(Number(inputs.cogsPercent || 0) - params.deltaPoints);
      return inputs;
    }
    case "reduce_fixed_pct": {
      return applyCostReductionScenario(inputs, { reductionRate: params.reductionRate, target: "fixed" });
    }
    case "increase_revenue_growth": {
      return applyRevenueGrowthScenario(inputs, {
        additionalPoints: params.additionalPoints,
        baseGrowth:
          inputs.revenueMode === "detailed"
            ? Number(inputs.monthlyVolumeGrowth) || 0
            : Number(inputs.monthlyRevenueGrowth) || 0,
      });
    }
    case "delay_payroll_growth": {
      return applyPayrollDelayScenario(inputs, { delayMonths: params.delayMonths });
    }
    case "delay_capex": {
      inputs.capexEvents = (inputs.capexEvents || []).map((ev) => {
        const amount = Number(ev?.amount) || 0;
        if (amount <= 0) return ev;
        return {
          ...ev,
          monthIndex: Math.min(24, Number(ev.monthIndex || 1) + params.delayMonths),
        };
      });
      return inputs;
    }
    case "delay_funding": {
      inputs.equityEvents = (inputs.equityEvents || []).map((ev) => ({
        ...ev,
        monthIndex: Math.min(24, Number(ev.monthIndex || 1) + params.delayMonths),
      }));
      inputs.debtEvents = (inputs.debtEvents || []).map((ev) => ({
        ...ev,
        monthIndex: Math.min(24, Number(ev.monthIndex || 1) + params.delayMonths),
      }));
      return inputs;
    }
    default:
      return null;
  }
}

function clampPct(value) {
  return Math.min(1, Math.max(0, value));
}

function runSimulationInternal(inputs) {
  const validated = validateSimulatorInputs(inputs);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const months = calculateProjection(validated.data);
  const baseKpis = calculateKpis(months);
  const kpis = withFundingAwareRunway(validated.data, months, baseKpis);
  return { ok: true, inputs: validated.data, months, kpis };
}

function snapshotFromSim(sim) {
  const m1 = sim.months[0] || {};
  const m12 = sim.months[11] || {};
  const kpis = sim.kpis || {};
  return {
    runwayMonths: kpis.runwayMonths,
    cashOutMonthLabel: kpis.cashOutMonthLabel,
    ebitdaM1: m1.ebitda ?? 0,
    closingCashM12: m12.closingCash ?? null,
  };
}

function diffSnapshots(before, after) {
  const runwayMonths =
    before.runwayMonths != null && after.runwayMonths != null
      ? round1(after.runwayMonths - before.runwayMonths)
      : null;
  return {
    runwayMonths,
    ebitdaM1: round1((after.ebitdaM1 ?? 0) - (before.ebitdaM1 ?? 0)),
    closingCashM12:
      before.closingCashM12 != null && after.closingCashM12 != null
        ? after.closingCashM12 - before.closingCashM12
        : null,
  };
}

function hasMaterialChange(delta) {
  return (
    (delta.runwayMonths != null && Math.abs(delta.runwayMonths) >= 0.05) ||
    (delta.ebitdaM1 != null && Math.abs(delta.ebitdaM1) >= 1000) ||
    (delta.closingCashM12 != null && Math.abs(delta.closingCashM12) >= 10_000)
  );
}

function buildAssumptionChanges(baseInputs, scenarioInputs, action) {
  const changes = [{ label: action.label, base: "Current model", scenario: "Candidate scenario" }];

  if (action.type === "reduce_fulfillment_pts") {
    changes.unshift({
      label: "Fulfillment & variable costs %",
      base: formatPercent(baseInputs.productTechPercent),
      scenario: formatPercent(scenarioInputs.productTechPercent),
    });
  } else if (action.type === "reduce_sm_pts") {
    changes.unshift({
      label: "Sales & marketing %",
      base: formatPercent(baseInputs.salesMarketingPercent),
      scenario: formatPercent(scenarioInputs.salesMarketingPercent),
    });
  } else if (action.type === "improve_gross_margin_pts") {
    changes.unshift({
      label: "COGS %",
      base: formatPercent(baseInputs.cogsPercent),
      scenario: formatPercent(scenarioInputs.cogsPercent),
    });
  }

  return changes;
}

function computeSimulationHash(candidateId, inputs) {
  return computeContextVersion({ candidateId, inputs });
}

function candidateFamily(type) {
  if (!type) return "other";
  if (type.includes("fulfillment")) return "fulfillment";
  if (type.includes("sm")) return "sm";
  if (type.includes("margin") || type.includes("cogs")) return "margin";
  if (type.includes("fixed")) return "fixed";
  if (type.includes("revenue")) return "revenue";
  if (type.includes("payroll")) return "payroll";
  if (type.includes("capex")) return "capex";
  if (type.includes("funding")) return "funding";
  return type;
}

function isNearDuplicate(candidate, picked) {
  return picked.some((existing) => {
    if (existing.candidateType !== candidate.candidateType) return false;
    const runwayClose =
      existing.delta.runwayMonths != null &&
      candidate.delta.runwayMonths != null &&
      Math.abs(existing.delta.runwayMonths - candidate.delta.runwayMonths) < 0.3;
    return runwayClose;
  });
}

function estimateMagnitude(result) {
  const id = result.candidateId || "";
  if (id.includes("_15") || id.includes("_50") || id.includes("_5mo")) return 3;
  if (id.includes("_10") || id.includes("_30") || id.includes("_3mo")) return 2;
  return 1;
}

function largestDriverFromSim(sim) {
  const mix = sim.kpis?.expenseMix;
  if (!mix?.largestExpenseCategoryKey) return null;
  return {
    key: mix.largestExpenseCategoryKey,
    label: mix.largestExpenseCategoryLabel ?? mix.largestExpenseCategory,
    shareOfRevenue: mix.largestExpenseCategoryAmount / (sim.months[0]?.revenue || 1),
  };
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
