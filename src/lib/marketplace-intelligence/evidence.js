/**
 * Marketplace Ask WYZ evidence adapter.
 * Builds a sanitized, schema-limited payload of verified metrics for the LLM.
 * Never includes raw CSV/PDF bytes or order-level customer identifiers.
 */

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
    netProductSales: roundMoney(kpis.netProductSales),
    orderCount: Number.isFinite(kpis.orderCount) ? kpis.orderCount : null,
    aov: roundMoney(kpis.aov),
    top8Concentration: roundRatio(kpis.top8Concentration),
    sellingFees: roundMoney(kpis.sellingFees),
    advertising: roundMoney(kpis.advertising),
    refundProductCharges: roundMoney(kpis.refundProductCharges),
    promotionalRebates: roundMoney(kpis.promotionalRebates),
    inboundTransportation: roundMoney(kpis.inboundTransportation),
    otherSettlement: roundMoney(kpis.otherSettlement),
    netSettlementMovement: roundMoney(kpis.netSettlementMovement ?? kpis.amazonProceeds),
    effectiveMarketplaceDeductionRate: roundRatio(kpis.effectiveMarketplaceDeductionRate),
  };

  const monthly = (topline.monthly || []).slice(-6).map((row) => ({
    month: clipText(row.month, 16),
    sales: roundMoney(row.sales),
    orders: Number.isFinite(row.orders) ? row.orders : null,
    growth: roundRatio(row.growth),
  }));

  const bulkOrders = (topline.bulkOrders || []).slice(0, 5).map((row) => ({
    amount: roundMoney(row.amount),
    productName: sanitizeProductLabel(row.productName),
    week: clipText(row.week, 16),
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
    "Product profit requires actual product costs (COGS), which are not in these Amazon exports.",
    "Amazon selling fees in the CSV are an aggregate — not proven referral-only.",
    "CSV Other credits are unexplained and are not assigned to tax, fees, or revenue without evidence.",
    "Bank transfers and GST appear on the Unified Summary PDF only when present.",
    "Opening and closing Amazon account balances are not in these exports.",
  ];

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    context: {
      sectionId,
      sectionLabel: getSection(sectionId).label,
      chartId: context.chartId ? clipText(context.chartId, 40) : null,
      product: context.product ? sanitizeProductLabel(context.product) : null,
      dateRange: context.dateRange
        ? {
            start: clipText(context.dateRange.start, 16) || null,
            end: clipText(context.dateRange.end, 16) || null,
          }
        : null,
      period: metrics?.period
        ? {
            start: clipText(metrics.period.start, 16) || null,
            end: clipText(metrics.period.end, 16) || null,
          }
        : null,
    },
    kpis: baseKpis,
    monthly,
    bulkOrders,
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
 */
export function buildAskPayload({
  question,
  metrics,
  reconciliation = null,
  context = {},
  guided = null,
  history = [],
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
          })),
        }
      : null,
    history: safeHistory,
  };

  const encoded = JSON.stringify(payload);
  if (encoded.length <= MAX_PAYLOAD_CHARS) return payload;

  // Trim products / monthly / history if oversized.
  payload.evidence.products = payload.evidence.products.slice(0, 5);
  payload.evidence.monthly = payload.evidence.monthly.slice(-3);
  payload.history = payload.history.slice(-2);
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
