import { formatInr, formatMonths } from "../format.js";
import { monthFullLabelFromStart } from "../calculateProjection.js";

/**
 * Snapshot KPIs used for scenario comparison (same definitions as base engine).
 * @param {{ kpis: object, months: object[] }} sim
 */
export function snapshotComparisonMetrics(sim) {
  const last = sim.months[sim.months.length - 1];
  return {
    runwayMonths: sim.kpis.runwayMonths,
    cashOutMonth: sim.kpis.cashOutMonthLabel,
    cashOutMonthIndex: sim.kpis.cashOutMonthIndex,
    avgNetBurn: sim.kpis.avgMonthlyNetBurn,
    month24ClosingCash: last?.closingCash ?? null,
  };
}

/**
 * @param {ReturnType<typeof snapshotComparisonMetrics>} base
 * @param {ReturnType<typeof snapshotComparisonMetrics>} scenario
 */
export function computeDeltas(base, scenario) {
  const num = (a, b) => {
    if (a == null || b == null || Number.isNaN(Number(a)) || Number.isNaN(Number(b))) return null;
    return Number(b) - Number(a);
  };
  return {
    runwayMonths: num(base.runwayMonths, scenario.runwayMonths),
    avgNetBurn: num(base.avgNetBurn, scenario.avgNetBurn),
    month24ClosingCash: num(base.month24ClosingCash, scenario.month24ClosingCash),
  };
}

/**
 * Deterministic insight sentence from scenario deltas.
 */
export function buildScenarioInsight({ type, label, params, base, scenario, delta, forecastStartMonth }) {
  const baseRunway = formatMonths(base.runwayMonths);
  const scenRunway = formatMonths(scenario.runwayMonths);
  const runwayDelta = delta.runwayMonths;

  if (type === "funding") {
    const monthLabel = monthFullLabelFromStart(forecastStartMonth, params.monthIndex);
    const amt = formatInr(params.amount);
    if (runwayDelta != null && Math.abs(runwayDelta) >= 0.05) {
      return `A ${amt} raise in ${monthLabel} extends projected runway from ${baseRunway} to ${scenRunway}.`;
    }
    return `A ${amt} raise in ${monthLabel} does not materially change projected runway (${baseRunway}).`;
  }

  if (type === "cost-reduction") {
    const pct = Math.round((params.reductionRate || 0) * 100);
    const burnDelta = delta.avgNetBurn;
    const burnText =
      burnDelta != null && burnDelta < 0
        ? ` lowers average net burn by ${formatInr(Math.abs(burnDelta))}`
        : "";
    const runwayText =
      runwayDelta != null && runwayDelta > 0.05
        ? ` and extends runway by ${formatMonths(runwayDelta).replace(" months", "")} months`
        : runwayDelta != null && Math.abs(runwayDelta) < 0.05
          ? " with no material runway change"
          : "";
    return `Reducing selected operating costs by ${pct}%${burnText}${runwayText}.`;
  }

  if (type === "revenue-growth") {
    const fromPct = Math.round((params.baseGrowth || 0) * 1000) / 10;
    const toPct = Math.round(((params.baseGrowth || 0) + (params.additionalPoints || 0)) * 1000) / 10;
    const baseOut = base.cashOutMonthIndex;
    const scenOut = scenario.cashOutMonthIndex;
    if (baseOut != null && scenOut != null && scenOut > baseOut) {
      return `Increasing monthly revenue growth from ${fromPct}% to ${toPct}% delays cash-out by ${scenOut - baseOut} months.`;
    }
    if (runwayDelta != null && runwayDelta > 0.05) {
      return `Increasing monthly revenue growth from ${fromPct}% to ${toPct}% extends runway from ${baseRunway} to ${scenRunway}.`;
    }
    return `Increasing monthly revenue growth from ${fromPct}% to ${toPct}% does not materially change the cash-out timeline.`;
  }

  if (type === "payroll-delay") {
    const months = params.delayMonths || 0;
    if (runwayDelta != null && runwayDelta > 0.05) {
      return `Keeping payroll flat for ${months} months extends runway by ${formatMonths(runwayDelta).replace(" months", "")} months.`;
    }
    return `Keeping payroll flat for ${months} months does not materially change projected runway (${baseRunway}).`;
  }

  return label || "Scenario comparison complete.";
}

/**
 * Classify a numeric delta for accessibility (not color-only).
 * @param {number|null} delta
 * @param {'higher-better' | 'lower-better'} direction
 */
export function impactLabel(delta, direction = "higher-better") {
  if (delta == null || Number.isNaN(delta)) return "No material change";
  const eps = direction === "higher-better" ? 0.05 : 1;
  if (Math.abs(delta) < eps) return "No material change";
  if (direction === "higher-better") return delta > 0 ? "Improved" : "Worsened";
  return delta < 0 ? "Improved" : "Worsened";
}
