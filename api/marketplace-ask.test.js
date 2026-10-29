import { describe, it } from "node:test";
import assert from "node:assert/strict";

const mod = await import("./marketplace-ask.js");
const { __test } = mod;

describe("api/marketplace-ask NVIDIA proxy", () => {
  it("defaults to the configured NVIDIA NIM model path", () => {
    assert.equal(__test.DEFAULT_MODEL, "openai/gpt-oss-20b");
    assert.equal(__test.DEFAULT_BASE_URL, "https://integrate.api.nvidia.com/v1");
    assert.equal(__test.SCHEMA_VERSION, 1);
  });

  it("validates evidence schema and rejects raw file smuggling", () => {
    const ok = __test.validatePayload({
      schemaVersion: 1,
      question: "Where is Amazon taking the money?",
      evidence: {
        schemaVersion: 1,
        context: { sectionId: "amazon_economics" },
        kpis: { grossProductSales: 100 },
        limitations: [],
      },
      guidedAnswer: { text: "Fees total 10", evidence: [] },
      history: [],
    });
    assert.equal(ok.ok, true);

    assert.equal(__test.validatePayload({ schemaVersion: 1, question: "hi" }).ok, false);
    assert.equal(
      __test.validatePayload({
        schemaVersion: 1,
        question: "leak",
        evidence: { schemaVersion: 1, context: { sectionId: "topline" }, bytes: [1] },
      }).ok,
      false,
    );
  });

  it("rate-limits repeated requests from the same IP bucket", () => {
    const ip = `test-ip-${Date.now()}-${Math.random()}`;
    let blocked = false;
    for (let i = 0; i < __test.RATE_LIMIT_MAX + 2; i += 1) {
      const result = __test.takeRateLimit(ip);
      if (!result.ok) blocked = true;
    }
    assert.equal(blocked, true);
  });

  it("sanitizes model output and falls back when JSON is invalid", () => {
    const validated = {
      question: "test",
      evidence: { context: { chartId: "fees" }, limitations: ["No COGS"] },
      guidedAnswer: { text: "Guided answer with ₹100 fees" },
    };
    const parsed = __test.sanitizeModelOutput(
      {
        explanation: "Advertising is the largest drain in the supplied evidence.",
        limitations: ["No attribution"],
        followUps: ["How much is being spent on advertising?"],
        chartRefs: ["fees"],
      },
      validated,
    );
    assert.match(parsed.explanation, /Advertising/);
    assert.equal(__test.extractJsonObject("not json"), null);
    assert.equal(__test.guidedFallback(validated).source, "guided");
    assert.match(__test.guidedFallback(validated).explanation, /Guided answer/);
  });

  it("does not import or re-export authenticated analytics worker routes", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "marketplace-ask.js"), "utf8");
    assert.equal(source.includes("/api/v1/analytics"), false);
    assert.equal(source.includes("ai-cfo/ask"), false);
    assert.equal(source.includes("openai.com"), false);
    assert.equal(source.includes("anthropic"), false);
    assert.match(source, /integrate\.api\.nvidia\.com/);
  });
});
