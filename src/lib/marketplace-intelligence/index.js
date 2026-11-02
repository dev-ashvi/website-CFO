/**
 * Marketplace Intelligence engine.
 *
 * Public route: /marketplace-intelligence (no login).
 * Layers: ingestion → calculations → reconciliation → intelligence → investigations → UI.
 */
import { calculateMarketplace, createEmptyFilters } from "./calculations.js";
import { buildFinancialIntelligence } from "./financialIntelligence.js";
import { buildChartInsights } from "./insights.js";
import { normalizeSources } from "./ingestion.js";
import { reconcileSettlement } from "./reconciliation.js";

export { MARKETPLACE_INTELLIGENCE_PATH } from "./session.js";
export {
  CANONICAL_TRANSACTION_FIELDS,
  DEDUCTION_CATEGORIES,
  FEE_CATEGORIES,
  MISSING_PRODUCT_COST,
  MISSING_REFERRAL_SPLIT,
  MISSING_UNITS,
  PLATFORMS,
  assertDistinctFeeRoles,
  emptyAnalysis,
} from "./schema.js";
export { SECTIONS, getSection } from "./sections.js";
export {
  SOURCE_LIMITS,
  SOURCE_SLOTS,
  SUPPORTED_FORMATS,
  classifyUpload,
  fileExtension,
} from "./formats.js";
export {
  SESSION_PERSISTENCE,
  attachSourceFile,
  createMarketplaceSession,
  detachSourceFile,
  fileSummary,
  releaseSession,
  requestSampleDataset,
  sessionSummary,
} from "./session.js";
export { normalizeSources } from "./ingestion.js";
export {
  analyzeRefundOrders,
  buildBulkImpact,
  buildOrderLevelTotals,
  buildProductMonthly,
  calculateMarketplace,
  computeOrderValueStats,
  countDistinctOrders,
  createEmptyFilters,
  filterTransactions,
} from "./calculations.js";
export { buildChartInsights, densifyMonthly } from "./insights.js";
export { normalizeProductName } from "./classify.js";
export { reconcileSettlement } from "./reconciliation.js";
export { medianOfSorted } from "./money.js";
export {
  DECOMPOSITION_METHOD,
  DECOMPOSITION_PRESENTATION_METHOD,
  DECOMPOSITION_TOLERANCE_INR,
  decomposeSalesOrdersAov,
  primaryDriverLabel,
} from "./decomposition.js";
export {
  BRIEF_SCHEMA_VERSION,
  buildFinancialIntelligence,
  findInsight,
  latestMonthDecomposition,
} from "./financialIntelligence.js";
export { discoverInsights } from "./insightDiscovery.js";
export { dedupeInsights, scoreInsight, selectBriefInsights } from "./insightRanking.js";
export {
  COMPARISON_STATUS,
  CONFIDENCE,
  INSIGHT_CURRENCY,
  INSIGHT_SCHEMA_VERSION,
  INSIGHT_TYPES,
  INVESTIGATION_ITEM_STATUS,
  METRIC_BASIS,
  createInsight,
  defaultConfidenceFacets,
  metricRef,
} from "./insightSchema.js";
export {
  compareMonthCoverage,
  coverageLeadHeadline,
  founderComparisonNote,
  formatCoverageSpan,
  isPartialMonth,
  monthCoverageMeta,
  monthParts,
  presentLatestMomGrowth,
} from "./periodCoverage.js";
export { connectionToStatus, humanReconGap, statusLabel } from "./investigationLabels.js";
export {
  ASK_WYZ_DISCLOSURE,
  ASK_WYZ_DISCLOSURE_LIVE,
  ASK_WYZ_MODE,
  ASK_WYZ_MODE_LIVE,
  buildInvestigationContext,
  investigate,
} from "./investigations.js";
export {
  EVIDENCE_SCHEMA_VERSION,
  MAX_PAYLOAD_CHARS,
  MAX_QUESTION_CHARS,
  buildAskPayload,
  selectEvidenceMetrics,
  validateAskPayload,
} from "./evidence.js";
export { MARKETPLACE_ASK_ENDPOINT, askMarketplaceWyz } from "./askLive.js";
export {
  FACT_SCHEMA_VERSION,
  buildFactStore,
  factsForWire,
  getFact,
  measureBulkOrdersByMonth,
} from "./investigationFacts.js";
export {
  INVESTIGATION_PLAN_VERSION,
  investigationPlanForWire,
  planInvestigation,
} from "./investigationPlanner.js";
export {
  REPORT_CURRENCY,
  REPORT_CURRENCY_NAME,
  REPORT_CURRENCY_SYMBOL,
  detectSalesBasisConfusion,
  formatMonthLabel,
  humanizePeriodLabels,
  presentAskExplanation,
  validateInrCurrencyPresentation,
} from "./askPresentation.js";
export { METRIC_DEFINITIONS } from "./metricDefinitions.js";
export { formatCount, formatInr, formatPct, parseIndianNumber } from "./money.js";
export { normalizeAmazonCsvText } from "./normalize.js";
export { parseUnifiedSummaryPdf, parseUnifiedSummaryText } from "./pdfSummary.js";
export { buildSampleDataset } from "./sampleDataset.js";

export async function runMarketplaceEngine(session, filters = createEmptyFilters()) {
  const normalized = await normalizeSources(session);
  const metrics =
    normalized.status === "ready"
      ? calculateMarketplace(normalized, filters)
      : calculateMarketplace({ transactions: [] }, filters);
  const reconciliation = reconcileSettlement(normalized, metrics);
  if (metrics?.status === "calculated") {
    metrics.chartInsights = buildChartInsights(metrics, reconciliation);
    metrics.intelligence = buildFinancialIntelligence(metrics, reconciliation);
  }
  return {
    sessionId: session?.id || null,
    persistence: "memory",
    normalized,
    reconciliation,
    metrics,
  };
}
