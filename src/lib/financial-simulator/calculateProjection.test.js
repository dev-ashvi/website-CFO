import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDefaultInputs } from "./defaults.js";
import { validateSimulatorInputs } from "./validation.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis, getHealthStatus } from "./calculateKpis.js";
import { runSimulation } from "./index.js";

const TOL = 1; // INR rounding tolerance vs Excel

describe("validateSimulatorInputs", () => {
  it("rejects empty required values", () => {
    const r = validateSimulatorInputs({
      ...getDefaultInputs(),
      industry: "",
      currentCashBalance: "",
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.length >= 1);
  });

  it("rejects invalid percentages", () => {
    const r = validateSimulatorInputs({
      ...getDefaultInputs(),
      cogsPercent: 1.5,
    });
    assert.equal(r.ok, false);
  });

  it("rejects negative cash", () => {
    const r = validateSimulatorInputs({
      ...getDefaultInputs(),
      currentCashBalance: -100,
    });
    assert.equal(r.ok, false);
  });

  it("rejects event month outside 1–24", () => {
    const r = validateSimulatorInputs({
      ...getDefaultInputs(),
      capexEvents: [{ monthIndex: 30, amount: 1000 }],
    });
    assert.equal(r.ok, false);
  });
});

describe("calculateProjection — Excel month 1 defaults", () => {
  it("matches workbook month-1 revenue and ending cash (within tolerance)", () => {
    // Detailed mode mirrors Excel volume×AOV path
    const inputs = {
      ...getDefaultInputs(),
      revenueMode: "detailed",
      currentVolume: 500,
      monthlyVolumeGrowth: 0.02,
      averageOrderValue: 1500,
      monthlyAovGrowth: 0,
      capexEvents: [],
      equityEvents: [],
      debtEvents: [],
    };
    const months = calculateProjection(inputs);
    const m1 = months[0];
    assert.equal(m1.revenue, 750_000);
    assert.ok(Math.abs(m1.cogs - 262_500) < TOL);
    assert.ok(Math.abs(m1.payroll - 150_300) < TOL);
    assert.ok(Math.abs(m1.otherFixedCosts - 75_150) < TOL);
    assert.ok(Math.abs(m1.ebitda - -225_450) < TOL);
    assert.ok(Math.abs(m1.closingCash - 774_550) < TOL);
  });

  it("rolls opening→closing cash correctly", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "detailed",
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    for (let i = 1; i < months.length; i++) {
      assert.equal(months[i].openingCash, months[i - 1].closingCash);
    }
  });

  it("retains negative closing cash after cash-out (funding shortfall)", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      currentCashBalance: 50_000,
      revenueMode: "simple",
      currentMonthlyRevenue: 10_000,
      monthlyRevenueGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const firstOut = months.find((m) => m.cashOut);
    assert.ok(firstOut);
    assert.ok(firstOut.closingCash < 0);
    assert.equal(months.every((m) => m.closingCash != null), true);
  });
});

describe("scenarios", () => {
  it("handles zero revenue", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      currentMonthlyRevenue: 0,
      monthlyRevenueGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.equal(months[0].revenue, 0);
    assert.ok(months[0].ebitda < 0);
  });

  it("handles zero expenses (no payroll/fixed/variable)", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      currentMonthlyRevenue: 100_000,
      monthlyRevenueGrowth: 0,
      cogsPercent: 0,
      otherDirectCostsPercent: 0,
      salesMarketingPercent: 0,
      productTechPercent: 0,
      monthlyPayroll: 0,
      payrollGrowth: 0,
      otherFixedCosts: 0,
      otherFixedGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(months[0].ebitda > 0);
    assert.ok(months[0].closingCash > months[0].openingCash);
  });

  it("positive cash flow increases closing cash", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      currentMonthlyRevenue: 2_000_000,
      monthlyRevenueGrowth: 0,
      cogsPercent: 0.1,
      otherDirectCostsPercent: 0,
      salesMarketingPercent: 0.05,
      productTechPercent: 0.05,
      monthlyPayroll: 50_000,
      payrollGrowth: 0,
      otherFixedCosts: 20_000,
      otherFixedGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(months[0].netCashFlow > 0);
    assert.ok(months[0].closingCash > months[0].openingCash);
  });

  it("detects cash-out within 24 months", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      currentCashBalance: 100_000,
      revenueMode: "simple",
      currentMonthlyRevenue: 50_000,
      monthlyRevenueGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(months.some((m) => m.cashOut));
  });

  it("no cash-out within 24 months when funded / low burn", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      currentCashBalance: 50_000_000,
      revenueMode: "simple",
      currentMonthlyRevenue: 500_000,
      monthlyRevenueGrowth: 0.02,
      salesMarketingPercent: 0.1,
      productTechPercent: 0.05,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(!months.some((m) => m.cashOut));
  });

  it("applies funding event in a future month", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      equityEvents: [{ monthIndex: 3, amount: 10_000_000 }],
      debtEvents: [],
      capexEvents: [],
    });
    assert.equal(months[2].equityFunding, 10_000_000);
    assert.ok(months[2].netCashFlow > months[1].netCashFlow);
  });

  it("applies CapEx event in a future month", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      equityEvents: [],
      debtEvents: [],
      capexEvents: [{ monthIndex: 2, amount: 250_000 }],
    });
    assert.equal(months[1].capex, 250_000);
    assert.ok(months[1].totalCashBurn > months[0].totalCashBurn);
  });

  it("grows revenue month over month in simple mode", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      currentMonthlyRevenue: 100_000,
      monthlyRevenueGrowth: 0.1,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(months[1].revenue > months[0].revenue);
  });

  it("grows payroll month over month", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      payrollGrowth: 0.1,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(months[1].payroll > months[0].payroll);
  });
});

describe("KPIs / health", () => {
  it("maps health thresholds", () => {
    assert.equal(getHealthStatus(3), "Critical");
    assert.equal(getHealthStatus(8), "Attention required");
    assert.equal(getHealthStatus(14), "Stable");
    assert.equal(getHealthStatus(20), "Healthy");
  });

  it("runSimulation returns months + kpis", () => {
    const r = runSimulation(getDefaultInputs());
    assert.equal(r.ok, true);
    assert.equal(r.months.length, 24);
    assert.ok(r.kpis.runwayMonths != null);
    assert.ok(r.kpis.healthStatus);
  });

  it("defines gross burn as total operating cash outflow", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      currentMonthlyRevenue: 100_000,
      monthlyRevenueGrowth: 0,
      cogsPercent: 0.2,
      otherDirectCostsPercent: 0.05,
      salesMarketingPercent: 0.1,
      productTechPercent: 0.05,
      monthlyPayroll: 30_000,
      payrollGrowth: 0,
      otherFixedCosts: 10_000,
      otherFixedGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const m = months[0];
    const expectedGross =
      m.cogs + m.otherDirectCosts + m.salesAndMarketing + m.productAndTechnology + m.payroll + m.otherFixedCosts;
    assert.ok(Math.abs(m.grossBurn - expectedGross) < TOL);
    assert.ok(Math.abs(m.grossBurn - (m.revenue - m.ebitda)) < TOL);
  });

  it("defines net burn as −EBITDA (gross burn − revenue)", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      currentMonthlyRevenue: 100_000,
      monthlyRevenueGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const m = months[0];
    assert.ok(Math.abs(m.netBurn - -m.ebitda) < TOL);
    assert.ok(Math.abs(m.netBurn - (m.grossBurn - m.revenue)) < TOL);
  });

  it("avg net burn floors profitable months at zero", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      currentCashBalance: 5_000_000,
      revenueMode: "simple",
      currentMonthlyRevenue: 2_000_000,
      monthlyRevenueGrowth: 0,
      cogsPercent: 0.1,
      otherDirectCostsPercent: 0,
      salesMarketingPercent: 0.05,
      productTechPercent: 0.05,
      monthlyPayroll: 50_000,
      payrollGrowth: 0,
      otherFixedCosts: 20_000,
      otherFixedGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(months[0].netBurn < 0);
    const kpis = calculateKpis(months);
    assert.equal(kpis.avgMonthlyNetBurn, 0);
  });
});
