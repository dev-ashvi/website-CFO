import { FREE_TIER_COST_TARGET_INR } from "./types.js";

/** Default USD→INR for internal cost reporting (engineering estimate). */
const USD_TO_INR = 83;

/**
 * @typedef {import('./types.js').AiUsageEvent} AiUsageEvent
 * @typedef {import('./types.js').AiFeature} AiFeature
 * @typedef {import('./types.js').ModelTier} ModelTier
 */

/**
 * Server-side authoritative AI usage telemetry sink.
 */
export class AiUsageTelemetry {
  /**
   * @param {{ sink?: AiUsageEvent[]; onRecord?: (event: AiUsageEvent) => void }} [options]
   */
  constructor(options = {}) {
    /** @type {AiUsageEvent[]} */
    this.events = options.sink ?? [];
    this.onRecord = options.onRecord ?? null;
  }

  /**
   * @param {Partial<AiUsageEvent> & Pick<AiUsageEvent, "feature" | "provider" | "model" | "modelTier" | "contextVersion" | "sessionId">} partial
   */
  record(partial) {
    /** @type {AiUsageEvent} */
    const event = {
      feature: partial.feature,
      provider: partial.provider,
      model: partial.model,
      modelTier: partial.modelTier,
      contextVersion: partial.contextVersion,
      sessionId: partial.sessionId,
      inputTokens: partial.inputTokens ?? 0,
      outputTokens: partial.outputTokens ?? 0,
      toolCalls: partial.toolCalls ?? 0,
      simulationCalls: partial.simulationCalls ?? 0,
      latencyMs: partial.latencyMs ?? 0,
      estimatedCostUsd: partial.estimatedCostUsd ?? 0,
      cacheHit: partial.cacheHit ?? false,
      success: partial.success ?? true,
      failureReason: partial.failureReason,
      timestamp: partial.timestamp ?? new Date().toISOString(),
    };
    this.events.push(event);
    this.onRecord?.(event);
    return event;
  }

  /**
   * @param {{ feature: AiFeature; modelTier: ModelTier; contextVersion: string; sessionId: string; provider?: string; model?: string }} params
   */
  recordCacheHit(params) {
    return this.record({
      ...params,
      provider: params.provider ?? "cache",
      model: params.model ?? "none",
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      simulationCalls: 0,
      latencyMs: 0,
      estimatedCostUsd: 0,
      cacheHit: true,
      success: true,
    });
  }

  /** @param {AiFeature} [feature] */
  getCostSummary(feature) {
    const filtered = feature ? this.events.filter((e) => e.feature === feature) : this.events;
    const live = filtered.filter((e) => !e.cacheHit);
    const totalUsd = live.reduce((s, e) => s + (e.estimatedCostUsd || 0), 0);
    const cacheHits = filtered.filter((e) => e.cacheHit).length;
    return {
      eventCount: filtered.length,
      liveCallCount: live.length,
      cacheHitCount: cacheHits,
      cacheHitRate: filtered.length ? cacheHits / filtered.length : 0,
      totalCostUsd: totalUsd,
      totalCostInr: totalUsd * USD_TO_INR,
      avgCostUsd: live.length ? totalUsd / live.length : 0,
      freeTierTargetInr: FREE_TIER_COST_TARGET_INR,
    };
  }

  clear() {
    this.events.length = 0;
  }
}

/**
 * Normalize provider usage metadata into telemetry fields.
 * @param {string} provider
 * @param {unknown} rawUsage
 * @param {{ inputCostPerToken?: number; outputCostPerToken?: number }} [pricing]
 */
export function normalizeProviderUsage(provider, rawUsage, pricing = {}) {
  const usage = /** @type {Record<string, number>} */ (rawUsage && typeof rawUsage === "object" ? rawUsage : {});

  let inputTokens = 0;
  let outputTokens = 0;

  if (provider === "openai" || provider === "deepseek") {
    inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
    outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  } else if (provider === "qwen") {
    inputTokens = Number(usage.input_tokens ?? 0);
    outputTokens = Number(usage.output_tokens ?? 0);
  } else {
    inputTokens = Number(usage.inputTokens ?? usage.input_tokens ?? 0);
    outputTokens = Number(usage.outputTokens ?? usage.output_tokens ?? 0);
  }

  const estimatedCostUsd =
    inputTokens * (pricing.inputCostPerToken ?? 0) + outputTokens * (pricing.outputCostPerToken ?? 0);

  return { inputTokens, outputTokens, estimatedCostUsd };
}

/**
 * @param {number} usd
 */
export function usdToInr(usd) {
  return usd * USD_TO_INR;
}
