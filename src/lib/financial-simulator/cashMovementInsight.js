import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { cloneInputs, runWhatIfScenario } from "./scenarios/index.js";
import { formatInr, formatMonths, formatPercent } from "./format.js";

const CHART_VARIABLE_KEYS = ["cogs", "otherDirectCosts"];
const CHART_FIXED_KEYS = [
  "salesAndMarketing",
  "payroll",
  "productAndTechnology",
  "otherFixedCosts",
];

const CATEGORY_LABELS = {
  cogs: "COGS",
  otherDirectCosts: "Other direct costs",
  salesAndMarketing: "Sales & marketing",
  payroll: "Payroll",
  productAndTechnology: "Product & technology",
  otherFixedCosts: "Other fixed costs",
};

/** Peer ranges for display (static references — not engine inputs). */
const GROSS_MARGIN_PEERS = {
  SaaS: { low: 0.6, high: 0.75, median: 0.65, topQuartile: 0.72 },
  FinTech: { low: 0.55, high: 0.7, median: 0.6, topQuartile: 0.68 },
  D2C: { low: 0.4, high: 0.55, median: 0.45, topQuartile: 0.52 },
  Other: { low: 0.45, high: 0.65, median: 0.5, topQuartile: 0.6 },
};

const BURN_MULTIPLE_MEDIAN = 1.2;
const BURN_MULTIPLE_TOP = 0.8;

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

  const totals = categoryTotals(months);
  const opexTotal = sum(Object.values(totals));
  const outflowTotal = opexTotal + sum(months.map((m) => Number(m.capex) || 0));
  const varTotal = sum(CHART_VARIABLE_KEYS.map((k) => totals[k] || 0));
  const fixTotal = sum(CHART_FIXED_KEYS.map((k) => totals[k] || 0));
  const varShare = outflowTotal > 0 ? varTotal / outflowTotal : 0;
  const fixShare = outflowTotal > 0 ? fixTotal / outflowTotal : 0;
  const varShareOpex = opexTotal > 0 ? varTotal / opexTotal : 0;
  const fixShareOpex = opexTotal > 0 ? fixTotal / opexTotal : 0;

  const largestEntry = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  const largestKey = largestEntry?.[0];
  const largestName = CATEGORY_LABELS[largestKey] || "Operating costs";
  const largestShareOpex = opexTotal > 0 ? largestEntry[1] / opexTotal : 0;
  const largestAmount = largestEntry?.[1] || 0;

  const avgRevenue = average(months.map((m) => m.revenue));
  const avgPayroll = average(months.map((m) => m.payroll));
  const payrollOfRevenue = avgRevenue > 0 ? avgPayroll / avgRevenue : 0;
  const avgGrossMargin = average(months.map((m) => m.grossMargin));

  const cmp = sim.kpis?.capexComparison;
  const cumulativeCapex = Number(cmp?.cumulativeCapex ?? sum(months.map((m) => m.capex))) || 0;
  const capexMaterial =
    cumulativeCapex > 0 &&
    ((cmp?.cashOutMonthIncludingCapex != null && cmp?.cashOutMonthExcludingCapex == null) ||
      (cmp?.cashOutMonthIncludingCapex != null &&
        cmp?.cashOutMonthExcludingCapex != null &&
        cmp.cashOutMonthIncludingCapex !== cmp.cashOutMonthExcludingCapex));

  const primaryDriver = {
    name: largestName,
    key: largestKey,
    shareOfOperatingSpend: largestShareOpex,
    amount: largestAmount,
  };

  const costDrivers = buildCostDrivers(totals, opexTotal);
  const mixBars = [
    { id: "variable", label: "Variable Costs", share: varShareOpex, color: "#c2410c" },
    { id: "fixed", label: "Fixed Costs", share: fixShareOpex, color: "#1a3673" },
  ];

  const whatIfs = buildWhatIfSensitivities(sim.inputs);
  const benchmark = buildBenchmark(sim, avgGrossMargin, months);
  const cashOutDetail = buildCashOutDetail(months);

  const opportunity = pickOpportunity(sim, {
    varShare,
    fixShare,
    largestKey,
    largestName,
    largestShareOpex,
    largestAmount,
    payrollOfRevenue,
    avgGrossMargin,
    capexMaterial,
    cmp,
    primaryDriver,
    months,
  });

  return {
    ...opportunity,
    primaryDriver,
    whatIfs,
    benchmark,
    costDrivers,
    mixBars,
    cashOutDetail,
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
    costDrivers: [],
    mixBars: [],
    cashOutDetail: null,
  };
}

function pickOpportunity(sim, ctx) {
  const {
    varShare,
    fixShare,
    largestKey,
    largestName,
    largestShareOpex,
    largestAmount,
    payrollOfRevenue,
    avgGrossMargin,
    capexMaterial,
    cmp,
    primaryDriver,
    months,
  } = ctx;

  if (capexMaterial && sim.inputs) {
    const delta = estimateCapexDelayRunway(sim.inputs, 3);
    const savings = sum(months.map((m) => Number(m.capex) || 0));
    if (delta != null && delta > 0.05) {
      return makeOpportunity({
        badge: "AI CFO Recommendation",
        title: "Delay CapEx by 3 months",
        action: "Reschedule capital spend to protect runway",
        body: cmp?.cashOutMonthLabelIncludingCapex
          ? `CapEx advances cash-out to ${cmp.cashOutMonthLabelIncludingCapex}.`
          : "Planned CapEx is advancing cash-out.",
        why: {
          headline: "Capital spend is advancing cash exhaustion.",
          detail: `Planned CapEx totals ${formatInr(savings, { compact: true })} over the forecast. Delaying it by 3 months keeps operating cash available longer and extends runway by approximately ${formatDeltaMonths(delta)}.`,
        },
        tone: "opportunity",
        runwayGainMonths: delta,
        difficulty: "Low",
        applyId: "delay-capex-3",
        primaryDriver,
      });
    }
  }

  if (payrollOfRevenue >= 0.3 && sim.inputs) {
    const delta = estimateFixedCutRunway(sim.inputs, 0.1);
    const payrollTotal = sum(months.map((m) => m.payroll));
    const savings = payrollTotal * 0.1;
    if (delta != null && delta > 0.05) {
      return makeOpportunity({
        badge: "AI CFO Recommendation",
        title: "Reduce hiring pace",
        action: "Slow payroll growth by ~10%",
        body: `Payroll is ${Math.round(payrollOfRevenue * 100)}% of revenue.`,
        why: {
          headline: "Payroll is your largest controllable fixed commitment.",
          detail: `A 10% reduction saves about ${formatInr(savings, { compact: true })} over the forecast period and extends runway by approximately ${formatDeltaMonths(delta)}.`,
        },
        tone: "alert",
        runwayGainMonths: delta,
        difficulty: "Medium",
        applyId: "fixed-down-10",
        primaryDriver: { name: "Payroll", key: "payroll", shareOfOperatingSpend: largestShareOpex, amount: payrollTotal },
      });
    }
  }

  if ((avgGrossMargin < 0.5 || largestKey === "cogs" || varShare >= 0.45) && sim.inputs) {
    const delta = estimateGrossMarginLiftRunway(sim.inputs, 0.05);
    const cogsTotal = sum(months.map((m) => m.cogs));
    const savings = sum(months.map((m) => (Number(m.revenue) || 0) * 0.05));
    if (delta != null && delta > 0.05) {
      return makeOpportunity({
        badge: "AI CFO Recommendation",
        title: "Improve gross margin by 5%",
        action: "Lift gross margin by 5 percentage points",
        body: `Gross margin averages ${formatPercent(avgGrossMargin, 0)}.`,
        why: {
          headline: "Unit economics are the highest-leverage cash lever.",
          detail: `COGS totals ${formatInr(cogsTotal, { compact: true })} over the forecast. A 5pp gross-margin lift frees about ${formatInr(savings, { compact: true })} of cash and extends runway by approximately ${formatDeltaMonths(delta)}.`,
        },
        tone: "opportunity",
        runwayGainMonths: delta,
        difficulty: "High",
        applyId: "gm-up-5",
        primaryDriver,
      });
    }
  }

  if ((fixShare >= 0.45 || largestKey === "payroll" || largestKey === "salesAndMarketing") && sim.inputs) {
    const delta = estimateFixedCutRunway(sim.inputs, 0.1);
    const savings = largestAmount * 0.1;
    if (delta != null && delta > 0.05) {
      const payrollLed = largestKey === "payroll";
      return makeOpportunity({
        badge: "AI CFO Recommendation",
        title: payrollLed ? "Reduce hiring pace" : "Reduce fixed costs by 10%",
        action: payrollLed ? "Slow payroll growth by ~10%" : "Cut fixed operating costs by 10%",
        body: `${largestName} is ${Math.round(largestShareOpex * 100)}% of operating spend.`,
        why: {
          headline: `${largestName} is your largest controllable expense.`,
          detail: `Reducing it by 10% saves about ${formatInr(savings, { compact: true })} over the forecast period and extends runway by approximately ${formatDeltaMonths(delta)}.`,
        },
        tone: "opportunity",
        runwayGainMonths: delta,
        difficulty: "Medium",
        applyId: "fixed-down-10",
        primaryDriver,
      });
    }
  }

  if (sim.inputs) {
    const delta = estimateCostCutRunway(sim.inputs, 0.05, "variable");
    const varSpend = sum(CHART_VARIABLE_KEYS.map((k) => sum(months.map((m) => m[k]))));
    // Engine variable also includes S&M + product — use totalVariable for savings estimate
    const varAll = sum(months.map((m) => m.totalVariableExpenses));
    const savings = varAll * 0.05;
    if (delta != null && delta > 0.05) {
      return makeOpportunity({
        badge: "AI CFO Recommendation",
        title: "Tighten variable spend by 5%",
        action: "Reduce variable costs by 5%",
        body: `Variable costs represent ${Math.round(varShare * 100)}% of cash outflows.`,
        why: {
          headline: "Variable spend scales with every rupee of revenue.",
          detail: `A 5% reduction saves about ${formatInr(savings, { compact: true })} over the forecast (vs ~${formatInr(varSpend, { compact: true })} of direct variable lines) and extends runway by approximately ${formatDeltaMonths(delta)}.`,
        },
        tone: "opportunity",
        runwayGainMonths: delta,
        difficulty: "Medium",
        applyId: "variable-down-5",
        primaryDriver,
      });
    }
  }

  return makeOpportunity({
    badge: "Recommended Next Action",
    title: `${largestName} is the largest outflow`,
    action: null,
    body: `${largestName} represents ${Math.round(largestShareOpex * 100)}% of operating spend.`,
    why: {
      headline: `${largestName} dominates operating spend.`,
      detail: `At ${Math.round(largestShareOpex * 100)}% of operating costs (${formatInr(largestAmount, { compact: true })} over the forecast), this line is the primary place to look for runway improvement.`,
    },
    tone: "driver",
    runwayGainMonths: null,
    difficulty: null,
    applyId: null,
    primaryDriver,
  });
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
      display: formatRunwayGain(r.delta),
    }));
}

function buildBenchmark(sim, avgGrossMargin, months) {
  const industry = sim.inputs?.industry || "Other";
  const peers = GROSS_MARGIN_PEERS[industry] ?? GROSS_MARGIN_PEERS.Other;
  const burnMultiple = computeBurnMultiple(months);

  if (industry === "SaaS" || industry === "FinTech" || avgGrossMargin >= 0.4) {
    let status = "Within benchmark";
    let onTarget = true;
    if (avgGrossMargin < peers.low) {
      status = "Below benchmark";
      onTarget = false;
    } else if (avgGrossMargin >= peers.topQuartile) {
      status = "Top quartile";
    } else if (avgGrossMargin > peers.high) {
      status = "Above range";
    }
    return {
      kind: "grossMargin",
      title: `Healthy ${industry}`,
      metricLabel: "Gross Margin",
      rangeLabel: "Peer range",
      rangeValue: `${formatPercent(peers.low, 0)}–${formatPercent(peers.high, 0)}`,
      medianLabel: "Industry median",
      medianValue: formatPercent(peers.median, 0),
      topLabel: "Top quartile",
      topValue: formatPercent(peers.topQuartile, 0),
      youLabel: "You",
      youValue: formatPercent(avgGrossMargin, 0),
      status,
      onTarget,
    };
  }

  if (burnMultiple != null) {
    const onTarget = burnMultiple <= BURN_MULTIPLE_MEDIAN * 1.15;
    return {
      kind: "burnMultiple",
      title: "Burn multiple vs peers",
      metricLabel: "Burn Multiple",
      rangeLabel: "Healthy band",
      rangeValue: `< ${BURN_MULTIPLE_MEDIAN}`,
      medianLabel: "Industry median",
      medianValue: String(BURN_MULTIPLE_MEDIAN),
      topLabel: "Top quartile",
      topValue: String(BURN_MULTIPLE_TOP),
      youLabel: "You",
      youValue: String(round1(burnMultiple)),
      status: onTarget ? "Within benchmark" : "Above median",
      onTarget,
    };
  }

  return {
    kind: "grossMargin",
    title: `Healthy ${industry}`,
    metricLabel: "Gross Margin",
    rangeLabel: "Peer range",
    rangeValue: `${formatPercent(peers.low, 0)}–${formatPercent(peers.high, 0)}`,
    medianLabel: "Industry median",
    medianValue: formatPercent(peers.median, 0),
    topLabel: "Top quartile",
    topValue: formatPercent(peers.topQuartile, 0),
    youLabel: "You",
    youValue: formatPercent(avgGrossMargin, 0),
    status: avgGrossMargin >= peers.low ? "Within benchmark" : "Below benchmark",
    onTarget: avgGrossMargin >= peers.low,
  };
}

function buildCostDrivers(totals, opexTotal) {
  return Object.entries(totals)
    .map(([key, amount]) => ({
      key,
      name: CATEGORY_LABELS[key],
      amount,
      share: opexTotal > 0 ? amount / opexTotal : 0,
    }))
    .filter((d) => d.share >= 0.02)
    .sort((a, b) => b.share - a.share)
    .slice(0, 4);
}

function buildCashOutDetail(months) {
  const hit = months.find((m) => m.cashOut);
  if (!hit) return null;
  return {
    monthLabel: hit.monthLabel,
    balance: Number(hit.closingCash) || 0,
  };
}

function computeBurnMultiple(months) {
  if (!months?.length || months.length < 2) return null;
  let burn = 0;
  let newRev = 0;
  for (let i = 1; i < months.length; i++) {
    burn += Math.max(Number(months[i].netBurn) || 0, 0);
    const delta = (Number(months[i].revenue) || 0) - (Number(months[i - 1].revenue) || 0);
    newRev += Math.max(delta, 0);
  }
  if (newRev <= 0) return null;
  return burn / newRev;
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

function categoryTotals(months) {
  return {
    cogs: sum(months.map((m) => m.cogs)),
    otherDirectCosts: sum(months.map((m) => m.otherDirectCosts)),
    salesAndMarketing: sum(months.map((m) => m.salesAndMarketing)),
    payroll: sum(months.map((m) => m.payroll)),
    productAndTechnology: sum(months.map((m) => m.productAndTechnology)),
    otherFixedCosts: sum(months.map((m) => m.otherFixedCosts)),
  };
}

function sum(arr) {
  return arr.reduce((a, b) => a + (Number(b) || 0), 0);
}

function average(arr) {
  if (!arr.length) return 0;
  return sum(arr) / arr.length;
}
