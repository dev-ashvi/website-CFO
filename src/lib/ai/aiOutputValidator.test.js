import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateMetricRefs,
  validateSimulationRefs,
  validateFinancialRules,
  validateAiOutput,
} from "./aiOutputValidator.js";
import { runSimulation, buildFinancialIntelligenceContext, getScenario4FormInputs } from "../financial-simulator/index.js";
import { normalizeFormInputs } from "../financial-simulator/normalizeFormInputs.js";

function scenario4Context() {
  const sim = runSimulation(normalizeFormInputs(getScenario4FormInputs()));
  assert.equal(sim.ok, true);
  return buildFinancialIntelligenceContext(sim);
}

describe("aiOutputValidator", () => {
  it("accepts valid MetricRef paths and values", () => {
    const context = scenario4Context();
    const result = validateMetricRefs(
      [{ path: "runway.runwayBeforePlannedFundingMonths", value: 7.9 }],
      context,
    );
    assert.equal(result.ok, true);
  });

  it("rejects invalid MetricRef path", () => {
    const context = scenario4Context();
    const result = validateMetricRefs([{ path: "runway.inventedField", value: 1 }], context);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("unsupported_path")));
  });

  it("rejects wrong MetricRef value", () => {
    const context = scenario4Context();
    const result = validateMetricRefs(
      [{ path: "runway.runwayBeforePlannedFundingMonths", value: 26 }],
      context,
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("mismatch")));
  });

  it("validates SimulationRef against verified results", () => {
    const verified = [{ candidateId: "c1", simulationHash: "hash-abc" }];
    const ok = validateSimulationRefs([{ candidateId: "c1", simulationHash: "hash-abc" }], verified);
    assert.equal(ok.ok, true);

    const bad = validateSimulationRefs([{ candidateId: "c1", simulationHash: "wrong" }], verified);
    assert.equal(bad.ok, false);
  });

  it("rejects cash-series runway used as hero when funding exists", () => {
    const context = scenario4Context();
    const prose =
      "Your projected runway is 26 months after planned funding.";
    const result = validateFinancialRules(context, prose);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("financial_rule_cash_series_used_as_hero"));
  });

  it("runs full pipeline and sanitizes on MetricRef failure", () => {
    const context = scenario4Context();
    const result = validateAiOutput({
      output: {
        summary: "Runway before funding is 26 months.",
        keyRisks: ["Risk"],
        recommendedActions: ["Action"],
        priorityObservation: "Note",
        metricRefs: [{ path: "runway.runwayBeforePlannedFundingMonths", value: 26 }],
      },
      context,
      tier: "free",
    });

    assert.equal(result.valid, false);
    assert.equal(result.stage, "metricRef");
    assert.equal(result.sanitized.source, "sanitized");
  });

  it("passes valid structured assessment", () => {
    const context = scenario4Context();
    const result = validateAiOutput({
      output: {
        summary: "Planned funding improves runway materially.",
        keyRisks: ["Before-funding runway is critical"],
        recommendedActions: ["Monitor cash before funding month"],
        priorityObservation: "Funding timing matters",
        metricRefs: [
          { path: "runway.runwayBeforePlannedFundingMonths", value: 7.9 },
          { path: "runway.runwayAfterPlannedFundingMonths", value: 20.4 },
        ],
      },
      context,
      tier: "free",
    });

    assert.equal(result.valid, true);
    assert.equal(result.stage, "complete");
  });
});
