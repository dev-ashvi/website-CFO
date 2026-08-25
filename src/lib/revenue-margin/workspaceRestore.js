/**
 * Revenue & Margin workspace restore state machine.
 *
 * Terminal phases: IDLE | RESTORED | FAILED | NOT_FOUND
 * RESTORING must always exit — never leave the UI spinning indefinitely.
 */

import {
  canRestoreAnalysisWorkspace,
  clearActiveDatasetId,
  isValidDatasetId,
  readActiveDatasetIdFromStorage,
  writeActiveDatasetId,
  DATASET_QUERY_PARAM,
} from "./workspaceSession.js";

export const RESTORE_PHASE = Object.freeze({
  IDLE: "IDLE",
  RESTORING: "RESTORING",
  RESTORED: "RESTORED",
  FAILED: "FAILED",
  NOT_FOUND: "NOT_FOUND",
});

const RESTORE_TIMEOUT_MS = 45000;

/**
 * Canonical workspace result shape for fresh analysis AND restore.
 * Both paths must produce the same model for AnalysisWorkspace.
 */
export function normalizeRevenueMarginWorkspaceResult(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("invalid_analysis_result");
  }
  const datasetId = response.dataset_id;
  if (datasetId != null && !isValidDatasetId(String(datasetId))) {
    throw new Error("invalid_analysis_result_dataset_id");
  }
  if (!response.job_id && !response.facts_uri && !response.engine_version && !response.company) {
    throw new Error("invalid_analysis_result_shape");
  }
  return {
    ...response,
    dataset_id: datasetId ?? null,
    job_id: response.job_id ?? null,
    engine_version: response.engine_version ?? null,
    facts_uri: response.facts_uri ?? null,
    mapping_version: response.mapping_version ?? null,
    dataset_version: response.dataset_version ?? null,
    result_id: response.result_id ?? null,
  };
}

export function resolveRestoreTarget({ searchParams, storage = globalThis.localStorage } = {}) {
  const fromUrl =
    searchParams?.get?.(DATASET_QUERY_PARAM) || searchParams?.get?.("dataset_id") || null;
  if (isValidDatasetId(fromUrl)) {
    return { datasetId: fromUrl.trim(), source: "url" };
  }
  if (fromUrl && String(fromUrl).trim()) {
    return { datasetId: String(fromUrl).trim(), source: "url", invalid: true };
  }
  const fromStorage = readActiveDatasetIdFromStorage(storage);
  if (fromStorage) {
    return { datasetId: fromStorage, source: "storage" };
  }
  return { datasetId: null, source: null };
}

function emitRestoreTelemetry(event, payload = {}) {
  try {
    if (typeof console !== "undefined" && typeof console.info === "function") {
      console.info(`[workspace_restore] ${event}`, {
        dataset_id: payload.dataset_id ?? null,
        dataset_status: payload.dataset_status ?? null,
        http_status: payload.http_status ?? null,
        failure_stage: payload.failure_stage ?? null,
        elapsed_ms: payload.elapsed_ms ?? null,
        source: payload.source ?? null,
      });
    }
  } catch {
    /* ignore */
  }
}

function withTimeout(promise, ms, failureStage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject({
        status: 0,
        message: `Workspace restore timed out (${failureStage}).`,
        failure_stage: failureStage,
      });
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Pure restore runner (testable). Callers supply fetchers and apply callbacks.
 *
 * @returns {Promise<{ phase: string, dataset?: object, result?: object|null, error?: string, clearedStorage?: boolean }>}
 */
export async function runWorkspaceRestore({
  target,
  getDataset,
  getAnalysisResult,
  storage = globalThis.localStorage,
  timeoutMs = RESTORE_TIMEOUT_MS,
  isStale = () => false,
  onTelemetry = emitRestoreTelemetry,
} = {}) {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  if (!target?.datasetId) {
    onTelemetry("workspace_restore_completed", { elapsed_ms: elapsed(), failure_stage: null });
    return { phase: RESTORE_PHASE.IDLE, dataset: null, result: null };
  }

  if (target.invalid || !isValidDatasetId(target.datasetId)) {
    onTelemetry("workspace_restore_failed", {
      dataset_id: target.datasetId,
      http_status: 0,
      failure_stage: "invalid_dataset_id",
      elapsed_ms: elapsed(),
      source: target.source,
    });
    if (target.source === "url") {
      const stored = readActiveDatasetIdFromStorage(storage);
      if (stored === target.datasetId) clearActiveDatasetId(storage);
    } else {
      clearActiveDatasetId(storage);
    }
    return {
      phase: RESTORE_PHASE.NOT_FOUND,
      dataset: null,
      result: null,
      error: "We couldn't restore this analysis.",
      clearedStorage: true,
    };
  }

  const datasetId = target.datasetId;
  onTelemetry("workspace_restore_started", {
    dataset_id: datasetId,
    elapsed_ms: 0,
    source: target.source,
  });

  let meta;
  try {
    onTelemetry("workspace_restore_dataset_requested", { dataset_id: datasetId, source: target.source });
    meta = await withTimeout(getDataset(datasetId), timeoutMs, "dataset_fetch");
    if (isStale()) {
      return { phase: RESTORE_PHASE.IDLE, aborted: true };
    }
    onTelemetry("workspace_restore_dataset_received", {
      dataset_id: datasetId,
      dataset_status: meta?.status ?? null,
      http_status: 200,
      elapsed_ms: elapsed(),
      source: target.source,
    });
  } catch (err) {
    if (isStale()) return { phase: RESTORE_PHASE.IDLE, aborted: true };
    const status = err?.status ?? 0;
    const notFound = status === 404;
    onTelemetry("workspace_restore_failed", {
      dataset_id: datasetId,
      http_status: status,
      failure_stage: "dataset_fetch",
      elapsed_ms: elapsed(),
      source: target.source,
    });
    // URL failure must not silently load a different localStorage dataset.
    if (target.source === "url") {
      const stored = readActiveDatasetIdFromStorage(storage);
      if (stored === datasetId) clearActiveDatasetId(storage);
    } else {
      clearActiveDatasetId(storage);
    }
    return {
      phase: notFound ? RESTORE_PHASE.NOT_FOUND : RESTORE_PHASE.FAILED,
      dataset: null,
      result: null,
      error: "We couldn't restore this analysis.",
      clearedStorage: true,
    };
  }

  if (!meta?.dataset_id || meta.status === "FAILED") {
    if (isStale()) return { phase: RESTORE_PHASE.IDLE, aborted: true };
    onTelemetry("workspace_restore_failed", {
      dataset_id: datasetId,
      dataset_status: meta?.status ?? null,
      http_status: 200,
      failure_stage: "dataset_unusable",
      elapsed_ms: elapsed(),
      source: target.source,
    });
    if (target.source === "url") {
      const stored = readActiveDatasetIdFromStorage(storage);
      if (stored === datasetId) clearActiveDatasetId(storage);
    } else {
      clearActiveDatasetId(storage);
    }
    return {
      phase: RESTORE_PHASE.FAILED,
      dataset: null,
      result: null,
      error: "We couldn't restore this analysis.",
      clearedStorage: true,
    };
  }

  let result = null;
  if (meta.status === "COMPLETED" || meta.latest_job_id) {
    try {
      onTelemetry("workspace_restore_result_requested", {
        dataset_id: datasetId,
        dataset_status: meta.status,
        elapsed_ms: elapsed(),
        source: target.source,
      });
      const raw = await withTimeout(getAnalysisResult(datasetId), timeoutMs, "result_fetch");
      if (isStale()) return { phase: RESTORE_PHASE.IDLE, aborted: true };
      onTelemetry("workspace_restore_result_received", {
        dataset_id: datasetId,
        dataset_status: meta.status,
        http_status: 200,
        elapsed_ms: elapsed(),
        source: target.source,
      });
      const normalized = normalizeRevenueMarginWorkspaceResult(raw);
      if (canRestoreAnalysisWorkspace(meta, normalized)) {
        result = normalized;
      } else if (meta.status === "COMPLETED") {
        onTelemetry("workspace_restore_failed", {
          dataset_id: datasetId,
          dataset_status: meta.status,
          http_status: 200,
          failure_stage: "result_not_restorable",
          elapsed_ms: elapsed(),
          source: target.source,
        });
        return {
          phase: RESTORE_PHASE.FAILED,
          dataset: meta,
          result: null,
          error: "We couldn't restore this analysis.",
        };
      }
    } catch (err) {
      if (isStale()) return { phase: RESTORE_PHASE.IDLE, aborted: true };
      // Incomplete datasets may lack a result — keep metadata for setup resume.
      if (meta.status === "COMPLETED") {
        onTelemetry("workspace_restore_failed", {
          dataset_id: datasetId,
          dataset_status: meta.status,
          http_status: err?.status ?? 0,
          failure_stage: err?.failure_stage || "result_fetch",
          elapsed_ms: elapsed(),
          source: target.source,
        });
        return {
          phase: RESTORE_PHASE.FAILED,
          dataset: meta,
          result: null,
          error: "We couldn't restore this analysis.",
        };
      }
    }
  }

  if (isStale()) return { phase: RESTORE_PHASE.IDLE, aborted: true };

  // Successful URL/storage restore updates convenience localStorage to match.
  writeActiveDatasetId(meta.dataset_id, storage);
  onTelemetry("workspace_restore_completed", {
    dataset_id: meta.dataset_id,
    dataset_status: meta.status,
    http_status: 200,
    elapsed_ms: elapsed(),
    source: target.source,
  });

  return {
    phase: RESTORE_PHASE.RESTORED,
    dataset: meta,
    result,
  };
}


