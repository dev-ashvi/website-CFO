import { httpClient } from "./httpClient.js";
import {
  DEMO_TOKEN_PREFIX,
  PILOT_TOKEN_PREFIX,
  analyticsApiBaseUrl,
  isConfiguredPilotAnalytics,
  isDevDemoMode,
  matchesDemoLogin,
} from "./devMode.js";

function useAuthMock() {
  if (isDevDemoMode()) return true;
  const f = import.meta.env.VITE_USE_AUTH_MOCK;
  if (f === "true" || f === "1") return true;
  if (f === "false" || f === "0") return false;
  return false;
}

function demoLoginResponse({ tenantSlug, email }) {
  return {
    token: `${DEMO_TOKEN_PREFIX}${Date.now()}`,
    user: {
      email,
      tenant_slug: tenantSlug,
      name: "Demo user",
      is_demo: true,
    },
  };
}

/**
 * Temporary internal CFO pilot login (BFF).
 * Uses the same origin as analytics (VITE_ANALYTICS_API_BASE_URL) when set.
 * Produces a non-demo token (wyz-pilot.*) accepted by the pilot BFF.
 */
async function tryPilotLogin({ tenantSlug, email, password }) {
  const base = analyticsApiBaseUrl();
  const url = `${base}/api/v1/pilot-auth/login`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        tenant_slug: tenantSlug,
      }),
    });
  } catch (networkErr) {
    throw { status: 0, message: "Pilot login unreachable.", details: networkErr };
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // Same-origin SPA fallback or missing BFF — treat as unavailable.
    throw { status: 404, message: "Pilot login endpoint not available." };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error && data.error.message) ||
      (data && data.message) ||
      "Invalid email or password.";
    throw { status: res.status, message, details: data };
  }
  const token = data && data.token;
  if (!token || !String(token).startsWith(PILOT_TOKEN_PREFIX)) {
    throw {
      status: 0,
      message: "Pilot login response did not include a valid pilot token.",
      details: data,
    };
  }
  return {
    token,
    user: (data && data.user) || { email, tenant_slug: tenantSlug, is_pilot: true, is_demo: false },
  };
}

export async function login({ tenantSlug, email, password }) {
  const pilotConfigured = isConfiguredPilotAnalytics();

  try {
    return await tryPilotLogin({ tenantSlug, email, password });
  } catch (err) {
    // When analytics base is configured (Vercel → pilot), never fall through to demo.
    if (pilotConfigured) {
      throw {
        status: (err && err.status) || 0,
        message:
          (err && err.message) ||
          "Pilot authentication failed. Check that the analytics backend is reachable.",
        details: err && err.details,
      };
    }
    // Unconfigured: fall through only when the pilot endpoint is absent (plain Vite/dev).
    if (err && (err.status === 404 || err.status === 0 || err.status === 502 || err.status === 503)) {
      // continue to demo / mock / API
    } else if (err && err.status === 401) {
      throw err;
    } else if (err && err.status) {
      throw err;
    }
  }

  // Live + local: fixed demo credentials unlock UI without a backend (BFF rejects these tokens).
  if (matchesDemoLogin({ tenantSlug, email, password })) {
    return demoLoginResponse({ tenantSlug: tenantSlug.trim(), email: email.trim() });
  }

  if (useAuthMock()) {
    return {
      token: `dev-mock-${Date.now()}`,
      user: {
        email,
        tenant_slug: tenantSlug,
        name: "Demo user (local)",
      },
    };
  }

  const payload = {
    tenant_slug: tenantSlug,
    email,
    password,
  };

  const data = await httpClient.post("/api/v1/auth/login", payload);

  const token = data.token;
  if (!token) {
    throw {
      status: 0,
      message: "Login response did not include a token.",
      details: data,
    };
  }

  return {
    token,
    user: data.user || null,
  };
}
