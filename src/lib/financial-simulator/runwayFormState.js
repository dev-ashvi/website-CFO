import { getDefaultInputs, RUNWAY_FORM_SCHEMA_VERSION } from "./defaults.js";

export const RUNWAY_FORM_STORAGE_KEY = "wyz_runway_simulator_form";

/**
 * Fresh form state for the runway simulator UI.
 * Always stamps the current schema version.
 */
export function createInitialFormInputs() {
  return {
    ...getDefaultInputs(),
    schemaVersion: RUNWAY_FORM_SCHEMA_VERSION,
  };
}

/**
 * Accept stored form state only when schemaVersion matches.
 * Legacy drafts (missing version, or swapped S&M/fulfilment era) are discarded.
 * @param {unknown} raw
 * @returns {import('./types.js').SimulatorInputs}
 */
export function migrateOrResetFormInputs(raw) {
  if (!raw || typeof raw !== "object") {
    return createInitialFormInputs();
  }
  const version = Number(/** @type {{ schemaVersion?: number }} */ (raw).schemaVersion);
  if (version !== RUNWAY_FORM_SCHEMA_VERSION) {
    return createInitialFormInputs();
  }
  return {
    ...createInitialFormInputs(),
    ...raw,
    schemaVersion: RUNWAY_FORM_SCHEMA_VERSION,
  };
}

/**
 * Read browser draft if present and schema-compatible; otherwise fresh defaults.
 * Never restores incompatible legacy S&M=40 / Fulfilment=20 drafts.
 */
export function loadStoredFormInputs() {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return createInitialFormInputs();
  }
  try {
    const raw = window.sessionStorage.getItem(RUNWAY_FORM_STORAGE_KEY);
    if (!raw) return createInitialFormInputs();
    return migrateOrResetFormInputs(JSON.parse(raw));
  } catch {
    return createInitialFormInputs();
  }
}

/**
 * Persist form draft with schema version (best-effort).
 * @param {import('./types.js').SimulatorInputs} inputs
 */
export function persistFormInputs(inputs) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const payload = {
      ...inputs,
      schemaVersion: RUNWAY_FORM_SCHEMA_VERSION,
    };
    window.sessionStorage.setItem(RUNWAY_FORM_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

/** Drop any stored draft (e.g. after schema bump or explicit reset). */
export function clearStoredFormInputs() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(RUNWAY_FORM_STORAGE_KEY);
  } catch {
    // ignore
  }
}
