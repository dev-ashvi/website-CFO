import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "__fixtures__", "runwayExcelGoldenFixtures.json");
const FIXTURES = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

const CURRENCY_TOL = 1; // ₹1 — floating-point only
const PCT_TOL = 0.000001;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

deepFreeze(FIXTURES);

/**
 * Map approved Excel golden inputs → simulator schema.
 * Fulfilment maps to productAndTechnology (website % of revenue category).
 * Do not use displayedMonthlyRevenueGrowth — revenue is Volume × AOV (detailed mode).
 */
export function mapExcelInputsToSimulator(excelInputs) {
  const capexEvents = [];
  const equityEvents = [];
  const debtEvents = [];
  (excelInputs.capexByMonth || []).forEach((amount, i) => {
    if (Number(amount) > 0) capexEvents.push({ monthIndex: i + 1, amount: Number(amount) });
  });
  (excelInputs.equityByMonth || []).forEach((amount, i) => {
    if (Number(amount) > 0) equityEvents.push({ monthIndex: i + 1, amount: Number(amount) });
  });
  (excelInputs.otherFundingByMonth || []).forEach((amount, i) => {
    if (Number(amount) > 0) debtEvents.push({ monthIndex: i + 1, amount: Number(amount) });
  });

  /** @type {import('./types.js').SimulatorInputs} */
  const inputs = {
    companyName: "Golden Excel",
    email: "golden@example.com",
    phone: "+91 9876543210",
    industry: "Other",
    businessModel: "Other",
    startupStage: "Growth",
    mainPriority: "",
    currency: "INR",
    currentCashBalance: Number(excelInputs.startingCash),
    forecastStartMonth: "2026-07",
    revenueMode: "detailed",
    currentMonthlyRevenue: Number(excelInputs.displayedMonthlyRevenue) || 0,
    monthlyRevenueGrowth: 0, // unused in detailed mode; do not use displayed 5%
    currentVolume: Number(excelInputs.currentVolume),
    monthlyVolumeGrowth: Number(excelInputs.monthlyVolumeGrowth),
    averageOrderValue: Number(excelInputs.aov),
    monthlyAovGrowth: Number(excelInputs.monthlyAovGrowth),
    cogsPercent: Number(excelInputs.cogsPercent),
    otherDirectCostsPercent: Number(excelInputs.otherDirectPercent),
    salesMarketingPercent: Number(excelInputs.salesMarketingPercent),
    productTechPercent: Number(excelInputs.fulfillmentPercent),
    monthlyPayroll: Number(excelInputs.monthlyPayroll),
    payrollGrowth: Number(excelInputs.payrollGrowth),
    otherFixedCosts: Number(excelInputs.otherFixed),
    otherFixedGrowth: Number(excelInputs.otherFixedGrowth),
    capexEvents,
    equityEvents,
    debtEvents,
  };

  if (excelInputs.fulfillmentChangeMonth && excelInputs.fulfillmentChangedPercent != null) {
    const match = String(excelInputs.fulfillmentChangeMonth).match(/(\d+)/);
    const fromMonth = match ? Number(match[1]) : 0;
    if (fromMonth >= 1) {
      inputs.productTechPercentChangeFromMonth = fromMonth;
      inputs.productTechPercentAfterChange = Number(excelInputs.fulfillmentChangedPercent);
    }
  }

  return inputs;
}

function expectCurrency(actual, expected, context) {
  const a = Number(actual);
  const e = Number(expected);
  const diff = a - e;
  assert.ok(
    Math.abs(diff) <= CURRENCY_TOL,
    `${context.scenario} mismatch:\nMonth: ${context.month}\nField: ${context.field}\nExcel: ${e}\nEngine: ${a}\nDifference: ${diff}`,
  );
}

function expectExact(actual, expected, context) {
  assert.equal(
    actual,
    expected,
    `${context.scenario} mismatch:\nMonth: ${context.month}\nField: ${context.field}\nExcel: ${expected}\nEngine: ${actual}\nDifference: n/a`,
  );
}

/**
 * Explicit Excel-row → engine value mapping for month-level comparison.
 * Aggregates that Excel labels differently are reconstructed from Excel line items
 * where the website definition includes Fulfilment.
 */
function engineValueForExcelField(month, excelField) {
  switch (excelField) {
    case "Current Volumes (Nos.)":
      return month.volume;
    case "Average Order Value (₹)":
      return month.averageOrderValue;
    case "Revenue (₹)":
      return month.revenue;
    case "COGS":
      return month.cogs;
    case "Other Direct Costs":
      return month.otherDirectCosts;
    case "Fulfillment & other variable costs":
      return month.productAndTechnology;
    case "Sales & Marketing costs":
      return month.salesAndMarketing;
    case "Salary / Payroll":
      return month.payroll;
    case "Other fixed costs":
      return month.otherFixedCosts;
    case "Variable costs":
      // Website total variable includes Fulfilment; Excel's "Variable costs" row excludes it.
      // Compare website definition to Excel line-item sum.
      return month.totalVariableExpenses;
    case "Fixed costs":
      return month.totalFixedExpenses;
    case "Gross Burn":
      return month.grossBurn;
    case "EBITDA":
      return month.ebitda;
    case "CapEx":
      return month.capex;
    case "Funds Inflow (Equity + Debt)":
      return (month.equityFunding || 0) + (month.debtOrOtherFunding || 0);
    case "Net Cash Outflow":
      return month.netCashFlow;
    case "Beginning Cash":
      return month.openingCash;
    case "Ending Cash":
      return month.closingCash;
    case "Net Burn (exc. Capex)":
      return month.netBurn;
    case "Ending Cash excluding CapEx":
      return month.closingCashExcludingCapex;
    default:
      return undefined;
  }
}

function excelComparableExpected(expected, monthIndex0, excelField) {
  const row = expected[excelField];
  if (!row) return undefined;
  const raw = row[monthIndex0];

  // Rebuild Excel aggregates to website definitions (include Fulfilment).
  if (excelField === "Variable costs") {
    return (
      expected["COGS"][monthIndex0] +
      expected["Other Direct Costs"][monthIndex0] +
      expected["Fulfillment & other variable costs"][monthIndex0] +
      expected["Sales & Marketing costs"][monthIndex0]
    );
  }
  if (excelField === "Gross Burn") {
    return (
      expected["COGS"][monthIndex0] +
      expected["Other Direct Costs"][monthIndex0] +
      expected["Fulfillment & other variable costs"][monthIndex0] +
      expected["Sales & Marketing costs"][monthIndex0] +
      expected["Salary / Payroll"][monthIndex0] +
      expected["Other fixed costs"][monthIndex0]
    );
  }
  return raw;
}

const COMPARE_FIELDS = [
  "Current Volumes (Nos.)",
  "Average Order Value (₹)",
  "Revenue (₹)",
  "COGS",
  "Other Direct Costs",
  "Fulfillment & other variable costs",
  "Sales & Marketing costs",
  "Salary / Payroll",
  "Other fixed costs",
  "Variable costs",
  "Fixed costs",
  "Gross Burn",
  "EBITDA",
  "CapEx",
  "Funds Inflow (Equity + Debt)",
  "Net Cash Outflow",
  "Beginning Cash",
  "Ending Cash",
  "Net Burn (exc. Capex)",
  "Ending Cash excluding CapEx",
];

function compareAllMonths(scenarioName, excelExpected, months) {
  assert.equal(months.length, 24, `${scenarioName}: expected 24 months`);
  for (let i = 0; i < 24; i++) {
    const month = months[i];
    const ctxBase = { scenario: scenarioName, month: i + 1 };
    expectExact(month.monthIndex, i + 1, { ...ctxBase, field: "monthIndex" });

    for (const field of COMPARE_FIELDS) {
      const expected = excelComparableExpected(excelExpected, i, field);
      if (expected === undefined) continue;
      const actual = engineValueForExcelField(month, field);
      const ctx = { ...ctxBase, field };
      if (field === "Current Volumes (Nos.)") {
        expectExact(actual, expected, ctx);
      } else {
        expectCurrency(actual, expected, ctx);
      }
    }

    expectCurrency(
      month.closingCashExcludingCapex - month.closingCash,
      month.cumulativeCapex,
      { ...ctxBase, field: "closingCashExcludingCapex - closingCashIncludingCapex (= cumulativeCapEx)" },
    );
    expectExact(month.closingCashIncludingCapex, month.closingCash, {
      ...ctxBase,
      field: "closingCashIncludingCapex alias",
    });
  }
}

function runScenario(key) {
  const fixture = FIXTURES[key];
  assert.ok(fixture, `Missing fixture ${key}`);
  const inputs = mapExcelInputsToSimulator(structuredClone(fixture.inputs));
  const months = calculateProjection(inputs);
  return { fixture, inputs, months, kpis: calculateKpis(months) };
}

describe("Excel golden-master scenarios", () => {
  describe("Scenario 1 — base case with CapEx", () => {
    it("matches Excel month-by-month for all compared fields", () => {
      const { fixture, months } = runScenario("scenario1");
      compareAllMonths("Scenario 1", fixture.expected, months);
    });

    it("hits explicit Month 1 / 12 / 13 / 24 checkpoints", () => {
      const { months } = runScenario("scenario1");
      const m1 = months[0];
      const m12 = months[11];
      const m13 = months[12];
      const m24 = months[23];

      expectCurrency(m1.revenue, 3_000_000, { scenario: "Scenario 1", month: 1, field: "revenue" });
      expectCurrency(m1.totalVariableExpenses, 1_800_000 + 1_200_000, {
        scenario: "Scenario 1",
        month: 1,
        field: "totalVariableExpenses (incl. fulfilment)",
      });
      expectCurrency(m1.totalFixedExpenses, 225_000, { scenario: "Scenario 1", month: 1, field: "totalFixedExpenses" });
      expectCurrency(m1.ebitda, -225_000, { scenario: "Scenario 1", month: 1, field: "ebitda" });
      expectCurrency(m1.closingCash, 2_775_000, { scenario: "Scenario 1", month: 1, field: "closingCash" });

      expectCurrency(m12.revenue, 3_346_500, { scenario: "Scenario 1", month: 12, field: "revenue" });
      expectCurrency(m12.ebitda, -229_999.7982, { scenario: "Scenario 1", month: 12, field: "ebitda" });
      expectCurrency(m12.closingCash, 270_101.1061, { scenario: "Scenario 1", month: 12, field: "closingCash" });

      expectCurrency(m13.capex, 300_000, { scenario: "Scenario 1", month: 13, field: "capex" });
      expectCurrency(m13.ebitda, -230_459.7978, { scenario: "Scenario 1", month: 13, field: "ebitda" });
      expectCurrency(m13.closingCash, -260_358.6916, { scenario: "Scenario 1", month: 13, field: "closingCash" });
      expectCurrency(m13.closingCashExcludingCapex, 39_641.3084, {
        scenario: "Scenario 1",
        month: 13,
        field: "closingCashExcludingCapex",
      });

      expectCurrency(m24.closingCash, -2_826_040.881, { scenario: "Scenario 1", month: 24, field: "closingCash" });
      expectCurrency(m24.closingCashExcludingCapex, -2_526_040.881, {
        scenario: "Scenario 1",
        month: 24,
        field: "closingCashExcludingCapex",
      });
    });

    it("reports CapEx-driven cash-out comparison KPIs from including-CapEx series", () => {
      const { kpis, months } = runScenario("scenario1");
      assert.equal(kpis.cashOutMonthIndex, months.find((m) => m.cashOut)?.monthIndex);
      assert.equal(kpis.capexComparison.cashOutMonthIncludingCapex, kpis.cashOutMonthIndex);
      assert.ok(kpis.capexComparison.cumulativeCapex >= 300_000 - CURRENCY_TOL);
      expectCurrency(kpis.sixMonthClosingCash, months[5].closingCash, {
        scenario: "Scenario 1",
        month: 6,
        field: "sixMonthClosingCash",
      });
      expectCurrency(kpis.twelveMonthClosingCash, months[11].closingCash, {
        scenario: "Scenario 1",
        month: 12,
        field: "twelveMonthClosingCash",
      });
    });
  });

  describe("Scenario 2 — equity funding", () => {
    it("matches Excel month-by-month", () => {
      const { fixture, months } = runScenario("scenario2");
      compareAllMonths("Scenario 2", fixture.expected, months);
    });

    it("hits funding checkpoints and preserves Scenario 1 operating results", () => {
      const s1 = runScenario("scenario1");
      const s1InputsSnapshot = JSON.stringify(s1.inputs);
      const s2 = runScenario("scenario2");

      // Scenario 1 inputs must not be mutated by Scenario 2 work.
      assert.equal(JSON.stringify(s1.inputs), s1InputsSnapshot);

      const m5 = s2.months[4];
      const m6 = s2.months[5];
      const m13 = s2.months[12];
      const m24 = s2.months[23];

      expectCurrency((m5.equityFunding || 0) + (m5.debtOrOtherFunding || 0), 0, {
        scenario: "Scenario 2",
        month: 5,
        field: "funding",
      });
      expectCurrency(m5.closingCash, 1_870_490.991, { scenario: "Scenario 2", month: 5, field: "closingCash" });

      expectCurrency((m6.equityFunding || 0) + (m6.debtOrOtherFunding || 0), 5_000_000, {
        scenario: "Scenario 2",
        month: 6,
        field: "funding",
      });
      expectCurrency(m6.closingCash, 6_643_231.973, { scenario: "Scenario 2", month: 6, field: "closingCash" });

      expectCurrency(m13.closingCash, 4_739_641.308, { scenario: "Scenario 2", month: 13, field: "closingCash" });
      expectCurrency(m13.closingCashExcludingCapex, 5_039_641.308, {
        scenario: "Scenario 2",
        month: 13,
        field: "closingCashExcludingCapex",
      });

      expectCurrency(m24.closingCash, 2_173_959.119, { scenario: "Scenario 2", month: 24, field: "closingCash" });
      expectCurrency(m24.closingCashExcludingCapex, 2_473_959.119, {
        scenario: "Scenario 2",
        month: 24,
        field: "closingCashExcludingCapex",
      });

      for (let i = 0; i < 24; i++) {
        const a = s1.months[i];
        const b = s2.months[i];
        expectCurrency(b.revenue, a.revenue, { scenario: "Scenario 2 vs 1", month: i + 1, field: "revenue" });
        expectCurrency(b.totalOperatingExpenses, a.totalOperatingExpenses, {
          scenario: "Scenario 2 vs 1",
          month: i + 1,
          field: "totalOperatingExpenses",
        });
        expectCurrency(b.ebitda, a.ebitda, { scenario: "Scenario 2 vs 1", month: i + 1, field: "ebitda" });
      }

      // Funding increases both cash series by the same cumulative equity.
      const fundingTotal = 5_000_000;
      expectCurrency(s2.months[23].closingCash - s1.months[23].closingCash, fundingTotal, {
        scenario: "Scenario 2",
        month: 24,
        field: "including-CapEx cash lift from funding",
      });
      expectCurrency(
        s2.months[23].closingCashExcludingCapex - s1.months[23].closingCashExcludingCapex,
        fundingTotal,
        {
          scenario: "Scenario 2",
          month: 24,
          field: "excluding-CapEx cash lift from funding",
        },
      );
    });
  });

  describe("Scenario 3 — variable-cost improvement", () => {
    it("matches Excel month-by-month", () => {
      const { fixture, months } = runScenario("scenario3");
      compareAllMonths("Scenario 3", fixture.expected, months);
    });

    it("applies fulfilment improvement from Month 7 and preserves revenue/fixed vs Scenario 1", () => {
      const s1 = runScenario("scenario1");
      const s3 = runScenario("scenario3");

      const m6 = s3.months[5];
      const m7 = s3.months[6];
      const m12 = s3.months[11];
      const m13 = s3.months[12];
      const m24 = s3.months[23];

      expectCurrency(m6.productAndTechnology, 1_261_200, {
        scenario: "Scenario 3",
        month: 6,
        field: "fulfillmentCosts",
      });
      assert.ok(Math.abs(m6.productAndTechnology / m6.revenue - 0.4) <= PCT_TOL);

      expectCurrency(m7.revenue, 3_184_500, { scenario: "Scenario 3", month: 7, field: "revenue" });
      expectCurrency(m7.productAndTechnology, 1_114_575, {
        scenario: "Scenario 3",
        month: 7,
        field: "fulfillmentCosts",
      });
      assert.ok(Math.abs(m7.productAndTechnology / m7.revenue - 0.35) <= PCT_TOL);
      // Excel sheet row "Variable costs" = COGS + S&M only (1,751,475) — excludes Other Direct + Fulfilment.
      // Website totalVariableExpenses includes all four % of-revenue categories.
      expectCurrency(m7.cogs + m7.salesAndMarketing, 1_751_475, {
        scenario: "Scenario 3",
        month: 7,
        field: "Excel Variable costs (COGS + S&M)",
      });
      expectCurrency(m7.totalVariableExpenses, 3_025_275, {
        scenario: "Scenario 3",
        month: 7,
        field: "totalVariableExpenses (website definition)",
      });
      expectCurrency(m7.ebitda, -68_488.53605, { scenario: "Scenario 3", month: 7, field: "ebitda" });

      expectCurrency(m12.ebitda, -62_674.79819, { scenario: "Scenario 3", month: 12, field: "ebitda" });
      expectCurrency(m12.closingCash, 1_249_526.106, { scenario: "Scenario 3", month: 12, field: "closingCash" });

      expectCurrency(m13.capex, 300_000, { scenario: "Scenario 3", month: 13, field: "capex" });
      expectCurrency(m13.closingCash, 888_041.3084, { scenario: "Scenario 3", month: 13, field: "closingCash" });
      expectCurrency(m13.closingCashExcludingCapex, 1_188_041.3084, {
        scenario: "Scenario 3",
        month: 13,
        field: "closingCashExcludingCapex",
      });

      expectCurrency(m24.ebitda, -47_030.91992, { scenario: "Scenario 3", month: 24, field: "ebitda" });
      expectCurrency(m24.closingCash, 296_734.1192, { scenario: "Scenario 3", month: 24, field: "closingCash" });
      expectCurrency(m24.closingCashExcludingCapex, 596_734.1192, {
        scenario: "Scenario 3",
        month: 24,
        field: "closingCashExcludingCapex",
      });

      for (let i = 0; i < 6; i++) {
        const a = s1.months[i];
        const b = s3.months[i];
        expectCurrency(b.ebitda, a.ebitda, { scenario: "Scenario 3 vs 1 (M1–6)", month: i + 1, field: "ebitda" });
        expectCurrency(b.productAndTechnology, a.productAndTechnology, {
          scenario: "Scenario 3 vs 1 (M1–6)",
          month: i + 1,
          field: "fulfillment",
        });
      }

      for (let i = 0; i < 24; i++) {
        const a = s1.months[i];
        const b = s3.months[i];
        expectCurrency(b.revenue, a.revenue, { scenario: "Scenario 3 vs 1", month: i + 1, field: "revenue" });
        expectCurrency(b.totalFixedExpenses, a.totalFixedExpenses, {
          scenario: "Scenario 3 vs 1",
          month: i + 1,
          field: "totalFixedExpenses",
        });
        expectCurrency(b.cogs, a.cogs, { scenario: "Scenario 3 vs 1", month: i + 1, field: "cogs" });
        expectCurrency(b.otherDirectCosts, a.otherDirectCosts, {
          scenario: "Scenario 3 vs 1",
          month: i + 1,
          field: "otherDirectCosts",
        });
        expectCurrency(b.salesAndMarketing, a.salesAndMarketing, {
          scenario: "Scenario 3 vs 1",
          month: i + 1,
          field: "salesAndMarketing",
        });
      }

      // Month 7 is first improved month.
      assert.ok(s3.months[6].productAndTechnology < s1.months[6].productAndTechnology);
      assert.ok(s3.months[6].ebitda > s1.months[6].ebitda);
      assert.ok(s3.months[6].netBurn < s1.months[6].netBurn);
      assert.ok(s3.months[23].closingCash > s1.months[23].closingCash);
    });
  });
});
