import { describe, it } from "node:test";
import assert from "node:assert/strict";

const mod = await import("./marketplace-ask.js");
const { __test } = mod;

function validBody(overrides = {}) {
  return {
    schemaVersion: 1,
    question: "Where is Amazon taking the money?",
    evidence: {
      schemaVersion: 1,
      context: { sectionId: "amazon_economics" },
      kpis: { grossProductSales: 1000, orderCount: 3, aov: 333.33 },
      limitations: ["No COGS"],
      products: [],
      monthly: [],
    },
    guidedAnswer: { text: "Advertising is the largest drain at 500." },
    history: [],
    ...overrides,
  };
}

describe("api/marketplace-ask NVIDIA proxy (Stage 3.1)", () => {
  it("defaults to the configured NVIDIA NIM model path", () => {
    assert.equal(__test.DEFAULT_MODEL, "openai/gpt-oss-20b");
    assert.equal(__test.DEFAULT_BASE_URL, "https://integrate.api.nvidia.com/v1");
    assert.equal(__test.SCHEMA_VERSION, 1);
  });

  it("validates evidence schema and rejects raw file / transaction smuggling", () => {
    assert.equal(__test.validatePayload(validBody()).ok, true);
    assert.equal(__test.validatePayload({ schemaVersion: 1, question: "hi" }).ok, false);
    assert.equal(
      __test.validatePayload(
        validBody({
          evidence: {
            schemaVersion: 1,
            context: { sectionId: "topline" },
            kpis: { grossProductSales: 1, orderCount: 1, aov: 1 },
            limitations: [],
            bytes: [1, 2, 3],
          },
        }),
      ).ok,
      false,
    );
    assert.equal(
      __test.validatePayload(
        validBody({
          evidence: {
            schemaVersion: 1,
            context: { sectionId: "topline" },
            kpis: { grossProductSales: 1, orderCount: 1, aov: 1 },
            limitations: [],
            transactions: [{ total: 1 }],
          },
        }),
      ).ok,
      false,
    );
  });

  it("enforces local per-IP limits when shared Redis is absent", () => {
    assert.equal(__test.upstashConfigured(), false);
    const ip = `stage31-${Date.now()}-${Math.random()}`;
    const limits = __test.resolveLimits();
    let blocked = false;
    for (let i = 0; i < limits.ipMinuteMax + 2; i += 1) {
      const result = __test.takeLocalRateLimit(ip, limits);
      if (!result.ok) blocked = true;
    }
    assert.equal(blocked, true);
  });

  it("sanitizes model output and falls back when JSON is invalid", () => {
    const validated = {
      question: "test",
      evidence: { context: { chartId: "fees" }, limitations: ["No COGS"] },
      guidedAnswer: { text: "Guided answer with fees" },
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
  });

  it("does not wire authenticated analytics worker or alternate paid providers", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "marketplace-ask.js"), "utf8");
    assert.equal(source.includes("/api/v1/analytics"), false);
    assert.equal(source.includes("ai-cfo/ask"), false);
    assert.equal(source.includes("openai.com"), false);
    assert.equal(source.includes("anthropic"), false);
    assert.match(source, /integrate\.api\.nvidia\.com/);
    assert.match(source, /UPSTASH_REDIS_REST_URL/);
    assert.match(source, /WYZ_MARKETPLACE_ASK_ALLOWED_ORIGINS/);
    assert.equal(source.includes("console.error(\"[marketplace-ask]\", body"), false);
  });

  it("reports origin allowlist behavior", () => {
    const prev = process.env.WYZ_MARKETPLACE_ASK_ALLOWED_ORIGINS;
    process.env.WYZ_MARKETPLACE_ASK_ALLOWED_ORIGINS = "https://example.com";
    assert.equal(__test.checkOrigin({ headers: { origin: "https://evil.test" } }).ok, false);
    assert.equal(__test.checkOrigin({ headers: { origin: "https://example.com" } }).ok, true);
    if (prev == null) delete process.env.WYZ_MARKETPLACE_ASK_ALLOWED_ORIGINS;
    else process.env.WYZ_MARKETPLACE_ASK_ALLOWED_ORIGINS = prev;
  });
});
