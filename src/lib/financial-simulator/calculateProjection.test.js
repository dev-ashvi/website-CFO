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
    assert.ok(Math.abs(m1.payroll - 150_000) < TOL);
    assert.ok(Math.abs(m1.otherFixedCosts - 75_000) < TOL);
    assert.ok(Math.abs(m1.ebitda - -225_000) < TOL);
    assert.ok(Math.abs(m1.closingCash - 775_000) < TOL);
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
    const r = runSimulation({
      ...getDefaultInputs(),
      email: "founder@example.com",
      phone: "+91 98765 43210",
    });
    assert.equal(r.ok, true);
    assert.equal(r.months.length, 24);
    assert.ok(r.kpis.runwayMonths != null);
    assert.ok(r.kpis.healthStatus);
    assert.ok(r.kpis.expenseMix);
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

describe("variable / fixed expense classification", () => {
  const base = () => ({
    ...getDefaultInputs(),
    revenueMode: "simple",
    currentMonthlyRevenue: 100_000,
    monthlyRevenueGrowth: 0.05,
    cogsPercent: 0.2,
    otherDirectCostsPercent: 0.05,
    salesMarketingPercent: 0.1,
    productTechPercent: 0.05,
    monthlyPayroll: 30_000,
    payrollGrowth: 0.01,
    otherFixedCosts: 10_000,
    otherFixedGrowth: 0.01,
    equityEvents: [],
    debtEvents: [],
    capexEvents: [{ monthIndex: 3, amount: 50_000 }],
  });

  it("total variable expenses equal the sum of variable categories", () => {
    const m = calculateProjection(base())[0];
    assert.ok(
      Math.abs(
        m.totalVariableExpenses -
          (m.cogs + m.otherDirectCosts + m.salesAndMarketing + m.productAndTechnology),
      ) < TOL,
    );
  });

  it("total fixed expenses equal payroll plus other fixed costs", () => {
    const m = calculateProjection(base())[0];
    assert.ok(Math.abs(m.totalFixedExpenses - (m.payroll + m.otherFixedCosts)) < TOL);
  });

  it("total operating expenses equal variable plus fixed", () => {
    const m = calculateProjection(base())[0];
    assert.ok(
      Math.abs(m.totalOperatingExpenses - (m.totalVariableExpenses + m.totalFixedExpenses)) < TOL,
    );
  });

  it("CapEx is excluded from variable and fixed operating expenses", () => {
    const months = calculateProjection(base());
    const m3 = months[2];
    assert.equal(m3.capex, 50_000);
    assert.ok(Math.abs(m3.grossBurn - m3.totalOperatingExpenses) < TOL);
    assert.ok(Math.abs(m3.totalCashBurn - (m3.netBurn + m3.capex)) < TOL);
    assert.ok(
      Math.abs(
        m3.totalOperatingExpenses - (m3.totalVariableExpenses + m3.totalFixedExpenses),
      ) < TOL,
    );
  });

  it("variable expense percentages scale correctly with revenue", () => {
    const m = calculateProjection({ ...base(), monthlyRevenueGrowth: 0 })[0];
    assert.ok(Math.abs(m.cogs - 20_000) < TOL);
    assert.ok(Math.abs(m.otherDirectCosts - 5_000) < TOL);
    assert.ok(Math.abs(m.salesAndMarketing - 10_000) < TOL);
    assert.ok(Math.abs(m.productAndTechnology - 5_000) < TOL);
  });

  it("fixed expense growth compounds correctly", () => {
    const months = calculateProjection({ ...base(), monthlyRevenueGrowth: 0 });
    // Month 1 uses input base; MoM growth starts in Month 2 (golden Excel convention).
    assert.ok(Math.abs(months[0].payroll - 30_000) < TOL);
    assert.ok(Math.abs(months[1].payroll - 30_000 * 1.01) < TOL);
  });

  it("expense-mix percentages sum to ~100%", () => {
    const months = calculateProjection(base());
    const kpis = calculateKpis(months);
    const sumPct = kpis.expenseMix.variableExpensePercent + kpis.expenseMix.fixedExpensePercent;
    assert.ok(Math.abs(sumPct - 1) < 0.01);
  });

  it("gross burn equals total variable plus total fixed expenses", () => {
    const m = calculateProjection(base())[0];
    assert.ok(Math.abs(m.grossBurn - (m.totalVariableExpenses + m.totalFixedExpenses)) < TOL);
  });

  it("net burn equals gross burn minus revenue", () => {
    const m = calculateProjection(base())[0];
    assert.ok(Math.abs(m.netBurn - (m.grossBurn - m.revenue)) < TOL);
  });
});

describe("closing cash including vs excluding CapEx", () => {
  it("with zero CapEx, both closing-cash series are identical", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    for (const m of months) {
      assert.ok(Math.abs(m.closingCash - m.closingCashExcludingCapex) < TOL);
      assert.equal(m.cumulativeCapex, 0);
    }
  });

  it("a CapEx event lowers including-CapEx cash in the correct month", () => {
    const baseInputs = {
      ...getDefaultInputs(),
      revenueMode: "simple",
      currentMonthlyRevenue: 100_000,
      monthlyRevenueGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    };
    const withCapex = {
      ...baseInputs,
      capexEvents: [{ monthIndex: 3, amount: 200_000 }],
    };
    const baseM = calculateProjection(baseInputs);
    const capM = calculateProjection(withCapex);
    assert.ok(Math.abs(capM[0].closingCash - baseM[0].closingCash) < TOL);
    assert.ok(Math.abs(capM[1].closingCash - baseM[1].closingCash) < TOL);
    assert.ok(Math.abs(capM[2].closingCash - (baseM[2].closingCash - 200_000)) < TOL);
    assert.equal(capM[2].capex, 200_000);
  });

  it("the excluding-CapEx series is unaffected by CapEx", () => {
    const baseInputs = {
      ...getDefaultInputs(),
      revenueMode: "simple",
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    };
    const withCapex = {
      ...baseInputs,
      capexEvents: [{ monthIndex: 2, amount: 500_000 }],
    };
    const baseM = calculateProjection(baseInputs);
    const capM = calculateProjection(withCapex);
    for (let i = 0; i < 24; i++) {
      assert.ok(Math.abs(capM[i].closingCashExcludingCapex - baseM[i].closingCashExcludingCapex) < TOL);
    }
  });

  it("the difference between the two series equals cumulative CapEx", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      equityEvents: [],
      debtEvents: [],
      capexEvents: [
        { monthIndex: 2, amount: 100_000 },
        { monthIndex: 5, amount: 250_000 },
      ],
    });
    for (const m of months) {
      assert.ok(
        Math.abs(m.closingCashExcludingCapex - m.closingCash - m.cumulativeCapex) < TOL,
      );
      assert.equal(m.closingCashIncludingCapex, m.closingCash);
    }
  });

  it("both series use independent opening-to-closing cash roll-forwards", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      equityEvents: [],
      debtEvents: [],
      capexEvents: [{ monthIndex: 2, amount: 100_000 }],
    });
    for (let i = 1; i < months.length; i++) {
      assert.equal(months[i].openingCash, months[i - 1].closingCash);
      assert.equal(months[i].openingCashExcludingCapex, months[i - 1].closingCashExcludingCapex);
      assert.ok(
        Math.abs(months[i].closingCash - (months[i].openingCash + months[i].netCashFlow)) < TOL,
      );
      assert.ok(
        Math.abs(
          months[i].closingCashExcludingCapex -
            (months[i].openingCashExcludingCapex + months[i].netCashFlowExcludingCapex),
        ) < TOL,
      );
    }
  });

  it("funding events affect both series equally", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      equityEvents: [{ monthIndex: 2, amount: 1_000_000 }],
      debtEvents: [],
      capexEvents: [],
    });
    assert.equal(months[1].equityFunding, 1_000_000);
    assert.ok(Math.abs(months[1].closingCash - months[1].closingCashExcludingCapex) < TOL);
    assert.ok(months[1].closingCash > months[0].closingCash);
  });

  it("operating expenses affect both series equally", () => {
    const low = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      monthlyPayroll: 50_000,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const high = calculateProjection({
      ...getDefaultInputs(),
      revenueMode: "simple",
      monthlyPayroll: 200_000,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.ok(high[0].closingCash < low[0].closingCash);
    assert.ok(high[0].closingCashExcludingCapex < low[0].closingCashExcludingCapex);
  });

  it("cash-out including CapEx can occur before excluding CapEx", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      currentCashBalance: 300_000,
      revenueMode: "simple",
      currentMonthlyRevenue: 50_000,
      monthlyRevenueGrowth: 0,
      cogsPercent: 0.3,
      otherDirectCostsPercent: 0.1,
      salesMarketingPercent: 0.2,
      productTechPercent: 0.1,
      monthlyPayroll: 80_000,
      payrollGrowth: 0,
      otherFixedCosts: 40_000,
      otherFixedGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [{ monthIndex: 2, amount: 400_000 }],
    });
    const outInc = months.find((m) => m.cashOut);
    const outEx = months.find((m) => m.cashOutExcludingCapex);
    assert.ok(outInc);
    assert.ok(outEx);
    assert.ok(outInc.monthIndex <= outEx.monthIndex);
  });

  it("existing runway continues to use including-CapEx cash", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      currentCashBalance: 200_000,
      revenueMode: "simple",
      currentMonthlyRevenue: 20_000,
      monthlyRevenueGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [{ monthIndex: 1, amount: 50_000 }],
    });
    const kpis = calculateKpis(months);
    assert.equal(kpis.cashOutMonthIndex, months.find((m) => m.cashOut)?.monthIndex);
    assert.equal(kpis.capexComparison.cashOutMonthIncludingCapex, kpis.cashOutMonthIndex);
    assert.equal(kpis.runwayMonths, kpis.capexComparison.runwayMonthsIncludingCapex);
    assert.equal(kpis.sixMonthClosingCash, months[5].closingCash);
  });

  it("negative cash values remain visible in both series", () => {
    const months = calculateProjection({
      ...getDefaultInputs(),
      currentCashBalance: 20_000,
      revenueMode: "simple",
      currentMonthlyRevenue: 5_000,
      monthlyRevenueGrowth: 0,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [{ monthIndex: 1, amount: 100_000 }],
    });
    assert.ok(months.some((m) => m.closingCash < 0));
    assert.ok(months.every((m) => m.closingCash != null && m.closingCashExcludingCapex != null));
  });
});
