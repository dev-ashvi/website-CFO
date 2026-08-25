/** Authenticated Revenue & Margin module routes. */

export const REVENUE_MARGIN_PATH = "/app/revenue-margin";

export const DATASET_STATUSES = {
  CREATED: "CREATED",
  UPLOADING: "UPLOADING",
  PROFILING: "PROFILING",
  MAPPING: "MAPPING",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  VALIDATING: "VALIDATING",
  READY: "READY",
  ANALYSING: "ANALYSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export const JOB_STATUSES = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export const MAPPING_ATTENTION = new Set([
  "review_recommended",
  "user_confirmation_required",
  "rejected",
]);

export const ROLE_LABELS = {
  ORDER_LINES: "Orders detected",
  SKU_MASTER: "Product / COGS detected",
  CHANNEL_SETTLEMENTS: "Channel settlements detected",
  MARKETING_SPEND: "Marketing spend detected",
  UNKNOWN: "Unrecognised file",
};

export function isIngestBusy(status) {
  return ["UPLOADING", "PROFILING", "MAPPING", "VALIDATING"].includes(status);
}

export function isJobBusy(status) {
  return ["QUEUED", "CLAIMED", "RUNNING", "ANALYSING", "WRITING_RESULT", "PROFILING", "MAPPING", "VALIDATING"].includes(
    status,
  );
}

export function jobErrorMessage(error, fallback = "Analysis failed") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error.message) return String(error.message);
  return fallback;
}

export function canStartAnalysis(dataset) {
  return dataset?.status === DATASET_STATUSES.READY && dataset?.readiness?.ready_for_engine === true;
}

export function mappingRowsNeedingAttention(rows = []) {
  return rows.filter((row) => row.needs_attention || MAPPING_ATTENTION.has(row.status));
}

export function applyMappingConfirmation(rows, confirmation) {
  return rows.map((row) => {
    const sameFile = row.source_file === confirmation.source_file;
    if (!sameFile) return row;
    if (row.source_column === confirmation.source_column) {
      return {
        ...row,
        canonical_field: confirmation.canonical_field,
        origin: "user_confirmed",
        status: "confirmed",
        needs_attention: false,
        final_confidence: 1,
      };
    }
    if (row.canonical_field === confirmation.canonical_field && row.source_column !== confirmation.source_column) {
      return { ...row, status: "rejected", needs_attention: true };
    }
    return row;
  });
}

export function workflowStep(status) {
  if (!status || status === DATASET_STATUSES.CREATED) return "setup";
  if (isIngestBusy(status)) return "processing";
  if (status === DATASET_STATUSES.NEEDS_REVIEW) return "review";
  if (status === DATASET_STATUSES.READY) return "ready";
  if (status === DATASET_STATUSES.ANALYSING || status === JOB_STATUSES.QUEUED || status === JOB_STATUSES.RUNNING) {
    return "analysing";
  }
  if (status === DATASET_STATUSES.COMPLETED) return "overview";
  if (status === DATASET_STATUSES.FAILED) return "failed";
  return "setup";
}
