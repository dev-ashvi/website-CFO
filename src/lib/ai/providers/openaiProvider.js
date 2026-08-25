import {
  extractChatCompletionContent,
  normalizeUsageForProvider,
  parseJsonFromModelText,
  postChatCompletion,
} from "./providerUtils.js";

/** @typedef {import('./providerUtils.js').ProviderModelMetadata} ProviderModelMetadata */
/** @typedef {import('./providerUtils.js').JsonCompletionRequest} JsonCompletionRequest */
/** @typedef {import('./providerUtils.js').JsonCompletionResult} JsonCompletionResult */
/** @typedef {import('./providerUtils.js').ToolCompletionRequest} ToolCompletionRequest */
/** @typedef {import('./providerUtils.js').ToolCompletionResult} ToolCompletionResult */

const DEFAULT_MODELS = {
  cheap: "gpt-4o-mini",
  reasoning: "gpt-4o",
  premium: "gpt-4o",
};

const MODEL_CATALOG = {
  "gpt-4o-mini": {
    supportedTiers: ["cheap"],
    contextWindow: 128_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    costPerInputTokenUsd: 0.15 / 1_000_000,
    costPerOutputTokenUsd: 0.6 / 1_000_000,
  },
  "gpt-4o": {
    supportedTiers: ["reasoning", "premium"],
    contextWindow: 128_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    costPerInputTokenUsd: 2.5 / 1_000_000,
    costPerOutputTokenUsd: 10 / 1_000_000,
  },
};

/**
 * @param {{ apiKey?: string; baseUrl?: string }} [config]
 */
export function createOpenAiProvider(config = {}) {
  const apiKey = config.apiKey ?? "";
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1/chat/completions";

  return {
    id: "openai",

    /**
     * @param {string} modelId
     */
    getModelMetadata(modelId) {
      const meta = MODEL_CATALOG[modelId] || MODEL_CATALOG[DEFAULT_MODELS.cheap];
      return {
        provider: "openai",
        modelId,
        ...meta,
      };
    },

    /**
     * @param {JsonCompletionRequest} request
     */
    async completeJson(request) {
      const { data, latencyMs } = await postChatCompletion(
        {
          model: request.modelId,
          temperature: request.temperature ?? 0.3,
          max_tokens: request.maxTokens ?? 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
        },
        apiKey,
        baseUrl,
      );
      const rawText = extractChatCompletionContent(data);
      const parsed = parseJsonFromModelText(rawText);
      return {
        parsed,
        rawText,
        usage: data.usage,
        latencyMs,
      };
    },

    /**
     * @param {ToolCompletionRequest} request
     */
    async completeWithTools(request) {
      const { data, latencyMs } = await postChatCompletion(
        {
          model: request.modelId,
          max_tokens: request.maxTokens ?? 2000,
          messages: [{ role: "system", content: request.systemPrompt }, ...request.messages],
          tools: request.tools,
          tool_choice: "auto",
        },
        apiKey,
        baseUrl,
      );
      const message = data?.choices?.[0]?.message ?? {};
      return {
        messages: [message],
        toolCalls: message.tool_calls ?? [],
        usage: data.usage,
        latencyMs,
      };
    },

    /**
     * @param {unknown} rawUsage
     * @param {string} modelId
     */
    normalizeUsage(rawUsage, modelId) {
      return normalizeUsageForProvider("openai", rawUsage, createOpenAiProvider().getModelMetadata(modelId));
    },
  };
}

export { DEFAULT_MODELS as OPENAI_DEFAULT_MODELS };
