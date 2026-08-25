import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMockProvider } from "./mockProvider.js";
import { createAiCfoService } from "../aiCfoService.js";
import { AiRouter } from "../aiRouter.js";
import { runSimulation, buildFinancialIntelligenceContext, getScenario1FormInputs } from "../../financial-simulator/index.js";
import { normalizeFormInputs } from "../../financial-simulator/normalizeFormInputs.js";

describe("mockProvider + aiCfoService contract", () => {
  it("completeJson returns parsed JSON and normalized usage", async () => {
    const mock = createMockProvider({
      responses: new Map([
        [
          "default",
          {
            summary: "Test",
            keyRisks: ["R1"],
            recommendedActions: ["A1"],
            priorityObservation: "P1",
          },
        ],
      ]),
    });

    const result = await mock.completeJson({
      modelId: "mock-cheap",
      systemPrompt: "sys",
      userPrompt: "user",
    });

    assert.equal(result.parsed.summary, "Test");
    assert.ok(result.usage);
    const usage = mock.normalizeUsage(result.usage, "mock-cheap");
    assert.ok(usage.inputTokens >= 0);
    assert.ok(usage.estimatedCostUsd >= 0);
  });

  it("aiCfoService records telemetry and supports cache hits", async () => {
    const mock = createMockProvider();
    const router = new AiRouter({
      providers: { mock },
      tierConfig: {
        cheap: { providerId: "mock", modelId: "mock-cheap" },
        reasoning: { providerId: "mock", modelId: "mock-reasoning" },
        premium: { providerId: "mock", modelId: "mock-premium" },
      },
    });
    const service = createAiCfoService({ router, providers: { mock } });

    const sim = runSimulation(normalizeFormInputs(getScenario1FormInputs()));
    assert.equal(sim.ok, true);
    const context = buildFinancialIntelligenceContext(sim);

    const first = await service.generateAssessment(context, { modelTier: "cheap", sessionId: "t1" });
    assert.equal(first.fromCache, false);
    assert.ok(first.output);

    const second = await service.generateAssessment(context, { modelTier: "cheap", sessionId: "t1" });
    assert.equal(second.fromCache, true);

    const summary = service.telemetry.getCostSummary("assessment");
    assert.equal(summary.liveCallCount, 1);
    assert.equal(summary.cacheHitCount, 1);
  });
});
