/**
 * WYZ analytics pilot BFF — same-origin or cross-origin proxy + temporary pilot login.
 *
 * Layers (independent):
 *   Cloudflare Access (external, optional) → Tunnel → this BFF (pilot session) → analytics-api
 *
 * TEMPORARY two-user internal CFO pilot auth only — not multi-tenant SaaS.
 * Does NOT read Cloudflare Access headers for authorization.
 * Auth is Bearer wyz-pilot.*; CORS is exact-origin allowlist (never *).
 */

import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.WYZ_BFF_PORT || 8080);
const UPSTREAM = (process.env.ANALYTICS_UPSTREAM || "http://analytics-api:8788").replace(/\/$/, "");
const PILOT_TOKEN = (process.env.WYZ_PILOT_API_TOKEN || "").trim();
const SESSION_SECRET = (process.env.WYZ_PILOT_SESSION_SECRET || "").trim();
const REQUIRE_BEARER = String(process.env.WYZ_BFF_REQUIRE_BEARER || "true").toLowerCase() !== "false";
const REJECT_DEMO = String(process.env.WYZ_BFF_REJECT_DEMO || "true").toLowerCase() !== "false";
const MAX_BODY = Number(process.env.WYZ_MAX_REQUEST_BODY_MB || 120) * 1024 * 1024;
const ALLOWED_ORIGINS = new Set(
  String(process.env.WYZ_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean)
);
const RELEASE = process.env.WYZ_RELEASE_SHA || "unknown";
const ANALYTICS_PREFIX = "/api/v1/analytics";
const PILOT_AUTH_PREFIX = "/api/v1/pilot-auth";
const PILOT_SESSION_PREFIX = "wyz-pilot.";

/** @type {Map<string, string>} email(lower) -> password */
function parsePilotUsers(raw) {
  const map = new Map();
  for (const part of String(raw || "").split(",")) {
    const item = part.trim();
    if (!item) continue;
    const idx = item.indexOf(":");
    if (idx <= 0) continue;
    const email = item.slice(0, idx).trim().toLowerCase();
    const password = item.slice(idx + 1);
    if (email && password) map.set(email, password);
  }
  return map;
}

const PILOT_USERS = parsePilotUsers(process.env.WYZ_PILOT_USERS);

function requestOrigin(req) {
  return String(req.headers.origin || "").replace(/\/$/, "");
}

function corsHeaders(origin) {
  const headers = { Vary: "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "false";
  }
  return headers;
}

function json(res, status, body, req) {
  const origin = req ? requestOrigin(req) : "";
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": Buffer.byteLength(raw),
    ...corsHeaders(origin),
  });
  res.end(raw);
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("payload_too_large"), { code: "PAYLOAD_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("invalid_json"), { code: "INVALID_JSON" }));
      }
    });
    req.on("error", reject);
  });
}

function extractBearer(req) {
  const auth = req.headers.authorization || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function sessionTokenForEmail(email) {
  const mac = crypto.createHmac("sha256", SESSION_SECRET).update(`v1|${email}`).digest("hex");
  return `${PILOT_SESSION_PREFIX}${mac}`;
}

function emailForSessionToken(token) {
  if (!token || !token.startsWith(PILOT_SESSION_PREFIX) || !SESSION_SECRET) return null;
  for (const email of PILOT_USERS.keys()) {
    const expected = sessionTokenForEmail(email);
    try {
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return email;
    } catch {
      // length mismatch
    }
  }
  return null;
}

function authorizeBrowser(req) {
  if (!REQUIRE_BEARER) return null;
  const bearer = extractBearer(req);
  if (!bearer) {
    return { status: 401, code: "UNAUTHORIZED", message: "Your session is not authorized for this workspace." };
  }
  if (PILOT_TOKEN && bearer === PILOT_TOKEN) {
    return {
      status: 401,
      code: "UNAUTHORIZED",
      message: "Your session is not authorized for this workspace.",
    };
  }
  if (REJECT_DEMO && (bearer.startsWith("wyz-demo-") || bearer === "demo")) {
    return { status: 401, code: "UNAUTHORIZED", message: "Your session is not authorized for this workspace." };
  }
  if (PILOT_USERS.size > 0 && SESSION_SECRET) {
    if (!emailForSessionToken(bearer)) {
      return {
        status: 401,
        code: "UNAUTHORIZED",
        message: "Your session is not authorized for this workspace.",
      };
    }
  }
  const origin = requestOrigin(req);
  if (origin && ALLOWED_ORIGINS.size > 0 && !ALLOWED_ORIGINS.has(origin)) {
    return { status: 403, code: "ORIGIN_FORBIDDEN", message: "Origin is not allowed for this analytics API." };
  }
  return null;
}

function equalPassword(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) {
    crypto.timingSafeEqual(aa.length ? aa : Buffer.from("x"), aa.length ? Buffer.alloc(aa.length) : Buffer.from("y"));
    return false;
  }
  return crypto.timingSafeEqual(aa, bb);
}

async function handlePilotLogin(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, req);
  }
  if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
    return json(res, 503, {
      error: { code: "PILOT_AUTH_MISCONFIGURED", message: "Pilot login is not configured." },
    }, req);
  }
  if (PILOT_USERS.size === 0) {
    return json(res, 503, {
      error: { code: "PILOT_AUTH_MISCONFIGURED", message: "Pilot login is not configured." },
    }, req);
  }
  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (err) {
    if (err.code === "PAYLOAD_TOO_LARGE") {
      return json(res, 413, { error: { code: "PAYLOAD_TOO_LARGE", message: "This upload is too large." } }, req);
    }
    return json(res, 400, { error: { code: "INVALID_JSON", message: "Invalid request body." } }, req);
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const expected = PILOT_USERS.get(email);
  const passwordOk = Boolean(expected) && equalPassword(password, expected);
  if (!passwordOk) {
    console.log(JSON.stringify({ event: "pilot_login_failed", release: RELEASE }));
    return json(res, 401, {
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
    }, req);
  }
  const token = sessionTokenForEmail(email);
  console.log(JSON.stringify({ event: "pilot_login_ok", release: RELEASE }));
  return json(res, 200, {
    token,
    user: {
      email,
      tenant_slug: String(body.tenant_slug || body.tenantSlug || "internal-pilot").trim() || "internal-pilot",
      name: email.split("@")[0] || "Pilot user",
      is_demo: false,
      is_pilot: true,
    },
  }, req);
}

function mergeCorsOntoProxyHeaders(outHeaders, origin) {
  const cors = corsHeaders(origin);
  const merged = { ...outHeaders };
  for (const [k, v] of Object.entries(cors)) {
    merged[k.toLowerCase()] = v;
  }
  // Ensure upstream does not advertise a different/missing ACAO for browser.
  if (cors["Access-Control-Allow-Origin"]) {
    merged["access-control-allow-origin"] = cors["Access-Control-Allow-Origin"];
    merged["access-control-allow-credentials"] = "false";
  } else {
    delete merged["access-control-allow-origin"];
    delete merged["access-control-allow-credentials"];
  }
  return merged;
}

function proxy(req, res) {
  if (!PILOT_TOKEN || PILOT_TOKEN.length < 16) {
    return json(res, 503, {
      error: { code: "BFF_MISCONFIGURED", message: "Analytics proxy is not configured." },
    }, req);
  }

  const authErr = authorizeBrowser(req);
  if (authErr) {
    return json(res, authErr.status, {
      error: { code: authErr.code, message: authErr.message },
    }, req);
  }

  const incoming = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (!incoming.pathname.startsWith(ANALYTICS_PREFIX)) {
    return json(res, 404, { error: { code: "NOT_FOUND", message: "Not found" } }, req);
  }

  const length = Number(req.headers["content-length"] || 0);
  if (length > MAX_BODY) {
    return json(res, 413, {
      error: { code: "PAYLOAD_TOO_LARGE", message: "This upload is too large." },
    }, req);
  }

  const origin = requestOrigin(req);
  const upstreamUrl = new URL(incoming.pathname + incoming.search, UPSTREAM);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["x-wyz-pilot-token"];
  headers["x-wyz-pilot-token"] = PILOT_TOKEN;
  headers["x-wyz-bff"] = "1";
  headers["x-wyz-release"] = RELEASE;

  const proxyReq = http.request(
    upstreamUrl,
    {
      method: req.method,
      headers,
      timeout: Number(process.env.WYZ_BFF_PROXY_TIMEOUT_MS || 600000),
    },
    (proxyRes) => {
      const outHeaders = mergeCorsOntoProxyHeaders({ ...proxyRes.headers }, origin);
      delete outHeaders["server"];
      res.writeHead(proxyRes.statusCode || 502, outHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      json(res, 504, { error: { code: "UPSTREAM_TIMEOUT", message: "Analytics request timed out." } }, req);
    }
  });
  proxyReq.on("error", (err) => {
    console.error(JSON.stringify({ event: "bff_upstream_error", error_class: err.name, release: RELEASE }));
    if (!res.headersSent) {
      json(res, 502, {
        error: { code: "UPSTREAM_UNAVAILABLE", message: "Analytics service is temporarily unavailable." },
      }, req);
    }
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const pathOnly = (req.url || "/").split("?")[0];
  const origin = requestOrigin(req);

  if (req.method === "GET" && (pathOnly === "/bff/health" || pathOnly === "/bff/health/")) {
    return json(res, 200, {
      ok: true,
      service: "wyz-analytics-bff",
      release: RELEASE,
      pilot_login_configured: PILOT_USERS.size > 0 && SESSION_SECRET.length >= 16,
    }, req);
  }

  if (req.method === "OPTIONS") {
    const headers = {
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS, HEAD",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-Id, Accept",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
      ...corsHeaders(origin),
    };
    res.writeHead(origin && ALLOWED_ORIGINS.size > 0 && !ALLOWED_ORIGINS.has(origin) ? 403 : 204, headers);
    return res.end();
  }

  if (pathOnly === `${PILOT_AUTH_PREFIX}/login` || pathOnly === `${PILOT_AUTH_PREFIX}/login/`) {
    return handlePilotLogin(req, res);
  }

  return proxy(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      event: "bff_started",
      port: PORT,
      upstream: UPSTREAM,
      require_bearer: REQUIRE_BEARER,
      reject_demo: REJECT_DEMO,
      pilot_users_configured: PILOT_USERS.size,
      allowed_origins_count: ALLOWED_ORIGINS.size,
      release: RELEASE,
    })
  );
});
