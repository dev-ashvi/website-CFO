import { HEALTH_THRESHOLDS } from "./defaults.js";

const FUNDING_IMPACT_THRESHOLD_MONTHS = 6;
const VARIABLE_LOAD_THRESHOLD = 0.55;
const FIXED_PRESSURE_THRESHOLD = 0.55;

/**
 * @typedef {{
 *   id: string;
 *   severity: "info" | "watch" | "warn" | "critical";
 *   title: string;
 *   fact: string;
 *   evidence: { source: string; value: number | string | boolean | null }[];
 * }} DeterministicSignal
 */

/**
 * @param {{
 *   runway?: object;
 *   funding?: object;
 *   currentPerformance?: object;
 *   burnAndCash?: object;
 *   costStructure?: object;
 *   benchmarks?: object;
 *   capex?: object;
 *   trends?: object;
 *   months?: object[];
 *   operatingLeverage?: object;
 * }} ctx
 * @returns {DeterministicSignal[]}
 */
export function buildDeterministicSignals(ctx) {
  /** @type {DeterministicSignal[]} */
  const signals = [];
  const runway = ctx.runway || {};
  const funding = ctx.funding || {};
  const months = ctx.months || [];
  const costStructure = ctx.costStructure || {};
  const benchmarks = ctx.benchmarks || {};
  const capex = ctx.capex || {};
  const operatingLeverage = ctx.operatingLeverage || {};

  const primary = runway.primaryRunwayMonths;
  const planned = funding.plannedFunding;

  if (primary != null && primary < HEALTH_THRESHOLDS.criticalBelow) {
    signals.push(makeSignal({
      id: "runway_critical",
      severity: "critical",
      title: "Runway critical",
      fact: `Primary runway is ${primary} months — below the ${HEALTH_THRESHOLDS.criticalBelow}-month critical threshold.`,
      evidence: [{ source: "runway.primaryRunwayMonths", value: primary }],
    }));
  } else if (primary != null && primary < HEALTH_THRESHOLDS.cautionBelow) {
    signals.push(makeSignal({
      id: "runway_caution",
      severity: "warn",
      title: "Runway caution",
      fact: `Primary runway is ${primary} months — within the caution band (${HEALTH_THRESHOLDS.criticalBelow}–${HEALTH_THRESHOLDS.cautionBelow} months).`,
      evidence: [{ source: "runway.primaryRunwayMonths", value: primary }],
    }));
  } else if (primary != null) {
    signals.push(makeSignal({
      id: "runway_healthy",
      severity: "info",
      title: "Runway healthy",
      fact: `Primary runway is ${primary} months — at or above ${HEALTH_THRESHOLDS.cautionBelow} months.`,
      evidence: [{ source: "runway.primaryRunwayMonths", value: primary }],
    }));
  }

  if (planned?.hasFutureFunding) {
    const impact = runway.fundingRunwayImpactMonths;
    if (impact != null && impact >= FUNDING_IMPACT_THRESHOLD_MONTHS) {
      signals.push(makeSignal({
        id: "funding_dependency_high",
        severity: "warn",
        title: "High funding dependency",
        fact: `Planned funding adds approximately ${impact} months to runway.`,
        evidence: [
          { source: "runway.fundingRunwayImpactMonths", value: impact },
          { source: "funding.plannedFunding.totalAmount", value: planned.totalAmount },
        ],
      }));
    }

    const before = runway.runwayBeforePlannedFundingMonths;
    if (before != null && before < HEALTH_THRESHOLDS.criticalBelow) {
      signals.push(makeSignal({
        id: "runway_before_funding_critical",
        severity: "critical",
        title: "Before-funding runway critical",
        fact: `Runway before planned funding is ${before} months — critical without the inflow.`,
        evidence: [{ source: "runway.runwayBeforePlannedFundingMonths", value: before }],
      }));
    }

    const cfo = funding.cfoFundingRunway;
    if (cfo?.runwayBeforeFunding?.cashOutMonthLabel && planned.firstFundingMonth != null) {
      const beforeCashOut = cfo.runwayBeforeFunding.cashOutMonthIndex;
      if (beforeCashOut != null && beforeCashOut < planned.firstFundingMonth) {
        signals.push(makeSignal({
          id: "cash_out_before_funding",
          severity: "critical",
          title: "Cash-out before funding",
          fact: `Cash is projected to run out (${cfo.runwayBeforeFunding.cashOutMonthLabel}) before planned funding in month ${planned.firstFundingMonth}.`,
          evidence: [
            { source: "runway.cashOutBeforeFunding", value: cfo.runwayBeforeFunding.cashOutMonthLabel },
            { source: "funding.plannedFunding.firstFundingMonth", value: planned.firstFundingMonth },
          ],
        }));
      }
    }
  }

  if (months.length) {
    const allNegative = months.every((m) => (m.ebitda ?? 0) < 0);
    if (allNegative) {
      signals.push(makeSignal({
        id: "ebitda_negative_through_horizon",
        severity: "warn",
        title: "EBITDA negative through horizon",
        fact: "EBITDA stays negative across all 24 projected months.",
        evidence: [{ source: "trends.ebitda.m1", value: months[0]?.ebitda ?? 0 }],
      }));
    }

    const firstPositive = months.find((m) => (m.ebitda ?? 0) > 0);
    if (firstPositive) {
      signals.push(makeSignal({
        id: "ebitda_turns_positive",
        severity: "info",
        title: "EBITDA turns positive",
        fact: `EBITDA turns positive in ${firstPositive.monthLabel} (month ${firstPositive.monthIndex}).`,
        evidence: [
          { source: "trends.ebitda.firstPositiveMonth", value: firstPositive.monthIndex },
        ],
      }));
    }
  }

  if (operatingLeverage.leverage === "Positive") {
    signals.push(makeSignal({
      id: "revenue_growing_faster_than_costs",
      severity: "info",
      title: "Positive operating leverage",
      fact: "Revenue is growing faster than operating costs over the first 12 months.",
      evidence: [
        { source: "operatingLeverage.revenueChange", value: operatingLeverage.revenueChange ?? 0 },
        { source: "operatingLeverage.outflowChange", value: operatingLeverage.outflowChange ?? 0 },
      ],
    }));
  } else if (operatingLeverage.leverage === "Negative") {
    signals.push(makeSignal({
      id: "costs_growing_faster_than_revenue",
      severity: "warn",
      title: "Negative operating leverage",
      fact: "Operating costs are growing faster than revenue over the first 12 months.",
      evidence: [
        { source: "operatingLeverage.revenueChange", value: operatingLeverage.revenueChange ?? 0 },
        { source: "operatingLeverage.outflowChange", value: operatingLeverage.outflowChange ?? 0 },
      ],
    }));
  }

  const largest = costStructure.largestDriver;
  if (largest?.key) {
    signals.push(makeSignal({
      id: "largest_cost_driver",
      severity: "info",
      title: "Largest cost driver",
      fact: `${largest.label || largest.key} is the largest Month 1 cost relative to revenue.`,
      evidence: [
        { source: "costStructure.largestDriver.key", value: largest.key },
        { source: "costStructure.largestDriver.shareOfRevenue", value: largest.shareOfRevenue ?? 0 },
      ],
    }));
  }

  const expenseMix = costStructure.expenseMix;
  if (expenseMix?.variableSharePercent != null && expenseMix.variableSharePercent >= VARIABLE_LOAD_THRESHOLD) {
    signals.push(makeSignal({
      id: "variable_cost_load_high",
      severity: "watch",
      title: "High variable cost load",
      fact: `Variable expenses are ${roundPct(expenseMix.variableSharePercent)} of Month 1 operating spend.`,
      evidence: [{ source: "costStructure.expenseMix.variableSharePercent", value: expenseMix.variableSharePercent }],
    }));
  }

  if (expenseMix?.fixedSharePercent != null && expenseMix.fixedSharePercent >= FIXED_PRESSURE_THRESHOLD) {
    signals.push(makeSignal({
      id: "fixed_cost_pressure",
      severity: "watch",
      title: "Fixed cost pressure",
      fact: `Fixed expenses are ${roundPct(expenseMix.fixedSharePercent)} of Month 1 operating spend.`,
      evidence: [{ source: "costStructure.expenseMix.fixedSharePercent", value: expenseMix.fixedSharePercent }],
    }));
  }

  if (benchmarks.available && benchmarks.onTarget === false && benchmarks.grossMarginBenchmark) {
    signals.push(makeSignal({
      id: "gross_margin_below_benchmark",
      severity: "watch",
      title: "Gross margin below peer band",
      fact: benchmarks.message || "Gross margin is below the typical range for this industry.",
      evidence: [
        { source: "benchmarks.onTarget", value: false },
        { source: "currentPerformance.grossMarginPercent", value: ctx.currentPerformance?.grossMarginPercent ?? 0 },
      ],
    }));
  } else if (benchmarks.available && benchmarks.onTarget === true) {
    signals.push(makeSignal({
      id: "gross_margin_at_benchmark",
      severity: "info",
      title: "Gross margin within peer band",
      fact: benchmarks.message || "Gross margin is within the typical range for this industry.",
      evidence: [{ source: "benchmarks.onTarget", value: true }],
    }));
  }

  const capexCmp = capex.capexComparison;
  if (capexCmp && capex.cumulativeHorizon > 0) {
    const cashOutTimingMaterial =
      (capexCmp.cashOutMonthIncludingCapex != null && capexCmp.cashOutMonthExcludingCapex == null) ||
      (capexCmp.cashOutMonthIncludingCapex != null &&
        capexCmp.cashOutMonthExcludingCapex != null &&
        capexCmp.cashOutMonthIncludingCapex !== capexCmp.cashOutMonthExcludingCapex);
    const runwaySeriesMaterial =
      capexCmp.runwayMonthsIncludingCapex != null &&
      capexCmp.runwayMonthsExcludingCapex != null &&
      Math.abs(capexCmp.runwayMonthsIncludingCapex - capexCmp.runwayMonthsExcludingCapex) >= 0.5;
    if (cashOutTimingMaterial || runwaySeriesMaterial) {
      signals.push(makeSignal({
        id: "capex_material",
        severity: "watch",
        title: "CapEx affects cash timing",
        fact: "Planned CapEx materially advances or changes the cash-out timeline.",
        evidence: [
          { source: "capex.cumulativeHorizon", value: capex.cumulativeHorizon },
          { source: "capex.capexComparison.cashOutMonthIncludingCapex", value: capexCmp.cashOutMonthIncludingCapex ?? 0 },
        ],
      }));
    }
  }

  if (runway.cashOutMonthIndex != null) {
    signals.push(makeSignal({
      id: "cash_out_within_horizon",
      severity: runway.cashOutMonthIndex <= 12 ? "critical" : "warn",
      title: "Cash-out within horizon",
      fact: `Cash is projected to run out in ${runway.cashOutMonthLabel}.`,
      evidence: [
        { source: "runway.cashOutMonthLabel", value: runway.cashOutMonthLabel },
        { source: "runway.cashOutMonthIndex", value: runway.cashOutMonthIndex },
      ],
    }));
  } else {
    signals.push(makeSignal({
      id: "no_cash_out_within_horizon",
      severity: "info",
      title: "No cash-out in horizon",
      fact: "Closing cash stays non-negative through the 24-month forecast window.",
      evidence: [{ source: "runway.cashOutMonthIndex", value: null }],
    }));
  }

  return signals;
}

/**
 * @param {Omit<DeterministicSignal, "id"> & { id: string }} spec
 */
function makeSignal(spec) {
  return {
    id: spec.id,
    severity: spec.severity,
    title: spec.title,
    fact: spec.fact,
    evidence: spec.evidence,
  };
}

function roundPct(fraction) {
  return `${Math.round(Number(fraction) * 1000) / 10}%`;
}
