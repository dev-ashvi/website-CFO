import {
  extractChatCompletionContent,
  normalizeUsageForProvider,
  parseJsonFromModelText,
  postChatCompletion,
} from "./providerUtils.js";

const DEFAULT_MODELS = {
  cheap: "qwen-plus",
  reasoning: "qwen-plus",
  premium: "qwen-max",
};

const MODEL_CATALOG = {
  "qwen-plus": {
    supportedTiers: ["cheap", "reasoning"],
    contextWindow: 128_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    costPerInputTokenUsd: 0.4 / 1_000_000,
    costPerOutputTokenUsd: 1.2 / 1_000_000,
  },
  "qwen-max": {
    supportedTiers: ["premium"],
    contextWindow: 128_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    costPerInputTokenUsd: 1.6 / 1_000_000,
    costPerOutputTokenUsd: 6.4 / 1_000_000,
  },
};

/**
 * @param {{ apiKey?: string; baseUrl?: string }} [config]
 */
export function createQwenProvider(config = {}) {
  const apiKey = config.apiKey ?? "";
  const baseUrl =
    config.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  const provider = {
    id: "qwen",

    getModelMetadata(modelId) {
      const meta = MODEL_CATALOG[modelId] || MODEL_CATALOG[DEFAULT_MODELS.cheap];
      return { provider: "qwen", modelId, ...meta };
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
      return normalizeUsageForProvider("qwen", rawUsage, provider.getModelMetadata(modelId));
    },
  };

  return provider;
}

export { DEFAULT_MODELS as QWEN_DEFAULT_MODELS };
