import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDefaultInputs, RUNWAY_FORM_SCHEMA_VERSION } from "./defaults.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";
import { runSimulation } from "./index.js";
import {
  getScenario1FormInputs,
  getScenario2FormInputs,
  SCENARIO_1_FORM_TEMPLATE,
  SCENARIO_2_FORM_TEMPLATE,
} from "./scenarioFormPresets.js";
import {
  createInitialFormInputs,
  migrateOrResetFormInputs,
} from "./runwayFormState.js";

describe("form defaults — S&M / Fulfilment mapping", () => {
  it("defaults use approved Excel mapping (S&M 20%, Fulfilment 40%)", () => {
    const d = getDefaultInputs();
    assert.equal(d.salesMarketingPercent, 0.2);
    assert.equal(d.productTechPercent, 0.4);
    assert.equal(d.schemaVersion, RUNWAY_FORM_SCHEMA_VERSION);
    assert.notEqual(d.salesMarketingPercent, 0.4);
    assert.notEqual(d.productTechPercent, 0.2);
  });

  it("rejects legacy stored drafts with swapped percents / old schema", () => {
    const legacy = {
      schemaVersion: 1,
      salesMarketingPercent: 0.4,
      productTechPercent: 0.2,
    };
    const migrated = migrateOrResetFormInputs(legacy);
    assert.equal(migrated.schemaVersion, RUNWAY_FORM_SCHEMA_VERSION);
    assert.equal(migrated.salesMarketingPercent, 0.2);
    assert.equal(migrated.productTechPercent, 0.4);
  });

  it("createInitialFormInputs matches current schema defaults", () => {
    const form = createInitialFormInputs();
    assert.equal(form.salesMarketingPercent, 0.2);
    assert.equal(form.productTechPercent, 0.4);
  });
});

describe("Scenario 1 / 2 form presets — label/value invariant", () => {
  it("Scenario 1 template is S&M 20% / Fulfilment 40% with no CapEx and no funding", () => {
    assert.equal(SCENARIO_1_FORM_TEMPLATE.salesMarketingPercent, 0.2);
    assert.equal(SCENARIO_1_FORM_TEMPLATE.productTechPercent, 0.4);
    assert.equal(Number(SCENARIO_1_FORM_TEMPLATE.capexEvents[0]?.amount) || 0, 0);
    assert.equal(Number(SCENARIO_1_FORM_TEMPLATE.equityEvents[0]?.amount) || 0, 0);
    assert.equal(Number(SCENARIO_1_FORM_TEMPLATE.debtEvents[0]?.amount) || 0, 0);
  });

  it("Scenario 2 clones Scenario 1 ops and only adds ₹50L equity Month 6", () => {
    assert.equal(SCENARIO_2_FORM_TEMPLATE.salesMarketingPercent, 0.2);
    assert.equal(SCENARIO_2_FORM_TEMPLATE.productTechPercent, 0.4);
    assert.equal(Number(SCENARIO_2_FORM_TEMPLATE.capexEvents[0]?.amount) || 0, 0);
    assert.deepEqual(SCENARIO_2_FORM_TEMPLATE.equityEvents, [{ monthIndex: 6, amount: 5_000_000 }]);
    assert.equal(Number(SCENARIO_2_FORM_TEMPLATE.debtEvents[0]?.amount) || 0, 0);
  });

  it("Scenario 1 form → normalize → engine: S&M ₹6L, Fulfilment ₹12L, CM1 ₹6L", () => {
    const form = getScenario1FormInputs();
    const normalized = normalizeFormInputs(form);
    assert.equal(normalized.salesMarketingPercent, 0.2);
    assert.equal(normalized.productTechPercent, 0.4);
    assert.deepEqual(normalized.capexEvents, []);
    assert.deepEqual(normalized.equityEvents, []);

    const sim = runSimulation(normalized);
    assert.equal(sim.ok, true);
    const m1 = sim.months[0];
    assert.equal(m1.salesAndMarketing, 600_000);
    assert.equal(m1.fulfillmentCosts, 1_200_000);
    assert.equal(m1.cm1, 600_000);
    assert.equal(m1.ebitda, -225_000);
    assert.equal(sim.kpis.runwayMonths, 12.3);
    assert.equal(sim.kpis.cashOutMonthLabel, "Aug 2027");
  });

  it("Scenario 2 form → normalize → same CM1/EBITDA; equity M6; CapEx none", () => {
    const form = getScenario2FormInputs();
    const normalized = normalizeFormInputs(form);
    assert.deepEqual(normalized.capexEvents, []);
    assert.deepEqual(normalized.equityEvents, [{ monthIndex: 6, amount: 5_000_000 }]);

    const sim = runSimulation(normalized);
    assert.equal(sim.ok, true);
    assert.equal(sim.months[0].cm1, 600_000);
    assert.equal(sim.months[0].ebitda, -225_000);
    assert.equal(sim.months[5].equityFunding, 5_000_000);
    assert.equal(sim.months[12].capex, 0);
    assert.equal(sim.kpis.plannedFunding.hasFutureFunding, true);
    assert.equal(sim.kpis.runwayBeforePlannedFundingMonths, 12.3);
    assert.equal(sim.kpis.runwayAfterPlannedFundingMonths, 29.2);
    assert.notEqual(sim.kpis.projectedRunwayMonths, sim.kpis.cashSeriesRunwayMonths);
  });
});
