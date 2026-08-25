import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { cloneInputs } from "./scenarios/index.js";
import { withFundingAwareRunway } from "./plannedFunding.js";
import { applyCostReductionScenario } from "./scenarios/applyCostReductionScenario.js";
import { applyRevenueGrowthScenario } from "./scenarios/applyRevenueGrowthScenario.js";
import { buildCostContribution } from "./cashMovementInsight.js";
import { formatMoney, formatMonths, formatPercent } from "./format.js";

/**
 * @param {{ months: object[], kpis: object, inputs: object }} sim
 * @deprecated Prefer `buildFinancialIntelligenceContext(sim)` for canonical runway + context fields.
 */
export function buildModelContext(sim) {
  const inputs = sim.inputs || {};
  const months = sim.months || [];
  const kpis = sim.kpis || {};
  const m1 = months[0] || {};
  const cc = buildCostContribution(m1);
  return {
    company: {
      name: inputs.companyName,
      industry: inputs.industry,
      businessModel: inputs.businessModel,
      stage: inputs.startupStage,
      priority: inputs.mainPriority,
    },
    openingCash: Number(inputs.currentCashBalance) || 0,
    revenue: m1.revenue,
    revenueGrowth:
      inputs.revenueMode === "detailed"
        ? inputs.monthlyVolumeGrowth
        : inputs.monthlyRevenueGrowth,
    grossMargin: m1.grossMargin,
    /** CM1 = after COGS, other direct, fulfilment — before S&M and fixed opex */
    cm1: m1.cm1,
    cm1Margin: m1.cm1Margin,
    /** CM2 = CM1 after sales & marketing */
    cm2: m1.cm2,
    cm2Margin: m1.cm2Margin,
    cogsPercent: inputs.cogsPercent,
    expenses: {
      cogs: m1.cogs,
      otherDirect: m1.otherDirectCosts,
      fulfillment: m1.fulfillmentCosts ?? m1.productAndTechnology,
      salesMarketing: m1.salesAndMarketing,
      productTech: m1.productAndTechnology,
      payroll: m1.payroll,
      otherFixed: m1.otherFixedCosts,
    },
    runwayMonths: kpis.runwayMonths,
    projectedRunwayMonths: kpis.projectedRunwayMonths ?? kpis.runwayMonths,
    runwayBeforePlannedFundingMonths: kpis.runwayBeforePlannedFundingMonths ?? null,
    runwayAfterPlannedFundingMonths: kpis.runwayAfterPlannedFundingMonths ?? null,
    cashSeriesRunwayMonths: kpis.cashSeriesRunwayMonths ?? null,
    plannedFunding: kpis.plannedFunding || null,
    fundingRunwayImpactMonths: kpis.fundingRunwayImpactMonths ?? null,
    cfoFundingRunway: kpis.cfoFundingRunway || null,
    cashOutMonth: kpis.cashOutMonthLabel,
    monthlyNetBurn: kpis.burnMetrics?.monthlyNetBurnExcludingCapex ?? m1.netBurn,
    ebitda: m1.ebitda,
    costContribution: cc,
    currency: inputs.currency,
  };
}

/**
 * @param {{ months: object[], kpis: object, inputs?: object }} sim
 */
export function buildSuggestedPrompts(sim) {
  const ctx = buildModelContext(sim);
  const rw = ctx.runwayMonths != null ? Number(ctx.runwayMonths).toFixed(1) : "—";
  return [
    { id: "why-runway", label: `Why is my runway only ${rw} months?` },
    { id: "reach-12", label: "What would it take to reach 12 months runway?" },
    { id: "hire-5", label: "Can I afford 5 more engineers?" },
    { id: "fundraise-slip", label: "What happens if fundraising is delayed by 4 months?" },
    { id: "double-marketing", label: "What if I double marketing?" },
    { id: "cost-to-12", label: "How much do I need to reduce costs to reach 12 months runway?" },
    { id: "ebitda-positive", label: "What revenue growth would make us EBITDA positive?" },
  ];
}

/**
 * Parse natural language into a structured action (no LLM).
 * @param {string} question
 * @param {{ pendingAction?: object }} [options]
 */
export function parseAiCfoQuestion(question, options = {}) {
  const q = String(question || "").trim();
  const lower = q.toLowerCase();

  if (options.pendingAction?.awaiting === "costPerHead") {
    const cost = parseAmount(q);
    if (cost == null || cost <= 0) {
      return { type: "clarify", message: "Enter a valid monthly cost per engineer.", awaiting: "costPerHead", pendingAction: options.pendingAction };
    }
    return {
      type: "evaluate_hiring",
      params: {
        headcount: options.pendingAction.headcount,
        costPerHead: cost,
      },
    };
  }

  if (/why.*runway|why is my runway|why only.*month/.test(lower)) {
    return { type: "explain_runway" };
  }
  if (/why.*burn|why.*los(e|ing) cash|what.*driv(e|ing).*burn/.test(lower)) {
    return { type: "explain_burn" };
  }

  const targetMonths = extractTargetMonths(lower);
  if (/how (?:can|do|much)|ways to|find (?:a )?path|what would it take|reach|get to|achieve/.test(lower) && targetMonths) {
    if (/reduce cost|cut cost|cost reduction|reduce fixed/.test(lower)) {
      return { type: "goal_seek_runway", params: { targetMonths, lever: "fixed" } };
    }
    if (/revenue growth|grow revenue/.test(lower)) {
      return { type: "goal_seek_runway", params: { targetMonths, lever: "revenue" } };
    }
    if (/how can|ways to|find (?:a )?path|what would it take/.test(lower)) {
      return { type: "find_path_runway", params: { targetMonths } };
    }
    return { type: "find_path_runway", params: { targetMonths } };
  }

  if (/ebitda positive|break even|breakeven/.test(lower) && /revenue growth|growth/.test(lower)) {
    return { type: "goal_seek_ebitda" };
  }

  const hireMatch = lower.match(/(\d+)\s*(?:more\s*)?(?:engineer|developer|hire|employee|head)/);
  if (/can i afford|afford.*hire|hire.*engineer/.test(lower) || hireMatch) {
    const headcount = hireMatch ? Number(hireMatch[1]) : 5;
    const costPerHead = extractCostPerHead(lower);
    if (costPerHead) {
      return { type: "evaluate_hiring", params: { headcount, costPerHead } };
    }
    return {
      type: "clarify",
      message: "What would be the approximate fully-loaded monthly cost per engineer?",
      awaiting: "costPerHead",
      pendingAction: { type: "evaluate_hiring", headcount, awaiting: "costPerHead" },
      clarifyOptions: [],
    };
  }

  if (/fundraising.*delay|funding.*slip|delay.*fundraising|fundraise.*slip/.test(lower)) {
    const months = extractNumberBefore(lower, "month") || 4;
    return { type: "simulate_funding_delay", params: { delayMonths: months } };
  }

  if (/double marketing|2x marketing|marketing.*double/.test(lower)) {
    return { type: "simulate_marketing", params: { multiplier: 2 } };
  }

  const multi = parseMultiVariable(lower);
  if (multi) return { type: "multi_simulate", params: multi };

  const fixedPct =
    matchPercentChange(lower, /(?:reduce|cut|lower|fall).*fixed|fixed.*(?:cost|expense).*(?:reduce|cut|lower|fall|by)/) ??
    (/(?:reduce|cut|lower).*fixed.*cost/.test(lower) ? extractFirstPercent(lower) : null);
  if (fixedPct != null) return { type: "simulate_fixed_cost", params: { changePercent: -Math.abs(fixedPct) } };

  const varPct = matchPercentChange(lower, /(?:reduce|cut|lower).*variable|variable.*(?:reduce|cut)/);
  if (varPct != null) return { type: "simulate_variable_cost", params: { changePercent: -Math.abs(varPct) } };

  const revGrowthMatch = lower.match(
    /revenue(?:\s+growth)?.*(?:grow|growth|faster|increase).*?(\d+(?:\.\d+)?)\s*(?:%|pp|points)?/,
  );
  if (revGrowthMatch && /growth|faster|pp|points/.test(lower)) {
    return { type: "simulate_revenue", params: { growthPoints: Number(revGrowthMatch[1]) / 100 } };
  }
  const revLevelMatch = lower.match(/revenue.*?(?:increase|up|by).*?(\d+(?:\.\d+)?)\s*%/);
  if (revLevelMatch && !/growth/.test(lower)) {
    return { type: "simulate_revenue", params: { levelPercent: Number(revLevelMatch[1]) } };
  }
  const revPct = matchPercentChange(lower, /(?:\+|\b)(\d+(?:\.\d+)?)\s*%\s*revenue|revenue.*(?:\+|\b)(\d+(?:\.\d+)?)\s*%/);
  if (revPct != null) return { type: "simulate_revenue", params: { levelPercent: revPct } };

  const gmTarget = lower.match(/gross margin(?:\s*(?:to|at|of))?\s*(\d+(?:\.\d+)?)\s*%/);
  if (gmTarget) {
    return { type: "simulate_margin", params: { targetMargin: Number(gmTarget[1]) / 100 } };
  }
  const gmPoints = lower.match(/gross margin.*(?:improve|increase|up).*?(\d+(?:\.\d+)?)\s*(?:pp|points|percentage points|%)/);
  if (gmPoints) {
    return { type: "simulate_margin", params: { pointsDelta: Number(gmPoints[1]) / 100 } };
  }

  const payrollAdd = lower.match(/payroll.*(?:increase|add|up).*?(?:₹|rs\.?|inr|\$)?\s*([\d,.]+)\s*(?:lakh|lac|k|cr|crore)?/i);
  if (payrollAdd) {
    const amt = parseAmount(payrollAdd[0]);
    if (amt) return { type: "simulate_payroll", params: { payrollAdd: amt } };
  }

  const marketingAmt = lower.match(/marketing.*(?:increase|add|by).*?(?:₹|rs\.?|\$)?\s*([\d,.]+)/i);
  if (marketingAmt) {
    const amt = parseAmount(marketingAmt[0]);
    if (amt) return { type: "simulate_marketing", params: { addAmount: amt } };
  }

  if (/what if|simulate|model|scenario/.test(lower)) {
    return {
      type: "clarify",
      message: "Which assumption would you like me to model?",
      clarifyOptions: [
        { id: "revenue", label: "Increase revenue growth" },
        { id: "fixed", label: "Reduce fixed costs" },
        { id: "marketing", label: "Increase marketing" },
        { id: "capex", label: "Add CapEx" },
      ],
    };
  }

  return {
    type: "clarify",
    message: "I can explain your runway, simulate a change, or search for a path to a target. Try a suggested question or be specific (e.g. “What if fixed costs fall 10%?”).",
    clarifyOptions: [],
  };
}

/**
 * Execute structured action against base simulation.
 * @param {object} action
 * @param {{ months: object[], kpis: object, inputs: object }} baseSim
 */
export function runAiCfoAction(action, baseSim) {
  const base = baseSim;
  switch (action.type) {
    case "explain_runway":
      return buildExplainRunway(base, action);
    case "explain_burn":
      return buildExplainBurn(base, action);
    case "simulate_revenue":
    case "simulate_fixed_cost":
    case "simulate_variable_cost":
    case "simulate_margin":
    case "simulate_marketing":
    case "simulate_payroll":
    case "simulate_funding_delay":
    case "multi_simulate":
      return buildSimulationResponse(base, action);
    case "goal_seek_runway":
      return buildGoalSeekRunway(base, action.params);
    case "goal_seek_ebitda":
      return buildGoalSeekEbitda(base);
    case "find_path_runway":
      return buildFindPath(base, action.params);
    case "evaluate_hiring":
      return buildHiringEvaluation(base, action.params);
    case "clarify":
      return {
        type: "clarify",
        question: "",
        title: "AI CFO",
        clarify: {
          message: action.message,
          options: action.clarifyOptions || [],
        },
        pendingAction: action.pendingAction,
        followUps: [],
      };
    default:
      return parseAndRunFromClarify(action, base);
  }
}

function buildExplainRunway(sim) {
  const ctx = buildModelContext(sim);
  const m1 = sim.months[0];
  const currency = ctx.currency;
  const money = (v) => formatMoney(v, { currency });
  const largest = ctx.costContribution.categories.sort((a, b) => b.shareOfRevenue - a.shareOfRevenue)[0];
  const planned = ctx.plannedFunding;
  const bullets = [
    { label: "Opening cash", value: money(ctx.openingCash) },
    { label: "Monthly net burn", value: money(ctx.monthlyNetBurn) },
    {
      label: "Largest cost pressure",
      value: largest
        ? `${largest.label} — ${formatPercent(largest.shareOfRevenue)} of revenue`
        : "—",
    },
    { label: "EBITDA", value: `${money(m1.ebitda)} / month` },
  ];
  if (planned?.hasFutureFunding && ctx.runwayBeforePlannedFundingMonths != null) {
    bullets.push({
      label: "Runway after planned funding",
      value: formatMonths(ctx.runwayAfterPlannedFundingMonths ?? ctx.projectedRunwayMonths ?? ctx.runwayMonths),
    });
    bullets.push({
      label: "Runway before planned funding",
      value: formatMonths(ctx.runwayBeforePlannedFundingMonths),
    });
    bullets.push({
      label: "Planned funding",
      value: `${money(planned.totalAmount)}${
        planned.eventCount === 1 && planned.firstFundingMonth != null
          ? ` (${planned.equityAmount > 0 ? "equity" : "debt/other"} in Month ${planned.firstFundingMonth})`
          : ` across ${planned.eventCount} events`
      }`,
    });
  }

  const fundingObservation =
    planned?.hasFutureFunding && ctx.runwayBeforePlannedFundingMonths != null
      ? ` After planned financing, CFO runway is approximately ${formatMonths(ctx.runwayAfterPlannedFundingMonths ?? ctx.projectedRunwayMonths ?? ctx.runwayMonths)}. Without that financing, runway is approximately ${formatMonths(ctx.runwayBeforePlannedFundingMonths)}.`
      : "";

  return {
    type: "explanation",
    question: "Why is my runway only this long?",
    title: `Why your runway is ${formatMonths(ctx.runwayMonths)}`,
    base: snapshotMetrics(sim),
    bullets,
    observation: `Your gross margin is ${formatPercent(ctx.grossMargin)}, but operating costs consume enough of the remaining margin to keep EBITDA ${m1.ebitda < 0 ? "negative" : "positive"}. Expected cash-out: ${ctx.cashOutMonth}.${fundingObservation}`,
    followUps: buildFollowUps("explain_runway", sim),
  };
}

function buildExplainBurn(sim) {
  const ctx = buildModelContext(sim);
  const largest = ctx.costContribution.categories.sort((a, b) => b.shareOfRevenue - a.shareOfRevenue)[0];
  return {
    type: "explanation",
    question: "What is driving my burn?",
    title: "What is driving your burn",
    base: snapshotMetrics(sim),
    bullets: [
      { label: "Monthly net burn", value: formatMoney(ctx.monthlyNetBurn, { currency: ctx.currency }) },
      { label: "Monthly gross burn", value: formatMoney(sim.months[0].grossBurn, { currency: ctx.currency }) },
      { label: "Month 1 revenue", value: formatMoney(ctx.revenue, { currency: ctx.currency }) },
      {
        label: "Primary driver",
        value: largest ? `${largest.label} (${formatPercent(largest.shareOfRevenue)} of revenue)` : "—",
      },
    ],
    observation: `Net burn reflects operating outflows after revenue. ${largest?.label || "Operating costs"} is the largest Month 1 cost line relative to revenue.`,
    followUps: buildFollowUps("explain_burn", sim),
  };
}

function buildSimulationResponse(baseSim, action) {
  const { scenarioInputs, assumptionChanges, label } = applyActionToInputs(baseSim.inputs, action);
  const scenarioSim = runSim(scenarioInputs);
  const base = snapshotMetrics(baseSim);
  const scenario = snapshotMetrics(scenarioSim);
  const runwayImpact =
    base.runwayMonths != null && scenario.runwayMonths != null
      ? round1(scenario.runwayMonths - base.runwayMonths)
      : null;

  return {
    type: "simulation",
    question: label,
    title: "AI CFO analysis",
    base,
    scenario,
    assumptionChanges,
    runwayImpact,
    observation: buildSimulationObservation(action, base, scenario, runwayImpact),
    scenarioInputs,
    scenarioSim,
    followUps: buildFollowUps(action.type, baseSim, action),
  };
}

function buildGoalSeekRunway(baseSim, { targetMonths, lever }) {
  const base = snapshotMetrics(baseSim);
  if (base.runwayMonths != null && base.runwayMonths >= targetMonths) {
    return {
      type: "explanation",
      question: `Reach ${targetMonths} months runway`,
      title: `Already at or above ${targetMonths} months`,
      base,
      observation: `Your projected runway is ${formatMonths(base.runwayMonths)} — at or above the ${targetMonths}-month target on the current model.`,
      followUps: buildFollowUps("goal_seek_runway", baseSim),
    };
  }

  let result = null;
  if (lever === "fixed" || lever === "variable") {
    result = searchCostReduction(baseSim.inputs, targetMonths, lever);
  } else if (lever === "revenue") {
    result = searchRevenueGrowth(baseSim.inputs, targetMonths);
  }

  if (!result) {
    return {
      type: "explanation",
      question: `Reach ${targetMonths} months runway`,
      title: "Target not reachable within model bounds",
      base,
      observation: `The model could not reach ${targetMonths} months runway within reasonable ${lever || "operating"} levers (tested up to 80% improvement). Consider funding or deeper structural changes.`,
      followUps: buildFollowUps("goal_seek_runway", baseSim),
    };
  }

  const scenarioSim = runSim(result.scenarioInputs);
  const scenario = snapshotMetrics(scenarioSim);
  return {
    type: "goal_seek",
    question: `Reach ${targetMonths} months runway`,
    title: "Target path found",
    base,
    scenario,
    target: { months: targetMonths },
    assumptionChanges: result.assumptionChanges,
    runwayImpact: round1((scenario.runwayMonths || 0) - (base.runwayMonths || 0)),
    observation: result.observation,
    scenarioInputs: result.scenarioInputs,
    scenarioSim,
    followUps: buildFollowUps("goal_seek_runway", baseSim),
  };
}

function buildGoalSeekEbitda(baseSim) {
  const base = snapshotMetrics(baseSim);
  const result = searchRevenueGrowthForEbitda(baseSim.inputs);
  if (!result) {
    return {
      type: "explanation",
      title: "EBITDA break-even not found in bounds",
      base,
      observation: "Could not reach positive Month 1 EBITDA within tested revenue growth rates (up to +50%).",
      followUps: [],
    };
  }
  const scenarioSim = runSim(result.scenarioInputs);
  return {
    type: "goal_seek",
    title: "Revenue growth for EBITDA break-even",
    base,
    scenario: snapshotMetrics(scenarioSim),
    assumptionChanges: result.assumptionChanges,
    observation: result.observation,
    scenarioInputs: result.scenarioInputs,
    scenarioSim,
    followUps: [],
  };
}

function buildFindPath(baseSim, { targetMonths }) {
  const base = snapshotMetrics(baseSim);
  const paths = [];

  const fixed = searchCostReduction(baseSim.inputs, targetMonths, "fixed");
  if (fixed) {
    paths.push({
      rank: paths.length + 1,
      title: `Reduce fixed costs by ~${Math.round(Math.abs(fixed.changePercent) * 100)}%`,
      runway: fixed.runway,
      difficulty: Math.abs(fixed.changePercent) >= 0.25 ? "High" : "Medium",
      scenarioInputs: fixed.scenarioInputs,
      scenarioSim: runSim(fixed.scenarioInputs),
    });
  }

  const margin = searchMarginImprovement(baseSim.inputs, targetMonths);
  if (margin) {
    paths.push({
      rank: paths.length + 1,
      title: `Improve gross margin to ~${Math.round(margin.targetMargin * 100)}%`,
      runway: margin.runway,
      difficulty: "Medium",
      scenarioInputs: margin.scenarioInputs,
      scenarioSim: runSim(margin.scenarioInputs),
    });
  }

  const combined = searchCombinedPlan(baseSim.inputs, targetMonths);
  if (combined) {
    paths.push({
      rank: paths.length + 1,
      title: "Combined plan (revenue + fixed costs + margin)",
      runway: combined.runway,
      difficulty: "Medium",
      scenarioInputs: combined.scenarioInputs,
      scenarioSim: runSim(combined.scenarioInputs),
      detail: combined.detail,
    });
  }

  if (!paths.length) {
    return buildGoalSeekRunway(baseSim, { targetMonths, lever: "fixed" });
  }

  paths.sort((a, b) => (b.runway || 0) - (a.runway || 0));

  return {
    type: "find_path",
    question: `How can I reach ${targetMonths} months runway?`,
    title: `Ways to reach ${targetMonths} months runway`,
    base,
    target: { months: targetMonths },
    paths,
    observation:
      paths.length > 1
        ? "The combined plan requires smaller changes across multiple levers and may be less disruptive than relying entirely on cost reduction."
        : paths[0]?.title || "",
    followUps: buildFollowUps("find_path_runway", baseSim),
  };
}

function buildHiringEvaluation(baseSim, { headcount, costPerHead }) {
  const payrollAdd = headcount * costPerHead;
  const action = { type: "simulate_payroll", params: { payrollAdd } };
  const res = buildSimulationResponse(baseSim, action);
  return {
    ...res,
    type: "affordability",
    question: `Can I afford ${headcount} more engineers?`,
    title: `Affordability: ${headcount} engineers @ ${formatMoney(costPerHead, { currency: baseSim.inputs?.currency })}/mo`,
    hiring: { headcount, costPerHead, payrollAdd },
  };
}

function applyActionToInputs(baseInputs, action) {
  const inputs = cloneInputs(baseInputs);
  const changes = [];
  let label = "Scenario";

  const addChange = (field, baseVal, scenVal, fmt = (v) => String(v)) => {
    if (baseVal !== scenVal) changes.push({ label: field, base: fmt(baseVal), scenario: fmt(scenVal) });
  };

  switch (action.type) {
    case "simulate_revenue": {
      if (action.params.levelPercent != null) {
        const mult = 1 + action.params.levelPercent / 100;
        inputs.currentMonthlyRevenue = Number(inputs.currentMonthlyRevenue || 0) * mult;
        inputs.currentVolume = Number(inputs.currentVolume || 0) * mult;
        addChange(
          "Month 1 revenue",
          formatMoney(baseInputs.currentMonthlyRevenue, { currency: inputs.currency }),
          formatMoney(inputs.currentMonthlyRevenue, { currency: inputs.currency }),
        );
        label = `${action.params.levelPercent > 0 ? "+" : ""}${action.params.levelPercent}% revenue`;
      } else {
        const pts = action.params.growthPoints || 0;
        if (inputs.revenueMode === "detailed") {
          inputs.monthlyVolumeGrowth = Number(inputs.monthlyVolumeGrowth || 0) + pts;
          addChange("Volume growth", baseInputs.monthlyVolumeGrowth, inputs.monthlyVolumeGrowth, (v) => formatPercent(v));
        } else {
          inputs.monthlyRevenueGrowth = Number(inputs.monthlyRevenueGrowth || 0) + pts;
          addChange("Revenue growth", baseInputs.monthlyRevenueGrowth, inputs.monthlyRevenueGrowth, (v) => formatPercent(v));
        }
        label = `Revenue growth +${Math.round(pts * 100)}pp`;
      }
      break;
    }
    case "simulate_fixed_cost": {
      const rate = Math.abs(action.params.changePercent) / 100;
      Object.assign(inputs, applyCostReductionScenario(inputs, { reductionRate: rate, target: "fixed" }));
      addChange("Fixed cost reduction", "0%", `${Math.round(rate * 100)}% from Month 2`);
      label = `${action.params.changePercent}% fixed costs`;
      break;
    }
    case "simulate_variable_cost": {
      const rate = Math.abs(action.params.changePercent) / 100;
      Object.assign(inputs, applyCostReductionScenario(inputs, { reductionRate: rate, target: "variable" }));
      addChange("Variable cost reduction", "0%", `${Math.round(rate * 100)}% from Month 2`);
      label = `${action.params.changePercent}% variable costs`;
      break;
    }
    case "simulate_margin": {
      if (action.params.targetMargin != null) {
        inputs.cogsPercent = Math.max(0, 1 - action.params.targetMargin - (Number(inputs.otherDirectCostsPercent) || 0));
        addChange("Gross margin target", formatPercent(1 - baseInputs.cogsPercent), formatPercent(action.params.targetMargin));
      } else if (action.params.pointsDelta != null) {
        inputs.cogsPercent = Math.max(0, Number(inputs.cogsPercent || 0) - action.params.pointsDelta);
        addChange("COGS %", formatPercent(baseInputs.cogsPercent), formatPercent(inputs.cogsPercent));
      }
      label = "Gross margin improvement";
      break;
    }
    case "simulate_marketing": {
      if (action.params.multiplier) {
        inputs.salesMarketingPercent = Number(inputs.salesMarketingPercent || 0) * action.params.multiplier;
        addChange("Sales & marketing %", formatPercent(baseInputs.salesMarketingPercent), formatPercent(inputs.salesMarketingPercent));
        label = `${action.params.multiplier}x marketing`;
      } else if (action.params.addAmount) {
        const m1Rev = Number(baseInputs.currentMonthlyRevenue) || 1;
        inputs.salesMarketingPercent = Number(inputs.salesMarketingPercent || 0) + action.params.addAmount / m1Rev;
        label = `Marketing +${formatMoney(action.params.addAmount, { currency: inputs.currency })}`;
      }
      break;
    }
    case "simulate_payroll": {
      inputs.monthlyPayroll = Number(inputs.monthlyPayroll || 0) + action.params.payrollAdd;
      addChange("Monthly payroll", formatMoney(baseInputs.monthlyPayroll, { currency: inputs.currency }), formatMoney(inputs.monthlyPayroll, { currency: inputs.currency }));
      label = `Payroll +${formatMoney(action.params.payrollAdd, { currency: inputs.currency })}`;
      break;
    }
    case "simulate_funding_delay": {
      const delay = action.params.delayMonths;
      inputs.equityEvents = (inputs.equityEvents || []).map((ev) => ({
        ...ev,
        monthIndex: Math.min(24, Number(ev.monthIndex || 1) + delay),
      }));
      inputs.debtEvents = (inputs.debtEvents || []).map((ev) => ({
        ...ev,
        monthIndex: Math.min(24, Number(ev.monthIndex || 1) + delay),
      }));
      addChange("Funding timing", "Base plan", `Delayed ${delay} months`);
      label = `Funding delayed ${delay} months`;
      break;
    }
    case "multi_simulate": {
      const p = action.params;
      if (p.revenueGrowthPoints != null) {
        if (inputs.revenueMode === "detailed") {
          inputs.monthlyVolumeGrowth = Number(inputs.monthlyVolumeGrowth || 0) + p.revenueGrowthPoints;
        } else {
          inputs.monthlyRevenueGrowth = Number(inputs.monthlyRevenueGrowth || 0) + p.revenueGrowthPoints;
        }
        addChange("Revenue growth", formatPercent(baseInputs.monthlyRevenueGrowth), formatPercent(inputs.monthlyRevenueGrowth));
      }
      if (p.fixedCostChangePercent != null) {
        const rate = Math.abs(p.fixedCostChangePercent) / 100;
        Object.assign(inputs, applyCostReductionScenario(inputs, { reductionRate: rate, target: "fixed" }));
        addChange("Fixed costs", "Base", `${p.fixedCostChangePercent}% from Month 2`);
      }
      if (p.marginPointsDelta != null) {
        inputs.cogsPercent = Math.max(0, Number(inputs.cogsPercent || 0) - p.marginPointsDelta);
        addChange("COGS %", formatPercent(baseInputs.cogsPercent), formatPercent(inputs.cogsPercent));
      }
      label = "Multi-variable scenario";
      break;
    }
    default:
      break;
  }

  changes.push({ label: "Everything else", base: "Unchanged", scenario: "Unchanged" });
  return { scenarioInputs: inputs, assumptionChanges: changes, label };
}

function searchCostReduction(baseInputs, targetMonths, target) {
  for (let pct = 0.05; pct <= 0.8; pct += 0.01) {
    const scenarioInputs = scaleOperatingCosts(cloneInputs(baseInputs), { reductionRate: pct, target });
    const runway = runwayOf(scenarioInputs);
    if (runway != null && runway >= targetMonths) {
      return {
        changePercent: -pct,
        runway,
        scenarioInputs,
        assumptionChanges: [
          {
            label: `${target === "fixed" ? "Fixed" : "Variable"} cost reduction`,
            base: "0%",
            scenario: `-${Math.round(pct * 100)}% (base run-rate)`,
          },
        ],
        observation: `Reducing ${target} costs by ~${Math.round(pct * 100)}% extends runway to approximately ${formatMonths(runway)}.`,
      };
    }
  }
  return null;
}

/**
 * Permanently scale base operating cost inputs (affects Month 1+), so CFO headline
 * runway (M1 ending cash ÷ near-term burn) can respond to goal-seek levers.
 */
function scaleOperatingCosts(inputs, { reductionRate, target = "variable" }) {
  const keep = 1 - Number(reductionRate || 0);
  if (target === "fixed") {
    inputs.monthlyPayroll = Math.max(0, Number(inputs.monthlyPayroll || 0) * keep);
    inputs.otherFixedCosts = Math.max(0, Number(inputs.otherFixedCosts || 0) * keep);
  } else {
    inputs.salesMarketingPercent = Math.max(0, Number(inputs.salesMarketingPercent || 0) * keep);
    inputs.productTechPercent = Math.max(0, Number(inputs.productTechPercent || 0) * keep);
  }
  return inputs;
}

function searchRevenueGrowth(baseInputs, targetMonths) {
  for (let pts = 0.01; pts <= 0.5; pts += 0.01) {
    const scenarioInputs = applyRevenueGrowthScenario(cloneInputs(baseInputs), {
      additionalPoints: pts,
      baseGrowth:
        baseInputs.revenueMode === "detailed"
          ? Number(baseInputs.monthlyVolumeGrowth) || 0
          : Number(baseInputs.monthlyRevenueGrowth) || 0,
    });
    const runway = runwayOf(scenarioInputs);
    if (runway != null && runway >= targetMonths) {
      return {
        scenarioInputs,
        runway,
        assumptionChanges: [
          {
            label: "Revenue growth",
            base: formatPercent(baseInputs.monthlyRevenueGrowth),
            scenario: `+${Math.round(pts * 100)}pp`,
          },
        ],
        observation: `Adding ~${Math.round(pts * 100)} percentage points to monthly revenue growth reaches ~${formatMonths(runway)} runway.`,
      };
    }
  }
  return null;
}

function searchMarginImprovement(baseInputs, targetMonths) {
  for (let gm = (1 - Number(baseInputs.cogsPercent || 0)) + 0.01; gm <= 0.95; gm += 0.01) {
    const next = cloneInputs(baseInputs);
    next.cogsPercent = Math.max(0, 1 - gm - (Number(next.otherDirectCostsPercent) || 0));
    const runway = runwayOf(next);
    if (runway != null && runway >= targetMonths) {
      return {
        targetMargin: gm,
        runway,
        scenarioInputs: next,
      };
    }
  }
  return null;
}

function searchCombinedPlan(baseInputs, targetMonths) {
  for (const rev of [0.02, 0.05]) {
    for (const fixed of [0.1, 0.15]) {
      for (const margin of [0.02, 0.03]) {
        let next = cloneInputs(baseInputs);
        if (next.revenueMode === "detailed") {
          next.monthlyVolumeGrowth = Number(next.monthlyVolumeGrowth || 0) + rev;
        } else {
          next.monthlyRevenueGrowth = Number(next.monthlyRevenueGrowth || 0) + rev;
        }
        next = scaleOperatingCosts(next, { reductionRate: fixed, target: "fixed" });
        next.cogsPercent = Math.max(0, Number(next.cogsPercent || 0) - margin);
        const runway = runwayOf(next);
        if (runway != null && runway >= targetMonths) {
          return {
            runway,
            scenarioInputs: next,
            detail: `Revenue growth +${Math.round(rev * 100)}pp, fixed costs -${Math.round(fixed * 100)}%, margin +${Math.round(margin * 100)}pp`,
          };
        }
      }
    }
  }
  return null;
}

function searchRevenueGrowthForEbitda(baseInputs) {
  for (let pts = 0.01; pts <= 0.5; pts += 0.01) {
    const scenarioInputs = applyRevenueGrowthScenario(cloneInputs(baseInputs), {
      additionalPoints: pts,
      baseGrowth:
        baseInputs.revenueMode === "detailed"
          ? Number(baseInputs.monthlyVolumeGrowth) || 0
          : Number(baseInputs.monthlyRevenueGrowth) || 0,
    });
    const months = calculateProjection(scenarioInputs);
    const positiveMonth = months.find((m) => m.ebitda > 0);
    if (positiveMonth) {
      return {
        scenarioInputs,
        positiveMonthIndex: positiveMonth.monthIndex,
        assumptionChanges: [
          {
            label: "Revenue growth",
            base: formatPercent(baseInputs.monthlyRevenueGrowth),
            scenario: `+${Math.round(pts * 100)}pp`,
          },
        ],
        observation: `Adding ~${Math.round(pts * 100)} percentage points to monthly revenue growth reaches positive EBITDA by ${positiveMonth.monthLabel}.`,
      };
    }
  }
  return null;
}

function snapshotMetrics(sim) {
  const m1 = sim.months[0] || {};
  const kpis = sim.kpis || {};
  return {
    runwayMonths: kpis.runwayMonths,
    cashOutMonth: kpis.cashOutMonthLabel,
    monthlyNetBurn: kpis.burnMetrics?.monthlyNetBurnExcludingCapex ?? m1.netBurn,
    ebitda: m1.ebitda,
    openingCash: m1.openingCash ?? sim.inputs?.currentCashBalance,
  };
}

function runSim(inputs) {
  const data = cloneInputs(inputs);
  const months = calculateProjection(data);
  const kpis = withFundingAwareRunway(data, months, calculateKpis(months));
  return { inputs: data, months, kpis };
}

function runwayOf(inputs) {
  return runSim(inputs).kpis.runwayMonths;
}

function buildSimulationObservation(action, base, scenario, impact) {
  if (impact == null) return "Scenario calculated from the deterministic model.";
  if (impact > 0.05) {
    return `This change improves runway by ${formatMonths(impact).replace(" months", "")} months but may not fully close the funding gap on its own. Compare gross-margin and fixed-cost levers for combined impact.`;
  }
  if (impact < -0.05) {
    return `This change shortens runway by ${formatMonths(Math.abs(impact)).replace(" months", "")} months on the current model.`;
  }
  return "This change does not materially shift projected runway on the current model.";
}

function buildFollowUps(actionType, sim, action) {
  const ctx = buildModelContext(sim);
  const rw = ctx.runwayMonths;
  const followUps = [];
  if (actionType === "explain_runway" || actionType === "explain_burn") {
    followUps.push("What would it take to reach 12 months runway?");
    followUps.push("What if fixed costs fall 10%?");
    followUps.push(`What if revenue growth reaches ${Math.round((ctx.revenueGrowth || 0) * 100 + 3)}%?`);
  } else if (actionType === "simulate_fixed_cost") {
    followUps.push("Which fixed cost should I reduce first?");
    followUps.push("What if revenue growth reaches 8% too?");
    followUps.push("Find the least disruptive path to 12 months runway.");
  } else if (actionType === "evaluate_hiring" || action?.type === "simulate_payroll") {
    followUps.push("What if I hire them over 6 months?");
    followUps.push("How many engineers can I afford while keeping 6 months runway?");
  } else if (actionType === "find_path_runway" || actionType === "goal_seek_runway") {
    followUps.push("Show the combined plan on the chart.");
    followUps.push("What if fundraising arrives one month earlier?");
  } else {
    followUps.push("Why is my runway only this long?");
    followUps.push("What if I reduce fixed costs by 10%?");
  }
  void rw;
  return followUps.slice(0, 3);
}

function parseMultiVariable(lower) {
  const revMatch = lower.match(/revenue growth.*?(\d+(?:\.\d+)?)\s*%/);
  const fixedMatch = lower.match(/fixed cost.*?(\d+(?:\.\d+)?)\s*%/);
  const marginMatch = lower.match(/gross margin.*?(\d+(?:\.\d+)?)\s*(?:pp|points|%)/);
  if (!revMatch && !fixedMatch && !marginMatch) return null;
  if (!(revMatch && fixedMatch) && !marginMatch) return null;
  return {
    revenueGrowthPoints: revMatch ? Number(revMatch[1]) / 100 : undefined,
    fixedCostChangePercent: fixedMatch ? -Number(fixedMatch[1]) : undefined,
    marginPointsDelta: marginMatch ? Number(marginMatch[1]) / 100 : undefined,
  };
}

function parseAndRunFromClarify(action, base) {
  if (action.id === "revenue") {
    return runAiCfoAction({ type: "simulate_revenue", params: { levelPercent: 5 } }, base);
  }
  if (action.id === "fixed") {
    return runAiCfoAction({ type: "simulate_fixed_cost", params: { changePercent: -10 } }, base);
  }
  if (action.id === "marketing") {
    return runAiCfoAction({ type: "simulate_marketing", params: { multiplier: 1.5 } }, base);
  }
  return { type: "clarify", clarify: { message: action.message, options: [] }, followUps: [] };
}

function extractTargetMonths(lower) {
  const m = lower.match(/(\d+(?:\.\d+)?)\s*months?\s*(?:runway|of runway)?/);
  if (m) return Number(m[1]);
  if (/twelve|12 month/.test(lower)) return 12;
  if (/eighteen|18 month/.test(lower)) return 18;
  if (/six|6 month/.test(lower)) return 6;
  return null;
}

function extractNumberBefore(lower, word) {
  const re = new RegExp(`(\\d+)\\s*${word}`);
  const m = lower.match(re);
  return m ? Number(m[1]) : null;
}

function extractCostPerHead(lower) {
  const m = lower.match(/(?:₹|rs\.?|\$)?\s*([\d,.]+)\s*(?:lakh|lac|k|per|\/)/i);
  if (m) return parseAmount(m[0]);
  return null;
}

function matchPercentChange(lower, contextRe) {
  if (!contextRe.test(lower)) return null;
  return extractFirstPercent(lower);
}

function extractFirstPercent(lower) {
  const m = lower.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

function parseAmount(text) {
  const s = String(text).toLowerCase().replace(/[,₹rs.\s]/g, "");
  const lakh = s.match(/([\d.]+)l(?:akh|ac)/);
  if (lakh) return Number(lakh[1]) * 100_000;
  const k = s.match(/([\d.]+)k/);
  if (k) return Number(k[1]) * 1_000;
  const cr = s.match(/([\d.]+)cr/);
  if (cr) return Number(cr[1]) * 10_000_000;
  const num = s.match(/([\d.]+)/);
  return num ? Number(num[1]) : null;
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

/** High-level entry: question → structured AI CFO response */
export function askAiCfo(question, baseSim, options = {}) {
  const action = parseAiCfoQuestion(question, options);
  const response = runAiCfoAction(action, baseSim);
  response.question = response.question || question;
  return response;
}
