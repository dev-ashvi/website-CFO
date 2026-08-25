import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicSignals } from "./deterministicSignals.js";
import { runSimulation, buildFinancialIntelligenceContext } from "./index.js";
import { getScenario1FormInputs, getScenario4FormInputs } from "./scenarioFormPresets.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";

describe("deterministicSignals", () => {
  it("emits runway and cost signals for Scenario 1", () => {
    const sim = runSimulation(normalizeFormInputs(getScenario1FormInputs()));
    assert.equal(sim.ok, true);
    const partial = buildFinancialIntelligenceContext(sim);
    const signals = buildDeterministicSignals(partial);
    const ids = signals.map((s) => s.id);

    assert.ok(ids.includes("largest_cost_driver"));
    assert.ok(ids.some((id) => id.startsWith("runway_")));
    assert.ok(signals.every((s) => s.fact && s.evidence?.length));
  });

  it("emits funding dependency signals for Scenario 4", () => {
    const sim = runSimulation(normalizeFormInputs(getScenario4FormInputs()));
    assert.equal(sim.ok, true);
    const partial = buildFinancialIntelligenceContext(sim);
    const signals = buildDeterministicSignals(partial);
    const ids = signals.map((s) => s.id);

    assert.ok(ids.includes("funding_dependency_high"));
    assert.ok(ids.includes("runway_before_funding_critical"));
    assert.ok(ids.includes("capex_material"));
  });
});
