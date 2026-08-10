import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDefaultInputs } from "./defaults.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { cloneInputs } from "./scenarios/index.js";
import { formatMoney } from "./format.js";
import {
  askAiCfo,
  buildSuggestedPrompts,
  parseAiCfoQuestion,
} from "./aiCfoEngine.js";

function run(overrides = {}) {
  const inputs = { ...getDefaultInputs(), ...overrides };
  const months = calculateProjection(inputs);
  const kpis = calculateKpis(months);
  return { inputs, months, kpis };
}

function lowRunwaySim() {
  return run({
    currentCashBalance: 800_000,
    currentMonthlyRevenue: 200_000,
    monthlyRevenueGrowth: 0.02,
    monthlyPayroll: 320_000,
    salesMarketingPercent: 0.35,
    cogsPercent: 0.35,
  });
}

describe("aiCfoEngine", () => {
  it("explanation queries do not alter assumptions", () => {
    const sim = lowRunwaySim();
    const snapshot = cloneInputs(sim.inputs);
    const res = askAiCfo("Why is my runway only this long?", sim);
    assert.equal(res.type, "explanation");
    assert.ok(res.bullets?.length);
    assert.equal(sim.inputs.currentCashBalance, snapshot.currentCashBalance);
    assert.equal(sim.inputs.monthlyPayroll, snapshot.monthlyPayroll);
    assert.ok(!res.scenarioInputs);
  });

  it("simulates +10% revenue without mutating base inputs", () => {
    const sim = lowRunwaySim();
    const snapshot = cloneInputs(sim.inputs);
    const res = askAiCfo("What if revenue increases by 10%?", sim);
    assert.equal(res.type, "simulation");
    assert.ok(res.scenario);
    assert.ok(res.scenario.runwayMonths != null);
    assert.equal(sim.inputs.currentMonthlyRevenue, snapshot.currentMonthlyRevenue);
    assert.ok(res.scenarioInputs.currentMonthlyRevenue > snapshot.currentMonthlyRevenue);
  });

  it("simulates -10% fixed cost", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("What if I reduce fixed costs by 10%?", sim);
    assert.equal(res.type, "simulation");
    assert.ok(res.scenarioInputs.opexReductionRate === 0.1);
    assert.ok(res.scenarioInputs.opexReductionTarget === "fixed");
    assert.ok(res.runwayImpact != null);
  });

  it("simulates gross margin improvement", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("What if gross margin improves to 70%?", sim);
    assert.equal(res.type, "simulation");
    assert.ok(res.scenarioInputs.cogsPercent < sim.inputs.cogsPercent);
  });

  it("simulates payroll increase", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("What if payroll increases by ₹50000?", sim);
    assert.equal(res.type, "simulation");
    assert.ok(res.scenarioInputs.monthlyPayroll > sim.inputs.monthlyPayroll);
  });

  it("simulates marketing increase via double marketing prompt", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("What if I double marketing?", sim);
    assert.equal(res.type, "simulation");
    assert.ok(res.scenarioInputs.salesMarketingPercent > sim.inputs.salesMarketingPercent);
  });

  it("simulates funding delay", () => {
    const sim = run({
      equityEvents: [{ monthIndex: 6, amount: 5_000_000 }],
    });
    const res = askAiCfo("What happens if fundraising is delayed by 4 months?", sim);
    assert.equal(res.type, "simulation");
    assert.equal(res.scenarioInputs.equityEvents[0].monthIndex, 10);
  });

  it("handles multi-variable scenario", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo(
      "What if revenue growth increases to 8% and we cut fixed costs by 10%?",
      sim,
    );
    assert.equal(res.type, "simulation");
    assert.ok(res.scenarioInputs.opexReductionRate === 0.1);
    assert.ok(res.assumptionChanges?.length >= 2);
  });

  it("scenario overlay uses simulated closing cash distinct from base", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("What if I reduce fixed costs by 10%?", sim);
    const baseClosing = sim.months.map((m) => m.closingCash);
    const scenClosing = res.scenarioSim.months.map((m) => m.closingCash);
    assert.notDeepEqual(baseClosing, scenClosing);
  });

  it("apply scenario inputs differ from base until explicit apply", () => {
    const sim = lowRunwaySim();
    const snapshot = cloneInputs(sim.inputs);
    const res = askAiCfo("What if fixed costs fall 15%?", sim);
    assert.notEqual(res.scenarioInputs.opexReductionRate, snapshot.opexReductionRate);
    assert.equal(sim.inputs.opexReductionRate, snapshot.opexReductionRate);
  });

  it("goal-seek runway returns scenario meeting target", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("How much do I need to reduce costs to reach 12 months runway?", sim);
    assert.ok(["goal_seek", "simulation", "find_path"].includes(res.type));
    const targetSim = res.scenarioSim || res.paths?.[0]?.scenarioSim;
    assert.ok(targetSim);
    assert.ok(targetSim.kpis.runwayMonths >= 12);
  });

  it("goal-seek EBITDA uses deterministic outputs", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("What revenue growth would make us EBITDA positive?", sim);
    assert.equal(res.type, "goal_seek");
    assert.ok(res.scenarioSim.months.some((m) => m.ebitda > 0));
  });

  it("unsupported requests trigger clarification", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("What if we expand aggressively?", sim);
    assert.equal(res.type, "clarify");
    assert.ok(res.clarify?.options?.length > 0);
  });

  it("currency formatting follows selected currency", () => {
    const sim = run({ currency: "USD", currentCashBalance: 1_000_000 });
    const res = askAiCfo("Why is my runway only this long?", sim);
    const cashBullet = res.bullets?.find((b) => b.label === "Opening cash");
    assert.ok(cashBullet?.value.includes("$"));
    assert.ok(formatMoney(1000, { currency: "USD" }).includes("$"));
  });

  it("buildSuggestedPrompts uses calculated runway not hardcoded value", () => {
    const sim = lowRunwaySim();
    const prompts = buildSuggestedPrompts(sim);
    const rw = Number(sim.kpis.runwayMonths).toFixed(1);
    const whyPrompt = prompts.find((p) => p.id === "why-runway");
    assert.ok(whyPrompt.label.includes(rw));
  });

  it("evaluate hiring asks for cost per head then simulates", () => {
    const sim = lowRunwaySim();
    const clarify = askAiCfo("Can I afford 5 more engineers?", sim);
    assert.equal(clarify.type, "clarify");
    assert.equal(clarify.pendingAction?.awaiting, "costPerHead");
    const res = askAiCfo("80000", sim, { pendingAction: clarify.pendingAction });
    assert.equal(res.type, "affordability");
    assert.ok(res.scenario.runwayMonths < res.base.runwayMonths);
  });

  it("find path compares multiple levers for runway target", () => {
    const sim = lowRunwaySim();
    const res = askAiCfo("How can I reach 12 months runway?", sim);
    assert.equal(res.type, "find_path");
    assert.ok(res.paths?.length >= 1);
    for (const path of res.paths) {
      assert.ok(path.runway >= 12);
      assert.ok(["High", "Medium", "Low"].includes(path.difficulty));
    }
  });

  it("parseAiCfoQuestion maps explain burn intent", () => {
    assert.equal(parseAiCfoQuestion("Why am I losing cash?").type, "explain_burn");
  });
});
