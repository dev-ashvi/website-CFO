import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDefaultInputs } from "../defaults.js";
import { calculateProjection } from "../calculateProjection.js";
import {
  applyCostReductionScenario,
  applyFundingScenario,
  applyPayrollDelayScenario,
  applyRevenueGrowthScenario,
  cloneInputs,
  runWhatIfScenario,
} from "./index.js";

const baseNormalized = () => ({
  ...getDefaultInputs(),
  revenueMode: "simple",
  currentMonthlyRevenue: 100_000,
  monthlyRevenueGrowth: 0.05,
  equityEvents: [],
  debtEvents: [],
  capexEvents: [],
});

describe("what-if scenarios", () => {
  it("funding scenario increases cash in the selected month", () => {
    const base = baseNormalized();
    const withFunding = applyFundingScenario(base, { amount: 5_000_000, monthIndex: 3 });
    const months = calculateProjection(withFunding);
    assert.equal(months[2].equityFunding, 5_000_000);
    assert.ok(months[2].closingCash > calculateProjection(base)[2].closingCash);
  });

  it("variable cost reduction affects only variable expenses from month 2", () => {
    const base = baseNormalized();
    const cut = applyCostReductionScenario(base, { reductionRate: 0.1, target: "variable" });
    const baseM = calculateProjection(base);
    const cutM = calculateProjection(cut);
    assert.ok(Math.abs(cutM[0].totalVariableExpenses - baseM[0].totalVariableExpenses) < 1);
    assert.ok(cutM[1].cogs < baseM[1].cogs * 0.95);
    assert.ok(cutM[1].salesAndMarketing < baseM[1].salesAndMarketing * 0.95);
    assert.ok(Math.abs(cutM[1].payroll - baseM[1].payroll) < 1);
    assert.ok(Math.abs(cutM[1].otherFixedCosts - baseM[1].otherFixedCosts) < 1);
  });

  it("fixed cost reduction affects only fixed expenses from month 2", () => {
    const base = baseNormalized();
    const cut = applyCostReductionScenario(base, { reductionRate: 0.1, target: "fixed" });
    const baseM = calculateProjection(base);
    const cutM = calculateProjection(cut);
    assert.ok(Math.abs(cutM[0].payroll - baseM[0].payroll) < 1);
    assert.ok(cutM[1].payroll < baseM[1].payroll * 0.95);
    assert.ok(cutM[1].otherFixedCosts < baseM[1].otherFixedCosts * 0.95);
    assert.ok(Math.abs(cutM[1].cogs - baseM[1].cogs) < 1);
    assert.ok(Math.abs(cutM[1].salesAndMarketing - baseM[1].salesAndMarketing) < 1);
  });

  it("cost reduction lowers selected costs only from month 2", () => {
    const base = baseNormalized();
    const cut = applyCostReductionScenario(base, { reductionRate: 0.1, target: "variable" });
    const baseM = calculateProjection(base);
    const cutM = calculateProjection(cut);
    assert.ok(Math.abs(cutM[0].salesAndMarketing - baseM[0].salesAndMarketing) < 1);
    assert.ok(cutM[1].salesAndMarketing < baseM[1].salesAndMarketing * 0.95);
    assert.ok(Math.abs(cutM[1].payroll - baseM[1].payroll) < 1);
  });

  it("revenue growth scenario adds percentage points correctly", () => {
    const base = baseNormalized();
    const grown = applyRevenueGrowthScenario(base, { additionalPoints: 0.02 });
    assert.ok(Math.abs(grown.monthlyRevenueGrowth - 0.07) < 1e-9);
    assert.equal(base.monthlyRevenueGrowth, 0.05);
    const baseM = calculateProjection(base);
    const grownM = calculateProjection(grown);
    assert.ok(grownM[1].revenue > baseM[1].revenue);
  });

  it("payroll delay keeps payroll flat for the selected delay period", () => {
    const base = {
      ...baseNormalized(),
      monthlyPayroll: 100_000,
      payrollGrowth: 0.1,
      otherFixedGrowth: 0,
    };
    const delayed = applyPayrollDelayScenario(base, { delayMonths: 6 });
    const months = calculateProjection(delayed);
    assert.ok(Math.abs(months[0].payroll - months[5].payroll) < 1);
    assert.ok(months[6].payroll > months[5].payroll);
  });

  it("scenario calculations do not mutate base assumptions", () => {
    const base = baseNormalized();
    const snapshot = JSON.stringify(base);
    applyFundingScenario(base, { amount: 1_000_000, monthIndex: 2 });
    applyCostReductionScenario(base, { reductionRate: 0.1, target: "variable" });
    applyCostReductionScenario(base, { reductionRate: 0.1, target: "fixed" });
    applyRevenueGrowthScenario(base, { additionalPoints: 0.01 });
    applyPayrollDelayScenario(base, { delayMonths: 3 });
    assert.equal(JSON.stringify(base), snapshot);
  });

  it("runway delta is calculated correctly", () => {
    const base = {
      ...baseNormalized(),
      currentCashBalance: 200_000,
      currentMonthlyRevenue: 20_000,
      monthlyRevenueGrowth: 0,
      salesMarketingPercent: 0.3,
      productTechPercent: 0.2,
      monthlyPayroll: 80_000,
      payrollGrowth: 0,
      otherFixedCosts: 40_000,
      otherFixedGrowth: 0,
    };
    const cmp = runWhatIfScenario(base, {
      type: "funding",
      params: { amount: 10_000_000, monthIndex: 2 },
    });
    assert.ok(cmp.delta.runwayMonths != null);
    assert.ok(cmp.delta.runwayMonths > 0);
    assert.ok(
      Math.abs(cmp.delta.runwayMonths - (cmp.scenario.runwayMonths - cmp.base.runwayMonths)) < 0.05,
    );
  });

  it("scenario with no meaningful change returns near-zero delta", () => {
    const base = baseNormalized();
    const cmp = runWhatIfScenario(base, {
      type: "cost-reduction",
      params: { reductionRate: 0, target: "variable" },
    });
    assert.ok(Math.abs(cmp.delta.runwayMonths || 0) < 0.05);
    assert.ok(Math.abs(cmp.delta.avgNetBurn || 0) < 1);
  });

  it("base and scenario cash series both retain negative values", () => {
    const base = {
      ...baseNormalized(),
      currentCashBalance: 50_000,
      currentMonthlyRevenue: 10_000,
      monthlyRevenueGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    };
    const cmp = runWhatIfScenario(base, {
      type: "cost-reduction",
      params: { reductionRate: 0.05, target: "variable" },
    });
    assert.ok(cmp.baseMonths.some((m) => m.closingCash < 0));
    assert.ok(cmp.scenarioMonths.some((m) => m.closingCash < 0));
    assert.equal(
      cmp.baseMonths.every((m) => m.closingCash != null),
      true,
    );
  });

  it("human-readable event month maps correctly to month index", () => {
    const base = baseNormalized();
    const withFunding = applyFundingScenario(base, { amount: 2_500_000, monthIndex: 6 });
    assert.equal(withFunding.equityEvents.at(-1).monthIndex, 6);
    assert.equal(calculateProjection(withFunding)[5].equityFunding, 2_500_000);
  });

  it("cloneInputs returns an independent copy", () => {
    const base = baseNormalized();
    const copy = cloneInputs(base);
    copy.currentCashBalance = 1;
    copy.equityEvents.push({ monthIndex: 1, amount: 9 });
    assert.notEqual(base.currentCashBalance, 1);
    assert.equal(base.equityEvents.length, 0);
  });
});
