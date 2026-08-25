import {
  extractChatCompletionContent,
  normalizeUsageForProvider,
  parseJsonFromModelText,
  postChatCompletion,
} from "./providerUtils.js";

const DEFAULT_MODELS = {
  cheap: "deepseek-chat",
  reasoning: "deepseek-chat",
  premium: "deepseek-reasoner",
};

const MODEL_CATALOG = {
  "deepseek-chat": {
    supportedTiers: ["cheap", "reasoning"],
    contextWindow: 64_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    costPerInputTokenUsd: 0.27 / 1_000_000,
    costPerOutputTokenUsd: 1.1 / 1_000_000,
  },
  "deepseek-reasoner": {
    supportedTiers: ["premium"],
    contextWindow: 64_000,
    supportsTools: false,
    supportsStructuredOutput: true,
    costPerInputTokenUsd: 0.55 / 1_000_000,
    costPerOutputTokenUsd: 2.19 / 1_000_000,
  },
};

/**
 * @param {{ apiKey?: string; baseUrl?: string }} [config]
 */
export function createDeepSeekProvider(config = {}) {
  const apiKey = config.apiKey ?? "";
  const baseUrl = config.baseUrl ?? "https://api.deepseek.com/chat/completions";

  const provider = {
    id: "deepseek",

    getModelMetadata(modelId) {
      const meta = MODEL_CATALOG[modelId] || MODEL_CATALOG[DEFAULT_MODELS.cheap];
      return { provider: "deepseek", modelId, ...meta };
    },

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
      return {
        parsed: parseJsonFromModelText(rawText),
        rawText,
        usage: data.usage,
        latencyMs,
      };
    },

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

    normalizeUsage(rawUsage, modelId) {
      return normalizeUsageForProvider("deepseek", rawUsage, provider.getModelMetadata(modelId));
    },
  };

  return provider;
}

export { DEFAULT_MODELS as DEEPSEEK_DEFAULT_MODELS };
