/**
 * WYZ AI CFO benchmark eval cases — derived from approved simulator scenarios.
 * @typedef {import('../types.js').MetricRef} MetricRef
 */

/**
 * @typedef {object} WyzAiEvalCase
 * @property {string} id
 * @property {string} financialFixture
 * @property {string} userQuestion
 * @property {string[]} [expectedToolCalls]
 * @property {MetricRef[]} expectedMetricRefs
 * @property {string[]} forbiddenClaims
 * @property {string[]} expectedFinancialRules
 */

/** @type {WyzAiEvalCase[]} */
export const WYZ_AI_EVAL_CASES = [
  {
    id: "s1-runway-headline",
    financialFixture: "scenario1",
    userQuestion: "Why is runway 12.3 months?",
    expectedMetricRefs: [{ path: "runway.primaryRunwayMonths", value: 12.3 }],
    forbiddenClaims: ["26 months", "26.0 months"],
    expectedFinancialRules: ["must_use_primary_runway"],
  },
  {
    id: "s4-runway-before-funding",
    financialFixture: "scenario4",
    userQuestion: "Why is runway 7.9 months?",
    expectedMetricRefs: [{ path: "runway.runwayBeforePlannedFundingMonths", value: 7.9 }],
    forbiddenClaims: ["20.4 months as before", "26 months"],
    expectedFinancialRules: ["must_use_before_funding_leg"],
  },
  {
    id: "s4-runway-before-after",
    financialFixture: "scenario4",
    userQuestion: "Why is runway different before and after planned funding?",
    expectedMetricRefs: [
      { path: "runway.runwayBeforePlannedFundingMonths", value: 7.9 },
      { path: "runway.runwayAfterPlannedFundingMonths", value: 20.4 },
      { path: "runway.fundingRunwayImpactMonths", value: 12.5 },
    ],
    forbiddenClaims: ["26 months projected runway", "26.0 months of runway"],
    expectedFinancialRules: ["must_not_use_cashSeriesRunwayMonths_as_hero"],
  },
  {
    id: "s4-funding-delay",
    financialFixture: "scenario4",
    userQuestion: "What happens if funding is delayed 4 months?",
    expectedToolCalls: ["simulate_changes"],
    expectedMetricRefs: [],
    forbiddenClaims: [],
    expectedFinancialRules: ["must_use_simulation_for_impact"],
  },
  {
    id: "s4-capex-cm1",
    financialFixture: "scenario4",
    userQuestion: "Does CapEx affect CM1?",
    expectedMetricRefs: [{ path: "currentPerformance.cm1", value: 600_000 }],
    forbiddenClaims: [],
    expectedFinancialRules: ["capex_does_not_affect_cm1"],
  },
  {
    id: "s1-largest-cost",
    financialFixture: "scenario1",
    userQuestion: "What is the largest controllable cost?",
    expectedMetricRefs: [],
    forbiddenClaims: [],
    expectedFinancialRules: ["must_reference_cost_structure"],
  },
  {
    id: "s1-runway-vs-cashout",
    financialFixture: "scenario1",
    userQuestion: "Why can cash-out date differ from the headline runway calculation?",
    expectedMetricRefs: [{ path: "runway.primaryRunwayMonths", value: 12.3 }],
    forbiddenClaims: [],
    expectedFinancialRules: ["must_explain_cfo_vs_cashout_independence"],
  },
];

/**
 * @param {string} fixtureId
 */
export function getEvalCasesForFixture(fixtureId) {
  return WYZ_AI_EVAL_CASES.filter((c) => c.financialFixture === fixtureId);
}
