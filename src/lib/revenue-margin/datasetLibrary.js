/**
 * Dataset library helpers — discovery UI only.
 * Backend list metadata is source of truth; never store the library in localStorage.
 */

const HEAVY_KEYS = new Set([
  "mappings",
  "canonical_fields",
  "readiness",
  "source_files",
  "files",
  "waterfall",
  "company",
  "facts_uri",
  "evidence",
  "summary",
  "by_channel",
  "by_category",
  "orders",
  "units",
  "customers",
]);

const PROCESSING = new Set([
  "CREATED",
  "UPLOADING",
  "PROFILING",
  "MAPPING",
  "NEEDS_REVIEW",
  "VALIDATING",
  "READY",
  "ANALYSING",
  "QUEUED",
  "RUNNING",
]);

export function normalizeDatasetLibraryItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const datasetId = typeof raw.dataset_id === "string" ? raw.dataset_id.trim() : "";
  if (!datasetId.startsWith("ds_")) return null;
  for (const key of Object.keys(raw)) {
    if (HEAVY_KEYS.has(key)) {
      // Drop heavy keys rather than rejecting the whole item.
      continue;
    }
  }
  return {
    workspace_id: raw.workspace_id || "local",
    dataset_id: datasetId,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Revenue & Margin analysis",
    status: typeof raw.status === "string" ? raw.status : "UNKNOWN",
    created_at: raw.created_at || null,
    updated_at: raw.updated_at || raw.created_at || null,
    file_count: Number.isFinite(Number(raw.file_count)) ? Number(raw.file_count) : 0,
    analysis_status: raw.analysis_status || null,
    latest_job_id: raw.latest_job_id || null,
    period_label: typeof raw.period_label === "string" ? raw.period_label : null,
  };
}

export function normalizeDatasetLibrary(payload) {
  const items = Array.isArray(payload?.datasets) ? payload.datasets : Array.isArray(payload) ? payload : [];
  const datasets = [];
  for (const item of items) {
    try {
      const normalized = normalizeDatasetLibraryItem(item);
      if (normalized) datasets.push(normalized);
    } catch {
      // L25 — one malformed item must not break the selector.
    }
  }
  return {
    workspace_id: payload?.workspace_id || "local",
    datasets,
    count: datasets.length,
  };
}

export function libraryDisplayTitle(item) {
  if (!item) return "Analysis";
  if (item.period_label) return `Revenue & Margin · ${item.period_label}`;
  if (item.name && item.name.trim()) return item.name.trim();
  if (item.created_at) {
    try {
      const d = new Date(item.created_at);
      if (!Number.isNaN(d.getTime())) {
        return `Analysis · ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
      }
    } catch {
      /* fall through */
    }
  }
  return "Revenue & Margin analysis";
}

export function formatLibraryStatus(status) {
  if (!status) return "Unknown";
  if (status === "COMPLETED") return "Completed";
  if (status === "FAILED") return "Failed";
  if (PROCESSING.has(status)) return "Processing";
  return status;
}

export function formatLibraryDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

/** COMPLETED / in-progress selectable; FAILED selectable to open restore recovery. */
export function isLibraryItemSelectable(item) {
  if (!item?.dataset_id) return false;
  return true;
}

export function assertLibraryPayloadIsLean(payload) {
  const items = Array.isArray(payload?.datasets) ? payload.datasets : [];
  for (const item of items) {
    for (const key of Object.keys(item || {})) {
      if (HEAVY_KEYS.has(key)) {
        throw new Error(`library_payload_heavy_key:${key}`);
      }
    }
  }
  return true;
}
