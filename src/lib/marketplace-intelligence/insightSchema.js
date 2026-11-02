/**
 * Financial Insight Object — Stage 5A schema.
 * Amounts must originate from deterministic calculations; never invent figures.
 */

export const INSIGHT_SCHEMA_VERSION = 2;
export const INSIGHT_CURRENCY = "INR";

/** Six discovery families (stable type ids). */
export const INSIGHT_TYPES = Object.freeze({
  REVENUE_MOVEMENT: "revenue_movement",
  ORDERS_VS_AOV: "orders_vs_aov",
  ORDER_VALUE_SKEW: "order_value_skew",
  PRODUCT_CONCENTRATION: "product_concentration",
  FEE_BURDEN: "fee_burden",
  REFUNDS_RECON_GAPS: "refunds_recon_gaps",
});

export const METRIC_BASIS = Object.freeze({
  GROSS_PRODUCT_SALES: "gross_product_sales",
  NET_PRODUCT_SALES: "net_product_sales",
  GROSS_AOV: "gross_aov",
  ORDERS: "gross_orders",
  MARKETPLACE_FEES: "marketplace_fees",
  REFUNDS: "customer_product_refunds",
  RECONCILIATION: "settlement_reconciliation",
});

export const CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
});

/** Period comparison quality for MoM / product moves (Stage 5B.1). */
export const COMPARISON_STATUS = Object.freeze({
  COMPLETE_COMPARABLE: "complete_comparable",
  MATCHED_PARTIAL: "matched_partial",
  TRAILING_PARTIAL: "trailing_partial",
  INCOMPATIBLE: "incompatible",
  NOT_COMPARABLE: "not_comparable",
  NOT_APPLICABLE: "not_applicable",
});

/**
 * Founder-facing investigation item statuses (Stage 5B.1).
 * Suggested business causes must stay suggested / unverified — never measured_result.
 */
export const INVESTIGATION_ITEM_STATUS = Object.freeze({
  MEASURED_RESULT: "measured_result",
  /** Overall filter-level fact — not a period-specific test. */
  BACKGROUND_FACT: "background_fact",
  CHECKED_HYPOTHESIS: "checked_hypothesis",
  SUGGESTED_INVESTIGATION: "suggested_investigation",
  MISSING_EVIDENCE: "missing_evidence",
  INCONCLUSIVE: "inconclusive",
});

/**
 * Separated confidence facets — never collapse into one “report is complete” badge.
 * @typedef {object} InsightConfidenceFacets
 * @property {"high"|"medium"|"low"} calculation  Arithmetic / identity quality
 * @property {"high"|"medium"|"low"|"incomplete"} coverage  Period / filter completeness
 * @property {"matched"|"differences"|"missing"|"unavailable"|"not_applicable"} reconciliation
 * @property {"none"|"unverified_only"} businessCause  Never elevated above unverified hypotheses
 */

export function defaultConfidenceFacets(partial = {}) {
  return {
    calculation: partial.calculation || CONFIDENCE.MEDIUM,
    coverage: partial.coverage || CONFIDENCE.MEDIUM,
    reconciliation: partial.reconciliation || "not_applicable",
    businessCause: partial.businessCause || "unverified_only",
  };
}

/**
 * @typedef {object} InsightMetricRef
 * @property {string} metricId
 * @property {string} label
 * @property {number|null} value
 * @property {string} source
 */

/**
 * @typedef {object} InsightDriver
 * @property {string} id
 * @property {string} label
 * @property {number|null} amount  Absolute INR contribution when applicable
 * @property {number|null} shareOfChange  Driver / total Δ when applicable
 * @property {string} detail
 */

/**
 * @typedef {object} FinancialInsight
 * @property {number} schemaVersion
 * @property {string} id
 * @property {string} type
 * @property {string} family
 * @property {string} groupKey
 * @property {string} metricBasis
 * @property {string} currency
 * @property {{ start: string|null, end: string|null, label: string }} period
 * @property {{ start: string|null, end: string|null, label: string }|null} comparisonPeriod
 * @property {object} filters
 * @property {string} headline
 * @property {string} summary
 * @property {string} what
 * @property {{ method: string, drivers: InsightDriver[], reconciles: boolean, residual: number|null }} why
 * @property {{ text: string, status: "unverified" }[]} hypotheses
 * @property {{ action: string, question: string, sectionId: string, chartId: string|null }[]} whatNext
 * @property {InsightMetricRef[]} metrics
 * @property {{ score: number, absoluteChange: number|null, relativeChange: number|null, notes: string }} materiality
 * @property {{ score: number, reasons: string[] }} ranking
 * @property {"high"|"medium"|"low"} confidence  Legacy calculation confidence (compat)
 * @property {InsightConfidenceFacets} confidenceFacets
 * @property {string} evidenceQuality
 * @property {string} shortWhy  One-line measurable why for compact brief rows
 * @property {string[]} limitations
 * @property {{ sectionIds: string[], chartIds: string[], investigationHints: string[] }} links
 * @property {boolean} [isStableObservation]  Stable structural note (lower urgency)
 * @property {boolean} [isRecentChange]  Recent period movement
 */

/**
 * Build a typed insight object with required defaults.
 * Callers supply verified amounts only.
 */
export function createInsight(partial = {}) {
  const type = partial.type || INSIGHT_TYPES.REVENUE_MOVEMENT;
  return {
    schemaVersion: INSIGHT_SCHEMA_VERSION,
    id: String(partial.id || `insight_${type}`),
    type,
    family: String(partial.family || type),
    groupKey: String(partial.groupKey || partial.id || type),
    metricBasis: partial.metricBasis || METRIC_BASIS.GROSS_PRODUCT_SALES,
    currency: INSIGHT_CURRENCY,
    period: partial.period || { start: null, end: null, label: "Current scope" },
    comparisonPeriod: partial.comparisonPeriod ?? null,
    filters: partial.filters && typeof partial.filters === "object" ? { ...partial.filters } : {},
    headline: String(partial.headline || ""),
    summary: String(partial.summary || ""),
    what: String(partial.what || ""),
    why: {
      method: partial.why?.method || "verified_observation",
      drivers: Array.isArray(partial.why?.drivers) ? partial.why.drivers : [],
      reconciles: Boolean(partial.why?.reconciles),
      residual: partial.why?.residual ?? null,
      ...(partial.why?.audit ? { audit: partial.why.audit } : {}),
    },
    hypotheses: Array.isArray(partial.hypotheses)
      ? partial.hypotheses.map((h) => ({
          text: String(h.text || h),
          status: "unverified",
        }))
      : [],
    whatNext: Array.isArray(partial.whatNext) ? partial.whatNext : [],
    metrics: Array.isArray(partial.metrics) ? partial.metrics : [],
    materiality: {
      score: Number.isFinite(partial.materiality?.score) ? partial.materiality.score : 0,
      absoluteChange: partial.materiality?.absoluteChange ?? null,
      relativeChange: partial.materiality?.relativeChange ?? null,
      notes: String(partial.materiality?.notes || ""),
    },
    ranking: {
      score: Number.isFinite(partial.ranking?.score) ? partial.ranking.score : 0,
      reasons: Array.isArray(partial.ranking?.reasons) ? partial.ranking.reasons : [],
    },
    confidence: partial.confidence || CONFIDENCE.MEDIUM,
    confidenceFacets: defaultConfidenceFacets(partial.confidenceFacets || { calculation: partial.confidence }),
    evidenceQuality: String(partial.evidenceQuality || "calculated_session_metrics"),
    shortWhy: String(partial.shortWhy || ""),
    limitations: Array.isArray(partial.limitations) ? partial.limitations : [],
    isStableObservation: Boolean(partial.isStableObservation),
    isRecentChange: Boolean(partial.isRecentChange),
    comparisonStatus: partial.comparisonStatus || COMPARISON_STATUS.NOT_APPLICABLE,
    provisional: Boolean(partial.provisional),
    links: {
      sectionIds: Array.isArray(partial.links?.sectionIds) ? partial.links.sectionIds : [],
      chartIds: Array.isArray(partial.links?.chartIds) ? partial.links.chartIds : [],
      investigationHints: Array.isArray(partial.links?.investigationHints)
        ? partial.links.investigationHints
        : [],
    },
  };
}

export function metricRef(metricId, label, value, source) {
  return {
    metricId: String(metricId),
    label: String(label),
    value: value == null || !Number.isFinite(value) ? null : value,
    source: String(source || "session_calculations"),
  };
}
