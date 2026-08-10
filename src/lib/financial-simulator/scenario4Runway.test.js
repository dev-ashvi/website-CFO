import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateProjection } from "./calculateProjection.js";
import {
  calculateKpis,
  computeCfoRunwayAtMonth,
  findExpectedCashOutMonth,
} from "./calculateKpis.js";
import { withFundingAwareRunway } from "./plannedFunding.js";
import { getScenario1FormInputs, getScenario4FormInputs } from "./scenarioFormPresets.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";
import { runSimulation } from "./index.js";

const CURRENCY_TOL = 1;
const RAW_TOL = 1e-6;

describe("Scenario 4 — CFO before/after planned funding runway", () => {
  const form = getScenario4FormInputs();
  const inputs = normalizeFormInputs(form);
  const months = calculateProjection(inputs);
  const baseKpis = calculateKpis(months);
  const kpis = withFundingAwareRunway(inputs, months, baseKpis);
  const cfo = kpis.cfoFundingRunway;

  it("has Month 1 CapEx ₹10L and Equity ₹40L in Month 6", () => {
    assert.deepEqual(inputs.capexEvents, [{ monthIndex: 1, amount: 1_000_000 }]);
    assert.deepEqual(inputs.equityEvents, [{ monthIndex: 6, amount: 4_000_000 }]);
    assert.equal(months[0].capex, 1_000_000);
    assert.equal(months[5].equityFunding, 4_000_000);
  });

  it("CapEx affects cash / incl burn but not P&L or excl burn", () => {
    const m1 = months[0];
    expectNear(m1.revenue, 3_000_000);
    expectNear(m1.cm1, 600_000);
    expectNear(m1.cm2, 0);
    expectNear(m1.ebitda, -225_000);
    expectNear(m1.netBurn, 225_000);
    expectNear(m1.netBurnIncludingCapex, 1_225_000);
    expectNear(m1.closingCash, 1_775_000);
  });

  it("before-funding runway = M1 ending cash ÷ 3-mo avg net burn ≈ 7.873 → 7.9", () => {
    const before = cfo.runwayBeforeFunding;
    expectNear(before.endingCash, 1_775_000);
    expectNear(before.threeMonthAvgNetBurn, 225_450.3, 0.05);
    expectNear(before.rawMonths, 7.873132127, RAW_TOL);
    assert.equal(before.displayMonths, 7.9);
    assert.equal(kpis.runwayBeforePlannedFundingMonths, 7.9);
    assert.equal(before.cashOutMonthLabel, "Mar 2027");
  });

  it("after-funding runway at Month 6 = post-funding ending cash ÷ forward 3-mo burn ≈ 20.39 → 20.4", () => {
    const m6 = months[5];
    expectNear(m6.openingCash, 870_490.99);
    expectNear(m6.ebitda, -227_259.02);
    assert.equal(m6.capex, 0);
    expectNear(m6.equityFunding, 4_000_000);
    expectNear(m6.closingCash, 4_643_231.97);

    const atFunding = computeCfoRunwayAtMonth(months, 5);
    expectNear(atFunding.endingCash, 4_643_231.97);
    expectNear(atFunding.threeMonthAvgNetBurn, 227_713.84, 0.05);
    expectNear(atFunding.rawMonths, 20.39064464, RAW_TOL);

    const after = cfo.runwayAfterFunding;
    expectNear(after.rawMonths, 20.39064464, RAW_TOL);
    assert.equal(after.displayMonths, 20.4);
    assert.equal(after.fundingMonth, 6);
    assert.equal(after.fundingDate, "Dec 2026");
    assert.equal(after.fundingAmount, 4_000_000);
    assert.equal(after.fundingType, "Equity");
    assert.equal(kpis.runwayAfterPlannedFundingMonths, 20.4);
    assert.equal(kpis.projectedRunwayMonths, 20.4);
    assert.equal(kpis.runwayMonths, 20.4);
  });

  it("funding impact ≈ 12.5175 → +12.5 months", () => {
    expectNear(cfo.fundingRunwayImpactMonths, 12.517512513, RAW_TOL);
    assert.equal(cfo.fundingRunwayImpactDisplayMonths, 12.5);
    assert.equal(kpis.fundingRunwayImpactMonths, 12.5);
  });

  it("attaches Critical to before-funding and Healthy to after-funding", () => {
    // Existing thresholds: Critical < 9, Caution < 18, else Healthy.
    assert.equal(cfo.runwayBeforeFunding.healthStatus, "Critical");
    assert.equal(cfo.runwayAfterFunding.healthStatus, "Healthy");
    assert.equal(kpis.healthStatusBeforePlannedFunding, "Critical");
    assert.equal(kpis.healthStatusAfterPlannedFunding, "Healthy");
  });

  it("does NOT use deterministic cash-series runway (26.0) as CFO hero", () => {
    assert.equal(kpis.cashSeriesRunwayMonths, 26);
    assert.notEqual(kpis.runwayMonths, 26);
    assert.notEqual(kpis.projectedRunwayMonths, 26);
    assert.notEqual(kpis.runwayAfterPlannedFundingMonths, 26);
    assert.equal(kpis.runwayAfterPlannedFundingMonths, 20.4);
  });

  it("cash-out dates stay independent of 7.9 / 20.4", () => {
    const beforeHit = findExpectedCashOutMonth(
      calculateProjection({ ...inputs, equityEvents: [], debtEvents: [] }),
    );
    assert.equal(beforeHit.monthLabel, "Mar 2027");
    assert.notEqual(Math.round(cfo.runwayBeforeFunding.rawMonths), beforeHit.monthIndex);
  });
});

describe("Scenario 1 regression — no funding hero stays 12.3", () => {
  it("Projected Runway 12.3; cash-out Aug 2027; CM1/EBITDA unchanged", () => {
    const sim = runSimulation(normalizeFormInputs(getScenario1FormInputs()));
    assert.equal(sim.ok, true);
    assert.equal(sim.kpis.plannedFunding.hasFutureFunding, false);
    assert.equal(sim.kpis.runwayMonths, 12.3);
    assert.equal(sim.kpis.projectedRunwayMonths, 12.3);
    assert.equal(sim.kpis.runwayBeforePlannedFundingMonths, null);
    assert.equal(sim.kpis.runwayAfterPlannedFundingMonths, null);
    assert.equal(sim.kpis.cashOutMonthLabel, "Aug 2027");
    expectNear(sim.months[0].cm1, 600_000);
    expectNear(sim.months[0].ebitda, -225_000);
    assert.equal(sim.months[0].capex, 0);
  });
});

function expectNear(actual, expected, tol = CURRENCY_TOL) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= tol,
    `expected ${expected}, got ${actual}`,
  );
}
