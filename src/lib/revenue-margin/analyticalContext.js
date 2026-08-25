import { compareGrowthDisplay, metricSupported } from "./explorers.js";
import { filtersToQueryFilters } from "./filters.js";

export const ATTRIBUTED_MARKETING_TOOLTIP =
  "Marketing spend allocated using the active WYZ attribution methodology.";

export function revenueTableColumns(rows, metricSpec) {
  const showPrimaryMetric = metricSpec?.id !== "net_revenue";
  const showGrowth = (rows || []).some((row) => compareGrowthDisplay(row).supported);
  return {
    showPrimaryMetric,
    showGrowth,
    showContribution: showGrowth,
  };
}

export function marginTableColumns(rows) {
  const list = rows || [];
  return {
    showOrders: list.some((row) => metricSupported(row, "orders")),
    showAov: list.some((row) => metricSupported(row, "net_aov")),
  };
}

export function suggestedAiQuestions({ surface, signals, filters } = {}) {
  const query = filtersToQueryFilters(filters || {});
  const has = (key) => (query[key] || []).length > 0;
  const hasChannel = has("channel");
  const hasCategory = has("category");
  const hasSku = has("sku");
  const questions = [];

  if (hasSku) {
    questions.push(
      "What's driving margin for this SKU?",
      "Where is margin pressure coming from in this view?",
      "What changed over this period?",
      "How does attributed marketing affect CM2 here?",
    );
  } else if (hasChannel && hasCategory) {
    questions.push(
      "Which SKUs contribute most?",
      "Which SKUs contribute least?",
      "What's driving margin in this view?",
      "What changed over the period?",
    );
  } else if (hasChannel) {
    questions.push(
      "What's driving margin in this channel?",
      "Which categories contribute most?",
      "Which SKUs contribute most?",
      "What changed over this period?",
    );
  } else if (hasCategory) {
    questions.push(
      "Which channels drive this category?",
      "Which SKUs contribute most?",
      "What's driving CM2 in this category?",
      "What changed over the period?",
    );
  } else if (surface === "revenue") {
    questions.push(
      "What is driving revenue?",
      "Which areas contributed most to growth?",
      "What changed over this period?",
      "Is revenue quality improving?",
    );
  } else {
    questions.push(
      "What's driving CM2?",
      "Where are the biggest margin pressures?",
      "Which channel contributes most?",
      "What changed over this period?",
    );
  }

  const extras = [];
  for (const signal of (signals || []).slice(0, 2)) {
    if (signal?.entity && signal?.label) {
      const entity = String(signal.entity);
      if (/filtered population/i.test(entity)) continue;
      const extra = `Why is ${entity} ${String(signal.label).toLowerCase()}?`;
      if (!/stop selling|should we|falls \d|scenario/i.test(extra)) {
        extras.push(extra);
      }
    }
  }
  // Prefer signal-aware extras so they are not truncated by the 4-slot cap.
  return [...new Set([...extras, ...questions])].slice(0, 4);
}

export function buildAnalyticalContext({
  result,
  filters,
  surface,
  dimension,
  metric,
}) {
  return {
    workspace_id: result?.workspace_id,
    analysis_job_id: result?.job_id,
    filters,
    surface,
    dimension,
    metric,
  };
}
