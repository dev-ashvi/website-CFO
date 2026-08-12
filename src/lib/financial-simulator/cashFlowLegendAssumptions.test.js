import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCashFlowLegendAssumptions,
  CASH_FLOW_INTELLIGENCE_LABELS,
  buildCostContribution,
} from "./cashMovementInsight.js";
import { getScenario4FormInputs } from "./scenarioFormPresets.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";
import { calculateProjection } from "./calculateProjection.js";

describe("Cash Flow Intelligence legend assumptions", () => {
  it("resolves legend assumptions from normalized inputs (Scenario 4 shape)", () => {
    const inputs = normalizeFormInputs(getScenario4FormInputs());
    assert.equal(inputs.cogsPercent, 0.35);
    assert.equal(inputs.otherDirectCostsPercent, 0.05);
    assert.equal(inputs.productTechPercent, 0.4);
    assert.equal(inputs.salesMarketingPercent, 0.2);
    assert.equal(inputs.monthlyPayroll, 150_000);
    assert.equal(inputs.otherFixedCosts, 75_000);
    assert.deepEqual(inputs.capexEvents, [{ monthIndex: 1, amount: 1_000_000 }]);

    const legend = buildCashFlowLegendAssumptions(inputs, "INR");

    assert.equal(legend.cogs.inputValue, 0.35);
    assert.equal(legend.otherDirectCosts.inputValue, 0.05);
    assert.equal(legend.productAndTechnology.inputValue, 0.4);
    assert.equal(legend.salesAndMarketing.inputValue, 0.2);
    assert.equal(legend.payroll.inputValue, 150_000);
    assert.equal(legend.otherFixedCosts.inputValue, 75_000);
    assert.equal(legend.capex.inputValue, 1_000_000);

    assert.equal(legend.cogs.legendText, "COGS · 35% of revenue");
    assert.equal(legend.otherDirectCosts.legendText, "Other direct costs · 5% of revenue");
    assert.equal(
      legend.productAndTechnology.legendText,
      "Fulfillment & other variable costs · 40% of revenue",
    );
    assert.equal(legend.salesAndMarketing.legendText, "Sales & Marketing costs · 20% of revenue");
    assert.match(legend.payroll.legendText, /Salary \/ Payroll · ₹1,50,000 \/ month/);
    assert.match(legend.otherFixedCosts.legendText, /Other fixed costs · ₹75,000 \/ month/);
    assert.match(legend.capex.legendText, /CapEx · ₹10,00,000 planned/);

    assert.equal(
      legend.productAndTechnology.label,
      CASH_FLOW_INTELLIGENCE_LABELS.productAndTechnology,
    );
    assert.equal(legend.productAndTechnology.label, "Fulfillment & other variable costs");
    assert.ok(!/Product & technology/i.test(JSON.stringify(legend)));
    assert.ok(!/\(\d+%\)/.test(legend.cogs.legendText));
  });

  it("maps productAndTechnology internal field to Fulfillment label in cost contribution", () => {
    const inputs = normalizeFormInputs(getScenario4FormInputs());
    const months = calculateProjection(inputs);
    const cc = buildCostContribution(months[0]);
    const fulfillment = cc.categories.find((c) => c.key === "productAndTechnology");
    assert.ok(fulfillment);
    assert.equal(fulfillment.label, "Fulfillment & other variable costs");
    assert.equal(fulfillment.group, "variable");
    const sm = cc.categories.find((c) => c.key === "salesAndMarketing");
    assert.equal(sm.label, "Sales & Marketing costs");
    assert.equal(sm.group, "variable");
  });

  it("uses actual input percents dynamically (not hardcoded Scenario 4)", () => {
    const legend = buildCashFlowLegendAssumptions(
      {
        cogsPercent: 0.22,
        otherDirectCostsPercent: 0.08,
        productTechPercent: 0.15,
        salesMarketingPercent: 0.33,
        monthlyPayroll: 200_000,
        otherFixedCosts: 50_000,
        capexEvents: [],
        currency: "INR",
      },
      "INR",
    );
    assert.equal(legend.cogs.legendText, "COGS · 22% of revenue");
    assert.equal(legend.productAndTechnology.legendText, "Fulfillment & other variable costs · 15% of revenue");
    assert.equal(legend.salesAndMarketing.legendText, "Sales & Marketing costs · 33% of revenue");
    assert.match(legend.capex.legendText, /none planned/);
  });
});
