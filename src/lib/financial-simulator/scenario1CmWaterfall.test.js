import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { mapExcelInputsToSimulator } from "./excelScenarioMapper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "runwayExcelGoldenFixtures.json"), "utf8"),
);

const CURRENCY_TOL = 1;
const PCT_TOL = 1e-9;

function expectCurrency(actual, expected, ctx) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= CURRENCY_TOL,
    `${ctx}: expected ${expected}, got ${actual}`,
  );
}

function expectPct(actual, expected, ctx) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= PCT_TOL,
    `${ctx}: expected ${expected}, got ${actual}`,
  );
}

/**
 * Derive Excel CM1/CM2 waterfall from approved Output Model line items
 * (fixtures do not store CM1/CM2 rows; formulas match inspected workbook).
 */
function excelWaterfallFromExpected(expected, i) {
  const revenue = Number(expected["Revenue (₹)"][i]);
  const cogs = Number(expected.COGS[i]);
  const otherDirect = Number(expected["Other Direct Costs"][i]);
  const fulfillment = Number(expected["Fulfillment & other variable costs"][i]);
  const salesMarketing = Number(expected["Sales & Marketing costs"][i]);
  const payroll = Number(expected["Salary / Payroll"][i]);
  const otherFixed = Number(expected["Other fixed costs"][i]);
  const ebitda = Number(expected.EBITDA[i]);

  const grossProfit = revenue - cogs;
  const netProfitAfterDirectCosts = grossProfit - otherDirect;
  const cm1 = netProfitAfterDirectCosts - fulfillment;
  const cm2 = cm1 - salesMarketing;
  const totalFixedOpex = payroll + otherFixed;
  const ebitdaFromWaterfall = cm2 - totalFixedOpex;

  return {
    revenue,
    cogs,
    grossProfit,
    grossMarginPercent: revenue === 0 ? 0 : grossProfit / revenue,
    otherDirect,
    netProfitAfterDirectCosts,
    fulfillment,
    cm1,
    cm1MarginPercent: revenue === 0 ? 0 : cm1 / revenue,
    salesMarketing,
    cm2,
    cm2MarginPercent: revenue === 0 ? 0 : cm2 / revenue,
    payroll,
    otherFixed,
    totalFixedOpex,
    ebitda,
    ebitdaFromWaterfall,
    ebitdaMarginPercent: revenue === 0 ? 0 : ebitda / revenue,
  };
}

describe("Scenario 1 CM1 / CM2 waterfall — Excel parity", () => {
  const fixture = FIXTURES.scenario1;
  const inputs = mapExcelInputsToSimulator(structuredClone(fixture.inputs));
  const months = calculateProjection(inputs);
  const kpis = calculateKpis(months);
  const expected = fixture.expected;

  it("Month 1 explicit workbook checkpoints", () => {
    const m1 = months[0];
    expectCurrency(m1.revenue, 3_000_000, "Revenue");
    expectCurrency(m1.cogs, 1_050_000, "COGS");
    expectCurrency(m1.grossProfit, 1_950_000, "Gross Profit");
    expectPct(m1.grossMarginPercent, 0.65, "Gross Margin %");
    expectCurrency(m1.otherDirectCosts, 150_000, "Other Direct");
    expectCurrency(m1.netProfitAfterDirectCosts, 1_800_000, "Net Profit after direct");
    expectCurrency(m1.fulfillmentCosts, 1_200_000, "Fulfilment");
    expectCurrency(m1.productAndTechnology, 1_200_000, "productAndTechnology = Fulfilment");
    expectCurrency(m1.cm1, 600_000, "CM1");
    expectPct(m1.cm1MarginPercent, 0.2, "CM1 %");
    expectCurrency(m1.salesAndMarketing, 600_000, "S&M");
    expectCurrency(m1.cm2, 0, "CM2");
    expectPct(m1.cm2MarginPercent, 0, "CM2 %");
    expectCurrency(m1.totalFixedOpex, 225_000, "Total Fixed Opex");
    expectCurrency(m1.ebitda, -225_000, "EBITDA");
    expectPct(m1.ebitdaMarginPercent, -0.075, "EBITDA %");
  });

  it("proves Sales & Marketing is subtracted AFTER CM1 (not inside CM1)", () => {
    const m1 = months[0];
    const wrongLegacyCm1 = m1.netProfitAfterDirectCosts - m1.salesAndMarketing;
    assert.equal(wrongLegacyCm1, 1_200_000);
    assert.notEqual(m1.cm1, wrongLegacyCm1);
    assert.equal(m1.cm1, m1.netProfitAfterDirectCosts - m1.fulfillmentCosts);
    assert.equal(m1.cm2, m1.cm1 - m1.salesAndMarketing);
  });

  it("Financial Performance KPI CM1 is ₹6L / 20%, not legacy ₹12L / 40%", () => {
    assert.equal(kpis.financialPerformance.cm1, 600_000);
    assert.equal(kpis.financialPerformance.cm1MarginPercent, 0.2);
    assert.equal(kpis.financialPerformance.ebitda, -225_000);
  });

  it("CM1/CM2/EBITDA waterfall matches Excel line items for all 24 months", () => {
    for (let i = 0; i < 24; i++) {
      const m = months[i];
      const excel = excelWaterfallFromExpected(expected, i);
      const month = i + 1;

      expectCurrency(m.grossProfit, excel.grossProfit, `M${month} Gross Profit`);
      expectPct(m.grossMarginPercent, excel.grossMarginPercent, `M${month} Gross Margin %`);
      expectCurrency(m.netProfitAfterDirectCosts, excel.netProfitAfterDirectCosts, `M${month} Net Profit`);
      expectCurrency(m.fulfillmentCosts, excel.fulfillment, `M${month} Fulfilment`);
      expectCurrency(m.cm1, excel.cm1, `M${month} CM1`);
      expectPct(m.cm1MarginPercent, excel.cm1MarginPercent, `M${month} CM1 %`);
      expectCurrency(m.salesAndMarketing, excel.salesMarketing, `M${month} S&M`);
      expectCurrency(m.cm2, excel.cm2, `M${month} CM2`);
      expectPct(m.cm2MarginPercent, excel.cm2MarginPercent, `M${month} CM2 %`);
      expectCurrency(m.totalFixedOpex, excel.totalFixedOpex, `M${month} Fixed Opex`);
      expectCurrency(m.ebitda, excel.ebitda, `M${month} EBITDA`);
      expectCurrency(excel.ebitdaFromWaterfall, excel.ebitda, `M${month} Excel waterfall identity`);
      expectPct(m.ebitdaMarginPercent, excel.ebitdaMarginPercent, `M${month} EBITDA %`);
    }
  });

  it("fixing CM1 classification does not change cash / burn / runway", () => {
    const m1 = months[0];
    expectCurrency(m1.ebitda, -225_000, "EBITDA unchanged");
    expectCurrency(m1.netBurn, 225_000, "Net burn unchanged");
    expectCurrency(m1.grossBurn, 2_025_000, "Gross burn unchanged");
    expectCurrency(months[11].closingCash, 270_101.11, "M12 closing cash");
    expectCurrency(months[12].closingCash, 39_641.31, "M13 closing cash");
    expectCurrency(months[13].closingCash, -191_279.41, "M14 closing cash");
    assert.equal(kpis.headlineRunwayMonths, 12.3);
    assert.equal(kpis.projectedRunwayMonths, 12.3);
    assert.equal(kpis.cashOutMonthIndex, 14);
    assert.equal(kpis.cashOutMonthLabel, "Aug 2027");
  });
});
