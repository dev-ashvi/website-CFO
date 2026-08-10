import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { mapExcelInputsToSimulator } from "./excelScenarioMapper.js";
import { withFundingAwareRunway } from "./plannedFunding.js";

/**
 * Scenario 2 golden / diagnostic suite.
 *
 * Source of truth: approved Excel Output Model rows stored in
 * runwayExcelGoldenFixtures.json → scenario2 (extracted from workbook).
 *
 * Definition: same operating assumptions as Scenario 1, plus
 * ₹50,00,000 Equity funding inflow in Month 6. CapEx = 0 (same as Scenario 1).
 *
 * Do NOT change engine formulas based on this file unless a mismatch is proven.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "runwayExcelGoldenFixtures.json"), "utf8"),
);

const CURRENCY_TOL = 1;
const PCT_TOL = 1e-9;

function expectCurrency(actual, expected, ctx) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= CURRENCY_TOL,
    `${ctx}: expected ${expected}, got ${actual} (diff ${Number(actual) - Number(expected)})`,
  );
}

function expectPct(actual, expected, ctx) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= PCT_TOL,
    `${ctx}: expected ${expected}, got ${actual}`,
  );
}

function run(key) {
  const fixture = FIXTURES[key];
  const inputs = mapExcelInputsToSimulator(structuredClone(fixture.inputs));
  const months = calculateProjection(inputs);
  const kpis = withFundingAwareRunway(inputs, months, calculateKpis(months));
  return { fixture, inputs, months, kpis };
}

function excelRow(expected, field, i) {
  return Number(expected[field][i]);
}

/** Derive CM waterfall from Excel line items (workbook does not store CM1/CM2 rows). */
function excelWaterfall(expected, i) {
  const revenue = excelRow(expected, "Revenue (₹)", i);
  const cogs = excelRow(expected, "COGS", i);
  const otherDirect = excelRow(expected, "Other Direct Costs", i);
  const fulfillment = excelRow(expected, "Fulfillment & other variable costs", i);
  const salesMarketing = excelRow(expected, "Sales & Marketing costs", i);
  const payroll = excelRow(expected, "Salary / Payroll", i);
  const otherFixed = excelRow(expected, "Other fixed costs", i);
  const ebitda = excelRow(expected, "EBITDA", i);
  const grossProfit = revenue - cogs;
  const netProfitAfterDirectCosts = grossProfit - otherDirect;
  const cm1 = netProfitAfterDirectCosts - fulfillment;
  const cm2 = cm1 - salesMarketing;
  const totalFixedOpex = payroll + otherFixed;
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
    ebitdaMarginPercent: revenue === 0 ? 0 : ebitda / revenue,
    ebitdaFromWaterfall: cm2 - totalFixedOpex,
  };
}

describe("Scenario 2 — Raise funding ₹50L Month 6 (Excel golden diagnostic)", () => {
  const s1 = run("scenario1");
  const s2 = run("scenario2");
  const expected = s2.fixture.expected;
  const raw = s2.fixture.inputs;

  it("extracts Exact Scenario 2 inputs from approved Excel fixture", () => {
    assert.equal(raw.startingCash, 3_000_000);
    assert.equal(raw.startMonth, "Jul 2026");
    assert.equal(raw.currentVolume, 2000);
    assert.equal(raw.monthlyVolumeGrowth, 0.01);
    assert.equal(raw.aov, 1500);
    assert.equal(raw.monthlyAovGrowth, 0);
    assert.equal(raw.cogsPercent, 0.35);
    assert.equal(raw.otherDirectPercent, 0.05);
    assert.equal(raw.fulfillmentPercent, 0.4);
    assert.equal(raw.salesMarketingPercent, 0.2);
    assert.equal(raw.monthlyPayroll, 150_000);
    assert.equal(raw.payrollGrowth, 0.002);
    assert.equal(raw.otherFixed, 75_000);
    assert.equal(raw.otherFixedGrowth, 0.002);
  });

  it("confirms funding is Equity (not Debt/Other) — ₹50L in Month 6", () => {
    assert.equal(raw.equityByMonth[5], 5_000_000);
    assert.ok(raw.otherFundingByMonth.every((v) => Number(v) === 0));
    assert.deepEqual(s2.inputs.equityEvents, [{ monthIndex: 6, amount: 5_000_000 }]);
    assert.deepEqual(s2.inputs.debtEvents, []);
    assert.equal(s2.months[5].equityFunding, 5_000_000);
    assert.equal(s2.months[5].debtOrOtherFunding, 0);
  });

  it("confirms CapEx is zero in Scenario 2 (same as Scenario 1)", () => {
    assert.ok(raw.capexByMonth.every((v) => Number(v) === 0));
    assert.deepEqual(s2.inputs.capexEvents, []);
    assert.deepEqual(s1.inputs.capexEvents, []);
    expectCurrency(s2.months[12].capex, 0, "M13 CapEx");
  });

  it("Month 1 P&L / burn unchanged by funding (Excel + engine)", () => {
    const m1 = s2.months[0];
    expectCurrency(m1.revenue, 3_000_000, "Revenue");
    expectCurrency(m1.cogs, 1_050_000, "COGS");
    expectCurrency(m1.grossProfit, 1_950_000, "Gross Profit");
    expectPct(m1.grossMarginPercent, 0.65, "Gross Margin %");
    expectCurrency(m1.otherDirectCosts, 150_000, "Other Direct");
    expectCurrency(m1.netProfitAfterDirectCosts, 1_800_000, "Net Profit after direct");
    expectCurrency(m1.fulfillmentCosts, 1_200_000, "Fulfilment");
    expectCurrency(m1.cm1, 600_000, "CM1");
    expectPct(m1.cm1MarginPercent, 0.2, "CM1 %");
    expectCurrency(m1.salesAndMarketing, 600_000, "S&M");
    expectCurrency(m1.cm2, 0, "CM2");
    expectPct(m1.cm2MarginPercent, 0, "CM2 %");
    expectCurrency(m1.payroll, 150_000, "Payroll");
    expectCurrency(m1.otherFixedCosts, 75_000, "Other Fixed");
    expectCurrency(m1.ebitda, -225_000, "EBITDA");
    expectPct(m1.ebitdaMarginPercent, -0.075, "EBITDA %");
    expectCurrency(m1.grossBurn, 2_025_000, "Gross Burn");
    expectCurrency(m1.equityFunding, 0, "M1 equity must be 0");
    expectCurrency(excelRow(expected, "Ending Cash", 0), 2_775_000, "Excel M1 Ending Cash");
    expectCurrency(m1.closingCash, 2_775_000, "Engine M1 Ending Cash");
  });

  it("Month 6 funding impact — Excel vs engine + cash identity", () => {
    const m5 = s2.months[4];
    const m6 = s2.months[5];
    const i = 5;

    expectCurrency(m6.revenue, excelRow(expected, "Revenue (₹)", i), "M6 Revenue");
    expectCurrency(m6.ebitda, excelRow(expected, "EBITDA", i), "M6 EBITDA");
    expectCurrency(m6.capex, excelRow(expected, "CapEx", i), "M6 CapEx");
    expectCurrency(
      (m6.equityFunding || 0) + (m6.debtOrOtherFunding || 0),
      excelRow(expected, "Funds Inflow (Equity + Debt)", i),
      "M6 Funds Inflow",
    );
    expectCurrency(m6.equityFunding, 5_000_000, "M6 Equity");
    expectCurrency(m6.netCashFlow, excelRow(expected, "Net Cash Outflow", i), "M6 Net Cash Flow");
    expectCurrency(m6.openingCash, excelRow(expected, "Beginning Cash", i), "M6 Beginning Cash");
    expectCurrency(m6.closingCash, excelRow(expected, "Ending Cash", i), "M6 Ending Cash");

    // Engine sign convention: Ending = Beginning + EBITDA − CapEx + Funding
    const identity =
      m6.openingCash + m6.ebitda - m6.capex + (m6.equityFunding || 0) + (m6.debtOrOtherFunding || 0);
    expectCurrency(m6.closingCash, identity, "M6 cash identity");

    // Before funding impact (operating path only) equals Scenario 1 Month 6 closing
    const closingBeforeFunding = m6.openingCash + m6.ebitda - m6.capex;
    expectCurrency(closingBeforeFunding, s1.months[5].closingCash, "M6 before-funding = S1 M6 closing");
    expectCurrency(m6.closingCash - closingBeforeFunding, 5_000_000, "M6 funding lift");

    // Cumulative incremental funding through Month 6 vs Scenario 1
    expectCurrency(m5.closingCash - s1.months[4].closingCash, 0, "M5 S2−S1 cash delta (pre-funding)");
    expectCurrency(m6.closingCash - s1.months[5].closingCash, 5_000_000, "M6 S2−S1 cash delta");
  });

  it("24-month Excel Output Model parity for all fixture fields", () => {
    for (let i = 0; i < 24; i++) {
      const m = s2.months[i];
      const month = i + 1;
      expectCurrency(m.volume, excelRow(expected, "Current Volumes (Nos.)", i), `M${month} volume`);
      expectCurrency(m.averageOrderValue, excelRow(expected, "Average Order Value (₹)", i), `M${month} AOV`);
      expectCurrency(m.revenue, excelRow(expected, "Revenue (₹)", i), `M${month} revenue`);
      expectCurrency(m.cogs, excelRow(expected, "COGS", i), `M${month} COGS`);
      expectCurrency(m.otherDirectCosts, excelRow(expected, "Other Direct Costs", i), `M${month} otherDirect`);
      expectCurrency(
        m.fulfillmentCosts,
        excelRow(expected, "Fulfillment & other variable costs", i),
        `M${month} fulfilment`,
      );
      expectCurrency(
        m.salesAndMarketing,
        excelRow(expected, "Sales & Marketing costs", i),
        `M${month} S&M`,
      );
      expectCurrency(m.payroll, excelRow(expected, "Salary / Payroll", i), `M${month} payroll`);
      expectCurrency(m.otherFixedCosts, excelRow(expected, "Other fixed costs", i), `M${month} otherFixed`);
      expectCurrency(m.ebitda, excelRow(expected, "EBITDA", i), `M${month} EBITDA`);
      expectCurrency(m.capex, excelRow(expected, "CapEx", i), `M${month} CapEx`);
      expectCurrency(
        (m.equityFunding || 0) + (m.debtOrOtherFunding || 0),
        excelRow(expected, "Funds Inflow (Equity + Debt)", i),
        `M${month} funds`,
      );
      expectCurrency(m.netBurn, excelRow(expected, "Net Burn (exc. Capex)", i), `M${month} netBurn`);
      expectCurrency(m.grossBurn, excelRow(expected, "Gross Burn", i), `M${month} grossBurn`);
      expectCurrency(m.netCashFlow, excelRow(expected, "Net Cash Outflow", i), `M${month} NCF`);
      expectCurrency(m.openingCash, excelRow(expected, "Beginning Cash", i), `M${month} open`);
      expectCurrency(m.closingCash, excelRow(expected, "Ending Cash", i), `M${month} close`);
      expectCurrency(
        m.closingCashExcludingCapex,
        excelRow(expected, "Ending Cash excluding CapEx", i),
        `M${month} closeEx`,
      );

      const wf = excelWaterfall(expected, i);
      expectCurrency(m.grossProfit, wf.grossProfit, `M${month} Gross Profit`);
      expectPct(m.grossMarginPercent, wf.grossMarginPercent, `M${month} GM%`);
      expectCurrency(m.netProfitAfterDirectCosts, wf.netProfitAfterDirectCosts, `M${month} Net after direct`);
      expectCurrency(m.cm1, wf.cm1, `M${month} CM1`);
      expectPct(m.cm1MarginPercent, wf.cm1MarginPercent, `M${month} CM1%`);
      expectCurrency(m.cm2, wf.cm2, `M${month} CM2`);
      expectPct(m.cm2MarginPercent, wf.cm2MarginPercent, `M${month} CM2%`);
      expectCurrency(m.totalFixedOpex, wf.totalFixedOpex, `M${month} Fixed Opex`);
      expectCurrency(wf.ebitdaFromWaterfall, wf.ebitda, `M${month} waterfall→EBITDA identity`);
    }
  });

  it("Scenario 1 vs Scenario 2 operating invariants (funding must not touch P&L)", () => {
    for (let i = 0; i < 24; i++) {
      const a = s1.months[i];
      const b = s2.months[i];
      const month = i + 1;
      for (const key of [
        "revenue",
        "cogs",
        "otherDirectCosts",
        "fulfillmentCosts",
        "productAndTechnology",
        "salesAndMarketing",
        "payroll",
        "otherFixedCosts",
        "cm1",
        "cm2",
        "ebitda",
        "grossBurn",
        "netBurn",
        "capex",
      ]) {
        expectCurrency(b[key], a[key], `S2 vs S1 M${month} ${key}`);
      }
    }

    // Cash diverges only from Month 6 onward by cumulative equity
    for (let i = 0; i < 5; i++) {
      expectCurrency(s2.months[i].closingCash, s1.months[i].closingCash, `pre-funding M${i + 1} cash`);
    }
    for (let i = 5; i < 24; i++) {
      expectCurrency(
        s2.months[i].closingCash - s1.months[i].closingCash,
        5_000_000,
        `post-funding M${i + 1} cash lift`,
      );
      expectCurrency(
        s2.months[i].closingCashExcludingCapex - s1.months[i].closingCashExcludingCapex,
        5_000_000,
        `post-funding M${i + 1} excl-CapEx cash lift`,
      );
    }
  });

  it("Scenario 2 runway / cash-out outputs", () => {
    // Headline Excel runway uses Month 1 ending cash ÷ 3-mo avg net burn — funding does not change M1.
    assert.equal(s2.kpis.headlineRunwayMonths, 12.3);
    assert.equal(s1.kpis.headlineRunwayMonths, 12.3);
    // No-funding projected runway = CFO headline; with funding, after-funding CFO at Month 6.
    assert.equal(s1.kpis.projectedRunwayMonths, 12.3);
    assert.equal(s2.kpis.runwayBeforePlannedFundingMonths, 12.3);
    assert.equal(s2.kpis.runwayAfterPlannedFundingMonths, 29.2);
    assert.equal(s2.kpis.projectedRunwayMonths, 29.2);
    assert.ok(s2.kpis.cashSeriesRunwayMonths > 24);
    assert.notEqual(s2.kpis.projectedRunwayMonths, s2.kpis.cashSeriesRunwayMonths);
    // With ₹50L equity, closing cash stays positive through Month 24.
    assert.equal(s2.kpis.cashOutMonthIndex, null);
    assert.equal(s2.kpis.cashOutMonthLabel, "Beyond 24-month horizon");
    assert.ok(s2.months.every((m) => m.closingCash >= 0));
    // Scenario 1 cash-outs in Month 14 (Aug 2027) — independent of 12.3 headline.
    assert.equal(s1.kpis.cashOutMonthIndex, 14);
    assert.equal(s1.kpis.cashOutMonthLabel, "Aug 2027");
  });
});

describe("Scenario 1 regression gate (must remain approved)", () => {
  it("Month 1 CM / burn / cash checkpoints still pass", () => {
    const { months, kpis } = run("scenario1");
    const m1 = months[0];
    expectCurrency(m1.revenue, 3_000_000, "S1 Revenue");
    expectCurrency(m1.grossProfit, 1_950_000, "S1 Gross Profit");
    expectPct(m1.grossMarginPercent, 0.65, "S1 GM%");
    expectCurrency(m1.cm1, 600_000, "S1 CM1");
    expectPct(m1.cm1MarginPercent, 0.2, "S1 CM1%");
    expectCurrency(m1.cm2, 0, "S1 CM2");
    expectCurrency(m1.ebitda, -225_000, "S1 EBITDA");
    expectCurrency(m1.grossBurn, 2_025_000, "S1 Gross Burn");
    expectCurrency(m1.capex, 0, "S1 CapEx");
    expectCurrency(months[11].closingCash, 270_101.11, "S1 M12 cash");
    expectCurrency(months[12].closingCash, 39_641.31, "S1 M13 cash");
    expectCurrency(months[13].closingCash, -191_279.41, "S1 M14 cash");
    assert.equal(kpis.headlineRunwayMonths, 12.3);
    assert.equal(kpis.projectedRunwayMonths, 12.3);
    assert.equal(kpis.cashOutMonthIndex, 14);
  });
});
