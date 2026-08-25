import { MODEL_TIERS } from "./types.js";
import { OPENAI_DEFAULT_MODELS } from "./providers/openaiProvider.js";
import { DEEPSEEK_DEFAULT_MODELS } from "./providers/deepseekProvider.js";
import { QWEN_DEFAULT_MODELS } from "./providers/qwenProvider.js";

/** @typedef {import('./types.js').ModelTier} ModelTier */
/** @typedef {import('./types.js').AiFeature} AiFeature */

/**
 * @typedef {object} TierRoute
 * @property {string} providerId
 * @property {string} modelId
 */

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function loadTierConfigFromEnv(env = process.env) {
  return {
    cheap: {
      providerId: env.WYZ_AI_TIER_CHEAP_PROVIDER || env.WYZ_INSIGHT_PROVIDER || "openai",
      modelId: env.WYZ_AI_TIER_CHEAP_MODEL || env.WYZ_INSIGHT_MODEL || OPENAI_DEFAULT_MODELS.cheap,
    },
    reasoning: {
      providerId: env.WYZ_AI_TIER_REASONING_PROVIDER || "openai",
      modelId: env.WYZ_AI_TIER_REASONING_MODEL || env.WYZ_AGENT_MODEL || OPENAI_DEFAULT_MODELS.reasoning,
    },
    premium: {
      providerId: env.WYZ_AI_TIER_PREMIUM_PROVIDER || "openai",
      modelId: env.WYZ_AI_TIER_PREMIUM_MODEL || env.WYZ_AGENT_REASONING_MODEL || OPENAI_DEFAULT_MODELS.premium,
    },
  };
}

/** Benchmark candidate defaults — evaluation only, not production commitment. */
export const BENCHMARK_CANDIDATES = Object.freeze([
  { providerId: "openai", models: Object.values(OPENAI_DEFAULT_MODELS) },
  { providerId: "deepseek", models: Object.values(DEEPSEEK_DEFAULT_MODELS) },
  { providerId: "qwen", models: Object.values(QWEN_DEFAULT_MODELS) },
]);

/**
 * Resolves logical tier → provider adapter + model.
 */
export class AiRouter {
  /**
   * @param {{ providers: Record<string, object>; tierConfig?: Record<ModelTier, TierRoute> }} options
   */
  constructor(options) {
    this.providers = options.providers;
    this.tierConfig = options.tierConfig ?? loadTierConfigFromEnv();
  }

  /**
   * @param {{ modelTier: ModelTier; feature?: AiFeature; escalation?: ModelTier }} params
   */
  resolve(params) {
    const tier = params.escalation ?? params.modelTier;
    if (!MODEL_TIERS.includes(tier)) {
      throw new Error(`invalid_model_tier: ${tier}`);
    }

    const route = this.tierConfig[tier];
    if (!route?.providerId || !route?.modelId) {
      throw new Error(`missing_tier_config: ${tier}`);
    }

    const adapter = this.providers[route.providerId];
    if (!adapter) {
      throw new Error(`unknown_provider: ${route.providerId}`);
    }

    const metadata = adapter.getModelMetadata(route.modelId);
    if (!metadata.supportedTiers.includes(tier) && tier !== "premium") {
      // Allow configured override; premium/reasoning may share models in benchmark phase.
    }

    return {
      modelTier: tier,
      providerId: route.providerId,
      modelId: route.modelId,
      adapter,
      metadata,
    };
  }

  /**
   * @param {ModelTier} fromTier
   */
  escalationTarget(fromTier) {
    if (fromTier === "cheap") return "reasoning";
    if (fromTier === "reasoning") return "premium";
    return "premium";
  }
}
