/**
 * Lightweight Revenue & Margin workspace session restore.
 *
 * Backend dataset/job/result remain the source of truth.
 * Frontend only remembers active_dataset_id (URL + localStorage).
 * Never stores financial values, uploads, or evidence payloads.
 */

export const ACTIVE_DATASET_STORAGE_KEY = "wyz_revenue_margin_active_dataset_id";
export const DATASET_QUERY_PARAM = "dataset";

const ID_RE = /^ds_[a-zA-Z0-9_-]{6,80}$/;

export function isValidDatasetId(value) {
  return typeof value === "string" && ID_RE.test(value.trim());
}

export function readActiveDatasetIdFromStorage(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(ACTIVE_DATASET_STORAGE_KEY);
    return isValidDatasetId(raw) ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function writeActiveDatasetId(datasetId, storage = globalThis.localStorage) {
  if (!isValidDatasetId(datasetId)) return false;
  try {
    storage?.setItem?.(ACTIVE_DATASET_STORAGE_KEY, datasetId.trim());
    return true;
  } catch {
    return false;
  }
}

export function clearActiveDatasetId(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(ACTIVE_DATASET_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Prefer URL ?dataset= over localStorage. */
export function resolveActiveDatasetId({ searchParams, storage = globalThis.localStorage } = {}) {
  const fromUrl = searchParams?.get?.(DATASET_QUERY_PARAM) || searchParams?.get?.("dataset_id");
  if (isValidDatasetId(fromUrl)) return fromUrl.trim();
  return readActiveDatasetIdFromStorage(storage);
}

export function buildRevenueMarginPath(datasetId) {
  if (!isValidDatasetId(datasetId)) return "/app/revenue-margin";
  return `/app/revenue-margin?${DATASET_QUERY_PARAM}=${encodeURIComponent(datasetId.trim())}`;
}

/**
 * Decide whether a dataset+result pair can restore AnalysisWorkspace.
 * Backend statuses are authoritative — never invent COMPLETED client-side.
 */
export function canRestoreAnalysisWorkspace(dataset, result) {
  if (!dataset?.dataset_id || !isValidDatasetId(dataset.dataset_id)) return false;
  if (dataset.status === "FAILED") return false;
  if (!result || typeof result !== "object") return false;
  // Completed analysis exposes a result payload with facts/job lineage.
  const completed =
    dataset.status === "COMPLETED" ||
    Boolean(result.job_id || result.facts_uri || result.engine_version);
  return completed;
}

/** Guard: storage payloads must never include financial keys. */
export function assertSessionPayloadIsLean(payload) {
  if (!payload || typeof payload !== "object") return true;
  const banned = [
    "net_revenue",
    "cm2",
    "cm1",
    "baseline",
    "evidence",
    "summary",
    "rows",
    "file_bytes",
    "prompt",
  ];
  for (const key of Object.keys(payload)) {
    if (banned.includes(key)) {
      throw new Error(`session_payload_banned_key:${key}`);
    }
  }
  return true;
}
