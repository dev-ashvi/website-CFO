import { normalizeProviderUsage } from "../aiUsageTelemetry.js";

/**
 * @typedef {import('../types.js').ModelTier} ModelTier
 */

/**
 * @typedef {object} ProviderModelMetadata
 * @property {string} provider
 * @property {string} modelId
 * @property {ModelTier[]} supportedTiers
 * @property {number} contextWindow
 * @property {boolean} supportsTools
 * @property {boolean} supportsStructuredOutput
 * @property {number} [costPerInputTokenUsd]
 * @property {number} [costPerOutputTokenUsd]
 */

/**
 * @typedef {object} JsonCompletionRequest
 * @property {string} modelId
 * @property {string} systemPrompt
 * @property {string} userPrompt
 * @property {number} [maxTokens]
 * @property {number} [temperature]
 */

/**
 * @typedef {object} JsonCompletionResult
 * @property {unknown} parsed
 * @property {string} rawText
 * @property {unknown} usage
 * @property {number} latencyMs
 */

/**
 * @typedef {object} ToolCompletionRequest
 * @property {string} modelId
 * @property {string} systemPrompt
 * @property {object[]} messages
 * @property {object[]} tools
 * @property {number} [maxTokens]
 */

/**
 * @typedef {object} ToolCompletionResult
 * @property {object[]} messages
 * @property {object[]} toolCalls
 * @property {unknown} usage
 * @property {number} latencyMs
 */

/**
 * @param {string} providerId
 * @param {unknown} rawUsage
 * @param {ProviderModelMetadata} metadata
 */
export function normalizeUsageForProvider(providerId, rawUsage, metadata) {
  return normalizeProviderUsage(providerId, rawUsage, {
    inputCostPerToken: metadata.costPerInputTokenUsd ?? 0,
    outputCostPerToken: metadata.costPerOutputTokenUsd ?? 0,
  });
}

/**
 * @param {Response} response
 */
export async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`provider_invalid_json: ${text.slice(0, 200)}`);
  }
}

/**
 * @param {object} body
 * @param {string} apiKey
 * @param {string} url
 */
export async function postChatCompletion(body, apiKey, url) {
  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - started;
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`provider_http_${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await readJsonResponse(response);
  return { data, latencyMs };
}

/**
 * @param {unknown} data
 */
export function extractChatCompletionContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("provider_missing_content");
  }
  return content;
}

/**
 * @param {string} text
 */
export function parseJsonFromModelText(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("provider_json_parse_failed");
  }
}
