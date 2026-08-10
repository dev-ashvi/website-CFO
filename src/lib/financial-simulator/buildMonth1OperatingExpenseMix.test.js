import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import {
  buildMonth1OperatingExpenseMix,
  getMonth1OperatingExpenseAmounts,
  OPERATING_EXPENSE_CATEGORY_LABELS,
} from "./buildMonth1OperatingExpenseMix.js";
import { mapExcelInputsToSimulator } from "./excelScenarioMapper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "runwayExcelGoldenFixtures.json"), "utf8"),
);

describe("buildMonth1OperatingExpenseMix — Scenario 1", () => {
  const inputs = mapExcelInputsToSimulator(structuredClone(FIXTURES.scenario1.inputs));
  const months = calculateProjection(inputs);
  const m1 = months[0];
  const mix = buildMonth1OperatingExpenseMix(m1);
  const kpis = calculateKpis(months);
  const amounts = getMonth1OperatingExpenseAmounts(m1);

  it("maps each engine field to its canonical operating label and amount", () => {
    assert.equal(
      mix.categoryLabels.productAndTechnology,
      "Fulfilment / other variable operating costs",
    );
    assert.equal(mix.categoryLabels.salesAndMarketing, "Sales & marketing");
    assert.equal(mix.categoryLabels.payroll, "Payroll");
    assert.equal(mix.categoryLabels.otherFixedCosts, "Other fixed costs");

    assert.equal(amounts.productAndTechnology, 1_200_000);
    assert.equal(amounts.salesAndMarketing, 600_000);
    assert.equal(amounts.payroll, 150_000);
    assert.equal(amounts.otherFixedCosts, 75_000);
  });

  it("variable operating expenses = fulfilment + S&M only", () => {
    assert.equal(mix.variableExpenses, 1_800_000);
    assert.equal(mix.variableExpenses, amounts.productAndTechnology + amounts.salesAndMarketing);
  });

  it("fixed operating expenses = payroll + other fixed", () => {
    assert.equal(mix.fixedExpenses, 225_000);
    assert.equal(mix.fixedExpenses, amounts.payroll + amounts.otherFixedCosts);
  });

  it("total operating expenses = variable + fixed = grossBurn", () => {
    assert.equal(mix.month1OperatingExpenses, 2_025_000);
    assert.equal(mix.variableExpenses + mix.fixedExpenses, m1.grossBurn);
    assert.equal(kpis.expenseMix.month1OperatingExpenses, m1.grossBurn);
  });

  it("variable and fixed shares use unrounded ratios", () => {
    assert.ok(Math.abs(mix.variableSharePercent - 1_800_000 / 2_025_000) < 1e-12);
    assert.ok(Math.abs(mix.fixedSharePercent - 225_000 / 2_025_000) < 1e-12);
    assert.ok(Math.abs(mix.variableSharePercent - 88.88888888888889 / 100) < 1e-9);
    assert.ok(Math.abs(mix.fixedSharePercent - 11.11111111111111 / 100) < 1e-9);
  });

  it("largest category resolves from engine key, not array order", () => {
    assert.equal(mix.largestExpenseCategoryKey, "productAndTechnology");
    assert.equal(
      mix.largestExpenseCategoryLabel,
      OPERATING_EXPENSE_CATEGORY_LABELS.productAndTechnology,
    );
    assert.equal(
      mix.largestExpenseCategoryLabel,
      "Fulfilment / other variable operating costs",
    );
    assert.equal(mix.largestExpenseCategoryAmount, 1_200_000);
    assert.ok(Math.abs(mix.largestExpenseCategorySharePercent - 1_200_000 / 2_025_000) < 1e-12);
    assert.ok(Math.abs(mix.largestExpenseCategorySharePercent - 59.25925925925926 / 100) < 1e-9);
    assert.equal(mix.largestExpenseCategory, mix.largestExpenseCategoryLabel);
  });

  it("excludes COGS, other direct, CapEx, and funding", () => {
    assert.equal(m1.cogs, 1_050_000);
    assert.equal(m1.otherDirectCosts, 150_000);
    assert.ok(m1.cogs + m1.otherDirectCosts > 0);
    assert.notEqual(mix.variableExpenses, m1.totalVariableExpenses);
    assert.notEqual(mix.month1OperatingExpenses, m1.totalOperatingExpenses);

    const withCapex = calculateProjection({
      ...inputs,
      capexEvents: [{ monthIndex: 1, amount: 500_000 }],
      equityEvents: [{ monthIndex: 1, amount: 2_000_000 }],
    });
    const mixWithEvents = buildMonth1OperatingExpenseMix(withCapex[0]);
    assert.equal(mixWithEvents.largestExpenseCategoryKey, mix.largestExpenseCategoryKey);
    assert.equal(mixWithEvents.largestExpenseCategoryLabel, mix.largestExpenseCategoryLabel);
  });

  it("calculateKpis expenseMix matches helper output", () => {
    assert.equal(kpis.expenseMix.scope, "operating");
    assert.equal(kpis.expenseMix.variableExpenses, mix.variableExpenses);
    assert.equal(kpis.expenseMix.fixedExpenses, mix.fixedExpenses);
    assert.equal(kpis.expenseMix.largestExpenseCategoryKey, mix.largestExpenseCategoryKey);
    assert.equal(kpis.expenseMix.largestExpenseCategoryLabel, mix.largestExpenseCategoryLabel);
  });
});
