import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { calculateProjection, monthLabelFromStart } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { mapExcelInputsToSimulator } from "./excelScenarioMapper.js";
import {
  buildClosingCashChartSeries,
  buildRevenueVsExpensesChartSeries,
  closingCashCapexGap,
  findFirstNegativeCashMonth,
  getChartTotalExpenses,
} from "./chartSeries.js";
import { buildClosingCashCaption } from "./capexCashInsight.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "runwayExcelGoldenFixtures.json"), "utf8"),
);
const CURRENCY_TOL = 1;

function expectCurrency(actual, expected, ctx) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= CURRENCY_TOL,
    `${ctx}: expected ${expected}, got ${actual}`,
  );
}

describe("Scenario 1 chart series — Excel parity (no CapEx)", () => {
  const fixture = FIXTURES.scenario1;
  const inputs = mapExcelInputsToSimulator(structuredClone(fixture.inputs));
  const months = calculateProjection(inputs);
  const kpis = calculateKpis(months);
  const expected = fixture.expected;

  it("Scenario 1 CapEx is zero for all months", () => {
    assert.deepEqual(inputs.capexEvents, []);
    assert.ok(months.every((m) => m.capex === 0));
    assert.ok(expected.CapEx.every((v) => Number(v) === 0));
  });

  it("forecast month labels map 1:1 to calendar months", () => {
    assert.equal(monthLabelFromStart("2026-07", 1), "Jul 2026");
    assert.equal(monthLabelFromStart("2026-07", 12), "Jun 2027");
    assert.equal(monthLabelFromStart("2026-07", 13), "Jul 2027");
    assert.equal(monthLabelFromStart("2026-07", 14), "Aug 2027");
    assert.equal(monthLabelFromStart("2026-07", 24), "Jun 2028");
  });

  it("Closing Cash matches Excel Ending Cash for all 24 months", () => {
    const series = buildClosingCashChartSeries(months);
    assert.equal(series.length, 24);
    for (let i = 0; i < 24; i++) {
      expectCurrency(series[i].includingCapex, expected["Ending Cash"][i], `Month ${i + 1} incl`);
      expectCurrency(months[i].closingCash, expected["Ending Cash"][i], `Month ${i + 1} engine`);
      expectCurrency(
        months[i].closingCashExcludingCapex,
        expected["Ending Cash excluding CapEx"][i],
        `Month ${i + 1} excl`,
      );
      expectCurrency(closingCashCapexGap(months[i]), 0, `Month ${i + 1} CapEx gap`);
    }
  });

  it("Month 13 stays positive; Month 14 is first negative (Aug 2027)", () => {
    const m13 = months[12];
    const m14 = months[13];
    expectCurrency(m13.closingCash, 39_641.31, "M13 incl");
    expectCurrency(m14.closingCash, -191_279.41, "M14 incl");
    assert.ok(m13.closingCash > 0);
    assert.ok(m14.closingCash < 0);
  });

  it("cash-out is August 2027 (Month 14)", () => {
    const hit = findFirstNegativeCashMonth(months, { includingCapex: true });
    assert.ok(hit);
    assert.equal(hit.monthIndex, 14);
    assert.equal(hit.monthLabel, "Aug 2027");
    assert.equal(kpis.cashOutMonthIndex, 14);
    assert.equal(kpis.cashOutMonthLabel, "Aug 2027");
  });

  it("Revenue / total expenses chart series match Excel checkpoints", () => {
    const revSeries = buildRevenueVsExpensesChartSeries(months);
    for (let i = 0; i < 24; i++) {
      expectCurrency(revSeries[i].revenue, expected["Revenue (₹)"][i], `Month ${i + 1} revenue`);
      expectCurrency(revSeries[i].expenses, getChartTotalExpenses(months[i]), `Month ${i + 1} expenses`);
    }
  });

  it("closing cash caption reflects identical incl/excl CapEx series when CapEx is zero", () => {
    const caption = buildClosingCashCaption(kpis.capexComparison);
    assert.match(caption, /Aug 2027/i);
  });
});
