/**
 * Progressive onboarding presentation for Revenue & Margin (P7.1).
 * Backend dataset.status remains authoritative for capability.
 * Session review flags control whether the user has reviewed Detect / Map.
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

/** Business-friendly file role labels for Detect / Map grouping. */
export const DETECT_ROLE_LABELS = Object.freeze({
  ORDER_LINES: "Orders",
  SKU_MASTER: "Products / COGS",
  CHANNEL_SETTLEMENTS: "Channel settlements",
  MARKETING_SPEND: "Marketing spend",
  UNKNOWN: "Unrecognised file",
});

export const REVIEW_STEPS = Object.freeze({
  DETECT: "detect",
  MAP: "map",
});

const REVIEW_PREFIX = "wyz_rm_step_review:";
/** Legacy detect-only key — still read for session continuity. */
const DETECT_ACK_PREFIX = "wyz_rm_detect_ack:";

const ROLE_DISPLAY_ORDER = [
  "ORDER_LINES",
  "SKU_MASTER",
  "CHANNEL_SETTLEMENTS",
  "MARKETING_SPEND",
  "UNKNOWN",
];

export function detectAckStorageKey(datasetId) {
  if (!datasetId) return null;
  return `${DETECT_ACK_PREFIX}${datasetId}`;
}

export function stepReviewStorageKey(datasetId, step) {
  if (!datasetId || !step) return null;
  return `${REVIEW_PREFIX}${datasetId}:${step}`;
}

export function readStepReviewed(datasetId, step, storage = globalThis.sessionStorage) {
  const key = stepReviewStorageKey(datasetId, step);
  if (!key || !storage) return false;
  try {
    if (storage.getItem(key) === "1") return true;
    // Migrate legacy detect acknowledgement into the generalized model.
    if (step === REVIEW_STEPS.DETECT) {
      const legacy = detectAckStorageKey(datasetId);
      if (legacy && storage.getItem(legacy) === "1") return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function writeStepReviewed(datasetId, step, value = true, storage = globalThis.sessionStorage) {
  const key = stepReviewStorageKey(datasetId, step);
  if (!key || !storage) return;
  try {
    if (value) storage.setItem(key, "1");
    else storage.removeItem(key);
    if (step === REVIEW_STEPS.DETECT) {
      const legacy = detectAckStorageKey(datasetId);
      if (!legacy) return;
      if (value) storage.setItem(legacy, "1");
      else storage.removeItem(legacy);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStepReviewed(datasetId, step, storage = globalThis.sessionStorage) {
  writeStepReviewed(datasetId, step, false, storage);
}

export function clearAllStepReviews(datasetId, storage = globalThis.sessionStorage) {
  clearStepReviewed(datasetId, REVIEW_STEPS.DETECT, storage);
  clearStepReviewed(datasetId, REVIEW_STEPS.MAP, storage);
}

/** @deprecated Prefer readStepReviewed(datasetId, REVIEW_STEPS.DETECT) */
export function readDetectAcknowledged(datasetId, storage = globalThis.sessionStorage) {
  return readStepReviewed(datasetId, REVIEW_STEPS.DETECT, storage);
}

/** @deprecated Prefer writeStepReviewed(datasetId, REVIEW_STEPS.DETECT, value) */
export function writeDetectAcknowledged(datasetId, value = true, storage = globalThis.sessionStorage) {
  writeStepReviewed(datasetId, REVIEW_STEPS.DETECT, value, storage);
}

/** @deprecated Prefer clearStepReviewed(datasetId, REVIEW_STEPS.DETECT) */
export function clearDetectAcknowledged(datasetId, storage = globalThis.sessionStorage) {
  clearStepReviewed(datasetId, REVIEW_STEPS.DETECT, storage);
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

export function hasMappingRows(dataset) {
  return (dataset?.mappings || []).length > 0;
}

/**
 * Map is a presentation trust step whenever mapping rows exist,
 * or the backend still requires mapping review (NEEDS_REVIEW).
 */
export function needsMapPresentation(dataset) {
  if (!dataset) return false;
  if (dataset.status === DATASET_STATUSES.NEEDS_REVIEW) return true;
  return hasMappingRows(dataset);
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
 * Derive the single focused onboarding stage from backend capability + session reviews.
 * Backend completion does NOT auto-skip Detect or Map presentation.
 */
export function resolveOnboardingStage({
  dataset = null,
  job = null,
  detectReviewed = false,
  mappingReviewed = false,
  /** @deprecated alias for detectReviewed */
  detectAcknowledged = undefined,
} = {}) {
  if (!dataset) return "upload";

  const detectAck = detectAcknowledged !== undefined ? Boolean(detectAcknowledged) : Boolean(detectReviewed);
  const mapAck = Boolean(mappingReviewed);
  const status = dataset.status;
  const detected = hasDetectedSources(dataset);
  const attention = mappingRowsNeedingAttention(dataset.mappings || []);
  const showMap = needsMapPresentation(dataset);

  if (isAnalysisBusy(dataset, job)) return "analyse";
  if (isAnalysisFailed(dataset, job)) return "analyse";

  if (status === DATASET_STATUSES.COMPLETED) {
    // Without a result we stay in onboarding; prefer validate so user can recover.
    return "validate";
  }

  if (status === DATASET_STATUSES.FAILED) {
    if (!detected) return "upload";
    if (!detectAck) return "detect";
    if (attention.length > 0 || (showMap && !mapAck)) return "map";
    if (dataset.readiness) return "validate";
    if (showMap) return "map";
    return "upload";
  }

  if (status === DATASET_STATUSES.READY || status === DATASET_STATUSES.VALIDATING) {
    if (detected && !detectAck) return "detect";
    if (showMap && !mapAck) return "map";
    return "validate";
  }

  if (status === DATASET_STATUSES.NEEDS_REVIEW) {
    if (detected && !detectAck) return "detect";
    return "map";
  }

  if (status === DATASET_STATUSES.MAPPING) {
    if (detected && !detectAck) return "detect";
    if (detected) return "detect";
    return "upload";
  }

  if (status === DATASET_STATUSES.UPLOADING || status === DATASET_STATUSES.PROFILING) {
    if (detected && !isIngestBusy(status)) return "detect";
    if (detected) return "detect";
    return "upload";
  }

  if (status === DATASET_STATUSES.CREATED) {
    return "upload";
  }

  // Fallback for unexpected statuses with partial data
  if (detected && !detectAck) return "detect";
  if (attention.length > 0 || (showMap && !mapAck)) return "map";
  if (dataset.readiness) return "validate";
  if (showMap) return "map";
  return "upload";
}

/**
 * Presentation-only back target. Does not mutate backend state.
 * Detect → Upload is intentionally unsupported (ambiguous after files exist).
 * Analyse has no Back once a job is authoritative.
 */
export function onboardingBackTarget(stage) {
  if (stage === "map") return "detect";
  if (stage === "validate") return "map";
  return null;
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
  return files.map((file) => {
    const roleLabel = file.file_role ? DETECT_ROLE_LABELS[file.file_role] : null;
    const rawLabel = file.label || file.file_role || "Data source";
    const title = roleLabel || String(rawLabel).replace(/\s+detected$/i, "");
    return {
      key: file.filename || file.file_id || file.label,
      title,
      filename: file.filename || null,
      rowCount: file.row_count ?? null,
      dateMin: file.date_min || null,
      dateMax: file.date_max || file.date_min || null,
      role: file.file_role || null,
    };
  });
}

function mappingReviewLabel(row) {
  if (row?.needs_attention || ["review_recommended", "user_confirmation_required", "rejected"].includes(row?.status)) {
    return "Needs review";
  }
  if (row?.origin === "user_confirmed" || row?.status === "confirmed") return "Confirmed";
  if (row?.status === "auto_accepted" || row?.origin === "auto" || row?.origin === "auto_accepted") {
    return "Accepted";
  }
  if (row?.status) {
    const raw = String(row.status).replace(/_/g, " ");
    if (/auto|accepted|mapped|confirmed/i.test(raw)) return "Accepted";
  }
  return "Accepted";
}

/**
 * Group existing mapping rows by business role for the Map trust screen.
 */
export function mappingGroupsByRole(dataset) {
  const mappings = dataset?.mappings || [];
  const filesByName = new Map((dataset?.files || []).map((f) => [f.filename, f]));
  const groups = new Map();

  for (const row of mappings) {
    const role = row.file_role || filesByName.get(row.source_file)?.file_role || "UNKNOWN";
    if (!groups.has(role)) {
      groups.set(role, {
        role,
        title: DETECT_ROLE_LABELS[role] || role,
        filename: row.source_file || null,
        rows: [],
      });
    }
    const group = groups.get(role);
    if (!group.filename && row.source_file) group.filename = row.source_file;
    group.rows.push({
      key: `${row.source_file}:${row.source_column}`,
      sourceFile: row.source_file || null,
      sourceColumn: row.source_column || null,
      canonicalField: row.canonical_field || null,
      confidence: row.final_confidence != null ? Number(row.final_confidence) : null,
      status: row.status || null,
      reviewLabel: mappingReviewLabel(row),
      needsAttention: Boolean(
        row.needs_attention || ["review_recommended", "user_confirmation_required", "rejected"].includes(row.status),
      ),
      fileRole: role,
      raw: row,
    });
  }

  return ROLE_DISPLAY_ORDER.filter((role) => groups.has(role))
    .concat([...groups.keys()].filter((role) => !ROLE_DISPLAY_ORDER.includes(role)))
    .map((role) => groups.get(role));
}

/**
 * Compact Validate-step success facts from verified readiness only.
 * Does not invent checks — only surfaces ready_for_engine + ok joins.
 */
export function validateReadinessHighlights(readiness) {
  if (!readiness) return [];
  const highlights = [];

  if (readiness.ready_for_engine === true) {
    highlights.push({ key: "required", label: "Required data is available" });
  }

  for (const join of readiness.joins || []) {
    if (!join?.ok) continue;
    const pct = Math.round(Number(join.match_pct || 0) * 100);
    if (!Number.isFinite(pct)) continue;
    const name = String(join.name || "");
    if (name.includes("sku_master")) {
      highlights.push({ key: name, label: `Product join coverage: ${pct}%` });
    } else if (name.includes("settlements")) {
      highlights.push({ key: name, label: `Settlement join coverage: ${pct}%` });
    }
  }

  return highlights;
}

/**
 * Executive readiness chips derived only from existing dataset fields.
 */
export function validateExecutiveSummary(dataset) {
  if (!dataset) return [];
  const chips = [];
  const sourceCount = (dataset.files || []).length;
  if (sourceCount > 0) {
    chips.push({ key: "sources", label: `${sourceCount} Data source${sourceCount === 1 ? "" : "s"}` });
  }

  const mappings = dataset.mappings || [];
  const mappedCount = mappings.filter((row) => row.canonical_field).length;
  if (mappedCount > 0) {
    chips.push({ key: "mapped", label: `${mappedCount} Mapped` });
  }

  for (const join of dataset.readiness?.joins || []) {
    if (!join?.ok) continue;
    const pct = Math.round(Number(join.match_pct || 0) * 100);
    if (!Number.isFinite(pct)) continue;
    const name = String(join.name || "");
    if (name.includes("sku_master")) {
      chips.push({ key: `join-${name}`, label: `${pct}% Product joins` });
    } else if (name.includes("settlements")) {
      chips.push({ key: `join-${name}`, label: `${pct}% Settlement joins` });
    }
  }

  return chips;
}
