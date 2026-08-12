import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDefaultInputs } from "./defaults.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import {
  buildCashMovementInsight,
  buildOperatingLeverageStats,
  buildCostContribution,
  buildExpenseInsights,
  sliceMonthsForChart,
  CHART_DEFAULT_HORIZON,
} from "./cashMovementInsight.js";
import { runDashboardOverlay } from "./dashboardOverlays.js";
import { answerAskAiCfo } from "./askAiCfo.js";
import { cloneInputs } from "./scenarios/index.js";

function run(overrides = {}) {
  const inputs = { ...getDefaultInputs(), ...overrides };
  const months = calculateProjection(inputs);
  const kpis = calculateKpis(months, inputs);
  return { inputs, months, kpis };
}

describe("cashMovementInsight", () => {
  it("returns structured opportunity with what-ifs, confidence, and why", () => {
    const { inputs, months, kpis } = run({
      currentCashBalance: 2_000_000,
      currentMonthlyRevenue: 500_000,
      monthlyRevenueGrowth: 0.03,
      cogsPercent: 0.4,
      monthlyPayroll: 400_000,
    });
    const insight = buildCashMovementInsight({ months, kpis, inputs });
    assert.ok(insight.badge);
    assert.ok(insight.title);
    assert.ok(["alert", "opportunity", "driver", "neutral"].includes(insight.tone));
    assert.ok(Array.isArray(insight.whatIfs));
    assert.ok(insight.whatIfs.length >= 1);
    assert.ok(insight.whatIfs[0].id);
    assert.ok(insight.benchmark);
    assert.ok(insight.costContribution);
    assert.ok(insight.expenseInsights);
    if (insight.runwayGainMonths != null) {
      assert.ok(insight.confidence?.level);
      assert.ok(insight.why?.detail);
    }
  });

  it("buildOperatingLeverageStats returns CFO observation and badges", () => {
    const { months } = run();
    const stats = buildOperatingLeverageStats(months.slice(0, CHART_DEFAULT_HORIZON));
    assert.ok(["Positive", "Negative", "Neutral", "—"].includes(stats.leverage));
    assert.equal(typeof stats.observationTitle, "string");
    assert.ok(stats.revenueBadge || stats.leverageBadge);
  });
});

describe("Cash Flow Intelligence chart horizon", () => {
  it("defaults to first 12 months for visualization", () => {
    const { months } = run();
    assert.equal(months.length, 24);
    const sliced = sliceMonthsForChart(months);
    assert.equal(sliced.length, CHART_DEFAULT_HORIZON);
    assert.equal(sliced[0].monthIndex, 1);
    assert.equal(sliced[11].monthIndex, 12);
  });
});

describe("Cost contribution (% of Month 1 revenue)", () => {
  it("uses Month 1 values with revenue denominator", () => {
    const { months } = run({
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const m1 = months[0];
    const cc = buildCostContribution(m1);
    assert.equal(cc.period, "month1");
    assert.equal(cc.revenue, m1.revenue);
    const cogs = cc.categories.find((c) => c.key === "cogs");
    assert.ok(Math.abs(cogs.shareOfRevenue - m1.cogs / m1.revenue) < 1e-9);
  });

  it("does not normalize category percentages to 100%", () => {
    const { months } = run({
      currentMonthlyRevenue: 100_000,
      monthlyRevenueGrowth: 0,
      cogsPercent: 0.35,
      salesMarketingPercent: 0.4,
      monthlyPayroll: 150_000,
      otherFixedCosts: 50_000,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const cc = buildCostContribution(months[0]);
    const totalPct = cc.categories.reduce((s, c) => s + c.shareOfRevenue, 0);
    assert.ok(totalPct > 1.0, "operating costs can exceed 100% of revenue");
  });

  it("excludes CapEx from operating cost/revenue metric", () => {
    const base = run({ capexEvents: [], equityEvents: [], debtEvents: [] });
    const withCapex = run({
      capexEvents: [{ monthIndex: 1, amount: 500_000 }],
      equityEvents: [],
      debtEvents: [],
    });
    assert.equal(
      buildCostContribution(withCapex.months[0]).totalOperatingCostToRevenue,
      buildCostContribution(base.months[0]).totalOperatingCostToRevenue,
    );
  });

  it("Month 2–24 values do not affect cost contribution", () => {
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
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    assert.deepEqual(
      buildCostContribution(flat.months[0]).categories.map((c) => c.shareOfRevenue),
      buildCostContribution(growing.months[0]).categories.map((c) => c.shareOfRevenue),
    );
    assert.notEqual(flat.months[23].revenue, growing.months[23].revenue);
  });
});

describe("Expense insights summary", () => {
  it("calculates total operating cost / revenue from Month 1", () => {
    const { months, kpis } = run({ equityEvents: [], debtEvents: [], capexEvents: [] });
    const m1 = months[0];
    const ei = buildExpenseInsights(m1, kpis, { inputs: { currency: "INR" } });
    const opex = m1.totalOperatingExpenses;
    assert.ok(Math.abs(ei.summary.operatingCostToRevenue - opex / m1.revenue) < 1e-9);
  });

  it("largest category insight uses Month 1 only", () => {
    const { months, kpis } = run({
      salesMarketingPercent: 0.5,
      monthlyRevenueGrowth: 0.2,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const ei = buildExpenseInsights(months[0], kpis);
    const largest = ei.items.find((i) => i.id === "largest");
    assert.ok(largest?.body.includes("Sales & Marketing costs"));
  });
});

describe("AI CFO recommendation ranking", () => {
  it("uses deterministic what-if runway deltas", () => {
    const { inputs, months, kpis } = run({
      currentCashBalance: 200_000,
      currentMonthlyRevenue: 20_000,
      monthlyRevenueGrowth: 0,
      monthlyPayroll: 80_000,
      otherFixedCosts: 40_000,
      equityEvents: [],
      debtEvents: [],
      capexEvents: [],
    });
    const insight = buildCashMovementInsight({ months, kpis, inputs });
    const bestWhatIf = [...insight.whatIfs].sort((a, b) => b.runwayDelta - a.runwayDelta)[0];
    if (insight.applyId && bestWhatIf?.runwayDelta > 0.05) {
      assert.equal(insight.runwayGainMonths, bestWhatIf.runwayDelta);
    }
    for (const row of insight.whatIfs) {
      assert.ok(row.baseRunway != null);
      assert.ok(row.simulatedRunway != null);
      assert.ok(Math.abs(row.simulatedRunway - row.baseRunway - row.runwayDelta) < 0.05);
    }
  });
});

describe("Industry benchmark", () => {
  it("uses industry field and shows unavailable when no validated data", () => {
    const { inputs, months, kpis } = run({ industry: "Healthcare" });
    const insight = buildCashMovementInsight({ months, kpis, inputs });
    assert.equal(insight.benchmark.available, false);
    assert.ok(insight.benchmark.message.includes("not yet available"));
  });

  it("shows benchmark for validated industry", () => {
    const { inputs, months, kpis } = run({ industry: "Financial Services" });
    const insight = buildCashMovementInsight({ months, kpis, inputs });
    assert.equal(insight.benchmark.available, true);
    assert.equal(insight.benchmark.industry, "Financial Services");
  });
});

describe("dashboardOverlays", () => {
  it("runs investor scenario and updates runway via engine", () => {
    const base = getDefaultInputs();
    const out = runDashboardOverlay(base, { kind: "scenario", id: "investor" });
    assert.equal(out.ok, true);
    assert.ok(out.sim.kpis);
    assert.ok(out.label);
  });

  it("runs what-if revenue overlay without mutating base inputs", () => {
    const base = getDefaultInputs();
    const snapshot = cloneInputs(base);
    const out = runDashboardOverlay(base, { kind: "whatif", id: "revenue-up-5" });
    assert.equal(out.ok, true);
    assert.ok(out.sim.months.length === 24);
    assert.equal(base.currentMonthlyRevenue, snapshot.currentMonthlyRevenue);
  });
});

describe("askAiCfo", () => {
  it("answers why-runway from projection outputs", () => {
    const { inputs, months, kpis } = run();
    const qa = answerAskAiCfo("why-runway", { months, kpis, inputs });
    assert.ok(qa.question);
    assert.ok(qa.answer.includes("Runway") || qa.answer.toLowerCase().includes("runway"));
  });
});
