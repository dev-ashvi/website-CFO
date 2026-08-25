import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AiUsageTelemetry, normalizeProviderUsage } from "./aiUsageTelemetry.js";

describe("aiUsageTelemetry", () => {
  it("records live inference events", () => {
    const telemetry = new AiUsageTelemetry();
    telemetry.record({
      feature: "assessment",
      provider: "openai",
      model: "gpt-4o-mini",
      modelTier: "cheap",
      contextVersion: "abc123",
      sessionId: "sess1",
      inputTokens: 1000,
      outputTokens: 200,
      estimatedCostUsd: 0.001,
    });

    assert.equal(telemetry.events.length, 1);
    assert.equal(telemetry.events[0].success, true);
    assert.equal(telemetry.events[0].cacheHit, false);
  });

  it("records cache hits with zero cost", () => {
    const telemetry = new AiUsageTelemetry();
    telemetry.recordCacheHit({
      feature: "assessment",
      modelTier: "cheap",
      contextVersion: "abc123",
      sessionId: "sess1",
    });

    assert.equal(telemetry.events[0].cacheHit, true);
    assert.equal(telemetry.events[0].estimatedCostUsd, 0);
    assert.equal(telemetry.events[0].inputTokens, 0);
  });

  it("normalizes OpenAI usage metadata", () => {
    const normalized = normalizeProviderUsage("openai", { prompt_tokens: 500, completion_tokens: 100 }, {
      inputCostPerToken: 0.000001,
      outputCostPerToken: 0.000002,
    });
    assert.equal(normalized.inputTokens, 500);
    assert.equal(normalized.outputTokens, 100);
    assert.ok(normalized.estimatedCostUsd > 0);
  });

  it("summarizes cost per feature", () => {
    const telemetry = new AiUsageTelemetry();
    telemetry.record({
      feature: "assessment",
      provider: "mock",
      model: "mock",
      modelTier: "cheap",
      contextVersion: "v1",
      sessionId: "s",
      estimatedCostUsd: 0.002,
    });
    telemetry.recordCacheHit({
      feature: "assessment",
      modelTier: "cheap",
      contextVersion: "v1",
      sessionId: "s",
    });

    const summary = telemetry.getCostSummary("assessment");
    assert.equal(summary.liveCallCount, 1);
    assert.equal(summary.cacheHitCount, 1);
    assert.equal(summary.cacheHitRate, 0.5);
    assert.equal(summary.totalCostUsd, 0.002);
  });
});
