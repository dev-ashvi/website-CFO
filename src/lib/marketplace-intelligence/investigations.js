/**
 * Ask WYZ guided investigations grounded in calculated metrics.
 * Explicitly not a live model in Stage 2.
 */
import { formatInr, formatPct } from "./money.js";
import { getSection } from "./sections.js";

export const ASK_WYZ_MODE = "deterministic_guided";

export const ASK_WYZ_DISCLOSURE =
  "Guided investigation. This is not a live model. Answers cite metrics calculated from this session only.";

export function buildInvestigationContext({
  sessionId = null,
  sectionId = "topline",
  dateRange = null,
  product = null,
  filters = null,
  chartId = null,
} = {}) {
  const section = getSection(sectionId);
  return {
    mode: ASK_WYZ_MODE,
    liveModel: false,
    sessionId,
    sectionId: section.id,
    dateRange,
    product,
    filters: filters && typeof filters === "object" ? { ...filters } : {},
    chartId,
    suggestedQuestions: section.questions,
  };
}

function evidence(metricId, label, value, source) {
  return { metricId, label, value, source };
}

function answerFor(question, metrics, context) {
  const q = String(question || "").toLowerCase();
  const kpis = metrics?.kpis || {};
  const section = metrics?.sections?.[context.sectionId] || {};
  const items = [];

  if (/monthly sales|growth|move in this period/.test(q)) {
    const months = section.monthly || metrics?.sections?.topline?.monthly || [];
    const latest = months[months.length - 1];
    items.push(
      evidence("gross_product_sales", "Gross product sales", kpis.grossProductSales, "Order Payment product charges"),
    );
    if (latest) {
      items.push(evidence("month_sales", `${latest.month} sales`, latest.sales, "Monthly aggregation"));
      items.push(evidence("mom_growth", `${latest.month} MoM growth`, latest.growth, "MoM vs prior month"));
    }
    return {
      text: `Gross product sales are ${formatInr(kpis.grossProductSales)} across ${kpis.orderCount} orders. ${
        latest
          ? `Latest month ${latest.month} is ${formatInr(latest.sales)} with MoM growth ${formatPct(latest.growth)}.`
          : "Monthly growth needs at least two months in scope."
      }`,
      evidence: items,
    };
  }

  if (/order volume|average order value|aov/.test(q)) {
    items.push(evidence("order_count", "Orders", kpis.orderCount, "Order Payment rows"));
    items.push(evidence("aov", "AOV", kpis.aov, "gross product sales / orders"));
    return {
      text: `Order volume is ${kpis.orderCount}. Average order value is ${formatInr(kpis.aov)}, using product charges rather than settlement totals.`,
      evidence: items,
    };
  }

  if (/bulk/.test(q)) {
    const bulk = metrics?.sections?.topline?.bulkOrders || [];
    items.push(evidence("bulk_orders", "Bulk-order candidates", bulk.length, ">= max(3× median, p90)"));
    return {
      text: bulk.length
        ? `Identified ${bulk.length} bulk-order candidate(s). Largest is ${formatInr(bulk[0].amount)} for ${bulk[0].productName || "an unspecified product"}.`
        : "No bulk-order candidates under the current threshold.",
      evidence: items,
    };
  }

  if (/where is amazon taking|taking the money|taking my money/.test(q)) {
    const rows = metrics?.sections?.amazon_economics?.whereMoneyGoes || [];
    const top = rows.slice(0, 4);
    for (const row of top) items.push(evidence(row.id, row.label, row.amount, "Classified settlement lines"));
    return {
      text: top.length
        ? `Largest settlement drains: ${top
            .map((row) => `${row.label} ${formatInr(row.amount)}`)
            .join("; ")}. Selling fees are CSV aggregates, not proven referral-only.`
        : "No classified fee outflows in the current scope.",
      evidence: items,
    };
  }

  if (/referral|total marketplace deduction|fee/.test(q) && /compar|versus|vs|deduction|fee/.test(q)) {
    items.push(evidence("selling_fees", "Amazon selling fees", kpis.sellingFees, "Amazon fees on orders/refunds"));
    items.push(
      evidence(
        "effective_marketplace_deduction_rate",
        "Effective deduction rate",
        kpis.effectiveMarketplaceDeductionRate,
        "Fee outflows / gross product sales",
      ),
    );
    return {
      text: `Referral fee is not separately itemised in this export. Amazon selling fees total ${formatInr(
        kpis.sellingFees,
      )}. Effective marketplace deduction rate is ${formatPct(kpis.effectiveMarketplaceDeductionRate)}.`,
      evidence: items,
    };
  }

  if (/advertising|refund|promotional/.test(q)) {
    items.push(evidence("advertising", "Advertising", kpis.advertising, "Cost of Advertising"));
    items.push(evidence("refunds", "Refunded product charges", kpis.refundProductCharges, "Refund rows"));
    items.push(evidence("promo", "Promotional rebates", kpis.promotionalRebates, "Promotional rebate column"));
    return {
      text: `Advertising ${formatInr(kpis.advertising)}; refunded product charges ${formatInr(
        kpis.refundProductCharges,
      )}; promotional rebates ${formatInr(kpis.promotionalRebates)}.`,
      evidence: items,
    };
  }

  if (/top eight|concentration|contribute the most|products contribute|revenue share/.test(q)) {
    const products = metrics?.sections?.product_performance?.products || [];
    const top = products.slice(0, 5);
    items.push(evidence("top8_concentration", "Top-8 revenue share", kpis.top8Concentration, "Top 8 sales / gross sales"));
    for (const row of top.slice(0, 3)) {
      items.push(evidence(`product:${row.productName}`, row.productName, row.sales, "Product gross sales"));
    }
    return {
      text: `Top-eight products account for ${formatPct(kpis.top8Concentration)} of gross product sales (revenue share, not profit). Leading product: ${
        top[0] ? `${top[0].productName} at ${formatInr(top[0].sales)}` : "n/a"
      }.`,
      evidence: items,
    };
  }

  if (/fee burden/.test(q)) {
    const products = [...(metrics?.sections?.product_performance?.products || [])]
      .filter((row) => row.sales > 0 && row.feesAvailable && row.feeBurden != null)
      .sort((a, b) => (b.feeBurden || 0) - (a.feeBurden || 0));
    const top = products[0];
    if (!top) {
      return { text: "No product fee burden is available from reported Amazon fees in the current scope.", evidence: items };
    }
    items.push(evidence("fee_burden", top.productName, top.feeBurden, "abs(reported fees)/sales"));
    return {
      text: `Highest fee burden among products with reported fees is ${top.productName} at ${formatPct(top.feeBurden)} (${formatInr(
        top.fees,
      )} fees on ${formatInr(top.sales)} sales). Missing fees are not treated as zero.`,
      evidence: items,
    };
  }

  if (/cash|settle|proceeds/.test(q)) {
    items.push(evidence("amazon_proceeds", "Amazon account proceeds", kpis.amazonProceeds, "Sum of Total (INR)"));
    items.push(
      evidence(
        "bank_transfers",
        "Bank transfers",
        metrics?.sections?.profitability?.bankTransfers,
        "Unified Summary PDF",
      ),
    );
    return {
      text: `Amazon account proceeds (settlement movement) are ${formatInr(
        kpis.amazonProceeds,
      )}. This is not net profit. Bank transfers from the Unified Summary are ${formatInr(
        metrics?.sections?.profitability?.bankTransfers,
      )}.`,
      evidence: items,
    };
  }

  if (/deduction|between revenue and proceeds|bridge|waterfall/.test(q)) {
    const steps = metrics?.sections?.profitability?.waterfall?.steps || [];
    for (const row of steps.filter((step) => step.kind !== "info").slice(0, 7)) {
      items.push(evidence(row.id, row.label, row.amount, "Settlement waterfall"));
    }
    return {
      text: `The settlement waterfall starts at gross product sales ${formatInr(
        kpis.grossProductSales,
      )} and ends at Amazon account settlement movement ${formatInr(
        kpis.amazonProceeds,
      )}. Bank transfers from the PDF are shown separately and are not subtracted into that result.`,
      evidence: items,
    };
  }

  if (/profitability|cogs|product profit/.test(q)) {
    items.push(evidence("product_profit", "Product profit", null, "Requires COGS"));
    return {
      text: "Product profitability is withheld because actual product costs were not provided. Marketplace proceeds are not profit.",
      evidence: items,
    };
  }

  items.push(evidence("gross_product_sales", "Gross product sales", kpis.grossProductSales, "Order Payment product charges"));
  items.push(evidence("amazon_proceeds", "Amazon account proceeds", kpis.amazonProceeds, "Sum of Total (INR)"));
  return {
    text: `In the current scope, gross product sales are ${formatInr(
      kpis.grossProductSales,
    )} and Amazon account proceeds are ${formatInr(kpis.amazonProceeds)}. Ask a section-specific question for a tighter breakdown.`,
    evidence: items,
  };
}

export function investigate(question, context, metrics = null) {
  const safeContext = buildInvestigationContext(context || {});
  const hasMetrics = Boolean(metrics && metrics.status === "calculated");
  if (!hasMetrics) {
    return {
      mode: ASK_WYZ_MODE,
      liveModel: false,
      status: "awaiting_calculations",
      disclosure: ASK_WYZ_DISCLOSURE,
      question: String(question || "").slice(0, 500),
      context: {
        sessionId: safeContext.sessionId,
        sectionId: safeContext.sectionId,
        dateRange: safeContext.dateRange,
        product: safeContext.product,
        filters: safeContext.filters,
        chartId: safeContext.chartId,
      },
      answer: null,
      evidence: [],
    };
  }

  const result = answerFor(question, metrics, safeContext);
  return {
    mode: ASK_WYZ_MODE,
    liveModel: false,
    status: "answered",
    disclosure: ASK_WYZ_DISCLOSURE,
    question: String(question || "").slice(0, 500),
    context: {
      sessionId: safeContext.sessionId,
      sectionId: safeContext.sectionId,
      dateRange: safeContext.dateRange,
      product: safeContext.product,
      filters: safeContext.filters,
      chartId: safeContext.chartId,
    },
    answer: result.text,
    evidence: result.evidence,
  };
}
