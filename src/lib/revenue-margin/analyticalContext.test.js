import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  marginTableColumns,
  revenueTableColumns,
  suggestedAiQuestions,
} from "./analyticalContext.js";

describe("explorer cleanup helpers", () => {
  it("hides duplicate net revenue metric column in revenue table", () => {
    const cols = revenueTableColumns([{ net_revenue: 100 }], { id: "net_revenue" });
    assert.equal(cols.showPrimaryMetric, false);
  });

  it("hides growth columns when growth is unavailable", () => {
    const cols = revenueTableColumns([{ net_revenue: 100, growth: { available: false } }], { id: "gross_revenue" });
    assert.equal(cols.showGrowth, false);
    assert.equal(cols.showContribution, false);
  });

  it("shows margin orders and aov when query rows include values", () => {
    const cols = marginTableColumns([{ orders: 12, net_aov: 900 }]);
    assert.equal(cols.showOrders, true);
    assert.equal(cols.showAov, true);
  });

  it("hides margin orders and aov when values are missing", () => {
    const cols = marginTableColumns([{ net_revenue: 100 }]);
    assert.equal(cols.showOrders, false);
    assert.equal(cols.showAov, false);
  });

  it("generates margin suggested questions with attributed marketing terminology context", () => {
    const questions = suggestedAiQuestions({ surface: "margin", signals: [], filters: {} });
    assert.ok(questions.some((item) => item.includes("CM2")));
    assert.ok(!questions.some((item) => /stop selling|should we/i.test(item)));
  });

  it("adds signal-aware suggested questions without an LLM call", () => {
    const questions = suggestedAiQuestions({
      surface: "margin",
      signals: [{ entity: "D2C Website", label: "Positive CM1 / Negative CM2" }],
    });
    assert.ok(questions.some((item) => item.includes("D2C Website")));
  });

  it("uses channel and category filters for deterministic suggestions", () => {
    const questions = suggestedAiQuestions({
      surface: "margin",
      filters: { channel: ["Amazon"], category: ["Lips"] },
    });
    assert.ok(questions.some((item) => item.toLowerCase().includes("sku")));
    assert.ok(!questions.some((item) => /stop selling|should we|falls 20/i.test(item)));
  });
});
