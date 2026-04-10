/**
 * MVP scenario projection engine — deterministic, no I/O.
 * Monthly step: revenue compounds with annual growth; burn uses hiring; cash net of burn vs revenue cash-in.
 */

/** @type {const} */
export const SCENARIO_ENGINE_DEFAULTS = {
  horizonMonths: 36,
  startingMonthlyRevenue: 4_200_000,
  startingCash: 52_000_000,
  baseMonthlyBurn: 3_150_000,
  costPerEmployeeMonth: 175_000,
  /** Share of monthly revenue that converts to net cash inflow (simplified). */
  revenueToCashRate: 0.22,
  baselineFxRef: 83.2,
};

/**
 * @param {number} annualRate decimal, e.g. 0.08
 */
function monthlyGrowthFactor(annualRate) {
  const g = Number.isFinite(annualRate) ? annualRate : 0;
  return Math.pow(1 + Math.max(-0.95, g), 1 / 12);
}

/**
 * @param {import('../assumptions/assumptionRecord.js').AssumptionRecord[]} assumptions
 * @param {Record<string, { proposedValue?: number|string }>} scenarioDraft
 */
function mergedModelInputs(assumptions, scenarioDraft) {
  const draft = scenarioDraft && typeof scenarioDraft === "object" ? scenarioDraft : {};
  const pick = (key, fallback) => {
    const row = assumptions.find((a) => a.key === key);
    const entry = draft[key];
    const raw = entry != null && entry.proposedValue != null ? entry.proposedValue : row?.value;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
    return Number.isFinite(n) ? n : fallback;
  };
  const hiring = Math.round(pick("hiring", 0));
  return {
    annualGrowth: pick("revenue_growth", 0.08),
    hiringCount: Math.max(0, hiring),
    fxRate: pick("fx", SCENARIO_ENGINE_DEFAULTS.baselineFxRef),
  };
}

/**
 * @param {{
 *   annualGrowth: number,
 *   hiringCount: number,
 *   fxRate: number,
 * }} params
 * @param {typeof SCENARIO_ENGINE_DEFAULTS} cfg
 */
function simulatePath(params, cfg = SCENARIO_ENGINE_DEFAULTS) {
  const { annualGrowth, hiringCount, fxRate } = params;
  const fxMult =
    cfg.baselineFxRef > 0 && Number.isFinite(fxRate) && fxRate > 0
      ? cfg.baselineFxRef / fxRate
      : 1;

  let revenue = cfg.startingMonthlyRevenue * fxMult;
  let cash = cfg.startingCash;
  const revenueSeries = [];
  const cashSeries = [];
  const growthFactor = monthlyGrowthFactor(annualGrowth);

  let runwayMonths = cfg.horizonMonths;
  let burnAccum = 0;

  for (let m = 0; m < cfg.horizonMonths; m++) {
    revenue *= growthFactor;
    const monthlyBurn = cfg.baseMonthlyBurn + hiringCount * cfg.costPerEmployeeMonth;
    burnAccum += monthlyBurn;
    const netCashFlow = -monthlyBurn + revenue * cfg.revenueToCashRate;
    cash += netCashFlow;
    revenueSeries.push(revenue);
    cashSeries.push(cash);
    if (cash <= 0 && runwayMonths === cfg.horizonMonths) {
      runwayMonths = m + 1;
    }
  }

  const avgMonthlyBurn = burnAccum / cfg.horizonMonths;
  const finalCash = cashSeries[cashSeries.length - 1] ?? cash;

  return {
    revenueSeries,
    cashSeries,
    runwayMonths,
    avgMonthlyBurn,
    finalCash,
  };
}

/**
 * Baseline path (no draft overrides) vs scenario path (draft merged).
 *
 * @param {{
 *   assumptions: import('../assumptions/assumptionRecord.js').AssumptionRecord[],
 *   scenarioDraft: Record<string, { proposedValue?: number|string, displayTo?: string }>,
 * }} input
 */
export function simulateScenario({ assumptions, scenarioDraft }) {
  const list = Array.isArray(assumptions) ? assumptions : [];
  const baselineParams = mergedModelInputs(list, {});
  const scenarioParams = mergedModelInputs(list, scenarioDraft || {});

  const baseline = simulatePath(baselineParams);
  const scenario = simulatePath(scenarioParams);

  const last = SCENARIO_ENGINE_DEFAULTS.horizonMonths - 1;
  const br = baseline.revenueSeries[last] || 1;
  const sr = scenario.revenueSeries[last] || 0;
  const revenueDeltaPercent = ((sr / br) - 1) * 100;
  const runwayDelta = scenario.runwayMonths - baseline.runwayMonths;
  const burnDelta =
    baseline.avgMonthlyBurn > 0
      ? ((scenario.avgMonthlyBurn / baseline.avgMonthlyBurn) - 1) * 100
      : 0;
  const cashDelta = scenario.finalCash - baseline.finalCash;

  return {
    horizonMonths: SCENARIO_ENGINE_DEFAULTS.horizonMonths,
    baseline: {
      revenueSeries: baseline.revenueSeries,
      cashSeries: baseline.cashSeries,
      runwayMonths: baseline.runwayMonths,
      avgMonthlyBurn: baseline.avgMonthlyBurn,
      finalCash: baseline.finalCash,
    },
    scenario: {
      revenueSeries: scenario.revenueSeries,
      cashSeries: scenario.cashSeries,
      runwayMonths: scenario.runwayMonths,
      avgMonthlyBurn: scenario.avgMonthlyBurn,
      finalCash: scenario.finalCash,
    },
    summary: {
      revenueDeltaPercent,
      runwayDelta,
      burnDelta,
      cashDelta,
    },
  };
}
