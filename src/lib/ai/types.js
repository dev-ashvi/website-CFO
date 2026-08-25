/** @typedef {"cheap" | "reasoning" | "premium"} ModelTier */

/** @typedef {"assessment" | "recommendation" | "ask_wyz" | "scenario_interpretation" | "agent_reasoning"} AiFeature */

/**
 * @typedef {object} AiUsageEvent
 * @property {AiFeature} feature
 * @property {string} provider
 * @property {string} model
 * @property {ModelTier} modelTier
 * @property {string} contextVersion
 * @property {string} sessionId
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} toolCalls
 * @property {number} simulationCalls
 * @property {number} latencyMs
 * @property {number} estimatedCostUsd
 * @property {boolean} cacheHit
 * @property {boolean} success
 * @property {string} [failureReason]
 * @property {string} timestamp
 */

/**
 * @typedef {object} MetricRef
 * @property {string} path
 * @property {number | string | boolean} value
 * @property {"months" | "currency" | "percent" | "label"} [displayFormat]
 */

/**
 * @typedef {object} SimulationRef
 * @property {string} candidateId
 * @property {string} simulationHash
 * @property {string[]} [fields]
 */

export const MODEL_TIERS = /** @type {const} */ (["cheap", "reasoning", "premium"]);

export const AI_FEATURES = /** @type {const} */ ([
  "assessment",
  "recommendation",
  "ask_wyz",
  "scenario_interpretation",
  "agent_reasoning",
]);

/** Internal engineering target — not a customer promise. */
export const FREE_TIER_COST_TARGET_INR = 1;
