import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateProjection } from "./calculateProjection.js";
import {
  calculateKpis,
  computeCfoHeadlineRunwayMonths,
  findExpectedCashOutMonth,
} from "./calculateKpis.js";
import { mapExcelInputsToSimulator } from "./excelScenarioMapper.js";
import { withFundingAwareRunway } from "./plannedFunding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "runwayExcelGoldenFixtures.json"), "utf8"),
);

const CURRENCY_TOL = 1;

describe("Scenario 1 — CFO headline runway vs independent cash-out", () => {
  const inputs = mapExcelInputsToSimulator(structuredClone(FIXTURES.scenario1.inputs));
  const months = calculateProjection(inputs);
  const baseKpis = calculateKpis(months);
  const kpis = withFundingAwareRunway(inputs, months, baseKpis);

  it("approved Scenario 1 has zero CapEx and zero funding", () => {
    assert.ok(FIXTURES.scenario1.inputs.capexByMonth.every((v) => Number(v) === 0));
    assert.ok(FIXTURES.scenario1.inputs.equityByMonth.every((v) => Number(v) === 0));
    assert.deepEqual(inputs.capexEvents, []);
    assert.deepEqual(inputs.equityEvents, []);
    assert.equal(months.every((m) => m.capex === 0), true);
    assert.equal(kpis.plannedFunding.hasFutureFunding, false);
  });

  it("headline runway uses Month 1 ending cash ÷ 3-month avg net burn ≈ 12.3", () => {
    const m1 = months[0];
    const burn3 =
      (months[0].netBurn + months[1].netBurn + months[2].netBurn) / 3;
    expectNear(m1.closingCash, 2_775_000);
    expectNear(burn3, 225_450.3);
    const raw = computeCfoHeadlineRunwayMonths(months);
    expectNear(raw, 12.30869952, 0.0001);
    assert.equal(kpis.headlineRunwayMonths, 12.3);
    assert.equal(kpis.runwayMonths, 12.3);
    assert.equal(kpis.projectedRunwayMonths, 12.3);
    assert.equal(kpis.runwayBeforePlannedFundingMonths, null);
  });

  it("expected cash-out is Aug 2027 (Month 14), independent of 12.3 headline", () => {
    const hit = findExpectedCashOutMonth(months);
    assert.ok(hit);
    assert.equal(hit.monthIndex, 14);
    assert.equal(hit.monthLabel, "Aug 2027");
    assert.equal(kpis.cashOutMonthIndex, 14);
    assert.equal(kpis.cashOutMonthLabel, "Aug 2027");

    expectNear(months[12].closingCash, 39_641.31); // Jul 2027 still positive
    assert.ok(months[12].closingCash > 0);
    expectNear(months[13].closingCash, -191_279.41); // Aug 2027 negative
    assert.ok(months[13].closingCash < 0);
  });

  it("headline runway and cash-out use separate helpers (not derived from each other)", () => {
    const headline = computeCfoHeadlineRunwayMonths(months);
    const cashOut = findExpectedCashOutMonth(months);
    assert.ok(typeof headline === "number");
    assert.ok(cashOut && cashOut.monthIndex === 14);
    // 12.3 months from Jul 2026 is not Aug 2027 — metrics must stay independent.
    assert.notEqual(Math.round(headline), cashOut.monthIndex);
  });

  it("Month 1 net burn excl/incl CapEx are identical when CapEx is zero", () => {
    const m1 = months[0];
    expectNear(m1.netBurn, 225_000);
    expectNear(m1.netBurnIncludingCapex, 225_000);
    assert.equal(m1.capex, 0);
  });
});

function expectNear(actual, expected, tol = CURRENCY_TOL) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= tol,
    `expected ${expected}, got ${actual}`,
  );
}
