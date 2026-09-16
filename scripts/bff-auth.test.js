import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import test from "node:test";

function startBff(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], {
      env: { ...process.env, ...env },
      cwd: "services/analytics/bff",
    });
    let ready = false;
    child.stdout.on("data", (buf) => {
      const text = buf.toString();
      if (!ready && text.includes("bff_started")) {
        ready = true;
        resolve(child);
      }
    });
    child.stderr.on("data", () => {});
    setTimeout(() => {
      if (!ready) reject(new Error("bff start timeout"));
    }, 5000);
  });
}

function req(port, { path, method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { hostname: "127.0.0.1", port, path, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    r.on("error", reject);
    if (body != null) r.write(body);
    r.end();
  });
}

test("bff rejects unauthenticated analytics and exposes /bff/health", async () => {
  const port = 18080;
  const child = await startBff({
    WYZ_BFF_PORT: String(port),
    WYZ_PILOT_API_TOKEN: "pilot-token-sixteen-chars-min",
    WYZ_ALLOWED_ORIGINS: "https://financewyz.ai,http://127.0.0.1:8080",
    ANALYTICS_UPSTREAM: "http://127.0.0.1:9",
    WYZ_RELEASE_SHA: "test",
  });
  try {
    const health = await req(port, { path: "/bff/health" });
    assert.equal(health.status, 200);
    assert.match(health.body, /wyz-analytics-bff/);
    const denied = await req(port, { path: "/api/v1/analytics/datasets" });
    assert.equal(denied.status, 401);
    const demo = await req(port, {
      path: "/api/v1/analytics/datasets",
      headers: { Authorization: "Bearer wyz-demo-xyz" },
    });
    assert.equal(demo.status, 401);
  } finally {
    child.kill("SIGTERM");
  }
});

test("bff CORS allowlist on OPTIONS / login failure / 401", async () => {
  const port = 18081;
  const child = await startBff({
    WYZ_BFF_PORT: String(port),
    WYZ_PILOT_API_TOKEN: "pilot-token-sixteen-chars-min",
    WYZ_PILOT_SESSION_SECRET: "session-secret-sixteen-min",
    WYZ_PILOT_USERS: "pilot@example.com:PilotPass123!",
    WYZ_ALLOWED_ORIGINS: "https://financewyz.ai,http://127.0.0.1:8080",
    WYZ_BFF_REJECT_DEMO: "true",
    ANALYTICS_UPSTREAM: "http://127.0.0.1:9",
    WYZ_RELEASE_SHA: "test",
  });
  try {
    const okOrigin = "https://financewyz.ai";
    const optionsOk = await req(port, {
      path: "/api/v1/pilot-auth/login",
      method: "OPTIONS",
      headers: {
        Origin: okOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(optionsOk.status, 204);
    assert.equal(optionsOk.headers["access-control-allow-origin"], okOrigin);

    const optionsEvil = await req(port, {
      path: "/api/v1/pilot-auth/login",
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(optionsEvil.status, 403);
    assert.equal(optionsEvil.headers["access-control-allow-origin"], undefined);

    const badLogin = await req(port, {
      path: "/api/v1/pilot-auth/login",
      method: "POST",
      headers: { Origin: okOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "pilot@example.com", password: "wrong" }),
    });
    assert.equal(badLogin.status, 401);
    assert.equal(badLogin.headers["access-control-allow-origin"], okOrigin);

    const goodLogin = await req(port, {
      path: "/api/v1/pilot-auth/login",
      method: "POST",
      headers: { Origin: okOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "pilot@example.com",
        password: "PilotPass123!",
        tenant_slug: "internal-pilot",
      }),
    });
    assert.equal(goodLogin.status, 200);
    assert.equal(goodLogin.headers["access-control-allow-origin"], okOrigin);
    const token = JSON.parse(goodLogin.body).token;
    assert.match(token, /^wyz-pilot\./);

    const unauth = await req(port, {
      path: "/api/v1/analytics/datasets",
      headers: { Origin: okOrigin },
    });
    assert.equal(unauth.status, 401);
    assert.equal(unauth.headers["access-control-allow-origin"], okOrigin);

    const forbiddenOrigin = await req(port, {
      path: "/api/v1/analytics/datasets",
      headers: { Origin: "https://evil.example", Authorization: `Bearer ${token}` },
    });
    assert.equal(forbiddenOrigin.status, 403);
    assert.equal(forbiddenOrigin.headers["access-control-allow-origin"], undefined);
  } finally {
    child.kill("SIGTERM");
  }
});
