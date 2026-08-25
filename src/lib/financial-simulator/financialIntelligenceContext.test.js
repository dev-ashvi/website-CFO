import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runSimulation,
  buildFinancialIntelligenceContext,
  buildLegacyAssessmentPayload,
} from "./index.js";
import {
  getScenario1FormInputs,
  getScenario2FormInputs,
  getScenario4FormInputs,
} from "./scenarioFormPresets.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";

function simFromForm(form) {
  const sim = runSimulation(normalizeFormInputs(form));
  assert.equal(sim.ok, true);
  return sim;
}

describe("financialIntelligenceContext", () => {
  it("Scenario 1 — headline runway and no funding legs", () => {
    const sim = simFromForm(getScenario1FormInputs());
    const ctx = buildFinancialIntelligenceContext(sim);

    assert.equal(ctx.runway.primaryRunwayLabel, "projected");
    assert.equal(ctx.runway.primaryRunwayMonths, 12.3);
    assert.equal(ctx.runway.headlineRunwayMonths, 12.3);
    assert.equal(ctx.runway.runwayBeforePlannedFundingMonths, null);
    assert.equal(ctx.runway.runwayAfterPlannedFundingMonths, null);
    assert.equal(ctx.funding.plannedFunding.hasFutureFunding, false);
    assert.ok(ctx.meta.contextVersion);
    assert.ok(ctx.deterministicSignals.length > 0);
    assert.ok(ctx.candidateActions.length >= 15);
  });

  it("Scenario 2 — funding-aware primary runway", () => {
    const sim = simFromForm(getScenario2FormInputs());
    const ctx = buildFinancialIntelligenceContext(sim);

    assert.equal(ctx.runway.primaryRunwayLabel, "after_planned_funding");
    assert.ok(ctx.runway.runwayBeforePlannedFundingMonths != null);
    assert.ok(ctx.runway.runwayAfterPlannedFundingMonths != null);
    assert.equal(ctx.funding.plannedFunding.hasFutureFunding, true);
  });

  it("Scenario 4 — canonical before/after funding runway", () => {
    const sim = simFromForm(getScenario4FormInputs());
    const ctx = buildFinancialIntelligenceContext(sim);

    assert.equal(ctx.runway.runwayBeforePlannedFundingMonths, 7.9);
    assert.equal(ctx.runway.runwayAfterPlannedFundingMonths, 20.4);
    assert.equal(ctx.runway.fundingRunwayImpactMonths, 12.5);
    assert.equal(ctx.runway.primaryRunwayMonths, 20.4);
    assert.equal(ctx.runway.cashSeriesRunwayMonths, 26);
    assert.notEqual(ctx.runway.primaryRunwayMonths, ctx.runway.cashSeriesRunwayMonths);
    assert.equal(ctx.runway.healthStatusBeforePlannedFunding, "Critical");
    assert.equal(ctx.runway.healthStatusAfterPlannedFunding, "Healthy");
  });

  it("legacy assessment payload uses canonical runway fields", () => {
    const sim = simFromForm(getScenario4FormInputs());
    const ctx = buildFinancialIntelligenceContext(sim);
    const payload = buildLegacyAssessmentPayload(ctx);

    assert.equal(payload.metrics.runwayMonths, 20.4);
    assert.equal(payload.metrics.runwayBeforePlannedFundingMonths, 7.9);
    assert.equal(payload.metrics.runwayAfterPlannedFundingMonths, 20.4);
    assert.equal(payload.metrics.fundingRunwayImpactMonths, 12.5);
    assert.equal(payload.metrics.cashSeriesRunwayMonths, 26);
    assert.equal(payload.contextVersion, ctx.meta.contextVersion);
    assert.ok(Array.isArray(payload.deterministicSignals));
  });

  it("includeSimulations populates verified shortlist", () => {
    const sim = simFromForm(getScenario1FormInputs());
    const ctx = buildFinancialIntelligenceContext(sim, { includeSimulations: true });

    assert.ok(ctx._candidatePipeline.allResultsCount >= 10);
    assert.ok(ctx.simulationResults.length >= 3);
    assert.ok(ctx.simulationResults.length <= 5);
    for (const result of ctx.simulationResults) {
      assert.ok(result.simulationHash);
      assert.ok(result.delta);
      assert.ok(result.candidateId);
    }
  });
});
