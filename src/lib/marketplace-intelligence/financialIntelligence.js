/**
 * Stage 5A / 5A.1 — Deterministic proactive financial intelligence.
 * Builds a local Intelligence Brief from calculated metrics (no NVIDIA wait).
 */
import { densifyMonthly } from "./insights.js";
import { discoverInsights } from "./insightDiscovery.js";
import { dedupeInsights, selectBriefInsights } from "./insightRanking.js";
import { INSIGHT_SCHEMA_VERSION, INSIGHT_CURRENCY, CONFIDENCE } from "./insightSchema.js";
import { decomposeSalesOrdersAov } from "./decomposition.js";
import { formatMonthLabel } from "./askPresentation.js";

export const BRIEF_SCHEMA_VERSION = 2;

function coverageFromMetrics(metrics, reconciliation) {
  const period = metrics?.period || null;
  const monthly = metrics?.sections?.topline?.monthly || [];
  const dense = monthly.length ? densifyMonthly(monthly) : [];
  const zeroMonths = dense.filter((row) => row.zeroFilled || row.sales === 0).length;
  const dateRange = metrics?.filters?.dateRange || null;
  const productFilter = metrics?.filters?.products || [];
  const diffs = (reconciliation?.comparisons || []).filter((row) => row.status === "difference").length;
  const missing = (reconciliation?.comparisons || []).filter(
    (row) => row.status === "missing_information" || row.status === "not_comparable",
  ).length;
  const matched = (reconciliation?.comparisons || []).filter((row) => row.status === "matched").length;

  const notes = [];
  let coverageCompleteness = CONFIDENCE.HIGH;
  if (dateRange?.start || dateRange?.end) {
    notes.push("Date filter applied — some months may be partial.");
    coverageCompleteness = CONFIDENCE.MEDIUM;
  }
  if (productFilter.length) {
    notes.push(`Product filter active (${productFilter.length}).`);
    coverageCompleteness = CONFIDENCE.MEDIUM;
  }
  if (zeroMonths) {
    notes.push(`${zeroMonths} zero-sales or gap month(s) in densified span.`);
    coverageCompleteness = coverageCompleteness === CONFIDENCE.HIGH ? CONFIDENCE.MEDIUM : coverageCompleteness;
  }
  if (!metrics?.kpis?.grossProductSales) {
    coverageCompleteness = CONFIDENCE.LOW;
    notes.push("No Gross Product Sales in scope.");
  }

  let reconciliationStatus = "unavailable";
  if (!reconciliation) reconciliationStatus = "unavailable";
  else if (diffs > 0) {
    reconciliationStatus = "differences";
    notes.push(`${diffs} unresolved reconciliation difference(s).`);
  } else if (missing > 0 && matched === 0) {
    reconciliationStatus = "missing";
    notes.push(`${missing} missing/not-comparable reconciliation check(s).`);
  } else if (missing > 0) {
    reconciliationStatus = "missing";
    notes.push(`${missing} missing/not-comparable reconciliation check(s).`);
  } else if (matched > 0) {
    reconciliationStatus = "matched";
  } else {
    reconciliationStatus = "unavailable";
  }

  // Calculation confidence: engine produced finite KPIs from session calcs.
  const calculationConfidence =
    metrics?.status === "calculated" && Number.isFinite(metrics?.kpis?.grossProductSales)
      ? CONFIDENCE.HIGH
      : CONFIDENCE.LOW;

  return {
    currency: INSIGHT_CURRENCY,
    period,
    periodLabel:
      period?.start && period?.end
        ? `${formatMonthLabel(String(period.start).slice(0, 7)) || period.start} – ${
            formatMonthLabel(String(period.end).slice(0, 7)) || period.end
          }`
        : "Current session",
    filters: {
      dateRange,
      products: productFilter,
    },
    monthCount: monthly.length,
    densifiedMonthCount: dense.length,
    zeroOrGapMonths: zeroMonths,
    reconciliationStatus: reconciliation?.status || null,
    reconciliationLabel: reconciliation?.statusLabel || null,
    // Separated facets — do not imply the whole report is complete/reconciled.
    facets: {
      calculation: calculationConfidence,
      coverage: coverageCompleteness,
      reconciliation: reconciliationStatus,
      businessCause: "unverified_only",
    },
    /** @deprecated use facets — kept only for older callers */
    dataConfidence: coverageCompleteness,
    notes,
  };
}

/**
 * Build the full intelligence payload attached to calculated metrics.
 */
export function buildFinancialIntelligence(metrics, reconciliation = null) {
  if (!metrics || metrics.status !== "calculated") {
    return {
      schemaVersion: BRIEF_SCHEMA_VERSION,
      insightSchemaVersion: INSIGHT_SCHEMA_VERSION,
      status: "unavailable",
      coverage: null,
      insights: [],
      briefInsights: [],
      brief: { primary: null, secondary: [] },
      generatedAt: null,
    };
  }

  const raw = discoverInsights(metrics, reconciliation);
  const ranked = dedupeInsights(raw);
  const brief = selectBriefInsights(ranked, 5);
  const coverage = coverageFromMetrics(metrics, reconciliation);

  return {
    schemaVersion: BRIEF_SCHEMA_VERSION,
    insightSchemaVersion: INSIGHT_SCHEMA_VERSION,
    status: "ready",
    currency: INSIGHT_CURRENCY,
    coverage,
    insights: ranked,
    // Compat: flat list still available
    briefInsights: brief.all,
    brief,
    generatedAt: new Date().toISOString(),
    source: "deterministic_local",
  };
}

/**
 * Convenience: latest two observed months decomposition from metrics.
 */
export function latestMonthDecomposition(metrics) {
  const monthly = metrics?.sections?.topline?.monthly || [];
  if (monthly.length < 2) return null;
  return decomposeSalesOrdersAov(monthly[monthly.length - 2], monthly[monthly.length - 1]);
}

/**
 * Find an insight by id from an intelligence payload or metrics.intelligence.
 */
export function findInsight(intelligenceOrMetrics, insightId) {
  const pack =
    intelligenceOrMetrics?.briefInsights || intelligenceOrMetrics?.insights
      ? intelligenceOrMetrics
      : intelligenceOrMetrics?.intelligence;
  if (!pack || !insightId) return null;
  return (
    (pack.insights || []).find((row) => row.id === insightId) ||
    (pack.briefInsights || []).find((row) => row.id === insightId) ||
    null
  );
}
