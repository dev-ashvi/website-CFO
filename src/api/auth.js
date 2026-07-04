import { httpClient } from "./httpClient.js";
import {
  DEMO_TOKEN_PREFIX,
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

export async function login({ tenantSlug, email, password }) {
  // Live + local: one fixed credential set always unlocks demo UI without a backend.
  if (matchesDemoLogin({ tenantSlug, email, password })) {
    return demoLoginResponse({ tenantSlug: tenantSlug.trim(), email: email.trim() });
  }

  // Local-only: any non-empty credentials when mock flags are on.
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
