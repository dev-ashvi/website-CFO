/** Shared flags and URL normalization for local development / live demo access. */

/** Fixed credentials for live frontend demo UI (no real backend auth). */
export const DEMO_LOGIN = {
  tenantSlug: "demo",
  email: "demo@wyz.com",
  password: "demo123",
};

export const DEMO_TOKEN_PREFIX = "wyz-demo-";

export function isDevDemoMode() {
  const v = import.meta.env.VITE_DEV_DEMO_MODE;
  if (v !== "true" && v !== "1") return false;
  if (!import.meta.env.DEV) return false;
  return true;
}

/** True when the current session was created via DEMO_LOGIN (works on live builds). */
export function isDemoSession() {
  if (typeof window === "undefined") return false;
  const token = window.localStorage.getItem("wyz_token");
  return Boolean(token && token.startsWith(DEMO_TOKEN_PREFIX));
}

export function matchesDemoLogin({ tenantSlug, email, password }) {
  return (
    String(tenantSlug ?? "").trim().toLowerCase() === DEMO_LOGIN.tenantSlug &&
    String(email ?? "").trim().toLowerCase() === DEMO_LOGIN.email &&
    String(password ?? "") === DEMO_LOGIN.password
  );
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
