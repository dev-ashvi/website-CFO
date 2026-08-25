import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("revenue-margin analysis job polling", () => {
  it("resolves when the job reaches a terminal status", async () => {
    const { pollUntil } = await import("../../api/revenueMargin.js");
    let n = 0;
    const job = await pollUntil(
      async () => {
        n += 1;
        return { status: n < 3 ? "RUNNING" : "COMPLETED", stage: n < 3 ? "engine" : "completed" };
      },
      { isDone: (value) => value.status === "COMPLETED" || value.status === "FAILED", intervalMs: 1, timeoutMs: 1000 },
    );
    assert.equal(job.status, "COMPLETED");
    assert.ok(n >= 3);
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
