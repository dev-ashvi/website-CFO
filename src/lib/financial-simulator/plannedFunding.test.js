import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { mapExcelInputsToSimulator } from "./excelScenarioMapper.js";
import {
  summarizePlannedFunding,
  stripFutureFundingEvents,
  withFundingAwareRunway,
} from "./plannedFunding.js";
import { runSimulation } from "./index.js";
import { getScenario4FormInputs } from "./scenarioFormPresets.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "runwayExcelGoldenFixtures.json"), "utf8"),
);

function enrich(key) {
  const inputs = mapExcelInputsToSimulator(structuredClone(FIXTURES[key].inputs));
  const months = calculateProjection(inputs);
  const kpis = withFundingAwareRunway(inputs, months, calculateKpis(months));
  return { inputs, months, kpis };
}

describe("funding-aware projected runway", () => {
  it("Scenario 1 — no funding; CFO headline 12.3; cash-out Aug 2027", () => {
    const { inputs, months, kpis } = enrich("scenario1");
    assert.equal(summarizePlannedFunding(inputs).hasFutureFunding, false);
    assert.equal(kpis.runwayBeforePlannedFundingMonths, null);
    assert.equal(kpis.runwayAfterPlannedFundingMonths, null);
    assert.equal(kpis.headlineRunwayMonths, 12.3);
    assert.equal(kpis.runwayMonths, 12.3);
    assert.equal(kpis.cashOutMonthLabel, "Aug 2027");
    assert.equal(months[12].capex, 0);
  });

  it("Scenario 2 — equity funding uses CFO after-funding, not cash-series", () => {
    const s1 = enrich("scenario1");
    const s2 = enrich("scenario2");
    assert.equal(s2.kpis.plannedFunding.hasFutureFunding, true);
    assert.equal(s2.kpis.plannedFunding.equityAmount, 5_000_000);
    assert.equal(s2.kpis.plannedFunding.firstFundingMonth, 6);
    assert.equal(s2.kpis.runwayBeforePlannedFundingMonths, 12.3);
    assert.equal(s2.kpis.runwayAfterPlannedFundingMonths, 29.2);
    assert.equal(s2.kpis.projectedRunwayMonths, 29.2);
    assert.ok(s2.kpis.cashSeriesRunwayMonths > 24);
    assert.notEqual(s2.kpis.projectedRunwayMonths, s2.kpis.cashSeriesRunwayMonths);
    assert.ok(s2.kpis.fundingRunwayImpactMonths > 10);
    assert.equal(s2.months[12].capex, 0);
    assert.equal(s1.kpis.runwayMonths, 12.3);
  });

  it("Scenario 4 — CapEx + funding: before 7.9, after 20.4, not 26.0", () => {
    const inputs = normalizeFormInputs(getScenario4FormInputs());
    const months = calculateProjection(inputs);
    const kpis = withFundingAwareRunway(inputs, months, calculateKpis(months));
    assert.equal(kpis.runwayBeforePlannedFundingMonths, 7.9);
    assert.equal(kpis.runwayAfterPlannedFundingMonths, 20.4);
    assert.equal(kpis.fundingRunwayImpactMonths, 12.5);
    assert.equal(kpis.cashSeriesRunwayMonths, 26);
    assert.notEqual(kpis.runwayMonths, 26);
  });

  it("removing funding does not change P&L; CapEx stays zero for Scenario 2", () => {
    const { inputs, months } = enrich("scenario2");
    const stripped = stripFutureFundingEvents(inputs);
    const before = calculateProjection(stripped);
    for (let i = 0; i < 24; i++) {
      assert.equal(before[i].revenue, months[i].revenue);
      assert.equal(before[i].cm1, months[i].cm1);
      assert.equal(before[i].ebitda, months[i].ebitda);
      assert.equal(before[i].capex, 0);
      assert.equal(months[i].capex, 0);
    }
    assert.notEqual(before[5].closingCash, months[5].closingCash);
  });

  it("runSimulation attaches funding-aware fields", () => {
    const s1 = runSimulation(mapExcelInputsToSimulator(structuredClone(FIXTURES.scenario1.inputs)));
    const s2 = runSimulation(mapExcelInputsToSimulator(structuredClone(FIXTURES.scenario2.inputs)));
    assert.equal(s1.kpis.runwayMonths, 12.3);
    assert.equal(s1.kpis.runwayBeforePlannedFundingMonths, null);
    assert.equal(s2.kpis.runwayBeforePlannedFundingMonths, 12.3);
    assert.equal(s2.kpis.runwayAfterPlannedFundingMonths, 29.2);
    assert.ok(s2.kpis.projectedRunwayMonths > s2.kpis.runwayBeforePlannedFundingMonths);
  });
});
