import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDefaultInputs } from "./defaults.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import {
  buildCashMovementInsight,
  buildOperatingLeverageStats,
} from "./cashMovementInsight.js";
import { runDashboardOverlay } from "./dashboardOverlays.js";
import { answerAskAiCfo } from "./askAiCfo.js";

describe("cashMovementInsight", () => {
  it("returns structured opportunity with what-ifs, confidence, and why", () => {
    const inputs = {
      ...getDefaultInputs(),
      currentCashBalance: 2_000_000,
      currentMonthlyRevenue: 500_000,
      monthlyRevenueGrowth: 0.03,
      cogsPercent: 0.4,
      monthlyPayroll: 400_000,
    };
    const months = calculateProjection(inputs);
    const kpis = calculateKpis(months);
    const insight = buildCashMovementInsight({ months, kpis, inputs });
    assert.ok(insight.badge);
    assert.ok(insight.title);
    assert.ok(["alert", "opportunity", "driver", "neutral"].includes(insight.tone));
    assert.ok(Array.isArray(insight.whatIfs));
    assert.ok(insight.whatIfs.length >= 1);
    assert.ok(insight.whatIfs[0].id);
    assert.ok(insight.benchmark);
    assert.ok(insight.benchmark.rangeValue || insight.benchmark.medianValue);
    assert.ok(Array.isArray(insight.costDrivers));
    assert.ok(Array.isArray(insight.mixBars));
    if (insight.runwayGainMonths != null) {
      assert.ok(insight.confidence?.level);
      assert.ok(insight.why?.detail);
    }
  });

  it("buildOperatingLeverageStats returns CFO observation and badges", () => {
    const months = calculateProjection(getDefaultInputs());
    const stats = buildOperatingLeverageStats(months);
    assert.ok(["Positive", "Negative", "Neutral", "—"].includes(stats.leverage));
    assert.equal(typeof stats.observationTitle, "string");
    assert.ok(stats.revenueBadge || stats.leverageBadge);
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

  it("runs what-if revenue overlay", () => {
    const base = getDefaultInputs();
    const out = runDashboardOverlay(base, { kind: "whatif", id: "revenue-up-5" });
    assert.equal(out.ok, true);
    assert.ok(out.sim.months.length === 24);
  });
});

describe("askAiCfo", () => {
  it("answers why-runway from projection outputs", () => {
    const inputs = getDefaultInputs();
    const months = calculateProjection(inputs);
    const kpis = calculateKpis(months);
    const qa = answerAskAiCfo("why-runway", { months, kpis, inputs });
    assert.ok(qa.question);
    assert.ok(qa.answer.includes("Runway") || qa.answer.toLowerCase().includes("runway"));
  });
});
