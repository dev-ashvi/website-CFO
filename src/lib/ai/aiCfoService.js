/**
 * Server-side AI CFO service — requests logical tiers, never hard-coded providers.
 * NOT imported by React client bundles (Phase 1+ API routes only).
 */

import { AiRouter, loadTierConfigFromEnv } from "./aiRouter.js";
import { AiUsageTelemetry } from "./aiUsageTelemetry.js";
import { validateAiOutput } from "./aiOutputValidator.js";
import { createProviderRegistry } from "./providers/index.js";

/** @typedef {import('./types.js').ModelTier} ModelTier */
/** @typedef {import('./types.js').AiFeature} AiFeature */

const ASSESSMENT_SYSTEM_PROMPT = `You are the WYZ AI CFO assessment layer.

Explain only supplied FinancialIntelligenceContext data.
Do not calculate new financial figures.
Return valid JSON with keys: summary, keyRisks (array of 3 strings), recommendedActions (array of 3 strings), priorityObservation.
When stating numbers, include metricRefs: [{ path, value }] tracing to context fields.
Never use cashSeriesRunwayMonths as the hero runway when planned funding exists — use primaryRunwayMonths or before/after funding legs.`;

/**
 * @param {{
 *   router?: AiRouter;
 *   telemetry?: AiUsageTelemetry;
 *   providers?: Record<string, object>;
 *   tierConfig?: ReturnType<typeof loadTierConfigFromEnv>;
 *   assessmentCache?: Map<string, unknown>;
 * }} [deps]
 */
export function createAiCfoService(deps = {}) {
  const providers = deps.providers ?? createProviderRegistry({ useMock: !hasLiveProviderEnv() });
  const router =
    deps.router ??
    new AiRouter({
      providers,
      tierConfig: deps.tierConfig ?? loadTierConfigFromEnv(),
    });
  const telemetry = deps.telemetry ?? new AiUsageTelemetry();
  const assessmentCache = deps.assessmentCache ?? new Map();

  return {
    router,
    telemetry,
    providers,

    /**
     * @param {object} context FinancialIntelligenceContext
     * @param {{ modelTier?: ModelTier; sessionId?: string; feature?: AiFeature; skipCache?: boolean }} [options]
     */
    async generateAssessment(context, options = {}) {
      const modelTier = options.modelTier ?? "cheap";
      const sessionId = options.sessionId ?? "anonymous";
      const feature = options.feature ?? "assessment";
      const contextVersion = context.meta?.contextVersion ?? "unknown";

      if (!options.skipCache && assessmentCache.has(contextVersion)) {
        telemetry.recordCacheHit({
          feature,
          modelTier,
          contextVersion,
          sessionId,
        });
        return {
          output: assessmentCache.get(contextVersion),
          fromCache: true,
          validation: { valid: true, stage: "cache" },
        };
      }

      const route = router.resolve({ modelTier, feature });

      try {
        const result = await route.adapter.completeJson({
          modelId: route.modelId,
          systemPrompt: ASSESSMENT_SYSTEM_PROMPT,
          userPrompt: JSON.stringify(context, null, 2),
          maxTokens: 1200,
        });

        const usage = route.adapter.normalizeUsage(result.usage, route.modelId);
        telemetry.record({
          feature,
          provider: route.providerId,
          model: route.modelId,
          modelTier,
          contextVersion,
          sessionId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          toolCalls: 0,
          simulationCalls: 0,
          latencyMs: result.latencyMs,
          estimatedCostUsd: usage.estimatedCostUsd,
          cacheHit: false,
          success: true,
        });

        const validation = validateAiOutput({
          output: result.parsed,
          context,
          verifiedSimulations: context.simulationResults ?? [],
          tier: modelTier === "premium" ? "premium" : "free",
          strictNumericAudit: false,
        });

        const output = validation.valid ? validation.output : validation.sanitized;
        if (validation.valid) {
          assessmentCache.set(contextVersion, output);
        }

        return {
          output,
          raw: result.rawText,
          fromCache: false,
          validation,
          route: { providerId: route.providerId, modelId: route.modelId, modelTier },
        };
      } catch (err) {
        telemetry.record({
          feature,
          provider: route.providerId,
          model: route.modelId,
          modelTier,
          contextVersion,
          sessionId,
          inputTokens: 0,
          outputTokens: 0,
          toolCalls: 0,
          simulationCalls: 0,
          latencyMs: 0,
          estimatedCostUsd: 0,
          cacheHit: false,
          success: false,
          failureReason: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },

    /**
     * @param {{ context: object; conversation: object[]; tools: object[] }} _params
     * @param {{ modelTier?: ModelTier; sessionId?: string }} [options]
     */
    async runAgentTurn(_params, options = {}) {
      const modelTier = options.modelTier ?? "reasoning";
      const sessionId = options.sessionId ?? "anonymous";
      const route = router.resolve({ modelTier, feature: "ask_wyz" });
      throw new Error(
        `runAgentTurn not implemented until Phase 2 (resolved ${route.providerId}/${route.modelId} for session ${sessionId})`,
      );
    },

    /**
     * @param {{ context: object; comparison: object }} _params
     * @param {{ modelTier?: ModelTier; sessionId?: string }} [options]
     */
    async interpretScenario(_params, options = {}) {
      const modelTier = options.modelTier ?? "reasoning";
      const route = router.resolve({ modelTier, feature: "scenario_interpretation" });
      throw new Error(
        `interpretScenario not implemented until Phase 4 (resolved ${route.providerId}/${route.modelId})`,
      );
    },

    clearCache() {
      assessmentCache.clear();
    },
  };
}

function hasLiveProviderEnv() {
  if (typeof process === "undefined") return false;
  const env = process.env;
  return Boolean(
    env.OPENAI_API_KEY ||
      env.WYZ_OPENAI_API_KEY ||
      env.DEEPSEEK_API_KEY ||
      env.WYZ_DEEPSEEK_API_KEY ||
      env.QWEN_API_KEY ||
      env.DASHSCOPE_API_KEY,
  );
}

/** Singleton for server scripts — not used by client. */
let defaultService = null;

export function getAiCfoService() {
  if (!defaultService) {
    defaultService = createAiCfoService();
  }
  return defaultService;
}
