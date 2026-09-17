/**
 * Progressive onboarding presentation for Revenue & Margin (P7.1 Pass 1).
 * Backend dataset.status remains authoritative — this module is UI routing only.
 */

import {
  DATASET_STATUSES,
  isIngestBusy,
  isJobBusy,
  mappingRowsNeedingAttention,
} from "./workflow.js";
import { canRestoreAnalysisWorkspace } from "./workspaceSession.js";

export const PRESENTATION_MODE = Object.freeze({
  ONBOARDING: "onboarding",
  WORKSPACE: "workspace",
});

/** Stepper stages (Upload → Detect → Map → Validate → Analyse). */
export const ONBOARDING_STAGES = Object.freeze([
  "upload",
  "detect",
  "map",
  "validate",
  "analyse",
]);

export const ONBOARDING_STAGE_LABELS = Object.freeze({
  upload: "Upload",
  detect: "Detect",
  map: "Map",
  validate: "Validate",
  analyse: "Analyse",
});

/** Business-friendly file role labels for the Detect step. */
export const DETECT_ROLE_LABELS = Object.freeze({
  ORDER_LINES: "Orders",
  SKU_MASTER: "Products / COGS",
  CHANNEL_SETTLEMENTS: "Channel Settlements",
  MARKETING_SPEND: "Marketing Spend",
  UNKNOWN: "Unrecognised file",
});

const DETECT_ACK_PREFIX = "wyz_rm_detect_ack:";

export function detectAckStorageKey(datasetId) {
  if (!datasetId) return null;
  return `${DETECT_ACK_PREFIX}${datasetId}`;
}

export function readDetectAcknowledged(datasetId, storage = globalThis.sessionStorage) {
  const key = detectAckStorageKey(datasetId);
  if (!key || !storage) return false;
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeDetectAcknowledged(datasetId, value = true, storage = globalThis.sessionStorage) {
  const key = detectAckStorageKey(datasetId);
  if (!key || !storage) return;
  try {
    if (value) storage.setItem(key, "1");
    else storage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearDetectAcknowledged(datasetId, storage = globalThis.sessionStorage) {
  writeDetectAcknowledged(datasetId, false, storage);
}

/**
 * Mode B when a restorable analysis result exists for the selected dataset.
 * Opening COMPLETED datasets must land here — no onboarding stack.
 */
export function resolvePresentationMode({ dataset, result } = {}) {
  if (!result || typeof result !== "object") {
    return PRESENTATION_MODE.ONBOARDING;
  }

  const activeId = dataset?.dataset_id != null ? String(dataset.dataset_id) : null;
  const resultId = result.dataset_id != null ? String(result.dataset_id) : null;

  // Never show Dataset A's workspace while Dataset B is selected.
  if (activeId && resultId && activeId !== resultId) {
    return PRESENTATION_MODE.ONBOARDING;
  }

  if (dataset && canRestoreAnalysisWorkspace(dataset, result)) {
    return PRESENTATION_MODE.WORKSPACE;
  }

  // Fresh analysis completion may set result before status flips to COMPLETED.
  if (
    activeId &&
    (!resultId || resultId === activeId) &&
    (result.job_id || result.facts_uri || result.engine_version)
  ) {
    return PRESENTATION_MODE.WORKSPACE;
  }

  if (!dataset) {
    return PRESENTATION_MODE.WORKSPACE;
  }

  return PRESENTATION_MODE.ONBOARDING;
}

export function hasDetectedSources(dataset) {
  const files = dataset?.files || [];
  if (!files.length) return false;
  return files.some(
    (file) =>
      Boolean(file.file_role) ||
      Boolean(file.label) ||
      file.row_count != null ||
      Boolean(file.date_min),
  );
}

function isAnalysisBusy(dataset, job) {
  if (dataset?.status === DATASET_STATUSES.ANALYSING) return true;
  if (isJobBusy(job?.status) || isJobBusy(job?.stage)) return true;
  return false;
}

function isAnalysisFailed(dataset, job) {
  if (job?.status === "FAILED" || job?.stage === "FAILED") return true;
  if (
    dataset?.status === DATASET_STATUSES.FAILED &&
    (dataset?.analysis_status === DATASET_STATUSES.FAILED ||
      dataset?.analysis_status === "FAILED" ||
      job)
  ) {
    return true;
  }
  return false;
}

/**
 * Derive the single focused onboarding stage from backend state + detect ack.
 * Detect may be a frontend acknowledgement when the backend already advanced.
 */
export function resolveOnboardingStage({
  dataset = null,
  job = null,
  detectAcknowledged = false,
} = {}) {
  if (!dataset) return "upload";

  const status = dataset.status;
  const detected = hasDetectedSources(dataset);
  const attention = mappingRowsNeedingAttention(dataset.mappings || []);
  const hasMappings = (dataset.mappings || []).length > 0;

  if (isAnalysisBusy(dataset, job)) return "analyse";
  if (isAnalysisFailed(dataset, job)) return "analyse";

  if (status === DATASET_STATUSES.COMPLETED) {
    // Without a result we stay in onboarding; prefer validate so user can recover.
    return "validate";
  }

  if (status === DATASET_STATUSES.FAILED) {
    if (!detected) return "upload";
    if (!detectAcknowledged) return "detect";
    if (attention.length > 0) return "map";
    if (dataset.readiness) return "validate";
    if (hasMappings) return "map";
    return "upload";
  }

  if (status === DATASET_STATUSES.READY || status === DATASET_STATUSES.VALIDATING) {
    if (detected && !detectAcknowledged) return "detect";
    return "validate";
  }

  if (status === DATASET_STATUSES.NEEDS_REVIEW) {
    if (detected && !detectAcknowledged) return "detect";
    return "map";
  }

  if (status === DATASET_STATUSES.MAPPING) {
    if (detected && !detectAcknowledged) return "detect";
    if (detected) return "detect";
    return "upload";
  }

  if (status === DATASET_STATUSES.UPLOADING || status === DATASET_STATUSES.PROFILING) {
    if (detected && !isIngestBusy(status)) return "detect";
    // Still profiling: keep Upload if roles not ready; otherwise Detect with busy cue.
    if (detected) return "detect";
    return "upload";
  }

  if (status === DATASET_STATUSES.CREATED) {
    return "upload";
  }

  // Fallback for unexpected statuses with partial data
  if (detected && !detectAcknowledged) return "detect";
  if (attention.length > 0) return "map";
  if (dataset.readiness) return "validate";
  if (hasMappings) return "map";
  return "upload";
}

/**
 * Stepper presentation: complete | current | upcoming for each stage.
 */
export function onboardingStepperModel(currentStage) {
  const idx = ONBOARDING_STAGES.indexOf(currentStage);
  const currentIndex = idx < 0 ? 0 : idx;
  return ONBOARDING_STAGES.map((id, i) => ({
    id,
    label: ONBOARDING_STAGE_LABELS[id],
    state: i < currentIndex ? "complete" : i === currentIndex ? "current" : "upcoming",
  }));
}

export function detectSourceCards(dataset) {
  const files = dataset?.files || [];
  return files.map((file) => ({
    key: file.filename || file.file_id || file.label,
    title:
      file.label ||
      DETECT_ROLE_LABELS[file.file_role] ||
      file.file_role ||
      "Data source",
    filename: file.filename || null,
    rowCount: file.row_count ?? null,
    dateMin: file.date_min || null,
    dateMax: file.date_max || file.date_min || null,
    role: file.file_role || null,
  }));
}
