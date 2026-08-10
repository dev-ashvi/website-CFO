import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getScenario1FormInputs } from "./scenario1FormPreset.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";
import { runSimulation } from "./index.js";
import {
  buildRunwayUiDiagnostic,
  compareScenario1Diagnostic,
  SCENARIO_1_UI_EXPECTED,
} from "./runwayUiDiagnostic.js";

describe("runway UI diagnostic — Scenario 1 preset", () => {
  it("form preset normalizes to approved Scenario 1 inputs", () => {
    const form = getScenario1FormInputs();
    assert.equal(form.currentCashBalance, 3_000_000);
    assert.equal(form.revenueMode, "detailed");
    assert.equal(form.currentVolume, 2000);
    assert.equal(form.monthlyVolumeGrowth, 0.01);
    assert.equal(form.averageOrderValue, 1500);
    assert.equal(form.productTechPercent, 0.4);
    assert.equal(form.salesMarketingPercent, 0.2);
    assert.equal(Number(form.capexEvents[0]?.amount) || 0, 0);
    assert.deepEqual(form.equityEvents, [{ monthIndex: "", amount: "" }]);
  });

  it("form → normalizeFormInputs → engine → KPI matches Scenario 1 checkpoints", () => {
    const form = getScenario1FormInputs();
    const normalized = normalizeFormInputs(form);
    assert.deepEqual(normalized.capexEvents, []);
    assert.equal(normalized.productTechPercent, 0.4);
    assert.equal(normalized.salesMarketingPercent, 0.2);

    const sim = runSimulation(normalized);
    assert.equal(sim.ok, true);
    const diagnostic = buildRunwayUiDiagnostic(sim.inputs, sim);
    const parity = compareScenario1Diagnostic(diagnostic);
    assert.equal(parity.noCapex, true);
    assert.equal(parity.firstNegativeMonth, true);
    assert.equal(parity.cashOutLabel, true);
    assert.equal(parity.largestKey, true);
    assert.equal(parity.largestLabel, true);
    assert.equal(parity.month13CashIncl, true);
    assert.equal(parity.month13CashExcl, true);
    assert.equal(diagnostic.engineOutputs.cashOutLabel, SCENARIO_1_UI_EXPECTED.cashOutLabel);
    assert.equal(sim.kpis.runwayMonths, 12.3);
    assert.equal(sim.kpis.cashOutMonthLabel, "Aug 2027");
  });
});
