/**
 * Deterministic Investigation Planner — Stage 5B.
 * Builds investigation plans from Financial Insight Objects + verified metrics.
 * Does not invent business causes or financial figures.
 */
import { formatMonthLabel } from "./askPresentation.js";
import { decomposeSalesOrdersAov, primaryDriverLabel } from "./decomposition.js";
import { findInsight } from "./financialIntelligence.js";
import { INVESTIGATION_ITEM_STATUS, INSIGHT_TYPES } from "./insightSchema.js";
import {
  buildFactStore,
  factsForWire,
  measureBulkOrdersByMonth,
} from "./investigationFacts.js";
import { connectionToStatus, humanReconGap } from "./investigationLabels.js";
import { formatInr, formatPct } from "./money.js";
import { founderComparisonNote } from "./periodCoverage.js";

export const INVESTIGATION_PLAN_VERSION = 1;

const FAMILY_BY_TYPE = Object.freeze({
  [INSIGHT_TYPES.REVENUE_MOVEMENT]: "revenue_decline",
  [INSIGHT_TYPES.ORDERS_VS_AOV]: "orders_vs_aov",
  [INSIGHT_TYPES.ORDER_VALUE_SKEW]: "large_order_dependence",
  [INSIGHT_TYPES.PRODUCT_CONCENTRATION]: "product_movement",
  [INSIGHT_TYPES.FEE_BURDEN]: "fee_burden",
  [INSIGHT_TYPES.REFUNDS_RECON_GAPS]: "reconciliation_exceptions",
});

function monthLabel(ym) {
  return formatMonthLabel(ym) || ym || "";
}

function relatedInsights(intelligence, selected) {
  const all = intelligence?.insights || [];
  if (!selected) return [];
  return all
    .filter((row) => row.id !== selected.id)
    .filter((row) => {
      if (row.groupKey && row.groupKey === selected.groupKey) return true;
      const sharedCharts = (row.links?.chartIds || []).some((id) =>
        (selected.links?.chartIds || []).includes(id),
      );
      const sharedSections = (row.links?.sectionIds || []).some((id) =>
        (selected.links?.sectionIds || []).includes(id),
      );
      if (selected.type === INSIGHT_TYPES.REVENUE_MOVEMENT) {
        return (
          row.type === INSIGHT_TYPES.ORDERS_VS_AOV ||
          row.type === INSIGHT_TYPES.ORDER_VALUE_SKEW ||
          row.type === INSIGHT_TYPES.PRODUCT_CONCENTRATION ||
          sharedCharts
        );
      }
      return sharedCharts || sharedSections || row.type === selected.type;
    })
    .slice(0, 6);
}

function parseMomMonths(insight) {
  const match = String(insight?.id || "").match(/revenue_mom_(\d{4}-\d{2})_(\d{4}-\d{2})/);
  if (match) return { priorMonth: match[1], currentMonth: match[2] };
  const months = String(insight?.period?.label || "").match(/(\w+ \d{4}).*?(\w+ \d{4})/);
  return { priorMonth: null, currentMonth: null, labelHint: months };
}

/**
 * Missing evidence scoped to the investigation family — not full-report limitations.
 */
function missingDataForFamily(family, insight, metrics, reconciliation) {
  const missing = [];
  const push = (id, label, relevance) => {
    if (missing.some((row) => row.id === id)) return;
    missing.push({
      id,
      label,
      relevance: relevance || family,
      status: INVESTIGATION_ITEM_STATUS.MISSING_EVIDENCE,
    });
  };

  const isRevenueFamily =
    family === "revenue_decline" || family === "orders_vs_aov" || family === "large_order_dependence";
  const isProduct = family === "product_movement";
  const isFee = family === "fee_burden";
  const isRecon = family === "reconciliation_exceptions";
  const isProfit = family === "profitability" || insight?.links?.sectionIds?.includes("profitability");
  const isCash =
    family === "cash_realization" || insight?.links?.sectionIds?.includes("profitability");

  if (isRevenueFamily || isProduct) {
    if (insight?.provisional || insight?.confidenceFacets?.coverage === "incomplete") {
      push(
        "period_coverage",
        founderComparisonNote({
          status: insight.comparisonStatus,
          provisional: insight.provisional,
        }) ||
          "Comparable full-month windows are not available for this movement — widen or clear the date filter to re-check.",
        "period",
      );
    }
    push(
      "product_level_moves",
      "Product-level sales changes beyond the top tracked SKUs are not fully listed here.",
      "products",
    );
    push(
      "order_distribution",
      "Full order-value distribution by month is not exported — only calculated bulk candidates and overall skew.",
      "orders",
    );
    push(
      "inventory_availability",
      "Inventory availability is not in these Amazon exports.",
      "operations",
    );
    push(
      "pricing_promo_history",
      "Pricing and promotion history are not in these exports.",
      "commercial",
    );
  }

  if (isFee || isProfit) {
    if (metrics?.kpis?.productProfit == null) {
      push(
        "missing_cogs",
        "Product costs (COGS) are unavailable, so product profit cannot be calculated.",
        "profitability",
      );
    }
    push(
      "ad_allocation",
      "Advertising spend is not allocated to individual products in this export.",
      "profitability",
    );
    if (
      metrics?.kpis?.referralFeesAvailable === false ||
      metrics?.sections?.amazon_economics?.referralFees == null
    ) {
      push(
        "missing_referral_split",
        "Product-level marketplace referral fees are not split out in this Amazon export.",
        "fees",
      );
    }
  }

  if (isRecon || isCash) {
    const preferCash = isCash && !isRecon;
    const cashIds = new Set([
      "bank_transfers",
      "settlement_vs_transfers",
      "opening_balance",
      "closing_balance",
      "gst",
      "net_gst",
    ]);
    for (const row of reconciliation?.comparisons || []) {
      const relevant =
        !preferCash ||
        cashIds.has(row.id) ||
        row.status === "difference" ||
        row.status === "missing_information" ||
        row.status === "not_comparable";
      if (
        relevant &&
        (row.status === "missing_information" ||
          row.status === "not_comparable" ||
          row.status === "difference")
      ) {
        if (preferCash && !cashIds.has(row.id) && row.id !== "product_sales") continue;
        push(`recon_${row.id}`, humanReconGap(row), isRecon ? "reconciliation" : "cash");
      }
    }
  }

  // Revenue investigations do not surface cash/GST gaps.
  return missing.slice(0, 6);
}

/**
 * Connect revenue decline to large-order dependence only with period-specific evidence.
 */
function connectRevenueToLargeOrders({ insight, related, metrics, decomp }) {
  const skew = related.find((row) => row.type === INSIGHT_TYPES.ORDER_VALUE_SKEW);
  const { priorMonth, currentMonth } = parseMomMonths(insight);
  const connections = [];

  if (!skew) {
    return connections;
  }

  // Overall skew is a background fact — not a period-specific large-order test.
  connections.push({
    id: "skew_overall_related",
    relatedInsightId: skew.id,
    strength: "related_observation",
    assertion: "verified_level",
    text: `Background fact (overall filter): large orders represent ${formatPct(
      metrics?.kpis?.salesShareAbove2xMedian,
    )} of Gross Product Sales. This is not a period-specific check of whether large-order activity changed between ${
      priorMonth ? monthLabel(priorMonth) : "the prior month"
    } and ${currentMonth ? monthLabel(currentMonth) : "the later month"}.`,
    factIds: ["kpi.sales_share_above_2x_median", "kpi.sales_above_2x_median"],
    requiresFurtherAnalysis: true,
    suggestedQuestion:
      "Did bulk or large-ticket order frequency change between the two months in this decline?",
  });

  if (priorMonth && currentMonth) {
    const bulk = measureBulkOrdersByMonth(metrics, priorMonth, currentMonth);
    if (bulk.available && (bulk.deltaSales != null || bulk.deltaOrders != null)) {
      const changed = bulk.deltaSales !== 0 || bulk.deltaOrders !== 0;
      connections.push({
        id: "bulk_orders_period_change",
        relatedInsightId: skew.id,
        strength: changed ? "period_measured" : "period_measured_no_change",
        assertion: "verified_period_bulk_change",
        text: changed
          ? `Bulk-order candidates moved from ${bulk.prior.orderCount} orders / ${formatInr(
              bulk.prior.sales,
            )} in ${bulk.prior.label} to ${bulk.current.orderCount} / ${formatInr(
              bulk.current.sales,
            )} in ${bulk.current.label} (Δ sales ${formatInr(
              bulk.deltaSales,
            )}). This is measured bulk-candidate activity — not proof that large orders caused the Gross AOV contribution of ${formatInr(
              decomp?.aovContribution,
            )}.`
          : `Bulk-order candidate counts/sales did not change between ${bulk.prior.label} and ${bulk.current.label} in the calculated bulk list. Large-order causation of the AOV move is not supported by this period check.`,
        factIds: [
          `month.${priorMonth}.sales`,
          `month.${currentMonth}.sales`,
          "kpi.sales_share_above_2x_median",
        ],
        measured: {
          prior: bulk.prior,
          current: bulk.current,
          deltaSales: bulk.deltaSales,
          deltaOrders: bulk.deltaOrders,
          thresholdNote: bulk.thresholdNote,
        },
        requiresFurtherAnalysis: true,
        suggestedQuestion:
          "Investigate whether basket-size mix (not only bulk candidates) shifted between the two months.",
      });
    } else {
      connections.push({
        id: "large_order_period_unknown",
        relatedInsightId: skew.id,
        strength: "insufficient_period_evidence",
        assertion: "question_only",
        text: `Period-specific large-order frequency for ${monthLabel(priorMonth)} → ${monthLabel(
          currentMonth,
        )} is not fully determined from available calculated series. Ask whether large-order activity changed before attributing the Gross AOV move to large tickets.`,
        factIds: ["kpi.sales_share_above_2x_median"],
        requiresFurtherAnalysis: true,
        suggestedQuestion:
          "Did large-order frequency or sales change between August and September?",
      });
    }
  }

  if (decomp?.comparable && primaryDriverLabel(decomp)?.id === "gross_aov") {
    connections.push({
      id: "aov_primary_driver",
      relatedInsightId: null,
      strength: "mathematical_driver",
      assertion: "verified_decomposition",
      text: `Gross AOV is the larger mathematical contributor to the sales movement under the symmetric Orders×AOV split (Orders ${formatInr(
        decomp.orderContribution,
      )}; Gross AOV ${formatInr(decomp.aovContribution)}).`,
      factIds: [
        "insight_order_contribution",
        "insight_aov_contribution",
      ],
      requiresFurtherAnalysis: false,
      suggestedQuestion: null,
    });
  }

  return connections;
}

function connectProductMovement(insight) {
  const connections = [];
  const incomplete = insight.confidenceFacets?.coverage === "incomplete";
  const zeroRecorded = /zero recorded sales/i.test(insight.headline || "");
  if (incomplete) {
    connections.push({
      id: "product_incomplete_coverage",
      strength: "qualified",
      assertion: "coverage_limitation",
      text: "One or both compared months are partial under the current filter — treat the product move as qualified, not a full-month demand verdict.",
      requiresFurtherAnalysis: true,
      suggestedQuestion: "Widen or clear the date filter and re-check this product’s monthly series.",
    });
  }
  if (zeroRecorded) {
    connections.push({
      id: "zero_sales_not_demand_proof",
      strength: "qualified",
      assertion: "not_confirmed_demand_decline",
      text: "Zero recorded Gross Product Sales in the later month is not confirmed product demand decline.",
      requiresFurtherAnalysis: true,
      suggestedQuestion: "Is the SKU missing rows due to stockouts, delisting, or incomplete coverage?",
    });
  }
  return connections;
}

function planQuestion(insight, family) {
  if (insight?.whatNext?.[0]?.question) return insight.whatNext[0].question;
  switch (family) {
    case "revenue_decline":
      return "What drove this Gross Product Sales movement — Orders or Gross AOV?";
    case "orders_vs_aov":
      return "How did Orders and Gross AOV each contribute to the sales change?";
    case "large_order_dependence":
      return "How much of Gross Product Sales sits in orders above 2× median?";
    case "product_movement":
      return "Which products moved most, and is coverage complete?";
    case "fee_burden":
      return "Where are marketplace fee drains concentrated?";
    case "reconciliation_exceptions":
      return "Which settlement reconciliation differences remain unresolved?";
    default:
      return insight?.headline || "Investigate this financial finding";
  }
}

function deterministicAnalyses(family, insight, metrics, decomp, bulk) {
  const analyses = [];
  if (family === "revenue_decline" || family === "orders_vs_aov") {
    analyses.push({
      id: "symmetric_orders_aov",
      label: "Symmetric Orders × Gross AOV decomposition",
      status: decomp?.comparable ? "available" : "unavailable",
      result: decomp?.comparable
        ? {
            deltaSales: decomp.deltaSales,
            orderContribution: decomp.orderContribution,
            aovContribution: decomp.aovContribution,
            primary: primaryDriverLabel(decomp)?.id || null,
          }
        : null,
    });
  }
  if (family === "large_order_dependence" || family === "revenue_decline") {
    analyses.push({
      id: "order_skew_2x_median",
      label: "Orders above 2× median (overall filter scope)",
      status: metrics?.kpis?.orderValues || metrics?.kpis?.ordersAbove2xMedian != null ? "available" : "unavailable",
      result: {
        ordersAbove2xMedian: metrics?.kpis?.ordersAbove2xMedian ?? null,
        salesAbove2xMedian: metrics?.kpis?.salesAbove2xMedian ?? null,
        salesShareAbove2xMedian: metrics?.kpis?.salesShareAbove2xMedian ?? null,
      },
    });
  }
  if (bulk?.available) {
    analyses.push({
      id: "bulk_orders_by_month",
      label: "Bulk-order candidates by month",
      status: "available",
      result: {
        prior: bulk.prior,
        current: bulk.current,
        deltaSales: bulk.deltaSales,
        deltaOrders: bulk.deltaOrders,
        note: bulk.thresholdNote,
      },
    });
  }
  if (family === "fee_burden") {
    analyses.push({
      id: "marketplace_fee_rate",
      label: "Marketplace fees ÷ Gross Product Sales",
      status: "available",
      result: {
        rate: metrics?.kpis?.effectiveMarketplaceDeductionRate ?? null,
        denominator: "gross_product_sales",
      },
    });
  }
  if (family === "reconciliation_exceptions") {
    analyses.push({
      id: "recon_differences",
      label: "Unresolved comparable reconciliation differences",
      status: "available",
      result: { insightId: insight?.id },
    });
  }
  if (family === "product_movement") {
    analyses.push({
      id: "product_monthly_delta",
      label: "Top-product monthly Gross Product Sales delta",
      status: insight ? "available" : "unavailable",
      result: { insightId: insight?.id, coverage: insight?.confidenceFacets?.coverage },
    });
  }
  return analyses;
}

/**
 * Build a deterministic investigation plan for a selected insight.
 * Immediate / local — does not call NVIDIA.
 */
export function planInvestigation({
  insightId = null,
  insight = null,
  metrics = null,
  reconciliation = null,
  sessionId = null,
} = {}) {
  const intelligence = metrics?.intelligence || null;
  const selected =
    insight ||
    (insightId ? findInsight(intelligence || metrics, insightId) : null) ||
    intelligence?.brief?.primary ||
    null;

  if (!selected || metrics?.status !== "calculated") {
    return {
      schemaVersion: INVESTIGATION_PLAN_VERSION,
      status: "unavailable",
      sessionId: sessionId || null,
      insightId: insightId || null,
      family: null,
      question: null,
      factStore: buildFactStore({ metrics, reconciliation, sessionId }),
      plan: null,
    };
  }

  const family =
    FAMILY_BY_TYPE[selected.type] ||
    (selected.id?.includes("recon") ? "reconciliation_exceptions" : "general");
  const related = relatedInsights(intelligence, selected);
  const { priorMonth, currentMonth } = parseMomMonths(selected);
  const monthly = metrics.sections?.topline?.monthly || [];
  const prior = priorMonth ? monthly.find((row) => row.month === priorMonth) : monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const current = currentMonth
    ? monthly.find((row) => row.month === currentMonth)
    : monthly.length >= 2
      ? monthly[monthly.length - 1]
      : null;
  const decomp =
    prior && current ? decomposeSalesOrdersAov(prior, current) : null;
  const bulk =
    priorMonth && currentMonth
      ? measureBulkOrdersByMonth(metrics, priorMonth, currentMonth)
      : prior && current
        ? measureBulkOrdersByMonth(metrics, prior.month, current.month)
        : { available: false };

  const factStore = buildFactStore({
    metrics,
    reconciliation,
    insight: selected,
    sessionId,
  });

  // Attach contribution facts with stable ids for wire refs
  if (decomp?.comparable) {
    factStore.facts.push({
      factId: "decomp.order_contribution",
      label: "Orders contribution (symmetric)",
      value: decomp.orderContribution,
      kind: "inr",
      source: "decomposition",
      period: current?.month || null,
    });
    factStore.facts.push({
      factId: "decomp.aov_contribution",
      label: "Gross AOV contribution (symmetric)",
      value: decomp.aovContribution,
      kind: "inr",
      source: "decomposition",
      period: current?.month || null,
    });
    factStore.facts.push({
      factId: "decomp.delta_sales",
      label: "Δ Gross Product Sales",
      value: decomp.deltaSales,
      kind: "inr",
      source: "decomposition",
      period: current?.month || null,
    });
    factStore.byId = Object.fromEntries(factStore.facts.map((f) => [f.factId, f]));
  }

  let connections = [];
  if (family === "revenue_decline" || family === "orders_vs_aov") {
    connections = connectRevenueToLargeOrders({
      insight: selected,
      related,
      metrics,
      decomp,
    });
    const productMove = related.find(
      (row) => row.type === INSIGHT_TYPES.PRODUCT_CONCENTRATION && row.isRecentChange,
    );
    if (productMove) {
      connections.push({
        id: "related_product_move",
        relatedInsightId: productMove.id,
        strength: "related_observation",
        assertion: "verified_related_insight",
        text: `Related product finding: ${productMove.headline}. Product mix may accompany the topline move — not proven as the sole driver.`,
        requiresFurtherAnalysis: true,
        suggestedQuestion: productMove.whatNext?.[0]?.question || "Which products contributed most to the change?",
      });
    }
  } else if (family === "product_movement" || selected.type === INSIGHT_TYPES.PRODUCT_CONCENTRATION) {
    connections = connectProductMovement(selected);
  } else if (family === "reconciliation_exceptions") {
    connections.push({
      id: "recon_unresolved",
      strength: "verified_exception",
      assertion: "unresolved_difference",
      text: selected.what,
      requiresFurtherAnalysis: true,
      suggestedQuestion: "Why are sales and settlement proceeds different?",
    });
  } else if (family === "fee_burden") {
    connections.push({
      id: "fee_rate_scope",
      strength: "verified_level",
      assertion: "fee_denominator_gross",
      text: "Marketplace deduction rate uses Gross Product Sales as denominator; promotional rebates and customer product refunds are excluded from the fee rate.",
      requiresFurtherAnalysis: false,
      suggestedQuestion: null,
    });
  } else if (family === "large_order_dependence") {
    connections.push({
      id: "skew_level_checked",
      strength: "verified_level",
      assertion: "verified_level",
      text: selected.what || selected.summary,
      requiresFurtherAnalysis: true,
      suggestedQuestion: "Did large-order frequency change between the months in the latest sales move?",
    });
  }

  if (selected.provisional || selected.comparisonStatus === "incompatible") {
    connections.unshift({
      id: "period_coverage_checked",
      strength: "qualified",
      assertion: "coverage_limitation",
      text:
        founderComparisonNote({
          status: selected.comparisonStatus,
          provisional: selected.provisional,
        }) ||
        "Period coverage was checked — this movement is provisional because the months are not fully comparable.",
      requiresFurtherAnalysis: true,
      suggestedQuestion: "Widen or clear the date filter and re-check this movement.",
    });
  }

  const missingData = missingDataForFamily(family, selected, metrics, reconciliation);
  const requiredFactIds = [
    "kpi.gross_product_sales",
    ...(decomp?.comparable
      ? ["decomp.delta_sales", "decomp.order_contribution", "decomp.aov_contribution"]
      : []),
    ...(family === "large_order_dependence"
      ? ["kpi.sales_share_above_2x_median", "kpi.median_order_value", "kpi.gross_aov"]
      : []),
    ...(family === "fee_burden" ? ["kpi.marketplace_fee_rate"] : []),
  ].filter((id) => factStore.byId[id]);

  const nextInvestigations = [
    ...(selected.whatNext || []).map((step) => ({
      question: step.question,
      action: step.action,
      sectionId: step.sectionId,
      chartId: step.chartId,
      status: INVESTIGATION_ITEM_STATUS.SUGGESTED_INVESTIGATION,
    })),
    ...connections
      .filter((c) => c.suggestedQuestion)
      .map((c) => ({
        question: c.suggestedQuestion,
        action: c.suggestedQuestion,
        sectionId: selected.links?.sectionIds?.[0] || "topline",
        chartId: selected.links?.chartIds?.[0] || null,
        status: INVESTIGATION_ITEM_STATUS.SUGGESTED_INVESTIGATION,
      })),
  ]
    .filter((step, index, arr) => arr.findIndex((s) => s.question === step.question) === index)
    .slice(0, 5);

  const hypotheses = (selected.hypotheses || []).map((h) => ({
    text: h.text,
    // Keep legacy "unverified" for grounding; UI maps this to Suggested — never Measured.
    status: "unverified",
    itemStatus: INVESTIGATION_ITEM_STATUS.SUGGESTED_INVESTIGATION,
  }));

  const measuredDrivers = (selected.why?.drivers || []).map((d) => ({
    id: d.id,
    label: d.label,
    amount: d.amount,
    shareOfChange: d.shareOfChange,
    detail: d.detail,
    status: INVESTIGATION_ITEM_STATUS.MEASURED_RESULT,
  }));

  const checkedItems = connections.map((c) => ({
    id: c.id,
    text: c.text,
    status: connectionToStatus(c),
    suggestedQuestion: c.suggestedQuestion || null,
    assertion: c.assertion,
  }));

  const findingSummary =
    selected.shortWhy ||
    selected.summary ||
    selected.what ||
    selected.headline;

  const plan = {
    insightId: selected.id,
    insightHeadline: selected.headline,
    family,
    question: planQuestion(selected, family),
    provisional: Boolean(selected.provisional),
    comparisonStatus: selected.comparisonStatus || null,
    selectedFinding: {
      id: selected.id,
      type: selected.type,
      headline: selected.headline,
      what: selected.what,
      summary: selected.summary,
      shortWhy: selected.shortWhy,
      findingSummary,
      provisional: Boolean(selected.provisional),
      comparisonStatus: selected.comparisonStatus || null,
      confidenceFacets: selected.confidenceFacets,
      links: selected.links,
    },
    requiredMetrics: requiredFactIds,
    supportingEvidence: factsForWire(factStore, [
      ...requiredFactIds,
      ...selected.metrics.slice(0, 8).map((m) => `insight.${selected.id}.${m.metricId}`),
    ]),
    measuredDrivers,
    relatedInsights: related.map((row) => ({
      id: row.id,
      type: row.type,
      headline: row.headline,
      summary: row.summary,
    })),
    connections,
    checkedItems,
    deterministicAnalyses: deterministicAnalyses(family, selected, metrics, decomp, bulk),
    missingData,
    unverifiedHypotheses: hypotheses,
    nextInvestigations,
    chartIds: selected.links?.chartIds || [],
    sectionIds: selected.links?.sectionIds || [],
    presentationNotes: [
      "All amounts are Indian rupees (INR) from session calculations.",
      "NVIDIA may narrate this plan but must cite factIds — not invent values.",
      "Unverified hypotheses are not findings.",
    ],
  };

  return {
    schemaVersion: INVESTIGATION_PLAN_VERSION,
    status: "ready",
    sessionId: sessionId || null,
    currency: "INR",
    insightId: selected.id,
    family,
    question: plan.question,
    factStore,
    plan,
    generatedAt: new Date().toISOString(),
    source: "deterministic_local",
  };
}

/**
 * Compact investigation context for the Ask / NVIDIA wire payload.
 */
export function investigationPlanForWire(investigation) {
  if (!investigation || investigation.status !== "ready" || !investigation.plan) return null;
  const p = investigation.plan;
  return {
    schemaVersion: INVESTIGATION_PLAN_VERSION,
    insightId: p.insightId,
    family: p.family,
    question: p.question,
    headline: p.selectedFinding?.headline,
    what: p.selectedFinding?.what,
    measuredDrivers: p.measuredDrivers,
    connections: (p.connections || []).map((c) => ({
      id: c.id,
      strength: c.strength,
      assertion: c.assertion,
      text: c.text,
      requiresFurtherAnalysis: Boolean(c.requiresFurtherAnalysis),
    })),
    missingData: p.missingData,
    unverifiedHypotheses: p.unverifiedHypotheses,
    nextInvestigations: (p.nextInvestigations || []).map((n) => n.question),
    facts: p.supportingEvidence,
    rules: [
      "Cite factId when discussing amounts; do not invent figures.",
      "Do not claim business causes; hypotheses are unverified.",
      "Large-order concentration does not prove it caused a MoM decline unless a period_measured connection says so — and even then do not over-claim causation.",
      "No profitability claims without COGS.",
      "Currency is INR only.",
    ],
  };
}
