import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDefaultInputs } from "./defaults.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";

function run(overrides = {}) {
  const inputs = { ...getDefaultInputs(), ...overrides };
  const months = calculateProjection(inputs);
  const kpis = calculateKpis(months, inputs);
  return { months, kpis, inputs };
}

describe("Results KPI burn metrics (Month 1, not averages)", () => {
  it("monthly gross burn equals Month 1 operating expense burn (excludes COGS)", () => {
    const { months, kpis } = run({ capexEvents: [], equityEvents: [], debtEvents: [] });
    const m1 = months[0];
    assert.equal(kpis.burnMetrics.monthlyGrossBurn, m1.grossBurn);
    assert.equal(
      kpis.burnMetrics.monthlyGrossBurn,
      m1.productAndTechnology + m1.salesAndMarketing + m1.payroll + m1.otherFixedCosts,
    );
  });

  it("monthly net burn excl. CapEx equals Month 1 −EBITDA", () => {
    const { months, kpis } = run({ capexEvents: [], equityEvents: [], debtEvents: [] });
    const m1 = months[0];
    assert.equal(kpis.burnMetrics.monthlyNetBurnExcludingCapex, m1.netBurn);
    assert.ok(Math.abs(kpis.burnMetrics.monthlyNetBurnExcludingCapex - -m1.ebitda) < 1e-6);
  });

  it("monthly net burn incl. CapEx equals Month 1 net burn + CapEx", () => {
    const { months, kpis } = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [{ monthIndex: 1, amount: 50_000 }],
    });
    const m1 = months[0];
    assert.equal(m1.capex, 50_000);
    assert.equal(kpis.burnMetrics.monthlyNetBurnIncludingCapex, m1.netBurnIncludingCapex);
    assert.equal(kpis.burnMetrics.monthlyNetBurnIncludingCapex, m1.netBurn + m1.capex);
  });

  it("funding does not affect either burn value", () => {
    const base = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const funded = run({
      equityEvents: [{ monthIndex: 1, amount: 5_000_000 }],
      debtEvents: [],
      capexEvents: [],
    });
    assert.equal(
      funded.kpis.burnMetrics.monthlyGrossBurn,
      base.kpis.burnMetrics.monthlyGrossBurn,
    );
    assert.equal(
      funded.kpis.burnMetrics.monthlyNetBurnExcludingCapex,
      base.kpis.burnMetrics.monthlyNetBurnExcludingCapex,
    );
    assert.equal(
      funded.kpis.burnMetrics.monthlyNetBurnIncludingCapex,
      base.kpis.burnMetrics.monthlyNetBurnIncludingCapex,
    );
    // Funding still moves cash (Month 1 closing), without changing burn KPIs.
    assert.equal(funded.months[0].closingCash, base.months[0].closingCash + 5_000_000);
  });

  it("CapEx affects only the including-CapEx burn", () => {
    const noCapex = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const withCapex = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [{ monthIndex: 1, amount: 100_000 }],
    });
    assert.equal(
      withCapex.kpis.burnMetrics.monthlyNetBurnExcludingCapex,
      noCapex.kpis.burnMetrics.monthlyNetBurnExcludingCapex,
    );
    assert.equal(
      withCapex.kpis.burnMetrics.monthlyGrossBurn,
      noCapex.kpis.burnMetrics.monthlyGrossBurn,
    );
    assert.equal(
      withCapex.kpis.burnMetrics.monthlyNetBurnIncludingCapex,
      noCapex.kpis.burnMetrics.monthlyNetBurnIncludingCapex + 100_000,
    );
  });

  it("values are Month 1, not 24-month averages", () => {
    const { months, kpis } = run({
      monthlyRevenueGrowth: 0.05,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const avgGross = months.reduce((s, m) => s + m.grossBurn, 0) / months.length;
    const avgNetFloored =
      months.reduce((s, m) => s + Math.max(m.netBurn, 0), 0) / months.length;

    assert.equal(kpis.burnMetrics.monthlyNetBurnExcludingCapex, months[0].netBurn);
    assert.equal(kpis.burnMetrics.monthlyGrossBurn, months[0].grossBurn);
    // With growth, Month 1 ≠ forecast average.
    assert.ok(Math.abs(kpis.burnMetrics.monthlyGrossBurn - avgGross) > 1);
    assert.ok(Math.abs(kpis.burnMetrics.monthlyNetBurnExcludingCapex - avgNetFloored) > 1);
    // Internal averages retained separately for compatibility.
    assert.ok(Math.abs(kpis.avgMonthlyNetBurn - avgNetFloored) < 1e-6);
    assert.ok(Math.abs(kpis.burnMetrics.avgNetBurnExcludingCapex - avgNetFloored) < 1e-6);
  });

  it("runway and expected cash-out remain driven by the forecast engine", () => {
    const { kpis, months } = run();
    assert.equal(typeof kpis.runwayMonths, "number");
    assert.ok(kpis.cashOutMonthLabel);
    assert.ok(kpis.cashOutMonthIndex == null || kpis.cashOutMonthIndex >= 0);
    // Engine still exposes horizon cash; UI no longer shows those cards.
    assert.equal(kpis.sixMonthClosingCash, months[5].closingCash);
    assert.equal(kpis.twelveMonthClosingCash, months[11].closingCash);
  });

  it("financial performance Month 1 KPIs remain unchanged", () => {
    const { months, kpis } = run({ capexEvents: [], equityEvents: [], debtEvents: [] });
    const m1 = months[0];
    assert.equal(kpis.financialPerformance.revenue, m1.revenue);
    assert.equal(kpis.financialPerformance.cm1, m1.cm1);
    assert.equal(kpis.financialPerformance.ebitda, m1.ebitda);
  });

  it("signed net burn stays negative when Month 1 is cash-flow positive", () => {
    const { months, kpis } = run({
      currentCashBalance: 10_000_000,
      currentMonthlyRevenue: 2_000_000,
      monthlyRevenueGrowth: 0,
      cogsPercent: 0.1,
      otherDirectCostsPercent: 0,
      salesMarketingPercent: 0.05,
      productTechPercent: 0.05,
      monthlyPayroll: 100_000,
      payrollGrowth: 0,
      otherFixedCosts: 40_000,
      otherFixedGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(months[0].ebitda > 0);
    assert.ok(kpis.burnMetrics.monthlyNetBurnExcludingCapex < 0);
    assert.equal(kpis.burnMetrics.monthlyNetBurnExcludingCapex, -months[0].ebitda);
  });
});

describe("Expense Breakdown (Month 1 snapshot)", () => {
  it("variable expenses equal Month 1 variable-expense total", () => {
    const { months, kpis } = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const m1 = months[0];
    assert.equal(kpis.expenseMix.period, "month1");
    assert.equal(kpis.expenseMix.variableExpenses, m1.totalVariableExpenses);
    assert.equal(
      kpis.expenseMix.variableExpenses,
      m1.cogs + m1.otherDirectCosts + m1.salesAndMarketing + m1.productAndTechnology,
    );
  });

  it("fixed expenses equal Month 1 fixed-expense total", () => {
    const { months, kpis } = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const m1 = months[0];
    assert.equal(kpis.expenseMix.fixedExpenses, m1.totalFixedExpenses);
    assert.equal(kpis.expenseMix.fixedExpenses, m1.payroll + m1.otherFixedCosts);
  });

  it("variable and fixed shares use Month 1 only and total ~100%", () => {
    const { months, kpis } = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const m1 = months[0];
    const opex = m1.totalOperatingExpenses;
    assert.ok(Math.abs(kpis.expenseMix.variableSharePercent - m1.totalVariableExpenses / opex) < 1e-9);
    assert.ok(Math.abs(kpis.expenseMix.fixedSharePercent - m1.totalFixedExpenses / opex) < 1e-9);
    assert.ok(
      Math.abs(kpis.expenseMix.variableSharePercent + kpis.expenseMix.fixedSharePercent - 1) < 0.01,
    );
  });

  it("largest category is determined from Month 1 only", () => {
    const { months, kpis } = run({
      // Make S&M the clear Month 1 leader; later months diverge via growth.
      currentMonthlyRevenue: 100_000,
      monthlyRevenueGrowth: 0.2,
      cogsPercent: 0.1,
      otherDirectCostsPercent: 0.05,
      salesMarketingPercent: 0.5,
      productTechPercent: 0.05,
      monthlyPayroll: 10_000,
      payrollGrowth: 0.1,
      otherFixedCosts: 5_000,
      otherFixedGrowth: 0.1,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const m1 = months[0];
    assert.equal(kpis.expenseMix.largestExpenseCategory, "Sales & marketing");
    assert.equal(kpis.expenseMix.largestExpenseCategoryAmount, m1.salesAndMarketing);
    // Month 24 S&M is much larger; mix must still use Month 1.
    assert.ok(months[23].salesAndMarketing > m1.salesAndMarketing * 2);
  });

  it("CapEx and funding are excluded from expense mix", () => {
    const base = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const withEvents = run({
      equityEvents: [{ monthIndex: 1, amount: 2_000_000 }],
      debtEvents: [],
      capexEvents: [{ monthIndex: 1, amount: 500_000 }],
    });
    assert.equal(withEvents.kpis.expenseMix.variableExpenses, base.kpis.expenseMix.variableExpenses);
    assert.equal(withEvents.kpis.expenseMix.fixedExpenses, base.kpis.expenseMix.fixedExpenses);
    assert.equal(withEvents.months[0].capex, 500_000);
    assert.ok(withEvents.months[0].capex > 0);
  });

  it("Month 2–24 values do not affect this section", () => {
    const flat = run({
      monthlyRevenueGrowth: 0,
      payrollGrowth: 0,
      otherFixedGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const growing = run({
      monthlyRevenueGrowth: 0.15,
      payrollGrowth: 0.05,
      otherFixedGrowth: 0.05,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    // Same Month 1 inputs → same expense mix despite different later months.
    assert.equal(growing.months[0].totalVariableExpenses, flat.months[0].totalVariableExpenses);
    assert.equal(growing.kpis.expenseMix.variableExpenses, flat.kpis.expenseMix.variableExpenses);
    assert.equal(growing.kpis.expenseMix.fixedExpenses, flat.kpis.expenseMix.fixedExpenses);
    assert.notEqual(
      growing.months[23].totalVariableExpenses,
      flat.months[23].totalVariableExpenses,
    );
  });

  it("currency selection does not change underlying expense values", () => {
    const inr = run({ currency: "INR", equityEvents: [], debtEvents: [], capexEvents: [] });
    const usd = run({ currency: "USD", equityEvents: [], debtEvents: [], capexEvents: [] });
    assert.equal(inr.kpis.expenseMix.variableExpenses, usd.kpis.expenseMix.variableExpenses);
    assert.equal(inr.kpis.expenseMix.fixedExpenses, usd.kpis.expenseMix.fixedExpenses);
  });
});
