import {
  buildCashFlowLegendAssumptions,
  buildCostContribution,
  buildOperatingLeverageStats,
  buildGrossMarginBenchmark,
} from "./cashMovementInsight.js";
import {
  summarizePlannedFunding,
  buildFundingDependencyInsight,
} from "./plannedFunding.js";
import { computeContextVersion, FINANCIAL_ENGINE_VERSION } from "./contextVersion.js";
import { buildDeterministicSignals } from "./deterministicSignals.js";
import {
  buildCandidateActions,
  runCandidatePipeline,
} from "./candidateActionEngine.js";

/**
 * Build canonical FinancialIntelligenceContext from a successful simulation.
 * @param {{ ok: true, inputs: object, months: object[], kpis: object }} sim
 * @param {{ includeSimulations?: boolean; calculatedAt?: string }} [options]
 */
export function buildFinancialIntelligenceContext(sim, options = {}) {
  const { inputs, months, kpis } = sim;
  const month1 = months[0] || {};
  const m6 = months[5];
  const m12 = months[11];
  const m24 = months[months.length - 1];
  const contextVersion = computeContextVersion(inputs);
  const calculatedAt = options.calculatedAt || new Date().toISOString();

  const plannedFunding = summarizePlannedFunding(inputs);
  const hasFunding = plannedFunding.hasFutureFunding;
  const primaryRunwayMonths = hasFunding
    ? kpis.runwayAfterPlannedFundingMonths ?? kpis.projectedRunwayMonths
    : kpis.headlineRunwayMonths ?? kpis.runwayMonths;
  const primaryRunwayLabel = hasFunding ? "after_planned_funding" : "projected";

  const costContribution = buildCostContribution(month1);
  const largestCat = [...costContribution.categories].sort(
    (a, b) => b.shareOfRevenue - a.shareOfRevenue,
  )[0];

  const expenseMix = kpis.expenseMix || {};
  const benchmarkRaw = buildGrossMarginBenchmark(sim, month1);
  const operatingLeverage = buildOperatingLeverageStats(months);

  const cfoFunding = kpis.cfoFundingRunway || null;
  const capexComparison = kpis.capexComparison || {};

  /** @type {object} */
  const partial = {
    meta: {
      contextVersion,
      engineVersion: FINANCIAL_ENGINE_VERSION,
      calculatedAt,
      currency: inputs.currency,
    },
    businessContext: {
      companyName: inputs.companyName || undefined,
      industry: inputs.industry,
      businessModel: inputs.businessModel,
      startupStage: inputs.startupStage,
      mainPriority: inputs.mainPriority,
      forecastStartMonth: inputs.forecastStartMonth,
      revenueMode: inputs.revenueMode,
    },
    assumptions: pickAssumptions(inputs),
    currentPerformance: {
      revenue: kpis.financialPerformance?.revenue ?? month1.revenue ?? 0,
      grossProfit: kpis.financialPerformance?.grossProfit ?? month1.grossProfit ?? 0,
      grossMarginPercent: kpis.financialPerformance?.grossMarginPercent ?? month1.grossMargin ?? 0,
      cm1: kpis.financialPerformance?.cm1 ?? month1.cm1 ?? 0,
      cm1MarginPercent: kpis.financialPerformance?.cm1MarginPercent ?? month1.cm1Margin ?? 0,
      cm2: month1.cm2 ?? 0,
      cm2MarginPercent: month1.cm2Margin ?? 0,
      ebitda: kpis.financialPerformance?.ebitda ?? month1.ebitda ?? 0,
      ebitdaMarginPercent: kpis.financialPerformance?.ebitdaMarginPercent ?? month1.ebitdaMargin ?? 0,
    },
    burnAndCash: {
      grossBurn: kpis.burnMetrics?.monthlyGrossBurn ?? month1.grossBurn ?? 0,
      netBurnExclCapex: kpis.burnMetrics?.monthlyNetBurnExcludingCapex ?? month1.netBurn ?? 0,
      netBurnInclCapex: kpis.burnMetrics?.monthlyNetBurnIncludingCapex ?? month1.netBurnIncludingCapex ?? 0,
      month1ClosingCash: month1.closingCash ?? 0,
      month1OpeningCash: month1.openingCash ?? inputs.currentCashBalance ?? 0,
    },
    runway: {
      primaryRunwayMonths,
      primaryRunwayLabel,
      headlineRunwayMonths: kpis.headlineRunwayMonths ?? kpis.runwayMonths,
      runwayBeforePlannedFundingMonths: kpis.runwayBeforePlannedFundingMonths ?? null,
      runwayAfterPlannedFundingMonths: kpis.runwayAfterPlannedFundingMonths ?? null,
      cashSeriesRunwayMonths: kpis.cashSeriesRunwayMonths ?? null,
      cashOutMonthLabel: kpis.cashOutMonthLabel,
      cashOutMonthIndex: kpis.cashOutMonthIndex ?? null,
      cashOutBeforeFunding: cfoFunding?.runwayBeforeFunding?.cashOutMonthLabel ?? null,
      cashOutWithFunding: cfoFunding?.runwayAfterFunding?.cashOutMonthLabel ?? null,
      healthStatus: kpis.healthStatus,
      healthStatusBeforePlannedFunding: kpis.healthStatusBeforePlannedFunding ?? null,
      healthStatusAfterPlannedFunding: kpis.healthStatusAfterPlannedFunding ?? null,
      fundingRunwayImpactMonths: kpis.fundingRunwayImpactMonths ?? null,
    },
    costStructure: {
      legendAssumptions: buildCashFlowLegendAssumptions(inputs, inputs.currency),
      expenseMix,
      costContribution,
      largestDriver: largestCat
        ? {
            key: largestCat.key,
            label: largestCat.label,
            shareOfRevenue: largestCat.shareOfRevenue,
            amount: largestCat.amount,
          }
        : null,
    },
    funding: {
      plannedFunding,
      fundingDependencyInsight: buildFundingDependencyInsight(
        {
          projectedRunwayMonths: kpis.projectedRunwayMonths ?? kpis.runwayMonths,
          runwayAfterPlannedFundingMonths: kpis.runwayAfterPlannedFundingMonths,
          runwayBeforePlannedFundingMonths: kpis.runwayBeforePlannedFundingMonths,
          fundingRunwayImpactMonths: kpis.fundingRunwayImpactMonths,
          plannedFunding,
        },
        inputs.currency,
      ),
      cfoFundingRunway: cfoFunding,
    },
    capex: {
      events: (inputs.capexEvents || []).filter((e) => Number(e?.amount) > 0),
      cumulativeMonth1: month1.capex ?? 0,
      cumulativeHorizon: capexComparison.cumulativeCapex ?? m24?.cumulativeCapex ?? 0,
      capexComparison,
    },
    trends: buildTrends(months, month1, m6, m12, m24),
    benchmarks: {
      available: benchmarkRaw.available ?? false,
      industry: benchmarkRaw.industry,
      grossMarginBenchmark: benchmarkRaw.available ? benchmarkRaw : null,
      onTarget: benchmarkRaw.onTarget ?? null,
      message: benchmarkRaw.message || benchmarkRaw.status || null,
    },
    costMix: kpis.costMix,
    months,
    operatingLeverage,
    deterministicSignals: [],
    candidateActions: [],
    simulationResults: [],
  };

  partial.deterministicSignals = buildDeterministicSignals(partial);
  partial.candidateActions = buildCandidateActions(partial);

  if (options.includeSimulations) {
    const pipeline = runCandidatePipeline(sim, partial);
    partial.simulationResults = pipeline.shortlist;
    partial._candidatePipeline = {
      allResultsCount: pipeline.allResults.length,
      scoredCount: pipeline.scored.length,
      shortlistCount: pipeline.shortlist.length,
    };
  }

  return partial;
}

/**
 * Legacy assessment payload for /api/runway-insight — uses canonical runway fields.
 * @param {ReturnType<typeof buildFinancialIntelligenceContext>} context
 */
export function buildLegacyAssessmentPayload(context) {
  const runway = context.runway || {};
  const perf = context.currentPerformance || {};
  const burn = context.burnAndCash || {};
  const expenseMix = context.costStructure?.expenseMix || {};
  const costMix = {
    payrollPercentOfExpenses: Math.round((context.costMix?.payrollPercentOfExpenses ?? 0) * 100),
    marketingPercentOfExpenses: Math.round((context.costMix?.marketingPercentOfExpenses ?? 0) * 100),
    technologyPercentOfExpenses: Math.round((context.costMix?.technologyPercentOfExpenses ?? 0) * 100),
  };

  const growthField =
    context.assumptions?.revenueMode === "simple"
      ? context.assumptions.monthlyRevenueGrowth
      : context.assumptions?.monthlyVolumeGrowth;

  return {
    contextVersion: context.meta?.contextVersion,
    businessContext: context.businessContext,
    metrics: {
      runwayMonths: runway.primaryRunwayMonths,
      headlineRunwayMonths: runway.headlineRunwayMonths,
      runwayBeforePlannedFundingMonths: runway.runwayBeforePlannedFundingMonths,
      runwayAfterPlannedFundingMonths: runway.runwayAfterPlannedFundingMonths,
      cashSeriesRunwayMonths: runway.cashSeriesRunwayMonths,
      fundingRunwayImpactMonths: runway.fundingRunwayImpactMonths,
      cashOutMonth: runway.cashOutMonthLabel,
      monthlyNetBurn: Math.round(burn.netBurnExclCapex),
      monthlyGrossBurn: Math.round(burn.grossBurn),
      avgMonthlyNetBurn: Math.round(context.trends?.avgMonthlyNetBurn ?? burn.netBurnExclCapex),
      avgMonthlyGrossBurn: Math.round(burn.grossBurn),
      grossMarginPercent: Math.round(perf.grossMarginPercent * 1000) / 10,
      monthlyRevenueGrowthPercent: Math.round((growthField ?? 0) * 1000) / 10,
      ebitda: Math.round(perf.ebitda),
      sixMonthClosingCash: context.trends?.closingCash?.m6,
      twelveMonthClosingCash: context.trends?.closingCash?.m12,
      healthStatus: runway.healthStatus,
      healthStatusBeforePlannedFunding: runway.healthStatusBeforePlannedFunding,
      healthStatusAfterPlannedFunding: runway.healthStatusAfterPlannedFunding,
    },
    financialPerformance: {
      revenue: Math.round(perf.revenue),
      grossProfit: Math.round(perf.grossProfit),
      grossMarginPercent: Math.round(perf.grossMarginPercent * 1000) / 10,
      cm1: Math.round(perf.cm1),
      cm1MarginPercent: Math.round(perf.cm1MarginPercent * 1000) / 10,
      ebitda: Math.round(perf.ebitda),
      ebitdaMarginPercent: Math.round(perf.ebitdaMarginPercent * 1000) / 10,
    },
    burnMetrics: {
      monthlyNetBurnExcludingCapex: Math.round(burn.netBurnExclCapex),
      monthlyNetBurnIncludingCapex: Math.round(burn.netBurnInclCapex),
      monthlyGrossBurn: Math.round(burn.grossBurn),
    },
    costMix,
    expenseMix: {
      period: "month1",
      variableExpenses: Math.round(expenseMix.variableExpenses ?? 0),
      fixedExpenses: Math.round(expenseMix.fixedExpenses ?? 0),
      variableSharePercent: Math.round((expenseMix.variableSharePercent ?? 0) * 1000) / 10,
      fixedSharePercent: Math.round((expenseMix.fixedSharePercent ?? 0) * 1000) / 10,
      largestExpenseCategoryKey: expenseMix.largestExpenseCategoryKey,
      largestExpenseCategoryLabel:
        expenseMix.largestExpenseCategoryLabel ?? expenseMix.largestExpenseCategory,
      largestExpenseCategory:
        expenseMix.largestExpenseCategoryLabel ?? expenseMix.largestExpenseCategory,
      largestExpenseCategoryAmount: Math.round(expenseMix.largestExpenseCategoryAmount || 0),
    },
    currency: context.meta?.currency,
    deterministicSignals: context.deterministicSignals?.map((s) => ({ id: s.id, severity: s.severity, title: s.title })),
  };
}

/**
 * @param {object} inputs
 */
function pickAssumptions(inputs) {
  return {
    openingCash: inputs.currentCashBalance,
    revenueMode: inputs.revenueMode,
    currentMonthlyRevenue: inputs.currentMonthlyRevenue,
    monthlyRevenueGrowth: inputs.monthlyRevenueGrowth,
    currentVolume: inputs.currentVolume,
    monthlyVolumeGrowth: inputs.monthlyVolumeGrowth,
    averageOrderValue: inputs.averageOrderValue,
    monthlyAovGrowth: inputs.monthlyAovGrowth,
    cogsPercent: inputs.cogsPercent,
    otherDirectCostsPercent: inputs.otherDirectCostsPercent,
    productTechPercent: inputs.productTechPercent,
    salesMarketingPercent: inputs.salesMarketingPercent,
    monthlyPayroll: inputs.monthlyPayroll,
    payrollGrowth: inputs.payrollGrowth,
    otherFixedCosts: inputs.otherFixedCosts,
    otherFixedGrowth: inputs.otherFixedGrowth,
    capexEvents: inputs.capexEvents,
    equityEvents: inputs.equityEvents,
    debtEvents: inputs.debtEvents,
  };
}

function buildTrends(months, m1, m6, m12, m24) {
  const firstPositive = months.find((m) => (m.ebitda ?? 0) > 0);
  const closingValues = months.map((m) => m.closingCash ?? 0);
  const minClosing = Math.min(...closingValues);
  const minMonth = months.find((m) => m.closingCash === minClosing);

  const avgNetBurn =
    months.reduce((s, m) => s + Math.max(m.netBurn ?? 0, 0), 0) / (months.length || 1);

  const revM1 = m1?.revenue ?? 0;
  const revM24 = m24?.revenue ?? 0;
  const cagrApprox =
    revM1 > 0 && revM24 > 0 && months.length >= 24
      ? Math.pow(revM24 / revM1, 1 / 23) - 1
      : null;

  return {
    avgMonthlyNetBurn: avgNetBurn,
    revenue: {
      m1: m1?.revenue ?? 0,
      m6: m6?.revenue ?? 0,
      m12: m12?.revenue ?? 0,
      m24: m24?.revenue ?? 0,
      cagrApprox,
    },
    totalOperatingExpenses: {
      m1: m1?.totalOperatingExpenses ?? 0,
      m12: m12?.totalOperatingExpenses ?? 0,
      m24: m24?.totalOperatingExpenses ?? 0,
    },
    ebitda: {
      m1: m1?.ebitda ?? 0,
      m12: m12?.ebitda ?? 0,
      m24: m24?.ebitda ?? 0,
      firstPositiveMonth: firstPositive?.monthIndex ?? null,
    },
    closingCash: {
      m1: m1?.closingCash ?? 0,
      m6: m6?.closingCash ?? 0,
      m12: m12?.closingCash ?? 0,
      m24: m24?.closingCash ?? 0,
      minimum: minClosing,
      minimumMonth: minMonth?.monthLabel ?? null,
    },
  };
}
