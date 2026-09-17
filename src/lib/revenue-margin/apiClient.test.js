import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("revenue-margin analysis job polling", () => {
  it("CASE F: resolves when the job reaches a terminal status", async () => {
    const { pollUntil } = await import("../../api/revenueMargin.js");
    let n = 0;
    const job = await pollUntil(
      async () => {
        n += 1;
        if (n === 1) return { status: "QUEUED" };
        if (n === 2) return { status: "RUNNING" };
        return { status: "COMPLETED", stage: "COMPLETED" };
      },
      { isDone: (value) => value.status === "COMPLETED" || value.status === "FAILED", intervalMs: 1, timeoutMs: 1000 },
    );
    assert.equal(job.status, "COMPLETED");
    assert.ok(n >= 3);
  });

  it("CASE A: first poll 5xx then COMPLETED succeeds", async () => {
    const { pollUntil } = await import("../../api/revenueMargin.js");
    let n = 0;
    const job = await pollUntil(
      async () => {
        n += 1;
        if (n === 1) throw { status: 501, message: "transient" };
        return { status: "COMPLETED" };
      },
      {
        isDone: (value) => value.status === "COMPLETED" || value.status === "FAILED",
        intervalMs: 1,
        timeoutMs: 2000,
        maxTransientErrors: 5,
      },
    );
    assert.equal(job.status, "COMPLETED");
    assert.equal(n, 2);
  });

  it("CASE B: multiple transient 5xx within budget then COMPLETED", async () => {
    const { pollUntil } = await import("../../api/revenueMargin.js");
    let n = 0;
    const job = await pollUntil(
      async () => {
        n += 1;
        if (n <= 3) throw { status: 502, message: "bad gateway" };
        return { status: "COMPLETED" };
      },
      {
        isDone: (value) => value.status === "COMPLETED" || value.status === "FAILED",
        intervalMs: 1,
        timeoutMs: 3000,
        maxTransientErrors: 5,
      },
    );
    assert.equal(job.status, "COMPLETED");
    assert.equal(n, 4);
  });

  it("CASE D: 401 fails immediately without retry", async () => {
    const { pollUntil } = await import("../../api/revenueMargin.js");
    let n = 0;
    await assert.rejects(
      () =>
        pollUntil(
          async () => {
            n += 1;
            throw { status: 401, message: "unauthorized" };
          },
          {
            isDone: (value) => value.status === "COMPLETED",
            intervalMs: 1,
            timeoutMs: 1000,
            maxTransientErrors: 5,
          },
        ),
      (err) => err && err.status === 401,
    );
    assert.equal(n, 1);
  });

  it("CASE D: 403 fails immediately without retry", async () => {
    const { pollUntil } = await import("../../api/revenueMargin.js");
    let n = 0;
    await assert.rejects(
      () =>
        pollUntil(
          async () => {
            n += 1;
            throw { status: 403, message: "forbidden" };
          },
          {
            isDone: (value) => value.status === "COMPLETED",
            intervalMs: 1,
            timeoutMs: 1000,
            maxTransientErrors: 5,
          },
        ),
      (err) => err && err.status === 403,
    );
    assert.equal(n, 1);
  });

  it("CASE E: job FAILED is terminal", async () => {
    const { pollUntil } = await import("../../api/revenueMargin.js");
    const job = await pollUntil(
      async () => ({ status: "FAILED", error: { message: "engine boom" } }),
      { isDone: (value) => value.status === "COMPLETED" || value.status === "FAILED", intervalMs: 1, timeoutMs: 500 },
    );
    assert.equal(job.status, "FAILED");
  });

  it("CASE C: poll exhaustion recovers COMPLETED from dataset refresh", async () => {
    const originalFetch = globalThis.fetch;
    let jobGets = 0;
    globalThis.fetch = mock.fn(async (url) => {
      const href = String(url);
      if (href.includes("/jobs/")) {
        jobGets += 1;
        return {
          ok: false,
          status: 501,
          headers: { get: () => "application/json" },
          json: async () => ({ error: { message: "not implemented" } }),
          text: async () => "",
        };
      }
      if (href.includes("/datasets/ds_recover")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            dataset_id: "ds_recover",
            status: "COMPLETED",
            analysis_status: "COMPLETED",
            latest_job_id: "job_recover",
          }),
          text: async () => "",
        };
      }
      throw new Error(`unexpected url ${href}`);
    });
    try {
      // fresh module state not required; functions close over fetch
      const { waitForAnalysisJob } = await import("../../api/revenueMargin.js");
      const job = await waitForAnalysisJob("job_recover", "ds_recover", {
        intervalMs: 1,
        timeoutMs: 500,
        maxTransientErrors: 2,
      });
      assert.equal(job.status, "COMPLETED");
      assert.ok(jobGets >= 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces worker unavailability instead of inventing totals", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    try {
      const { getDataset } = await import("../../api/revenueMargin.js");
      await assert.rejects(() => getDataset("ds_x"), (err) => {
        assert.match(String(err.message), /analytics worker/i);
        return true;
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
