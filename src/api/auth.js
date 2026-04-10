import { httpClient } from "./httpClient.js";
import { isDevDemoMode } from "./devMode.js";

function useAuthMock() {
  if (isDevDemoMode()) return true;
  const f = import.meta.env.VITE_USE_AUTH_MOCK;
  if (f === "true" || f === "1") return true;
  if (f === "false" || f === "0") return false;
  return false;
}

export async function login({ tenantSlug, email, password }) {
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
