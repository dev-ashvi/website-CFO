/** Mock provider for tests and offline benchmark scaffolding. */

/**
 * @typedef {import('./providerUtils.js').JsonCompletionRequest} JsonCompletionRequest
 */

/**
 * @param {{ responses?: Map<string, unknown>; latencyMs?: number }} [config]
 */
export function createMockProvider(config = {}) {
  /** @type {Map<string, unknown>} */
  const responses = config.responses ?? new Map();
  const defaultLatency = config.latencyMs ?? 5;

  const provider = {
    id: "mock",
    calls: [],

    getModelMetadata(modelId) {
      return {
        provider: "mock",
        modelId,
        supportedTiers: ["cheap", "reasoning", "premium"],
        contextWindow: 32_000,
        supportsTools: true,
        supportsStructuredOutput: true,
        costPerInputTokenUsd: 0.000001,
        costPerOutputTokenUsd: 0.000002,
      };
    },

    /**
     * @param {JsonCompletionRequest} request
     */
    async completeJson(request) {
      provider.calls.push({ type: "completeJson", request });
      const key = `${request.modelId}:${request.userPrompt.slice(0, 80)}`;
      const parsed =
        responses.get(key) ??
        responses.get(request.modelId) ??
        responses.get("default") ?? {
          summary: "Mock assessment.",
          keyRisks: ["Mock risk"],
          recommendedActions: ["Mock action"],
          priorityObservation: "Mock observation.",
        };
      const rawText = JSON.stringify(parsed);
      return {
        parsed,
        rawText,
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        latencyMs: defaultLatency,
      };
    },

    async completeWithTools(request) {
      provider.calls.push({ type: "completeWithTools", request });
      return {
        messages: [{ role: "assistant", content: "Mock tool response." }],
        toolCalls: [],
        usage: { prompt_tokens: 120, completion_tokens: 40 },
        latencyMs: defaultLatency,
      };
    },

    normalizeUsage(rawUsage, modelId) {
      const usage = /** @type {Record<string, number>} */ (rawUsage || {});
      const meta = provider.getModelMetadata(modelId);
      const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
      const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
      return {
        inputTokens,
        outputTokens,
        estimatedCostUsd:
          inputTokens * (meta.costPerInputTokenUsd ?? 0) +
          outputTokens * (meta.costPerOutputTokenUsd ?? 0),
      };
    },
  };

  return provider;
}
