/**
 * Frontend SignalContext builder for Ask WYZ.
 *
 * Topic metadata only — never filter overrides, never raw evidence values.
 * Current UI FinancialScope remains authoritative via analytical.filters.
 */

const ALLOWED_DIMENSIONS = new Set(["channel", "category", "sku"]);

const MAX_STR = 200;

function clip(value, max = MAX_STR) {
  const text = String(value ?? "").trim();
  return text.slice(0, max);
}

/**
 * Stable client-side id for telemetry (backend may recompute).
 * Does not include financial values.
 */
export function buildSignalId({ datasetId, scopeHash, signalType, dimension, entity }) {
  const raw = [datasetId, scopeHash, signalType, dimension, entity]
    .map((part) => String(part ?? "").trim())
    .join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `sig_${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Build ask-request signal_context from a CFO signal + stamped scope.
 * Strips evidence / filters / materiality. Returns null if invalid.
 *
 * @param {object} signal
 * @param {{ datasetId: string, scopeHash: string }} stamp
 * @returns {object|null}
 */
export function buildSignalContext(signal, stamp = {}) {
  const datasetId = clip(stamp.datasetId, 120);
  const scopeHash = clip(stamp.scopeHash, 80);
  const signalType = clip(signal?.signal_type, 80);
  const entity = clip(signal?.entity, 120);
  const dimension = clip(signal?.entity_type || signal?.dimension, 40).toLowerCase();
  const stage = clip(signal?.stage, 40);
  const label = clip(signal?.label, MAX_STR);

  if (!datasetId || !scopeHash || !signalType || !entity || !dimension) return null;
  if (!ALLOWED_DIMENSIONS.has(dimension)) return null;
  if (!scopeHash.startsWith("scope_")) return null;

  return {
    signal_id: buildSignalId({
      datasetId,
      scopeHash,
      signalType,
      dimension,
      entity,
    }),
    signal_type: signalType,
    entity,
    dimension,
    stage: stage || null,
    label: label || null,
    economic_role: signalType,
    scope_hash: scopeHash,
    dataset_id: datasetId,
  };
}

/** Generic Ask WYZ starter — meaning lives in signal_context, not brittle English. */
export const ASK_WYZ_STARTER_QUESTION = "Explain this signal.";

/**
 * Assert Ask WYZ does not mutate UI filters (Investigate vs Ask distinction).
 */
export function askWyzPreservesFilters(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

/**
 * Keys that must never appear on signal_context payloads.
 */
export const FORBIDDEN_SIGNAL_CONTEXT_KEYS = [
  "evidence",
  "filters",
  "materiality",
  "caveats",
  "severity",
  "cm2",
  "cm2_pct",
  "net_revenue",
  "rows",
];

export function signalContextHasOnlyTopicFields(ctx) {
  if (!ctx || typeof ctx !== "object") return false;
  for (const key of Object.keys(ctx)) {
    if (FORBIDDEN_SIGNAL_CONTEXT_KEYS.includes(key)) return false;
  }
  return true;
}
