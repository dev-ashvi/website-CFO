import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCandidateActions,
  runCandidatePipeline,
  shortlistCandidateResults,
} from "./candidateActionEngine.js";
import { runSimulation, buildFinancialIntelligenceContext } from "./index.js";
import { getScenario1FormInputs, getScenario4FormInputs } from "./scenarioFormPresets.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";

describe("candidateActionEngine", () => {
  it("generates broad candidate grid for Scenario 1", () => {
    const sim = runSimulation(normalizeFormInputs(getScenario1FormInputs()));
    assert.equal(sim.ok, true);
    const ctx = buildFinancialIntelligenceContext(sim);
    const actions = buildCandidateActions(ctx);

    assert.ok(actions.length >= 15);
    assert.ok(actions.length <= 30);
    const types = new Set(actions.map((a) => a.type));
    assert.ok(types.has("reduce_fulfillment_pts"));
    assert.ok(types.has("reduce_sm_pts"));
    assert.ok(types.has("reduce_fixed_pct"));
    assert.ok(types.has("increase_revenue_growth"));
  });

  it("adds CapEx and funding candidates when relevant", () => {
    const sim = runSimulation(normalizeFormInputs(getScenario4FormInputs()));
    assert.equal(sim.ok, true);
    const ctx = buildFinancialIntelligenceContext(sim);
    const actions = buildCandidateActions(ctx);
    const types = new Set(actions.map((a) => a.type));

    assert.ok(types.has("delay_capex"));
    assert.ok(types.has("delay_funding"));
  });

  it("simulates candidates and produces diverse shortlist", () => {
    const sim = runSimulation(normalizeFormInputs(getScenario1FormInputs()));
    assert.equal(sim.ok, true);
    const ctx = buildFinancialIntelligenceContext(sim);
    const pipeline = runCandidatePipeline(sim, ctx);

    assert.ok(pipeline.allResults.length >= 10);
    assert.ok(pipeline.shortlist.length >= 3);
    assert.ok(pipeline.shortlist.length <= 5);

    const families = new Set(pipeline.shortlist.map((r) => r.candidateType));
    assert.ok(families.size >= 2, "shortlist should include diverse strategy families");
  });

  it("deduplicates near-identical strategies in shortlist", () => {
    const sim = runSimulation(normalizeFormInputs(getScenario1FormInputs()));
    assert.equal(sim.ok, true);
    const ctx = buildFinancialIntelligenceContext(sim);
    const pipeline = runCandidatePipeline(sim, ctx);
    const manual = shortlistCandidateResults(pipeline.scored, { min: 3, max: 5 });

    for (let i = 0; i < manual.length; i++) {
      for (let j = i + 1; j < manual.length; j++) {
        const sameType = manual[i].candidateType === manual[j].candidateType;
        const closeRunway =
          manual[i].delta.runwayMonths != null &&
          manual[j].delta.runwayMonths != null &&
          Math.abs(manual[i].delta.runwayMonths - manual[j].delta.runwayMonths) < 0.3;
        assert.equal(sameType && closeRunway, false);
      }
    }
  });

  it("verified results never invent runway without simulation", () => {
    const sim = runSimulation(normalizeFormInputs(getScenario1FormInputs()));
    assert.equal(sim.ok, true);
    const ctx = buildFinancialIntelligenceContext(sim);
    const { allResults } = runCandidatePipeline(sim, ctx);

    for (const result of allResults) {
      assert.ok(result.before);
      assert.ok(result.after);
      assert.ok(result.simulationHash);
      if (result.delta.runwayMonths != null) {
        assert.equal(
          result.delta.runwayMonths,
          Math.round((result.after.runwayMonths - result.before.runwayMonths) * 10) / 10,
        );
      }
    }
  });
});
