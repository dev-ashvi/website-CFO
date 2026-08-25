import { validateMetricRefs, validateFinancialRules, auditUnsupportedNumericClaims } from "../aiOutputValidator.js";
import { resolveContextPath } from "../metricRefAllowlist.js";

/** @typedef {import('./evalCases.js').WyzAiEvalCase} WyzAiEvalCase */

/**
 * @param {WyzAiEvalCase} evalCase
 * @param {object} context
 * @param {object} response
 */
export function scoreEvalCase(evalCase, context, response) {
  const prose = collectResponseText(response);
  const metricRefs = response.metricRefs || [];

  /** @type {Record<string, { passed: boolean; gating: boolean; score: number; details?: string[] }>} */
  const dimensions = {};

  dimensions.numericalFidelity = scoreNumericalFidelity(evalCase, context, metricRefs, response);
  dimensions.runwaySemanticAccuracy = scoreRunwaySemantics(evalCase, context, prose);
  dimensions.metricRefCorrectness = scoreMetricRefCorrectness(context, metricRefs);
  dimensions.hallucination = scoreHallucination(evalCase, prose, metricRefs);
  dimensions.structuredOutput = scoreStructuredOutput(response);
  dimensions.financialReasoning = scoreFinancialRules(evalCase, context, prose);
  dimensions.toolCallAccuracy = scoreToolCalls(evalCase, response);
  dimensions.latency = { passed: true, gating: false, score: 1 };
  dimensions.cost = { passed: true, gating: false, score: 1 };

  const gatingFailed = Object.values(dimensions).some((d) => d.gating && !d.passed);
  const totalScore = Object.values(dimensions).reduce((s, d) => s + d.score, 0);
  const maxScore = Object.keys(dimensions).length;

  return {
    evalCaseId: evalCase.id,
    dimensions,
    gatingPassed: !gatingFailed,
    totalScore,
    maxScore,
    normalizedScore: maxScore ? totalScore / maxScore : 0,
  };
}

function scoreNumericalFidelity(evalCase, context, metricRefs, response) {
  const expected = evalCase.expectedMetricRefs || [];
  if (!expected.length) {
    return { passed: true, gating: true, score: 1 };
  }

  let matched = 0;
  for (const exp of expected) {
    const found = metricRefs.find((r) => r.path === exp.path);
    const auth = resolveContextPath(context, exp.path);
    if (found && auth != null && Math.abs(Number(found.value) - Number(auth)) <= 0.05) {
      matched++;
    }
  }

  const passed = matched === expected.length;
  return {
    passed,
    gating: true,
    score: expected.length ? matched / expected.length : 1,
    details: passed ? [] : ["expected_metric_refs_not_fully_matched"],
  };
}

function scoreRunwaySemantics(evalCase, context, prose) {
  const rules = evalCase.expectedFinancialRules || [];
  const errors = [];

  if (rules.includes("must_not_use_cashSeriesRunwayMonths_as_hero")) {
    const fin = validateFinancialRules(context, prose);
    if (!fin.ok) errors.push(...fin.errors);
  }

  if (rules.includes("must_use_before_funding_leg") && context.funding?.plannedFunding?.hasFutureFunding) {
    const before = context.runway?.runwayBeforePlannedFundingMonths;
    if (before != null && !prose.includes(String(before))) {
      errors.push("missing_before_funding_runway_in_response");
    }
  }

  return {
    passed: errors.length === 0,
    gating: true,
    score: errors.length ? 0 : 1,
    details: errors,
  };
}

function scoreMetricRefCorrectness(context, metricRefs) {
  const result = validateMetricRefs(metricRefs, context);
  return {
    passed: result.ok,
    gating: true,
    score: result.ok ? 1 : 0,
    details: result.errors,
  };
}

function scoreHallucination(evalCase, prose, metricRefs = []) {
  const forbidden = evalCase.forbiddenClaims || [];
  const hits = forbidden.filter((claim) => prose.toLowerCase().includes(claim.toLowerCase()));
  const audit = auditUnsupportedNumericClaims(prose, metricRefs);
  return {
    passed: hits.length === 0 && audit.ok,
    gating: true,
    score: hits.length ? 0 : audit.ok ? 1 : 0.5,
    details: hits.length ? hits : audit.errors,
  };
}

function scoreStructuredOutput(response) {
  const hasSummary = typeof response.summary === "string" && response.summary.length > 0;
  const hasRisks = Array.isArray(response.keyRisks) && response.keyRisks.length >= 1;
  const passed = hasSummary && hasRisks;
  return { passed, gating: false, score: passed ? 1 : 0.5 };
}

function scoreFinancialRules(evalCase, context, prose) {
  const fin = validateFinancialRules(context, prose);
  return {
    passed: fin.ok,
    gating: false,
    score: fin.ok ? 1 : 0,
    details: fin.errors,
  };
}

function scoreToolCalls(evalCase, response) {
  if (!evalCase.expectedToolCalls?.length) {
    return { passed: true, gating: false, score: 1 };
  }
  const actual = (response.toolCalls || []).map((t) => t.name || t);
  const matched = evalCase.expectedToolCalls.every((t) => actual.includes(t));
  return { passed: matched, gating: true, score: matched ? 1 : 0, details: actual };
}

function collectResponseText(response) {
  return [
    response.summary,
    response.priorityObservation,
    response.message,
    ...(response.keyRisks || []),
    ...(response.recommendedActions || []),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Rank benchmark candidates — gating failures cannot win on cost alone.
 * @param {Array<{ providerId: string; modelId: string; modelTier: string; caseScores: ReturnType<typeof scoreEvalCase>[]; avgLatencyMs?: number; avgCostUsd?: number }>} candidates
 */
export function rankBenchmarkCandidates(candidates) {
  return [...candidates]
    .map((c) => {
      const allGatingPassed = c.caseScores.every((s) => s.gatingPassed);
      const avgNormalized =
        c.caseScores.reduce((s, r) => s + r.normalizedScore, 0) / (c.caseScores.length || 1);
      return {
        ...c,
        allGatingPassed,
        avgNormalized,
        rankScore: allGatingPassed
          ? avgNormalized - (c.avgCostUsd ?? 0) * 0.001 - (c.avgLatencyMs ?? 0) * 0.00001
          : -1,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}
