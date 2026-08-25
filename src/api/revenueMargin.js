/**
 * Analytics API client. Isolated from chat/auth `/api/v1` usage.
 *
 * Local Vite proxies `/api/v1/analytics` to the Python worker on :8788.
 * Production WYZ API can implement the same paths later without UI changes.
 */
const ANALYTICS_PREFIX = "/api/v1/analytics";

function analyticsBase() {
  const raw = import.meta.env?.VITE_ANALYTICS_API_BASE_URL;
  return raw ? String(raw).replace(/\/+$/, "") : "";
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
    throw {
      status: response.status,
      message:
        (data && (data.message || data.error || data.detail)) ||
        response.statusText ||
        "Analytics request failed",
      details: data,
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

export function pollUntil(loadFn, { isDone, intervalMs = 1000, timeoutMs = 180000 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const value = await loadFn();
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
        reject(err);
      }
    };
    tick();
  });
}
