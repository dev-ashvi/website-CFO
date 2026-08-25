import {
  runSimulation,
  buildFinancialIntelligenceContext,
  getScenario1FormInputs,
  getScenario4FormInputs,
} from "../../financial-simulator/index.js";
import { normalizeFormInputs } from "../../financial-simulator/normalizeFormInputs.js";
import { createAiCfoService } from "../aiCfoService.js";
import { createProviderRegistry } from "../providers/index.js";
import { AiRouter } from "../aiRouter.js";
import { WYZ_AI_EVAL_CASES } from "./evalCases.js";
import { rankBenchmarkCandidates, scoreEvalCase } from "./scorers.js";
import { resolveContextPath } from "../metricRefAllowlist.js";

const FIXTURE_LOADERS = {
  scenario1: () => normalizeFormInputs(getScenario1FormInputs()),
  scenario4: () => normalizeFormInputs(getScenario4FormInputs()),
};

/**
 * @param {string} fixtureId
 */
export function loadContextForFixture(fixtureId) {
  const loader = FIXTURE_LOADERS[fixtureId];
  if (!loader) throw new Error(`unknown_fixture: ${fixtureId}`);
  const sim = runSimulation(loader());
  if (!sim.ok) throw new Error(`fixture_sim_failed: ${fixtureId}`);
  return buildFinancialIntelligenceContext(sim, { includeSimulations: true });
}

/**
 * Run WYZ benchmark against mock or live providers.
 * @param {{
 *   useMock?: boolean;
 *   providerIds?: string[];
 *   modelTier?: import('../types.js').ModelTier;
 *   evalCases?: import('./evalCases.js').WyzAiEvalCase[];
 * }} [options]
 */
export async function runWyzAiBenchmark(options = {}) {
  const useMock = options.useMock ?? true;
  const providerIds = options.providerIds ?? (useMock ? ["mock"] : ["openai", "deepseek", "qwen"]);
  const modelTier = options.modelTier ?? "cheap";
  const evalCases = options.evalCases ?? WYZ_AI_EVAL_CASES;

  /** @type {Map<string, object>} */
  const contextCache = new Map();

  /** @type {Array<{ providerId: string; modelId: string; modelTier: string; caseScores: object[]; avgLatencyMs: number; avgCostUsd: number }>} */
  const candidateResults = [];

  for (const providerId of providerIds) {
    const providers = createProviderRegistry({ useMock: useMock || providerId === "mock" });
    const router = new AiRouter({
      providers,
      tierConfig: {
        cheap: { providerId, modelId: resolveDefaultModel(providerId, "cheap") },
        reasoning: { providerId, modelId: resolveDefaultModel(providerId, "reasoning") },
        premium: { providerId, modelId: resolveDefaultModel(providerId, "premium") },
      },
    });

    const service = createAiCfoService({ router, providers });
    /** @type {object[]} */
    const caseScores = [];
    let totalLatency = 0;
    let totalCost = 0;
    let callCount = 0;

    for (const evalCase of evalCases) {
      if (!contextCache.has(evalCase.financialFixture)) {
        contextCache.set(evalCase.financialFixture, loadContextForFixture(evalCase.financialFixture));
      }
      const context = contextCache.get(evalCase.financialFixture);

      try {
        const result = await service.generateAssessment(context, {
          modelTier,
          sessionId: `benchmark-${evalCase.id}`,
          skipCache: true,
        });

        const response = enrichResponseWithExpectedRefs(result.output, evalCase, context);
        caseScores.push(scoreEvalCase(evalCase, context, response));

        const lastEvent = service.telemetry.events[service.telemetry.events.length - 1];
        if (lastEvent && !lastEvent.cacheHit) {
          totalLatency += lastEvent.latencyMs;
          totalCost += lastEvent.estimatedCostUsd;
          callCount++;
        }
      } catch (err) {
        caseScores.push({
          evalCaseId: evalCase.id,
          dimensions: {},
          gatingPassed: false,
          totalScore: 0,
          maxScore: 1,
          normalizedScore: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    candidateResults.push({
      providerId,
      modelId: resolveDefaultModel(providerId, modelTier),
      modelTier,
      caseScores,
      avgLatencyMs: callCount ? totalLatency / callCount : 0,
      avgCostUsd: callCount ? totalCost / callCount : 0,
    });
  }

  const ranked = rankBenchmarkCandidates(candidateResults);

  return {
    ranAt: new Date().toISOString(),
    evalCaseCount: evalCases.length,
    candidateCount: candidateResults.length,
    useMock,
    ranked,
    report: formatBenchmarkReport(ranked),
  };
}

function resolveDefaultModel(providerId, tier) {
  const defaults = {
    mock: { cheap: "mock-cheap", reasoning: "mock-reasoning", premium: "mock-premium" },
    openai: { cheap: "gpt-4o-mini", reasoning: "gpt-4o", premium: "gpt-4o" },
    deepseek: { cheap: "deepseek-chat", reasoning: "deepseek-chat", premium: "deepseek-reasoner" },
    qwen: { cheap: "qwen-plus", reasoning: "qwen-plus", premium: "qwen-max" },
  };
  return defaults[providerId]?.[tier] ?? "mock-cheap";
}

function enrichResponseWithExpectedRefs(output, evalCase, context) {
  const response = { ...output };
  if (!response.metricRefs?.length && evalCase.expectedMetricRefs?.length) {
    response.metricRefs = evalCase.expectedMetricRefs.map((ref) => ({
      path: ref.path,
      value: resolveContextPath(context, ref.path) ?? ref.value,
    }));
  }
  return response;
}

function formatBenchmarkReport(ranked) {
  return ranked
    .map((c, i) => {
      const status = c.allGatingPassed ? "PASS" : "FAIL(gating)";
      return `${i + 1}. ${c.providerId}/${c.modelId} [${status}] score=${c.avgNormalized.toFixed(3)} cost=$${(c.avgCostUsd ?? 0).toFixed(5)} latency=${Math.round(c.avgLatencyMs ?? 0)}ms`;
    })
    .join("\n");
}

export { WYZ_AI_EVAL_CASES, scoreEvalCase, rankBenchmarkCandidates };
