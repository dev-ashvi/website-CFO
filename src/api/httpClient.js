import { normalizeApiBaseUrl } from "./devMode.js";

const DEFAULT_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

let getToken = () => null;
let onUnauthorized = () => {};

export function configureHttpClient({ getTokenFn, onUnauthorizedFn } = {}) {
  if (typeof getTokenFn === "function") {
    getToken = getTokenFn;
  }
  if (typeof onUnauthorizedFn === "function") {
    onUnauthorized = onUnauthorizedFn;
  }
}

async function request(method, path, body, options = {}) {
  const token = getToken();
  const headers = {
    Accept: "application/json",
    ...(body != null ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const url = `${DEFAULT_BASE_URL}${path}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const baseHint =
      import.meta.env.DEV && !DEFAULT_BASE_URL
        ? " In dev, leave VITE_API_BASE_URL unset to use the built-in chat mock, or set VITE_USE_CHAT_MOCK=true. If you use a real API, set VITE_API_BASE_URL to its origin only (e.g. http://localhost:3001), not …/api/v1."
        : import.meta.env.DEV
          ? " Ensure the API server is running, VITE_API_BASE_URL is the origin only (no /api/v1), or set VITE_DEV_DEMO_MODE=true for local mock login + chat."
          : " Check VITE_API_BASE_URL, VPN, and that the API allows CORS from this origin.";
    throw {
      status: 0,
      message: `Network error while contacting the WYZ API.${baseHint}`,
      details: err,
    };
  }

  let data = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const normalizedError = {
      status: response.status,
      message:
        (data && (data.message || data.error || data.detail)) ||
        response.statusText ||
        "Request failed",
      details: data,
    };

    if (response.status === 401) {
      try {
        onUnauthorized();
      } catch {
        // Ignore handler errors; surface the normalized error instead.
      }
    }

    throw normalizedError;
  }

  return data;
}

export const httpClient = {
  get(path, options) {
    return request("GET", path, undefined, options);
  },
  post(path, body, options) {
    return request("POST", path, body, options);
  },
};

