import { monthLabelFromStart, calculateProjection } from "./calculateProjection.js";
import {
  calculateKpis,
  computeCfoRunwayAtMonth,
  findExpectedCashOutMonth,
  getHealthStatus,
} from "./calculateKpis.js";
import { formatMoney } from "./format.js";

/**
 * @param {import('./types.js').CashEvent[]|undefined} events
 * @returns {import('./types.js').CashEvent[]}
 */
function activeFundingEvents(events) {
  return (events || []).filter((e) => {
    const amount = Number(e?.amount) || 0;
    const month = Number(e?.monthIndex);
    return amount > 0 && Number.isInteger(month) && month >= 1;
  });
}

/**
 * Future equity + debt/other funding scheduled in the forecast (not CapEx).
 * @param {import('./types.js').SimulatorInputs} inputs
 */
export function summarizePlannedFunding(inputs) {
  const equity = activeFundingEvents(inputs.equityEvents).map((e) => ({
    type: /** @type {'equity'} */ ("equity"),
    monthIndex: Number(e.monthIndex),
    amount: Number(e.amount),
    monthLabel: monthLabelFromStart(inputs.forecastStartMonth, Number(e.monthIndex)),
  }));
  const debtOther = activeFundingEvents(inputs.debtEvents).map((e) => ({
    type: /** @type {'debtOther'} */ ("debtOther"),
    monthIndex: Number(e.monthIndex),
    amount: Number(e.amount),
    monthLabel: monthLabelFromStart(inputs.forecastStartMonth, Number(e.monthIndex)),
  }));

  const events = [...equity, ...debtOther].sort((a, b) => a.monthIndex - b.monthIndex);
  const equityAmount = equity.reduce((s, e) => s + e.amount, 0);
  const debtOtherAmount = debtOther.reduce((s, e) => s + e.amount, 0);
  const totalAmount = equityAmount + debtOtherAmount;
  const first = events[0] || null;

  return {
    hasFutureFunding: events.length > 0,
    totalAmount,
    eventCount: events.length,
    equityAmount,
    debtOtherAmount,
    firstFundingMonth: first?.monthIndex ?? null,
    firstFundingDate: first?.monthLabel ?? null,
    events,
  };
}

/**
 * Clone inputs with all equity/debt funding removed. CapEx and operating assumptions kept.
 * @param {import('./types.js').SimulatorInputs} inputs
 */
export function stripFutureFundingEvents(inputs) {
  const next = structuredClone
    ? structuredClone(inputs)
    : JSON.parse(JSON.stringify(inputs));
  next.equityEvents = [];
  next.debtEvents = [];
  return next;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function fundingTypeLabel(type) {
  return type === "equity" ? "Equity" : "Debt / other";
}

/**
 * Attach funding-aware runway fields.
 *
 * No future funding:
 *   Projected Runway = CFO headline (M1 ending cash ÷ 3-mo avg net burn)
 *
 * Future equity/debt funding:
 *   Runway before planned funding = CFO at Month 1 on funding-stripped projection (CapEx kept)
 *   Runway after planned funding = CFO at first funding month:
 *     postFundingEndingCash ÷ forward 3-mo avg net operating burn at that month
 *   Do NOT use deterministic cash-series zero-crossing as the CFO hero metric.
 *
 * @param {import('./types.js').SimulatorInputs} inputs
 * @param {import('./types.js').MonthlyProjection[]} months Full projection INCLUDING funding
 * @param {import('./types.js').SimulatorKpis} kpis
 */
export function withFundingAwareRunway(inputs, months, kpis) {
  const plannedFunding = summarizePlannedFunding(inputs);
  const headline = kpis.headlineRunwayMonths ?? null;
  const cashSeries =
    kpis.cashSeriesRunwayMonths ?? kpis.capexComparison?.runwayMonthsIncludingCapex ?? null;

  if (!plannedFunding.hasFutureFunding) {
    return {
      ...kpis,
      runwayMonths: headline,
      projectedRunwayMonths: headline,
      headlineRunwayMonths: headline,
      cashSeriesRunwayMonths: cashSeries,
      runwayBeforePlannedFundingMonths: null,
      runwayAfterPlannedFundingMonths: null,
      fundingRunwayImpactMonths: null,
      plannedFunding,
      cfoFundingRunway: {
        hasFutureFunding: false,
        runwayBeforeFunding: null,
        runwayAfterFunding: null,
        fundingRunwayImpactMonths: null,
        fundingRunwayImpactDisplayMonths: null,
      },
      healthStatus: getHealthStatus(headline),
    };
  }

  const stripped = stripFutureFundingEvents(inputs);
  const beforeMonths = calculateProjection(stripped);
  const beforeDetail = computeCfoRunwayAtMonth(beforeMonths, 0);
  const beforeCashOut = findExpectedCashOutMonth(beforeMonths);

  const first = plannedFunding.events[0];
  const afterDetail = computeCfoRunwayAtMonth(months, first.monthIndex - 1);
  const afterCashOut = findExpectedCashOutMonth(months);

  const beforeRaw = beforeDetail?.rawMonths ?? null;
  const afterRaw = afterDetail?.rawMonths ?? null;
  const beforeDisplay = beforeRaw == null ? null : round1(beforeRaw);
  const afterDisplay = afterRaw == null ? null : round1(afterRaw);
  const impactRaw =
    beforeRaw != null && afterRaw != null ? afterRaw - beforeRaw : null;
  const impactDisplay = impactRaw == null ? null : round1(impactRaw);

  const beforeHealth = getHealthStatus(beforeDisplay);
  const afterHealth = getHealthStatus(afterDisplay);

  const runwayBeforeFunding = beforeDetail
    ? {
        rawMonths: beforeRaw,
        displayMonths: beforeDisplay,
        endingCash: beforeDetail.endingCash,
        threeMonthAvgNetBurn: beforeDetail.threeMonthAvgNetBurn,
        cashOutMonthIndex: beforeCashOut?.monthIndex ?? null,
        cashOutMonthLabel: beforeCashOut
          ? beforeCashOut.monthLabel
          : "Beyond 24-month horizon",
        cashOutDate: beforeCashOut ? beforeCashOut.monthLabel : null,
        healthStatus: beforeHealth,
      }
    : null;

  const runwayAfterFunding = afterDetail
    ? {
        rawMonths: afterRaw,
        displayMonths: afterDisplay,
        fundingMonth: first.monthIndex,
        fundingDate: first.monthLabel,
        fundingAmount: first.amount,
        fundingType: fundingTypeLabel(first.type),
        postFundingEndingCash: afterDetail.endingCash,
        threeMonthAvgNetBurn: afterDetail.threeMonthAvgNetBurn,
        cashOutMonthIndex: afterCashOut?.monthIndex ?? null,
        cashOutMonthLabel: afterCashOut
          ? afterCashOut.monthLabel
          : "Beyond 24-month horizon",
        cashOutDate: afterCashOut ? afterCashOut.monthLabel : null,
        healthStatus: afterHealth,
      }
    : null;

  return {
    ...kpis,
    // Hero / primary CFO metric with funding = after planned funding (not cash-series).
    // healthStatus remains after-funding for secondary surfaces; hero shows per-runway badges.
    runwayMonths: afterDisplay,
    projectedRunwayMonths: afterDisplay,
    runwayAfterPlannedFundingMonths: afterDisplay,
    runwayBeforePlannedFundingMonths: beforeDisplay,
    headlineRunwayMonths: beforeDisplay,
    cashSeriesRunwayMonths: cashSeries,
    fundingRunwayImpactMonths: impactDisplay,
    plannedFunding,
    cfoFundingRunway: {
      hasFutureFunding: true,
      runwayBeforeFunding,
      runwayAfterFunding,
      fundingRunwayImpactMonths: impactRaw,
      fundingRunwayImpactDisplayMonths: impactDisplay,
    },
    healthStatus: afterHealth,
    healthStatusBeforePlannedFunding: beforeHealth,
    healthStatusAfterPlannedFunding: afterHealth,
  };
}

/**
 * Short supporting sentence for after-funding runway.
 * @param {ReturnType<typeof summarizePlannedFunding>} planned
 * @param {string} [currency]
 */
export function buildProjectedRunwayFundingNote(planned, currency = "INR") {
  if (!planned?.hasFutureFunding) return null;
  const money = (v) => formatMoney(v, { currency });

  if (planned.eventCount === 1) {
    const ev = planned.events[0];
    const kind = ev.type === "equity" ? "equity" : "debt / other";
    return `Includes ${money(ev.amount)} planned ${kind} funding in ${ev.monthLabel}.`;
  }

  return `Includes ${money(planned.totalAmount)} planned funding across ${planned.eventCount} events.`;
}

/**
 * Deterministic funding-dependency insight (null when not material).
 * @param {{
 *   projectedRunwayMonths: number|null,
 *   runwayBeforePlannedFundingMonths: number|null,
 *   runwayAfterPlannedFundingMonths?: number|null,
 *   fundingRunwayImpactMonths: number|null,
 *   plannedFunding: ReturnType<typeof summarizePlannedFunding>,
 * }} opts
 * @param {string} [currency]
 */
export function buildFundingDependencyInsight(opts, currency = "INR") {
  const planned = opts.plannedFunding;
  const impact = opts.fundingRunwayImpactMonths;
  const after =
    opts.runwayAfterPlannedFundingMonths ?? opts.projectedRunwayMonths ?? null;
  const before = opts.runwayBeforePlannedFundingMonths;
  if (!planned?.hasFutureFunding) return null;
  if (after == null || before == null || impact == null) return null;
  if (impact < 0.5) return null;

  const first = planned.events[0];
  const kind =
    planned.eventCount === 1
      ? first.type === "equity"
        ? "equity"
        : "debt / other"
      : "financing";
  const amountLabel =
    planned.eventCount === 1
      ? formatMoney(first.amount, { currency })
      : formatMoney(planned.totalAmount, { currency });

  return {
    id: "funding-dependency",
    title: "Funding dependency",
    body: `Planned ${amountLabel} ${kind} funding increases runway from ${Number(before).toFixed(1)} to ${Number(after).toFixed(1)} months.`,
    fundingRunwayImpactMonths: impact,
  };
}
