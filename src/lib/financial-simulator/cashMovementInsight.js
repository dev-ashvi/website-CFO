import { findFirstNegativeCashMonth } from "./chartSeries.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { cloneInputs, runWhatIfScenario } from "./scenarios/index.js";
import { formatMoney, formatMonths, formatPercent } from "./format.js";
import { buildFundingDependencyInsight } from "./plannedFunding.js";

/** Default visible horizon for Cash Flow Intelligence chart (model still runs 24 months). */
export const CHART_DEFAULT_HORIZON = 12;

/** Canonical user-facing labels for Cash Flow Intelligence (and AI CFO copy). */
export const CASH_FLOW_INTELLIGENCE_LABELS = Object.freeze({
  revenue: "Revenue",
  cogs: "COGS",
  otherDirectCosts: "Other direct costs",
  productAndTechnology: "Fulfillment & other variable costs",
  salesAndMarketing: "Sales & Marketing costs",
  payroll: "Salary / Payroll",
  otherFixedCosts: "Other fixed costs",
  capex: "CapEx",
});

function money(amount, sim, opts = {}) {
  return formatMoney(amount, { ...opts, currency: sim?.inputs?.currency });
}

const COST_CONTRIBUTION_CATEGORIES = [
  { key: "cogs", label: CASH_FLOW_INTELLIGENCE_LABELS.cogs, group: "variable" },
  { key: "otherDirectCosts", label: CASH_FLOW_INTELLIGENCE_LABELS.otherDirectCosts, group: "variable" },
  {
    key: "productAndTechnology",
    label: CASH_FLOW_INTELLIGENCE_LABELS.productAndTechnology,
    group: "variable",
  },
  {
    key: "salesAndMarketing",
    label: CASH_FLOW_INTELLIGENCE_LABELS.salesAndMarketing,
    group: "variable",
  },
  { key: "payroll", label: CASH_FLOW_INTELLIGENCE_LABELS.payroll, group: "fixed" },
  { key: "otherFixedCosts", label: CASH_FLOW_INTELLIGENCE_LABELS.otherFixedCosts, group: "fixed" },
];

/**
 * Legend / tooltip assumption copy from normalized user inputs (not projected shares).
 * @param {import('./types.js').SimulatorInputs | undefined} inputs
 * @param {string} [currency]
 */
export function buildCashFlowLegendAssumptions(inputs, currency = "INR") {
  const cur = currency || inputs?.currency || "INR";
  const labels = CASH_FLOW_INTELLIGENCE_LABELS;
  const cogsPct = Number(inputs?.cogsPercent) || 0;
  const otherDirectPct = Number(inputs?.otherDirectCostsPercent) || 0;
  const fulfillmentPct = Number(inputs?.productTechPercent) || 0;
  const smPct = Number(inputs?.salesMarketingPercent) || 0;
  const payroll = Number(inputs?.monthlyPayroll) || 0;
  const otherFixed = Number(inputs?.otherFixedCosts) || 0;
  const capexEvents = (inputs?.capexEvents || []).filter((e) => Number(e?.amount) > 0);
  const totalCapex = capexEvents.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const pctOfRevenue = (pct) => `${formatPercent(pct, 0)} of revenue`;
  const pctCompact = (pct) => formatPercent(pct, 0);

  /** @type {Record<string, {
   *   key: string,
   *   label: string,
   *   kind: 'revenue'|'percentOfRevenue'|'fixedMonthly'|'capex',
   *   legendText: string,
   *   compactLegendText: string,
   *   assumptionDetail: string|null,
   *   inputValue: number,
   *   totalCapex?: number,
   *   capexEventCount?: number,
   * }>} */
  const out = {
    revenue: {
      key: "revenue",
      label: labels.revenue,
      kind: "revenue",
      legendText: labels.revenue,
      compactLegendText: labels.revenue,
      assumptionDetail: null,
      inputValue: Number(inputs?.currentMonthlyRevenue) || 0,
    },
    cogs: {
      key: "cogs",
      label: labels.cogs,
      kind: "percentOfRevenue",
      legendText: `${labels.cogs} · ${pctOfRevenue(cogsPct)}`,
      compactLegendText: `${labels.cogs} · ${pctCompact(cogsPct)}`,
      assumptionDetail: pctOfRevenue(cogsPct),
      inputValue: cogsPct,
    },
    otherDirectCosts: {
      key: "otherDirectCosts",
      label: labels.otherDirectCosts,
      kind: "percentOfRevenue",
      legendText: `${labels.otherDirectCosts} · ${pctOfRevenue(otherDirectPct)}`,
      compactLegendText: `${labels.otherDirectCosts} · ${pctCompact(otherDirectPct)}`,
      assumptionDetail: pctOfRevenue(otherDirectPct),
      inputValue: otherDirectPct,
    },
    productAndTechnology: {
      key: "productAndTechnology",
      label: labels.productAndTechnology,
      kind: "percentOfRevenue",
      legendText: `${labels.productAndTechnology} · ${pctOfRevenue(fulfillmentPct)}`,
      compactLegendText: `${labels.productAndTechnology} · ${pctCompact(fulfillmentPct)}`,
      assumptionDetail: pctOfRevenue(fulfillmentPct),
      inputValue: fulfillmentPct,
    },
    salesAndMarketing: {
      key: "salesAndMarketing",
      label: labels.salesAndMarketing,
      kind: "percentOfRevenue",
      legendText: `${labels.salesAndMarketing} · ${pctOfRevenue(smPct)}`,
      compactLegendText: `${labels.salesAndMarketing} · ${pctCompact(smPct)}`,
      assumptionDetail: pctOfRevenue(smPct),
      inputValue: smPct,
    },
    payroll: {
      key: "payroll",
      label: labels.payroll,
      kind: "fixedMonthly",
      legendText: `${labels.payroll} · ${formatMoney(payroll, { currency: cur })} / month`,
      compactLegendText: `${labels.payroll} · ${formatMoney(payroll, { currency: cur, compact: true })}/mo`,
      assumptionDetail: `Starting monthly assumption: ${formatMoney(payroll, { currency: cur })}`,
      inputValue: payroll,
    },
    otherFixedCosts: {
      key: "otherFixedCosts",
      label: labels.otherFixedCosts,
      kind: "fixedMonthly",
      legendText: `${labels.otherFixedCosts} · ${formatMoney(otherFixed, { currency: cur })} / month`,
      compactLegendText: `${labels.otherFixedCosts} · ${formatMoney(otherFixed, { currency: cur, compact: true })}/mo`,
      assumptionDetail: `Starting monthly assumption: ${formatMoney(otherFixed, { currency: cur })}`,
      inputValue: otherFixed,
    },
    capex: {
      key: "capex",
      label: labels.capex,
      kind: "capex",
      legendText:
        totalCapex > 0
          ? `${labels.capex} · ${formatMoney(totalCapex, { currency: cur })} planned`
          : `${labels.capex} · none planned`,
      compactLegendText:
        totalCapex > 0
          ? `${labels.capex} · ${formatMoney(totalCapex, { currency: cur, compact: true })} planned`
          : labels.capex,
      assumptionDetail:
        totalCapex > 0
          ? `${formatMoney(totalCapex, { currency: cur })} across ${capexEvents.length} planned event${capexEvents.length === 1 ? "" : "s"}`
          : "No CapEx events planned",
      inputValue: totalCapex,
      totalCapex,
      capexEventCount: capexEvents.length,
    },
  };

  return out;
}

/** Peer gross-margin ranges keyed by industry label (validated only — do not invent). */
const INDUSTRY_GROSS_MARGIN_BENCHMARKS = {
  "SaaS / Software": { low: 0.6, high: 0.75, median: 0.65, topQuartile: 0.72 },
  Technology: { low: 0.6, high: 0.75, median: 0.65, topQuartile: 0.72 },
  Fintech: { low: 0.55, high: 0.7, median: 0.6, topQuartile: 0.68 },
  "Financial Services": { low: 0.55, high: 0.7, median: 0.6, topQuartile: 0.68 },
  "Retail & E-commerce": { low: 0.4, high: 0.55, median: 0.45, topQuartile: 0.52 },
  "Fashion & Apparel": { low: 0.4, high: 0.55, median: 0.45, topQuartile: 0.52 },
  "Beauty & Personal Care": { low: 0.4, high: 0.55, median: 0.45, topQuartile: 0.52 },
  FMCG: { low: 0.4, high: 0.55, median: 0.45, topQuartile: 0.52 },
  "Food & Beverage": { low: 0.4, high: 0.55, median: 0.45, topQuartile: 0.52 },
};

/**
 * Month 1 cost contribution as % of revenue (not normalized to 100%).
 * @param {import('./types.js').MonthlyProjection | undefined} month1
 */
export function buildCostContribution(month1) {
  if (!month1) {
    return {
      period: "month1",
      revenue: 0,
      categories: [],
      variableGroup: [],
      fixedGroup: [],
      totalOperatingCostToRevenue: 0,
    };
  }
  const revenue = Number(month1.revenue) || 0;
  const categories = COST_CONTRIBUTION_CATEGORIES.map(({ key, label, group }) => {
    const amount = Number(month1[key]) || 0;
    return {
      key,
      label,
      group,
      amount,
      shareOfRevenue: revenue > 0 ? amount / revenue : 0,
    };
  });
  const opex =
    Number(month1.totalOperatingExpenses) ||
    sum(categories.map((c) => c.amount));
  return {
    period: "month1",
    revenue,
    categories,
    variableGroup: categories.filter((c) => c.group === "variable"),
    fixedGroup: categories.filter((c) => c.group === "fixed"),
    totalOperatingCostToRevenue: revenue > 0 ? opex / revenue : 0,
    totalVariableShareOfRevenue:
      revenue > 0 ? (Number(month1.totalVariableExpenses) || 0) / revenue : 0,
    totalFixedShareOfRevenue:
      revenue > 0 ? (Number(month1.totalFixedExpenses) || 0) / revenue : 0,
  };
}

/**
 * Deterministic CFO-style expense insights from Month 1 values.
 * @param {import('./types.js').MonthlyProjection | undefined} month1
 * @param {import('./types.js').SimulatorKpis | undefined} kpis
 * @param {{ inputs?: import('./types.js').SimulatorInputs }} [sim]
 */
export function buildExpenseInsights(month1, kpis, sim = {}) {
  const cc = buildCostContribution(month1);
  const revenue = cc.revenue;
  const currency = sim.inputs?.currency;
  const fmt = (v) => formatMoney(v, { currency });
  const items = [];

  const largest = [...cc.categories].sort((a, b) => b.shareOfRevenue - a.shareOfRevenue)[0];
  if (largest?.shareOfRevenue > 0) {
    items.push({
      id: "largest",
      title: "Largest cost driver",
      body: `${largest.label} represents ${formatPercent(largest.shareOfRevenue)} of monthly revenue.`,
      tone: largest.shareOfRevenue >= 0.35 ? "warn" : "neutral",
      highlight: formatPercent(largest.shareOfRevenue),
    });
  }

  if (cc.totalOperatingCostToRevenue > 0) {
    const ratio = cc.totalOperatingCostToRevenue;
    const overRevenue = ratio > 1;
    items.push({
      id: "intensity",
      title: "Cost intensity",
      body: overRevenue
        ? `Total operating expenses equal ${formatPercent(ratio)} of revenue, indicating the business is currently spending ${ratio.toFixed(2)} for every 1.00 of revenue.`
        : `Total operating expenses equal ${formatPercent(ratio)} of revenue.`,
      tone: overRevenue ? "warn" : ratio > 0.85 ? "watch" : "good",
      highlight: formatPercent(ratio),
    });
  }

  if (cc.totalVariableShareOfRevenue > 0) {
    const remaining = 1 - cc.totalVariableShareOfRevenue;
    items.push({
      id: "variable-load",
      title: "Variable cost load",
      body: `Variable costs consume ${formatPercent(cc.totalVariableShareOfRevenue)} of revenue, leaving ${formatPercent(Math.max(remaining, 0))} before fixed operating costs.`,
      tone: cc.totalVariableShareOfRevenue >= 0.5 ? "watch" : "neutral",
      highlight: formatPercent(cc.totalVariableShareOfRevenue),
    });
  }

  if (cc.totalFixedShareOfRevenue > 0) {
    items.push({
      id: "fixed-pressure",
      title: "Fixed cost pressure",
      body: `Fixed operating expenses represent ${formatPercent(cc.totalFixedShareOfRevenue)} of revenue.`,
      tone: cc.totalFixedShareOfRevenue >= 0.55 ? "warn" : "neutral",
      highlight: formatPercent(cc.totalFixedShareOfRevenue),
    });
  }

  const payrollCat = cc.categories.find((c) => c.key === "payroll");
  if (payrollCat?.amount > 0) {
    items.push({
      id: "payroll",
      title: "Payroll exposure",
      body: `${CASH_FLOW_INTELLIGENCE_LABELS.payroll} represents ${formatPercent(payrollCat.shareOfRevenue)} of revenue and ${fmt(payrollCat.amount)} per month.`,
      tone: payrollCat.shareOfRevenue >= 0.25 ? "watch" : "neutral",
      highlight: formatPercent(payrollCat.shareOfRevenue),
    });
  }

  const gm = month1?.grossMargin ?? kpis?.financialPerformance?.grossMarginPercent;
  const ebitda = month1?.ebitda ?? kpis?.financialPerformance?.ebitda;
  if (gm != null && ebitda != null && Number(ebitda) < 0) {
    items.push({
      id: "margin-structure",
      title: "Margin structure",
      body: `Gross margin is ${formatPercent(gm)}, but operating expenses keep EBITDA negative.`,
      tone: "watch",
      highlight: formatPercent(gm),
    });
  }

  const ratio = cc.totalOperatingCostToRevenue;
  return {
    summary: {
      operatingCostToRevenue: ratio,
      operatingCostToRevenuePercent: Math.round(ratio * 1000) / 10,
      spendPerUnitOfRevenue: ratio,
    },
    items: items.slice(0, 4),
  };
}

/** Slice months for chart display without altering the underlying projection. */
export function sliceMonthsForChart(months, horizon = CHART_DEFAULT_HORIZON) {
  return (months || []).slice(0, horizon);
}

/**
 * @param {{
 *   months: import('./types.js').MonthlyProjection[],
 *   kpis?: import('./types.js').SimulatorKpis,
 *   inputs?: import('./types.js').SimulatorInputs,
 * }} sim
 */
export function buildCashMovementInsight(sim) {
  const months = sim.months || [];
  if (!months.length) {
    return emptyInsight();
  }

  const month1 = months[0];
  const costContribution = buildCostContribution(month1);
  const expenseInsights = buildExpenseInsights(month1, sim.kpis, sim);

  const largestCat = [...costContribution.categories].sort(
    (a, b) => b.shareOfRevenue - a.shareOfRevenue,
  )[0];
  const primaryDriver = largestCat
    ? {
        name: largestCat.label,
        key: largestCat.key,
        shareOfRevenue: largestCat.shareOfRevenue,
        amount: largestCat.amount,
      }
    : null;

  const cmp = sim.kpis?.capexComparison;
  const cumulativeCapex = Number(cmp?.cumulativeCapex ?? sum(months.map((m) => m.capex))) || 0;
  const capexMaterial =
    cumulativeCapex > 0 &&
    ((cmp?.cashOutMonthIncludingCapex != null && cmp?.cashOutMonthExcludingCapex == null) ||
      (cmp?.cashOutMonthIncludingCapex != null &&
        cmp?.cashOutMonthExcludingCapex != null &&
        cmp.cashOutMonthIncludingCapex !== cmp.cashOutMonthExcludingCapex));

  const whatIfs = buildWhatIfSensitivities(sim.inputs);
  const benchmark = buildBenchmark(sim, month1);
  const cashOutDetail = buildCashOutDetail(months);

  const opportunity = pickOpportunity(sim, {
    costContribution,
    primaryDriver,
    capexMaterial,
    cmp,
    cumulativeCapex,
    whatIfs,
    month1,
  });

  const fundingDependency = buildFundingDependencyInsight(
    {
      projectedRunwayMonths: sim.kpis?.projectedRunwayMonths ?? sim.kpis?.runwayMonths ?? null,
      runwayBeforePlannedFundingMonths: sim.kpis?.runwayBeforePlannedFundingMonths ?? null,
      fundingRunwayImpactMonths: sim.kpis?.fundingRunwayImpactMonths ?? null,
      plannedFunding: sim.kpis?.plannedFunding,
    },
    sim.inputs?.currency,
  );

  return {
    ...opportunity,
    primaryDriver,
    whatIfs,
    benchmark,
    costContribution,
    expenseInsights,
    cashOutDetail,
    fundingDependency,
  };
}

export function buildOperatingLeverageStats(months) {
  if (!months?.length) {
    return {
      revenueChange: null,
      outflowChange: null,
      leverage: "—",
      observationTitle: "Insufficient data",
      observationBody: "Run a projection to see operating leverage.",
      horizonLabel: "—",
      revenueBadge: null,
      outflowBadge: null,
      leverageBadge: null,
    };
  }
  const endIdx = Math.min(11, months.length - 1);
  const first = months[0];
  const last = months[endIdx];
  const firstOut = Number(first.totalOperatingExpenses) || 0;
  const lastOut = Number(last.totalOperatingExpenses) || 0;
  const revenueChange =
    Number(first.revenue) > 0 ? (Number(last.revenue) - Number(first.revenue)) / Number(first.revenue) : null;
  const outflowChange = firstOut > 0 ? (lastOut - firstOut) / firstOut : null;

  let leverage = "Neutral";
  let observationTitle = "Balanced cost trajectory";
  let observationBody = "Revenue and operating costs are growing at a similar pace.";
  let leverageBadge = { text: "Stable", tone: "neutral" };
  let revenueBadge = null;
  let outflowBadge = null;

  if (revenueChange != null) {
    if (revenueChange >= 0.4) revenueBadge = { text: "Healthy", tone: "good" };
    else if (revenueChange >= 0.1) revenueBadge = { text: "Solid", tone: "good" };
    else if (revenueChange < 0) revenueBadge = { text: "Declining", tone: "warn" };
    else revenueBadge = { text: "Modest", tone: "neutral" };
  }
  if (outflowChange != null) {
    if (revenueChange != null && outflowChange > revenueChange + 0.05) {
      outflowBadge = { text: "Rising fast", tone: "warn" };
    } else if (outflowChange < 0.1) {
      outflowBadge = { text: "Contained", tone: "good" };
    } else {
      outflowBadge = { text: "Scaling", tone: "neutral" };
    }
  }

  if (revenueChange != null && outflowChange != null) {
    if (revenueChange > outflowChange + 0.02) {
      leverage = "Positive";
      observationTitle = "Positive operating leverage";
      observationBody = "Revenue is growing faster than operating costs.";
      leverageBadge = { text: "Improving", tone: "good" };
    } else if (outflowChange > revenueChange + 0.02) {
      leverage = "Negative";
      observationTitle = "Negative operating leverage";
      observationBody = "Operating costs are growing faster than revenue.";
      leverageBadge = { text: "Watch", tone: "warn" };
    }
  }

  return {
    revenueChange,
    outflowChange,
    leverage,
    observationTitle,
    observationBody,
    horizonLabel: endIdx === 11 ? "M1 → M12" : `M1 → M${endIdx + 1}`,
    revenueBadge,
    outflowBadge,
    leverageBadge,
  };
}

function emptyInsight() {
  return {
    badge: "Recommended Next Action",
    title: "Projection pending",
    action: null,
    body: "Cash flow insights appear once the projection is available.",
    why: null,
    tone: "neutral",
    runwayGainMonths: null,
    confidence: null,
    difficulty: null,
    applyId: null,
    primaryDriver: null,
    whatIfs: [],
    benchmark: null,
    costContribution: buildCostContribution(undefined),
    expenseInsights: buildExpenseInsights(undefined),
    cashOutDetail: null,
  };
}

function pickOpportunity(sim, ctx) {
  const { costContribution, primaryDriver, capexMaterial, cmp, cumulativeCapex, whatIfs, month1 } =
    ctx;

  const candidates = [];

  if (capexMaterial && sim.inputs) {
    const delta = estimateCapexDelayRunway(sim.inputs, 3);
    if (delta != null && delta > 0.05) {
      candidates.push({
        badge: "AI CFO Recommendation",
        title: "Delay CapEx by 3 months",
        action: "Reschedule capital spend to protect runway",
        body: cmp?.cashOutMonthLabelIncludingCapex
          ? `CapEx advances cash-out to ${cmp.cashOutMonthLabelIncludingCapex}.`
          : "Planned CapEx is advancing cash-out.",
        why: {
          headline: "Capital spend is advancing cash exhaustion.",
          detail: `Planned CapEx totals ${money(cumulativeCapex, sim, { compact: true })} over the forecast. Delaying by 3 months extends runway by approximately ${formatDeltaMonths(delta)}.`,
        },
        tone: "opportunity",
        runwayGainMonths: delta,
        difficulty: "Low",
        applyId: "delay-capex-3",
        primaryDriver,
      });
    }
  }

  for (const row of whatIfs || []) {
    const mapped = mapWhatIfToOpportunity(row, sim, costContribution, primaryDriver, month1);
    if (mapped && row.runwayDelta != null && row.runwayDelta > 0.05) {
      candidates.push(mapped);
    }
  }

  const best = candidates.sort((a, b) => (b.runwayGainMonths || 0) - (a.runwayGainMonths || 0))[0];
  if (best) {
    return makeOpportunity(best);
  }

  const driver = primaryDriver;
  return makeOpportunity({
    badge: "Recommended Next Action",
    title: driver ? `${driver.name} is the largest Month 1 cost driver` : "Review operating costs",
    action: null,
    body: driver
      ? `${driver.name} represents ${formatPercent(driver.shareOfRevenue)} of Month 1 revenue.`
      : "Review Month 1 operating costs against revenue.",
    why: {
      headline: driver ? `${driver.name} dominates Month 1 costs relative to revenue.` : "Operating structure review",
      detail: driver
        ? `At ${formatPercent(driver.shareOfRevenue)} of revenue (${money(driver.amount, sim, { compact: true })} in Month 1), this line is the primary place to look for runway improvement.`
        : "Use the what-if simulations below to test revenue and cost levers.",
    },
    tone: "driver",
    runwayGainMonths: null,
    difficulty: null,
    applyId: null,
    primaryDriver: driver,
  });
}

function mapWhatIfToOpportunity(row, sim, costContribution, primaryDriver, month1) {
  const delta = row.runwayDelta;
  if (delta == null) return null;

  if (row.id === "revenue-up-5") {
    return {
      badge: "AI CFO Recommendation",
      title: "Grow revenue by 5%",
      action: "Increase Month 1 revenue trajectory by 5%",
      body: `Month 1 revenue is ${money(month1?.revenue, sim, { compact: true })}.`,
      why: {
        headline: "Revenue growth directly extends runway when costs lag.",
        detail: `A 5% revenue lift extends runway by approximately ${formatDeltaMonths(delta)} (from ${formatMonths(row.baseRunway)} to ${formatMonths(row.simulatedRunway)}).`,
      },
      tone: "opportunity",
      runwayGainMonths: delta,
      difficulty: "Medium",
      applyId: row.id,
      primaryDriver,
    };
  }

  if (row.id === "fixed-down-10") {
    const fixedShare = costContribution.totalFixedShareOfRevenue;
    return {
      badge: "AI CFO Recommendation",
      title: "Reduce fixed costs by 10%",
      action: "Cut fixed operating costs by 10% from Month 2",
      body: `Fixed costs represent ${formatPercent(fixedShare)} of Month 1 revenue.`,
      why: {
        headline: "Fixed cost relief compounds through the forecast.",
        detail: `A 10% fixed-cost reduction extends runway by approximately ${formatDeltaMonths(delta)} (from ${formatMonths(row.baseRunway)} to ${formatMonths(row.simulatedRunway)}).`,
      },
      tone: "opportunity",
      runwayGainMonths: delta,
      difficulty: "Medium",
      applyId: row.id,
      primaryDriver,
    };
  }

  if (row.id === "gm-up-5") {
    const gm = month1?.grossMargin ?? 0;
    return {
      badge: "AI CFO Recommendation",
      title: "Improve gross margin by 5 points",
      action: "Lift gross margin by 5 percentage points",
      body: `Month 1 gross margin is ${formatPercent(gm)}.`,
      why: {
        headline: "Unit economics are a high-leverage cash lever.",
        detail: `A 5-point gross-margin improvement extends runway by approximately ${formatDeltaMonths(delta)} (from ${formatMonths(row.baseRunway)} to ${formatMonths(row.simulatedRunway)}).`,
      },
      tone: "opportunity",
      runwayGainMonths: delta,
      difficulty: "High",
      applyId: row.id,
      primaryDriver,
    };
  }

  return null;
}

function makeOpportunity({
  badge,
  title,
  action,
  body,
  why,
  tone,
  runwayGainMonths,
  difficulty,
  applyId,
  primaryDriver,
}) {
  return {
    badge,
    title,
    action,
    body,
    why,
    tone,
    runwayGainMonths: runwayGainMonths == null ? null : round1(runwayGainMonths),
    confidence: confidenceFromGain(runwayGainMonths, difficulty),
    difficulty,
    applyId,
    primaryDriver,
  };
}

function confidenceFromGain(delta, difficulty) {
  if (delta == null || delta <= 0) return null;
  let level = "Medium";
  if (delta >= 2) level = "Very High";
  else if (delta >= 1) level = "High";
  else if (delta >= 0.4) level = "Medium";
  else level = "Low";
  if (difficulty === "Low" && level === "Medium") level = "High";
  if (difficulty === "High" && level === "Very High") level = "High";
  return {
    label: "Estimated Runway Impact",
    level,
  };
}

function buildWhatIfSensitivities(inputs) {
  if (!inputs) return [];
  const baseRunway = runwayOf(inputs);
  const rows = [
    { id: "revenue-up-5", label: "+5% Revenue", delta: estimateRevenueLevelLiftRunway(inputs, 0.05) },
    { id: "fixed-down-10", label: "−10% Fixed Costs", delta: estimateFixedCutRunway(inputs, 0.1) },
    { id: "gm-up-5", label: "+5% Gross Margin", delta: estimateGrossMarginLiftRunway(inputs, 0.05) },
  ];
  return rows
    .filter((r) => r.delta != null)
    .map((r) => ({
      id: r.id,
      label: r.label,
      runwayDelta: round1(r.delta),
      baseRunway: baseRunway != null ? round1(baseRunway) : null,
      simulatedRunway:
        baseRunway != null && r.delta != null ? round1(baseRunway + r.delta) : null,
      display: formatRunwayGain(r.delta),
    }));
}

/** Gross margin peer benchmark for FinancialIntelligenceContext. */
export function buildGrossMarginBenchmark(sim, month1) {
  return buildBenchmark(sim, month1);
}

function buildBenchmark(sim, month1) {
  const industry = sim.inputs?.industry || "";
  const peers = INDUSTRY_GROSS_MARGIN_BENCHMARKS[industry];

  if (!peers) {
    return {
      available: false,
      industry,
      message: "Benchmark data not yet available for this industry.",
    };
  }

  const grossMargin = month1?.grossMargin ?? 0;
  let status = "Within benchmark";
  let onTarget = true;
  if (grossMargin < peers.low) {
    status = "Below benchmark";
    onTarget = false;
  } else if (grossMargin >= peers.topQuartile) {
    status = "Top quartile";
  } else if (grossMargin > peers.high) {
    status = "Above range";
  }

  return {
    available: true,
    kind: "grossMargin",
    industry,
    title: `${industry} benchmark`,
    metricLabel: "Gross Margin (Month 1)",
    rangeLabel: "Peer range",
    rangeValue: `${formatPercent(peers.low, 0)}–${formatPercent(peers.high, 0)}`,
    medianLabel: "Industry median",
    medianValue: formatPercent(peers.median, 0),
    topLabel: "Top quartile",
    topValue: formatPercent(peers.topQuartile, 0),
    youLabel: "You",
    youValue: formatPercent(grossMargin, 0),
    status,
    onTarget,
  };
}

function buildCashOutDetail(months) {
  const hit = findFirstNegativeCashMonth(months, { includingCapex: true });
  if (!hit) return null;
  return {
    monthLabel: hit.monthLabel,
    balance: Number(hit.closingCash) || 0,
  };
}

function estimateCostCutRunway(inputs, reductionRate, target) {
  if (!inputs) return null;
  try {
    const cmp = runWhatIfScenario(inputs, {
      type: "cost-reduction",
      params: { reductionRate, target },
    });
    return cmp.delta?.runwayMonths ?? null;
  } catch {
    return null;
  }
}

function estimateFixedCutRunway(inputs, reductionRate) {
  return estimateCostCutRunway(inputs, reductionRate, "fixed");
}

function estimateGrossMarginLiftRunway(inputs, points) {
  if (!inputs) return null;
  try {
    const baseRunway = runwayOf(inputs);
    const next = cloneInputs(inputs);
    next.cogsPercent = Math.max(0, Number(next.cogsPercent || 0) - points);
    const scenRunway = runwayOf(next);
    if (baseRunway == null || scenRunway == null) return null;
    return scenRunway - baseRunway;
  } catch {
    return null;
  }
}

function estimateRevenueLevelLiftRunway(inputs, lift) {
  if (!inputs) return null;
  try {
    const baseRunway = runwayOf(inputs);
    const next = cloneInputs(inputs);
    next.currentMonthlyRevenue = Number(next.currentMonthlyRevenue || 0) * (1 + lift);
    next.currentVolume = Number(next.currentVolume || 0) * (1 + lift);
    const scenRunway = runwayOf(next);
    if (baseRunway == null || scenRunway == null) return null;
    return scenRunway - baseRunway;
  } catch {
    return null;
  }
}

function estimateCapexDelayRunway(inputs, delayMonths) {
  if (!inputs) return null;
  try {
    const baseRunway = runwayOf(inputs);
    const next = cloneInputs(inputs);
    const shift = Math.max(0, Math.floor(Number(delayMonths) || 0));
    next.capexEvents = (next.capexEvents || []).map((ev) => ({
      ...ev,
      monthIndex: Math.min(24, Math.max(1, Number(ev.monthIndex || 1) + shift)),
    }));
    const scenRunway = runwayOf(next);
    if (baseRunway == null || scenRunway == null) return null;
    return scenRunway - baseRunway;
  } catch {
    return null;
  }
}

function runwayOf(inputs) {
  const months = calculateProjection(cloneInputs(inputs));
  return calculateKpis(months).runwayMonths;
}

function formatRunwayGain(delta) {
  const n = round1(delta);
  if (n > 0) return `+${formatMonths(n).replace(" months", "")} months`;
  if (n < 0) return formatMonths(n);
  return "0 months";
}

function formatDeltaMonths(delta) {
  return formatMonths(round1(delta));
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function sum(arr) {
  return arr.reduce((a, b) => a + (Number(b) || 0), 0);
}
