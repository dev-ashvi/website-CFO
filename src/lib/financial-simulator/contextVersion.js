import { RUNWAY_FORM_SCHEMA_VERSION } from "./defaults.js";

/** Bump when projection / KPI formulas change — invalidates cached AI context. */
export const FINANCIAL_ENGINE_VERSION = "2026.08.12";

/**
 * Stable stringify for hashing — sorts object keys recursively.
 * @param {unknown} value
 */
function stableSerialize(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(",")}}`;
}

/**
 * FNV-1a 32-bit hash — browser-safe, deterministic.
 * @param {string} str
 */
function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * @param {import('./types.js').SimulatorInputs} normalizedInputs
 */
export function computeContextVersion(normalizedInputs) {
  const payload = {
    schemaVersion: RUNWAY_FORM_SCHEMA_VERSION,
    engineVersion: FINANCIAL_ENGINE_VERSION,
    inputs: normalizedInputs,
  };
  return fnv1aHash(stableSerialize(payload));
}

/**
 * @param {string|null|undefined} clientVersion
 * @param {string} serverVersion
 */
export function isContextVersionStale(clientVersion, serverVersion) {
  if (!clientVersion || !serverVersion) return true;
  return clientVersion !== serverVersion;
}
