/** Shared flags and URL normalization for local development. */

export function isDevDemoMode() {
  const v = import.meta.env.VITE_DEV_DEMO_MODE;
  if (v !== "true" && v !== "1") return false;
  if (!import.meta.env.DEV) return false;
  return true;
}

/**
 * API base should be origin only, e.g. http://localhost:3001.
 * Strips trailing slashes and a mistaken `/api/v1` suffix (paths already include `/api/v1/...`).
 */
export function normalizeApiBaseUrl(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  s = s.replace(/\/+$/, "");
  if (s.endsWith("/api/v1")) {
    s = s.slice(0, -"/api/v1".length);
  }
  return s.replace(/\/+$/, "");
}
