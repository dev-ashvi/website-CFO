/**
 * Analytics API client. Isolated from chat/auth `/api/v1` usage.
 *
 * Local (unset VITE_ANALYTICS_API_BASE_URL): same-origin `/api/v1/analytics`.
 * CFO pilot on Vercel: set VITE_ANALYTICS_API_BASE_URL=https://pilot.financewyz.ai
 *   → https://pilot.financewyz.ai/api/v1/analytics/...
 */
import { analyticsApiBaseUrl } from "./devMode.js";

const ANALYTICS_PREFIX = "/api/v1/analytics";

function analyticsBase() {
  return analyticsApiBaseUrl();
}

function authToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("wyz_token");
}

async function analyticsRequest(method, path, { json, form } = {}) {
  const url = `${analyticsBase()}${ANALYTICS_PREFIX}${path}`;
  const headers = {
    Accept: "application/json",
    ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}),
  };
  let body;
  if (form) {
    body = form;
  } else if (method !== "GET" && json != null) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  let response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch (err) {
    throw {
      status: 0,
      message:
        "Cannot reach the Revenue & Margin analytics worker. Start it with `npm run analytics:worker` during local development.",
      details: err,
    };
  }

  const data = await readBody(response);
  if (!response.ok) {
    const errObj = data && typeof data === "object" ? data.error : null;
    const code = errObj && typeof errObj === "object" ? errObj.code : null;
    const apiMessage =
      (errObj && errObj.message) ||
      (data && (data.message || (typeof data.error === "string" ? data.error : null) || data.detail));
    let message = apiMessage || response.statusText || "Analytics request failed";
    if (response.status === 401 || response.status === 403) {
      message = "Your session is not authorized for this workspace.";
    } else if (response.status === 413 || code === "PAYLOAD_TOO_LARGE") {
      message = "This upload is too large.";
    } else if (response.status === 503 || code === "AI_PROVIDER_UNAVAILABLE") {
      message = "AI CFO is temporarily unavailable.";
    }
    throw {
      status: response.status,
      message,
      details: data,
      request_id: data && data.request_id,
      code,
    };
  }
  return data;
}

async function readBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return response.text().catch(() => null);
}

export async function createDataset({ name, workspace_id } = {}) {
  return analyticsRequest("POST", "/datasets", {
    json: { name: name || "Revenue & Margin dataset", workspace_id: workspace_id || "local" },
  });
}

/** Lightweight workspace-scoped dataset discovery (metadata only). */
export async function listDatasets({ workspace_id = "local" } = {}) {
  const q = workspace_id ? `?workspace_id=${encodeURIComponent(workspace_id)}` : "";
  return analyticsRequest("GET", `/datasets${q}`);
}

export async function getDataset(datasetId) {
  return analyticsRequest("GET", `/datasets/${encodeURIComponent(datasetId)}`);
}

export async function uploadDatasetFiles(datasetId, files) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/files`, { form });
}

export async function confirmMappings(datasetId, items) {
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/mappings/confirm`, {
    json: { items },
  });
}

export async function startAnalysisJob(datasetId) {
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/jobs`, { json: {} });
}

export async function getAnalysisJob(jobId) {
  return analyticsRequest("GET", `/jobs/${encodeURIComponent(jobId)}`);
}

export async function getAnalysisResult(datasetId) {
  return analyticsRequest("GET", `/datasets/${encodeURIComponent(datasetId)}/result`);
}

export async function queryFinancialFacts(datasetId, query) {
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/query`, { json: query });
}

export async function fetchCostBreakdown(datasetId, body) {
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/cost-breakdown`, { json: body });
}

export async function fetchCfoSignals(datasetId, body) {
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/signals`, { json: body });
}

export async function askAiCfo(datasetId, body) {
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/ai-cfo/ask`, { json: body });
}

export async function submitAiFeedback(datasetId, body) {
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/ai-feedback`, { json: body });
}

export async function listAiFeedback(datasetId) {
  return analyticsRequest("GET", `/datasets/${encodeURIComponent(datasetId)}/ai-feedback`);
}

export async function reportClientError(body) {
  return analyticsRequest("POST", "/client-errors", { json: body });
}

export async function trackStrategicDecision(datasetId, body) {
  return analyticsRequest("POST", `/datasets/${encodeURIComponent(datasetId)}/strategic-decisions`, {
    json: body,
  });
}

export async function listStrategicDecisions(datasetId, { status } = {}) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return analyticsRequest("GET", `/datasets/${encodeURIComponent(datasetId)}/strategic-decisions${q}`);
}

export async function evaluateStrategicDecision(datasetId, decisionId, body) {
  return analyticsRequest(
    "POST",
    `/datasets/${encodeURIComponent(datasetId)}/strategic-decisions/${encodeURIComponent(decisionId)}/evaluate`,
    { json: body },
  );
}

export async function reviewStrategicDecision(datasetId, decisionId, body) {
  return analyticsRequest(
    "POST",
    `/datasets/${encodeURIComponent(datasetId)}/strategic-decisions/${encodeURIComponent(decisionId)}/review`,
    { json: body },
  );
}

export async function updateStrategicDecisionStatus(datasetId, decisionId, body) {
  return analyticsRequest(
    "PATCH",
    `/datasets/${encodeURIComponent(datasetId)}/strategic-decisions/${encodeURIComponent(decisionId)}/status`,
    { json: body },
  );
}

/** Transient poll failures worth retrying (includes observed pilot 501). */
export function isTransientAnalyticsPollError(err) {
  const status = err && typeof err.status === "number" ? err.status : null;
  return status === 0 || status === 500 || status === 501 || status === 502 || status === 503 || status === 504;
}

export function pollUntil(
  loadFn,
  { isDone, intervalMs = 1000, timeoutMs = 180000, maxTransientErrors = 5 } = {},
) {
  const started = Date.now();
  let transientErrors = 0;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const value = await loadFn();
        transientErrors = 0;
        if (isDone(value)) {
          resolve(value);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject({ status: 0, message: "Timed out waiting for analytics worker." });
          return;
        }
        setTimeout(tick, intervalMs);
      } catch (err) {
        if (isTransientAnalyticsPollError(err) && transientErrors < maxTransientErrors) {
          transientErrors += 1;
          if (Date.now() - started > timeoutMs) {
            reject({ status: 0, message: "Timed out waiting for analytics worker." });
            return;
          }
          setTimeout(tick, intervalMs);
          return;
        }
        reject(err);
      }
    };
    tick();
  });
}

function terminalJobFromDataset(dataset, jobId) {
  const status = dataset?.analysis_status || dataset?.status || null;
  if (status === "COMPLETED") {
    return {
      job_id: jobId,
      analysis_job_id: jobId,
      status: "COMPLETED",
      stage: "COMPLETED",
      message: "Analysis complete",
      recovered_from_dataset: true,
    };
  }
  if (status === "FAILED") {
    return {
      job_id: jobId,
      analysis_job_id: jobId,
      status: "FAILED",
      stage: "FAILED",
      error: dataset?.error || { message: "Analysis failed" },
      recovered_from_dataset: true,
    };
  }
  return null;
}

/**
 * Poll a job with transient retries. If polls still fail, trust dataset state.
 */
export async function waitForAnalysisJob(jobId, datasetId, pollOptions = {}) {
  const opts = {
    isDone: (value) => value?.status === "COMPLETED" || value?.status === "FAILED",
    intervalMs: 1000,
    timeoutMs: 180000,
    maxTransientErrors: 5,
    ...pollOptions,
  };
  try {
    return await pollUntil(() => getAnalysisJob(jobId), opts);
  } catch (err) {
    if (!datasetId) throw err;
    let dataset;
    try {
      dataset = await getDataset(datasetId);
    } catch {
      throw err;
    }
    const recovered = terminalJobFromDataset(dataset, jobId);
    if (recovered) {
      if (recovered.status === "COMPLETED") {
        try {
          return await getAnalysisJob(jobId);
        } catch {
          return recovered;
        }
      }
      return recovered;
    }
    const busy = ["QUEUED", "CLAIMED", "RUNNING", "ANALYSING", "WRITING_RESULT"].includes(
      String(dataset?.analysis_status || dataset?.status || ""),
    );
    throw {
      status: (err && err.status) || 0,
      message: busy
        ? "Analysis is still running on the server. Refresh this page or try again in a moment."
        : (err && err.message) || "Timed out waiting for analytics worker.",
      details: { err, dataset_status: dataset?.status, analysis_status: dataset?.analysis_status },
      code: "ANALYSIS_POLL_RECOVERY_NEEDED",
    };
  }
}
