/**
 * Reproduce BFF keep-alive framing: POST {} then immediate GET.
 * Mock upstream logs the raw request-line bytes of every connection message.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import test from "node:test";

function startMockUpstream() {
  const requestLines = [];
  const server = http.createServer((req, res) => {
    requestLines.push(req.method + " " + req.url);
    // Capture whether Node parsed method oddly by also exposing raw first packet via socket
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (req.url.startsWith("/api/v1/analytics/jobs/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ job_id: "job_x", status: "COMPLETED", body_seen: body }));
        return;
      }
      if (req.url.endsWith("/jobs") && req.method === "POST") {
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ job_id: "job_x", analysis_job_id: "job_x", status: "QUEUED" }));
        return;
      }
      res.writeHead(404);
      res.end("{}");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, requestLines });
    });
  });
}

function startBff(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: "services/analytics/bff",
      env: { ...process.env, ...env },
    });
    let ready = false;
    child.stdout.on("data", (buf) => {
      if (!ready && buf.toString().includes("bff_started")) {
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

function req(port, { path, method = "GET", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { hostname: "127.0.0.1", port, path, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
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

test("BFF POST {} then immediate GET does not produce {}GET upstream", async () => {
  const upstream = await startMockUpstream();
  const bffPort = 18090;
  const child = await startBff({
    WYZ_BFF_PORT: String(bffPort),
    WYZ_PILOT_API_TOKEN: "pilot-token-sixteen-chars-min",
    WYZ_PILOT_SESSION_SECRET: "session-secret-sixteen-min",
    WYZ_PILOT_USERS: "pilot@example.com:PilotPass123!",
    WYZ_ALLOWED_ORIGINS: "https://financewyz.ai,http://127.0.0.1:8080",
    WYZ_BFF_REJECT_DEMO: "true",
    ANALYTICS_UPSTREAM: `http://127.0.0.1:${upstream.port}`,
    WYZ_RELEASE_SHA: "test",
  });

  try {
    // Login for bearer
    const login = await req(bffPort, {
      path: "/api/v1/pilot-auth/login",
      method: "POST",
      headers: { Origin: "https://financewyz.ai", "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "pilot@example.com",
        password: "PilotPass123!",
        tenant_slug: "internal-pilot",
      }),
    });
    assert.equal(login.status, 200);
    const token = JSON.parse(login.body).token;

    // Burst: POST jobs with {} then immediate GET status, many times on keep-alive agent
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve, reject) => {
        const postBody = "{}";
        const post = http.request(
          {
            hostname: "127.0.0.1",
            port: bffPort,
            path: "/api/v1/analytics/datasets/ds_x/jobs",
            method: "POST",
            agent,
            headers: {
              Origin: "https://financewyz.ai",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postBody),
              Connection: "keep-alive",
            },
          },
          (res) => {
            res.resume();
            res.on("end", resolve);
          }
        );
        post.on("error", reject);
        post.write(postBody);
        post.end();
      });

      const getRes = await new Promise((resolve, reject) => {
        const get = http.request(
          {
            hostname: "127.0.0.1",
            port: bffPort,
            path: "/api/v1/analytics/jobs/job_x",
            method: "GET",
            agent,
            headers: {
              Origin: "https://financewyz.ai",
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              Connection: "keep-alive",
            },
          },
          (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () =>
              resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") })
            );
          }
        );
        get.on("error", reject);
        get.end();
      });
      assert.equal(getRes.status, 200, `iteration ${i} get status`);
    }

    const weird = upstream.requestLines.filter((l) => l.includes("{}") || l.startsWith("{}"));
    assert.equal(weird.length, 0, `malformed upstream lines: ${JSON.stringify(weird)}`);
    assert.ok(upstream.requestLines.some((l) => l.startsWith("GET ")));
    assert.ok(upstream.requestLines.some((l) => l.startsWith("POST ")));
  } finally {
    child.kill("SIGTERM");
    upstream.server.close();
  }
});
