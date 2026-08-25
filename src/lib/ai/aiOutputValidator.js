import {
  isAllowlistedMetricPath,
  resolveContextPath,
  metricPathTolerance,
} from "./metricRefAllowlist.js";

/** @typedef {import('./types.js').MetricRef} MetricRef */

const ASSESSMENT_REQUIRED_KEYS = ["summary", "keyRisks", "recommendedActions", "priorityObservation"];

/**
 * @param {unknown} output
 */
export function validateAssessmentSchema(output) {
  /** @type {string[]} */
  const errors = [];
  if (!output || typeof output !== "object") {
    return { ok: false, errors: ["schema_not_object"] };
  }
  const obj = /** @type {Record<string, unknown>} */ (output);

  for (const key of ASSESSMENT_REQUIRED_KEYS) {
    if (!(key in obj)) errors.push(`schema_missing_${key}`);
  }
  if (!Array.isArray(obj.keyRisks)) errors.push("schema_keyRisks_not_array");
  if (!Array.isArray(obj.recommendedActions)) errors.push("schema_recommendedActions_not_array");
  if (typeof obj.summary !== "string") errors.push("schema_summary_not_string");
  if (typeof obj.priorityObservation !== "string") errors.push("schema_priorityObservation_not_string");

  return { ok: errors.length === 0, errors };
}

/**
 * @param {MetricRef[]} metricRefs
 * @param {object} context
 */
export function validateMetricRefs(metricRefs, context) {
  /** @type {string[]} */
  const errors = [];
  if (!Array.isArray(metricRefs)) {
    return { ok: true, errors: [], validated: [] };
  }

  /** @type {MetricRef[]} */
  const validated = [];

  for (const ref of metricRefs) {
    if (!ref?.path) {
      errors.push("metric_ref_missing_path");
      continue;
    }
    if (!isAllowlistedMetricPath(ref.path)) {
      errors.push(`metric_ref_unsupported_path:${ref.path}`);
      continue;
    }

    const authoritative = resolveContextPath(context, ref.path);
    if (authoritative === undefined) {
      errors.push(`metric_ref_unresolvable:${ref.path}`);
      continue;
    }

    const tol = metricPathTolerance(ref.path);
    if (!valuesMatch(ref.value, authoritative, tol)) {
      errors.push(`metric_ref_value_mismatch:${ref.path}`);
      continue;
    }

    validated.push(ref);
  }

  return { ok: errors.length === 0, errors, validated };
}

/**
 * @param {object[]} simulationRefs
 * @param {object[]} verifiedSimulations
 */
export function validateSimulationRefs(simulationRefs, verifiedSimulations = []) {
  /** @type {string[]} */
  const errors = [];
  if (!simulationRefs?.length) return { ok: true, errors: [], validated: [] };

  const hashSet = new Set((verifiedSimulations || []).map((s) => s.simulationHash));
  const idMap = new Map((verifiedSimulations || []).map((s) => [s.candidateId, s.simulationHash]));

  for (const ref of simulationRefs) {
    if (!ref?.candidateId || !ref?.simulationHash) {
      errors.push("simulation_ref_incomplete");
      continue;
    }
    if (!hashSet.has(ref.simulationHash)) {
      errors.push(`simulation_ref_unknown_hash:${ref.simulationHash}`);
      continue;
    }
    if (idMap.get(ref.candidateId) !== ref.simulationHash) {
      errors.push(`simulation_ref_id_hash_mismatch:${ref.candidateId}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {object} context
 * @param {string} prose
 */
export function validateFinancialRules(context, prose) {
  /** @type {string[]} */
  const errors = [];
  const text = String(prose || "");
  const runway = context.runway || {};
  const hasFunding = context.funding?.plannedFunding?.hasFutureFunding;

  if (hasFunding && runway.cashSeriesRunwayMonths != null && runway.primaryRunwayMonths != null) {
    const cashSeries = String(runway.cashSeriesRunwayMonths);
    const primary = String(runway.primaryRunwayMonths);
    if (cashSeries !== primary && textIncludesNumber(text, runway.cashSeriesRunwayMonths)) {
      const usesCashSeriesAsHero =
        /projected runway|primary runway|runway is|estimated runway/i.test(text) &&
        textIncludesNumber(text, runway.cashSeriesRunwayMonths);
      if (usesCashSeriesAsHero) {
        errors.push("financial_rule_cash_series_used_as_hero");
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Scan prose for standalone numbers not covered by MetricRefs.
 * @param {string} prose
 * @param {MetricRef[]} metricRefs
 */
export function auditUnsupportedNumericClaims(prose, metricRefs = []) {
  /** @type {string[]} */
  const errors = [];
  const text = String(prose || "");
  const numbers = extractStandaloneNumbers(text);
  if (!numbers.length) return { ok: true, errors: [], uncovered: [] };

  const covered = new Set(
    metricRefs.flatMap((ref) => {
      if (typeof ref.value === "number") return [roundDisplay(ref.value)];
      return [];
    }),
  );

  /** @type {number[]} */
  const uncovered = [];
  for (const n of numbers) {
    const rounded = roundDisplay(n);
    const matched = [...covered].some((c) => Math.abs(c - rounded) <= 0.05);
    if (!matched) uncovered.push(n);
  }

  if (uncovered.length) {
    errors.push("unsupported_numeric_claims");
  }

  return { ok: errors.length === 0, errors, uncovered };
}

/**
 * Full validation pipeline: schema → MetricRef → SimulationRef → financial rules → numeric audit.
 * @param {{
 *   output: object;
 *   context: object;
 *   verifiedSimulations?: object[];
 *   tier?: "free" | "premium";
 *   strictNumericAudit?: boolean;
 * }} params
 */
export function validateAiOutput(params) {
  const { output, context, verifiedSimulations = [], tier = "free", strictNumericAudit = false } = params;

  const schema = validateAssessmentSchema(output);
  if (!schema.ok) {
    return {
      valid: false,
      stage: "schema",
      errors: schema.errors,
      sanitized: sanitizeOnFailure(output, context, tier),
    };
  }

  const metricRefs = collectMetricRefs(output);
  const metric = validateMetricRefs(metricRefs, context);
  if (!metric.ok) {
    return {
      valid: false,
      stage: "metricRef",
      errors: metric.errors,
      sanitized: sanitizeOnFailure(output, context, tier),
    };
  }

  const simRefs = output.simulationRefs || output.simulationReferences || [];
  const sim = validateSimulationRefs(simRefs, verifiedSimulations);
  if (!sim.ok) {
    return {
      valid: false,
      stage: "simulationRef",
      errors: sim.errors,
      sanitized: sanitizeOnFailure(output, context, tier),
    };
  }

  const prose = collectProse(output);
  const rules = validateFinancialRules(context, prose);
  if (!rules.ok) {
    return {
      valid: false,
      stage: "financialRules",
      errors: rules.errors,
      sanitized: sanitizeOnFailure(output, context, tier),
    };
  }

  if (strictNumericAudit) {
    const audit = auditUnsupportedNumericClaims(prose, metricRefs);
    if (!audit.ok) {
      return {
        valid: false,
        stage: "numericAudit",
        errors: audit.errors,
        uncovered: audit.uncovered,
        sanitized: sanitizeOnFailure(output, context, tier),
      };
    }
  }

  return {
    valid: true,
    stage: "complete",
    errors: [],
    output,
    validatedMetricRefs: metric.validated,
  };
}

function collectMetricRefs(output) {
  /** @type {MetricRef[]} */
  const refs = [];
  if (Array.isArray(output.metricRefs)) refs.push(...output.metricRefs);
  for (const obs of output.top_observations || output.topObservations || []) {
    if (Array.isArray(obs.metricRefs)) refs.push(...obs.metricRefs);
  }
  return refs;
}

function collectProse(output) {
  const parts = [
    output.summary,
    output.priorityObservation,
    output.executive_summary,
    output.message,
  ];
  for (const obs of output.top_observations || output.topObservations || []) {
    parts.push(obs.text);
  }
  for (const risk of output.keyRisks || []) parts.push(String(risk));
  for (const action of output.recommendedActions || []) parts.push(String(action));
  return parts.filter(Boolean).join("\n");
}

function sanitizeOnFailure(output, context, tier) {
  void tier;
  return {
    summary: stripUnsupportedNumbers(String(output?.summary || "")),
    keyRisks: (output?.keyRisks || []).map((r) => stripUnsupportedNumbers(String(r))),
    recommendedActions: (output?.recommendedActions || []).map((r) => stripUnsupportedNumbers(String(r))),
    priorityObservation: stripUnsupportedNumbers(String(output?.priorityObservation || "")),
    source: "sanitized",
    validationFailed: true,
    primaryRunwayMonths: context?.runway?.primaryRunwayMonths ?? null,
  };
}

function stripUnsupportedNumbers(text) {
  return text.replace(/\b\d+(?:\.\d+)?\s*(?:months?|mo|%|₹|rs\.?|inr|\$)?\b/gi, "[validated metric omitted]");
}

function valuesMatch(aiValue, authoritative, tolerance) {
  if (typeof authoritative === "string" || typeof authoritative === "boolean") {
    return String(aiValue) === String(authoritative);
  }
  const a = Number(aiValue);
  const b = Number(authoritative);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= tolerance;
}

function extractStandaloneNumbers(text) {
  const matches = text.match(/\b\d+(?:\.\d+)?\b/g) || [];
  return matches.map(Number).filter((n) => n > 0.1);
}

function textIncludesNumber(text, value) {
  if (value == null) return false;
  const str = String(value);
  return text.includes(str) || text.includes(str.replace(/\.0$/, ""));
}

function roundDisplay(n) {
  return Math.round(Number(n) * 10) / 10;
}
