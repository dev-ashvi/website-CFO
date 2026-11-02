/**
 * Marketplace Ask WYZ evidence adapter.
 * Builds a sanitized, schema-limited payload of verified metrics for the LLM.
 * Never includes raw CSV/PDF bytes or order-level customer identifiers.
 */

import { buildCurrencyEvidenceFields, formatMonthLabel } from "./askPresentation.js";
import { getSection } from "./sections.js";

export const EVIDENCE_SCHEMA_VERSION = 1;
export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_TURNS = 4;
export const MAX_PRODUCTS = 8;
export const MAX_EVIDENCE_ITEMS = 12;
export const MAX_PAYLOAD_CHARS = 14000;

const ALLOWED_SECTION_IDS = new Set([
  "topline",
  "amazon_economics",
  "product_performance",
  "profitability",
]);

function roundMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

function roundRatio(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 10000) / 10000;
}

function clipText(value, max = 120) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sanitizeProductLabel(name) {
  // Keep product title only; drop long catalogue suffixes that may carry injection text.
  return clipText(name, 80);
}

/**
 * Select verified metrics relevant to the active section / question intent.
 */
export function selectEvidenceMetrics(metrics, reconciliation, context = {}) {
  const sectionId = ALLOWED_SECTION_IDS.has(context.sectionId) ? context.sectionId : "topline";
  const kpis = metrics?.kpis || {};
  const sections = metrics?.sections || {};
  const topline = sections.topline || {};
  const economics = sections.amazon_economics || {};
  const products = sections.product_performance || {};
  const profitability = sections.profitability || {};

  const baseKpis = {
    grossProductSales: roundMoney(kpis.grossProductSales),
    refundAmountAbs: roundMoney(kpis.refundAmountAbs),
    refundProductCharges: roundMoney(kpis.refundProductCharges),
    netProductSales: roundMoney(kpis.netProductSales),
    // orderCount is a legacy alias of grossOrderCount — never a net denominator.
    orderCount: Number.isFinite(kpis.grossOrderCount)
      ? kpis.grossOrderCount
      : Number.isFinite(kpis.orderCount)
        ? kpis.orderCount
        : null,
    grossOrderCount: Number.isFinite(kpis.grossOrderCount) ? kpis.grossOrderCount : null,
    refundedOrderCount: Number.isFinite(kpis.refundedOrderCount) ? kpis.refundedOrderCount : null,
    fullRefundOrderCount: Number.isFinite(kpis.fullRefundOrderCount) ? kpis.fullRefundOrderCount : null,
    ordersAffectedByRefunds: Number.isFinite(kpis.ordersAffectedByRefunds) ? kpis.ordersAffectedByRefunds : null,
    netOrderCount: Number.isFinite(kpis.netOrderCount) ? kpis.netOrderCount : null,
    canSubtractFullRefunds: Boolean(kpis.canSubtractFullRefunds),
    netOrdersBasis: clipText(kpis.netOrdersBasis, 40) || null,
    aov: roundMoney(kpis.aov),
    aovBasis: clipText(kpis.aovBasis || "gross_product_sales / gross_order_count", 80),
    aovDenominator: "gross_order_count",
    aovNumerator: "gross_product_sales",
    medianOrderValue: roundMoney(kpis.medianOrderValue),
    medianBasis: clipText(kpis.medianBasis || "gross_unique_order_product_charges", 80),
    ordersAbove2xMedian: Number.isFinite(kpis.ordersAbove2xMedian) ? kpis.ordersAbove2xMedian : null,
    salesAbove2xMedian: roundMoney(kpis.salesAbove2xMedian),
    salesShareAbove2xMedian: roundRatio(kpis.salesShareAbove2xMedian),
    top8Concentration: roundRatio(kpis.top8Concentration),
    sellingFees: roundMoney(kpis.sellingFees),
    advertising: roundMoney(kpis.advertising),
    promotionalRebates: roundMoney(kpis.promotionalRebates),
    promotionalRebatesAreMarketplaceFees: false,
    inboundTransportation: roundMoney(kpis.inboundTransportation),
    otherSettlement: roundMoney(kpis.otherSettlement),
    netSettlementMovement: roundMoney(kpis.netSettlementMovement ?? kpis.amazonProceeds),
    effectiveMarketplaceDeductionRate: roundRatio(kpis.effectiveMarketplaceDeductionRate),
    feeRateDenominator: "gross_product_sales",
    productRefundsShownInTopline: true,
  };

  const chartInsights = {};
  for (const [id, pair] of Object.entries(metrics?.chartInsights || {})) {
    chartInsights[clipText(id, 40)] = {
      keyInsight: clipText(pair?.keyInsight, 220) || "Insufficient data",
      worthInvestigating: clipText(pair?.worthInvestigating, 220) || "Insufficient data",
    };
  }

  const monthly = (topline.monthly || []).slice(-6).map((row) => ({
    month: clipText(row.month, 16),
    monthLabel: clipText(formatMonthLabel(row.month), 24),
    sales: roundMoney(row.sales),
    orders: Number.isFinite(row.orders) ? row.orders : null,
    growth: roundRatio(row.growth),
    metricBasis: "gross_product_sales",
  }));

  const bulkOrders = (topline.bulkOrders || []).slice(0, 5).map((row) => ({
    amount: roundMoney(row.amount),
    productName: sanitizeProductLabel(row.productName),
    // Intentionally omit order IDs from LLM evidence.
  }));

  const bulkImpactRaw = products.bulkImpact || topline.bulkImpact || null;
  const bulkImpact = bulkImpactRaw
    ? {
        bulkOrderCount: Number.isFinite(bulkImpactRaw.bulkOrderCount) ? bulkImpactRaw.bulkOrderCount : null,
        bulkSales: roundMoney(bulkImpactRaw.bulkSales),
        bulkShareOfGross: roundRatio(bulkImpactRaw.bulkShareOfGross),
        productsLifted: (bulkImpactRaw.productsLifted || []).slice(0, 4).map((row) => ({
          productName: sanitizeProductLabel(row.productName),
          bulkOrders: Number.isFinite(row.bulkOrders) ? row.bulkOrders : null,
          bulkSales: roundMoney(row.bulkSales),
          rank: Number.isFinite(row.rank) ? row.rank : null,
          bulkShareOfProduct: roundRatio(row.bulkShareOfProduct),
        })),
      }
    : null;

  const feeBurdenByOrderSize = (products.orderSizes?.buckets || topline.orderSizes?.buckets || [])
    .slice(0, 4)
    .map((row) => ({
      id: clipText(row.id, 20),
      label: clipText(row.label, 40),
      orders: Number.isFinite(row.orders) ? row.orders : null,
      sales: roundMoney(row.sales),
      fees: row.feesAvailable ? roundMoney(row.fees) : null,
      feeBurden: row.feesAvailable ? roundRatio(row.feeBurden) : null,
      feesAvailable: Boolean(row.feesAvailable),
    }));

  const productMonthly = (products.productMonthly || [])
    .slice(0, 5)
    .map((row) => ({
      productName: sanitizeProductLabel(row.productName),
      months: (row.months || []).slice(-4).map((m) => ({
        month: clipText(m.month, 16),
        sales: roundMoney(m.sales),
        orders: Number.isFinite(m.orders) ? m.orders : null,
        growth: roundRatio(m.growth),
      })),
    }));

  const whereMoneyGoes = (economics.whereMoneyGoes || []).slice(0, 6).map((row) => ({
    id: clipText(row.id, 40),
    label: clipText(row.label, 60),
    amount: roundMoney(row.amount),
  }));

  const productRows = (products.products || []).slice(0, MAX_PRODUCTS).map((row) => ({
    productName: sanitizeProductLabel(row.productName),
    sales: roundMoney(row.sales),
    orders: Number.isFinite(row.orders) ? row.orders : null,
    revenueShare: roundRatio(row.revenueShare),
    fees: row.feesAvailable ? roundMoney(row.fees) : null,
    feeBurden: row.feesAvailable ? roundRatio(row.feeBurden) : null,
    feesAvailable: Boolean(row.feesAvailable),
  }));

  const waterfall = (profitability.waterfall?.steps || [])
    .filter((step) => step.kind !== "info")
    .slice(0, 10)
    .map((step) => ({
      id: clipText(step.id, 40),
      label: clipText(step.label, 80),
      amount: roundMoney(step.amount),
      running: roundMoney(step.running),
      kind: clipText(step.kind, 20),
    }));

  const comparisons = (reconciliation?.comparisons || []).slice(0, 10).map((row) => ({
    id: clipText(row.id, 40),
    status: clipText(row.status, 30),
    comparable: Boolean(row.comparable),
    txValue: roundMoney(row.txValue),
    pdfValue: roundMoney(row.pdfValue),
    difference: row.difference == null ? null : roundMoney(row.difference),
    explanation: clipText(row.explanation, 220),
  }));

  const limitations = [
    "All monetary amounts in this evidence are Indian rupees (INR / ₹). Do not use USD or other currencies.",
    "Prefer monthLabel fields (e.g. September 2026) over raw YYYY-MM codes in narration.",
    "Product profit requires actual product costs (COGS), which are not in these Amazon exports.",
    "Amazon selling fees in the CSV are an aggregate — not proven referral-only.",
    "Customer product refunds reduce Topline net product sales; they are not Amazon fee drains.",
    "Do not treat refunds as full-order cancellations unless canSubtractFullRefunds is true.",
    "Gross AOV = gross product sales / gross distinct orders. Do not mix net sales or net orders into AOV.",
    "Median uses the same gross unique-order product-charge population as Gross AOV.",
    "Promotional rebates are settlement adjustments — not Amazon marketplace fees.",
    "Marketplace deduction rate uses gross product sales as denominator and excludes product refunds and promotional rebates.",
    "CSV Other credits are unexplained and are not assigned to tax, fees, or revenue without evidence.",
    "Bank transfers and GST appear on the Unified Summary PDF only when present.",
    "Opening and closing Amazon account balances are not in these exports.",
    productMonthly.length
      ? "Product monthly series covers top products only (aggregated; no order-level rows)."
      : "Product-level monthly comparisons are unavailable for the current scope.",
  ];

  const currencyFields = buildCurrencyEvidenceFields(metrics?.currency || "INR");

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    ...currencyFields,
    context: {
      sectionId,
      sectionLabel: getSection(sectionId).label,
      chartId: context.chartId ? clipText(context.chartId, 40) : null,
      insightId: context.insightId ? clipText(context.insightId, 80) : null,
      insightHeadline: context.insightHeadline ? clipText(context.insightHeadline, 160) : null,
      product: context.product ? sanitizeProductLabel(context.product) : null,
      dateRange: context.dateRange
        ? {
            start: clipText(context.dateRange.start, 16) || null,
            end: clipText(context.dateRange.end, 16) || null,
            startLabel: context.dateRange.start
              ? clipText(formatMonthLabel(String(context.dateRange.start).slice(0, 7)), 24)
              : null,
            endLabel: context.dateRange.end
              ? clipText(formatMonthLabel(String(context.dateRange.end).slice(0, 7)), 24)
              : null,
          }
        : null,
      period: metrics?.period
        ? {
            start: clipText(metrics.period.start, 16) || null,
            end: clipText(metrics.period.end, 16) || null,
            startLabel: metrics.period.start
              ? clipText(formatMonthLabel(String(metrics.period.start).slice(0, 7)), 24)
              : null,
            endLabel: metrics.period.end
              ? clipText(formatMonthLabel(String(metrics.period.end).slice(0, 7)), 24)
              : null,
          }
        : null,
    },
    terminology: {
      grossProductSales: "Gross Product Sales",
      netProductSales: "Net Product Sales",
      grossAov: "Gross AOV",
      medianOrderValue: "Median Order Value",
      orders: "Orders",
      refunds: "Refunds",
      note: "Never conflate Gross Product Sales with Net Product Sales (refund-adjusted).",
    },
    kpis: baseKpis,
    chartInsights,
    monthly,
    bulkOrders,
    bulkImpact,
    feeBurdenByOrderSize,
    productMonthly,
    whereMoneyGoes,
    products: productRows,
    waterfall,
    reconciliation: {
      status: clipText(reconciliation?.status, 40) || null,
      statusLabel: clipText(reconciliation?.statusLabel, 80) || null,
      comparisons,
    },
    limitations,
    productProfitAvailable: false,
  };
}

/**
 * Build the wire payload for POST /api/marketplace-ask.
 * Optional investigationPlan is compact Stage 5B context (factIds + connections).
 */
export function buildAskPayload({
  question,
  metrics,
  reconciliation = null,
  context = {},
  guided = null,
  history = [],
  investigationPlan = null,
} = {}) {
  const evidence = selectEvidenceMetrics(metrics, reconciliation, context);
  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: clipText(turn.content, 400),
    }))
    .filter((turn) => turn.content);

  const payload = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    question: clipText(question, MAX_QUESTION_CHARS),
    evidence,
    guidedAnswer: guided
      ? {
          text: clipText(guided.answer || guided.text, 800),
          evidence: (guided.evidence || []).slice(0, MAX_EVIDENCE_ITEMS).map((item) => ({
            metricId: clipText(item.metricId, 60),
            label: clipText(item.label, 80),
            value: typeof item.value === "number" ? roundMoney(item.value) ?? roundRatio(item.value) : null,
            source: clipText(item.source, 80),
            factId: item.factId ? clipText(item.factId, 80) : null,
          })),
        }
      : null,
    history: safeHistory,
    investigation: investigationPlan || null,
  };

  const encoded = JSON.stringify(payload);
  if (encoded.length <= MAX_PAYLOAD_CHARS) return payload;

  // Trim products / monthly / history / investigation if oversized.
  payload.evidence.products = payload.evidence.products.slice(0, 5);
  payload.evidence.monthly = payload.evidence.monthly.slice(-3);
  payload.evidence.productMonthly = (payload.evidence.productMonthly || []).slice(0, 3);
  payload.evidence.feeBurdenByOrderSize = (payload.evidence.feeBurdenByOrderSize || []).slice(0, 4);
  payload.history = payload.history.slice(-2);
  if (payload.investigation?.facts) {
    payload.investigation.facts = payload.investigation.facts.slice(0, 12);
  }
  if (payload.investigation?.connections) {
    payload.investigation.connections = payload.investigation.connections.slice(0, 4);
  }

  // Stage 5 investigation facts already carry the key amounts — drop bulky
  // chart/recon detail so Ask-from-finding stays under the NVIDIA wire limit.
  if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) {
    payload.evidence.chartInsights = [];
    payload.evidence.productMonthly = [];
    payload.evidence.feeBurdenByOrderSize = [];
    payload.evidence.bulkOrders = [];
    payload.evidence.bulkImpact = null;
    payload.evidence.waterfall = (payload.evidence.waterfall || []).slice(0, 4);
    payload.evidence.limitations = (payload.evidence.limitations || []).slice(0, 6);
    if (payload.evidence.reconciliation?.comparisons) {
      payload.evidence.reconciliation.comparisons = payload.evidence.reconciliation.comparisons.slice(0, 4);
    }
    if (payload.guidedAnswer?.text) {
      payload.guidedAnswer.text = clipText(payload.guidedAnswer.text, 400);
    }
    if (payload.investigation?.facts) {
      payload.investigation.facts = payload.investigation.facts.slice(0, 8);
    }
    if (payload.investigation?.missingData) {
      payload.investigation.missingData = payload.investigation.missingData.slice(0, 4);
    }
    if (payload.investigation?.unverifiedHypotheses) {
      payload.investigation.unverifiedHypotheses = payload.investigation.unverifiedHypotheses.slice(0, 3);
    }
    if (payload.investigation?.nextInvestigations) {
      payload.investigation.nextInvestigations = payload.investigation.nextInvestigations.slice(0, 3);
    }
  }

  return payload;
}

/**
 * Validate an inbound Ask payload (shared rules mirrored in the API).
 */
export function validateAskPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  if (body.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    return { ok: false, error: "unsupported_schema" };
  }
  const question = String(body.question || "").trim();
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return { ok: false, error: "invalid_question" };
  }
  if (!body.evidence || typeof body.evidence !== "object") {
    return { ok: false, error: "missing_evidence" };
  }
  if (body.evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    return { ok: false, error: "invalid_evidence_schema" };
  }
  if (body.evidence.currency != null && String(body.evidence.currency).toUpperCase() !== "INR") {
    return { ok: false, error: "invalid_currency" };
  }
  const sectionId = body.evidence?.context?.sectionId;
  if (!ALLOWED_SECTION_IDS.has(sectionId)) {
    return { ok: false, error: "invalid_section" };
  }
  // Reject payloads that smuggle raw file content.
  const blob = JSON.stringify(body);
  if (blob.length > MAX_PAYLOAD_CHARS) {
    return { ok: false, error: "payload_too_large" };
  }
  if (/"bytes"\s*:|"pdf"\s*:|"csvText"\s*:/i.test(blob)) {
    return { ok: false, error: "forbidden_fields" };
  }
  return { ok: true, question, evidence: body.evidence, guidedAnswer: body.guidedAnswer || null, history: body.history || [] };
}
