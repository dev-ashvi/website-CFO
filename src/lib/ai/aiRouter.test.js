import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AiRouter, loadTierConfigFromEnv } from "./aiRouter.js";
import { createMockProvider } from "./providers/mockProvider.js";

describe("aiRouter", () => {
  it("resolves cheap tier to configured provider without app-level imports", () => {
    const mock = createMockProvider();
    const router = new AiRouter({
      providers: { mock, openai: mock },
      tierConfig: {
        cheap: { providerId: "mock", modelId: "mock-cheap" },
        reasoning: { providerId: "mock", modelId: "mock-reasoning" },
        premium: { providerId: "mock", modelId: "mock-premium" },
      },
    });

    const route = router.resolve({ modelTier: "cheap", feature: "assessment" });
    assert.equal(route.providerId, "mock");
    assert.equal(route.modelId, "mock-cheap");
    assert.equal(route.modelTier, "cheap");
    assert.ok(route.adapter);
  });

  it("escalates cheap → reasoning → premium", () => {
    const router = new AiRouter({ providers: { mock: createMockProvider() }, tierConfig: loadTierConfigFromEnv({}) });
    assert.equal(router.escalationTarget("cheap"), "reasoning");
    assert.equal(router.escalationTarget("reasoning"), "premium");
  });

  it("throws on unknown provider", () => {
    const router = new AiRouter({
      providers: { mock: createMockProvider() },
      tierConfig: { cheap: { providerId: "missing", modelId: "x" }, reasoning: { providerId: "mock", modelId: "m" }, premium: { providerId: "mock", modelId: "m" } },
    });
    assert.throws(() => router.resolve({ modelTier: "cheap" }), /unknown_provider/);
  });
});
