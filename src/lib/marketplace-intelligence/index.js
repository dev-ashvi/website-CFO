/**
 * Marketplace Intelligence engine.
 *
 * Public route: /marketplace-intelligence (no login).
 * Layers: ingestion → calculations → reconciliation → investigations → UI.
 */
import { calculateMarketplace, createEmptyFilters } from "./calculations.js";
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
  calculateMarketplace,
  countDistinctOrders,
  createEmptyFilters,
  filterTransactions,
} from "./calculations.js";
export { normalizeProductName } from "./classify.js";
export { reconcileSettlement } from "./reconciliation.js";
export {
  ASK_WYZ_DISCLOSURE,
  ASK_WYZ_MODE,
  buildInvestigationContext,
  investigate,
} from "./investigations.js";
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
  return {
    sessionId: session?.id || null,
    persistence: "memory",
    normalized,
    reconciliation,
    metrics,
  };
}
