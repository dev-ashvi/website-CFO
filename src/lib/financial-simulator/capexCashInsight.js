import { formatInr, formatMonths } from "./format.js";

/**
 * Deterministic closing-cash chart caption comparing CapEx-included vs CapEx-excluded series.
 * @param {import('./types.js').SimulatorKpis['capexComparison']} cmp
 * @returns {string}
 */
export function buildClosingCashCaption(cmp) {
  if (!cmp) return "Cash position across the 24-month forecast.";

  const incLabel = cmp.cashOutMonthLabelIncludingCapex;
  const exLabel = cmp.cashOutMonthLabelExcludingCapex;
  const incOut = cmp.cashOutMonthIncludingCapex;
  const exOut = cmp.cashOutMonthExcludingCapex;
  const beyond = "Beyond 24-month horizon";

  if (incOut == null && exOut == null) {
    return "Cash remains positive throughout the 24-month forecast both including and excluding planned CapEx.";
  }

  if (incOut != null && exOut == null) {
    return `Cash becomes negative in ${incLabel} after planned CapEx. Excluding CapEx, the business remains cash-positive throughout the 24-month forecast.`;
  }

  if (incOut != null && exOut != null && incOut === exOut) {
    return `Cash becomes negative in ${incLabel} both including and excluding planned CapEx. Operating burn, rather than CapEx, is the main driver of the shortfall.`;
  }

  if (incOut != null && exOut != null && incOut !== exOut) {
    const excludingAtIncOut = cmp.excludingCashAtIncludingCashOutMonth;
    const capexAtIncOut = Number(cmp.capexInIncludingCashOutMonth) || 0;
    if (excludingAtIncOut != null && excludingAtIncOut > 0 && capexAtIncOut > 0) {
      return `Cash becomes negative in ${incLabel} including planned CapEx. Excluding CapEx, cash remains positive in ${incLabel}, showing that the Month ${incOut} capital expenditure brings forward the cash shortfall.`;
    }
    const impact = cmp.capexRunwayImpactMonths;
    const impactText =
      impact != null && Math.abs(impact) >= 0.05
        ? ` Planned CapEx shortens runway by ${formatMonths(Math.abs(impact)).replace(" months", "")} months.`
        : "";
    return `Cash becomes negative in ${incLabel} including planned CapEx, compared with ${exLabel} excluding CapEx.${impactText}`;
  }

  if (incOut == null && exOut != null) {
    // Unusual (CapEx would normally worsen cash) — still report deterministically.
    return `Cash becomes negative in ${exLabel} excluding CapEx, while remaining non-negative including CapEx through the horizon.`;
  }

  if (incLabel === beyond && exLabel === beyond) {
    return "Cash remains positive throughout the 24-month forecast both including and excluding planned CapEx.";
  }

  return "Cash position across the 24-month forecast.";
}

/**
 * Compact CapEx impact note under the chart (null when not useful).
 * @param {import('./types.js').SimulatorKpis['capexComparison']} cmp
 * @returns {string|null}
 */
export function buildCapexImpactNote(cmp) {
  if (!cmp) return null;
  const cumulative = Number(cmp.cumulativeCapex) || 0;
  if (cumulative <= 0) {
    return "No planned CapEx is included, so both cash-position lines are identical.";
  }

  const m24Inc = cmp.month24CashIncludingCapex;
  const m24Ex = cmp.month24CashExcludingCapex;
  if (m24Inc == null || m24Ex == null) return null;

  const cashDelta = m24Ex - m24Inc;
  const impact = cmp.capexRunwayImpactMonths;
  const parts = [`Planned CapEx reduces Month 24 closing cash by ${formatInr(Math.abs(cashDelta))}`];

  if (
    impact != null &&
    Math.abs(impact) >= 0.05 &&
    cmp.cashOutMonthIncludingCapex != null
  ) {
    parts.push(
      `and shortens projected runway by ${formatMonths(Math.abs(impact)).replace(" months", "")} months`,
    );
  }

  return `${parts.join(" ")}.`;
}
