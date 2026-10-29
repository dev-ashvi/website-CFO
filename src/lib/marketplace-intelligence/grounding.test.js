import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAskPayload,
  createMarketplaceSession,
  investigate,
  requestSampleDataset,
  runMarketplaceEngine,
  selectEvidenceMetrics,
} from "./index.js";

const QUESTIONS = [
  { sectionId: "topline", q: "Why did sales decline after July?" },
  { sectionId: "topline", q: "Is the decline caused by fewer orders or smaller baskets?" },
  { sectionId: "product_performance", q: "Is my revenue too concentrated?" },
  { sectionId: "product_performance", q: "Which products carry the highest fee burden?" },
  { sectionId: "amazon_economics", q: "How much is being spent on advertising?" },
  { sectionId: "profitability", q: "Why are sales and settlement proceeds different?" },
  { sectionId: "profitability", q: "Can we calculate actual profitability?" },
  { sectionId: "profitability", q: "Are there reconciliation discrepancies?" },
  { sectionId: "product_performance", q: "Which products are growing or declining?" },
  { sectionId: "product_performance", q: "How do bulk orders affect product rankings?" },
  { sectionId: "amazon_economics", q: "What is the fee burden by order size?" },
];

describe("marketplace Ask WYZ financial grounding", () => {
  it("answers representative questions without inventing profit or raw files", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    assert.equal(engine.metrics.status, "calculated");

    for (const item of QUESTIONS) {
      const response = investigate(item.q, { sectionId: item.sectionId }, engine.metrics, engine.reconciliation);
      assert.equal(response.status, "answered", item.q);
      assert.ok(response.answer, item.q);
      assert.equal(/margin of 40|profit is ₹[0-9]/i.test(response.answer), false, `invented profit for: ${item.q}`);
      if (/profitability|cogs|actual profit/i.test(item.q)) {
        assert.match(response.answer, /cannot|not provided|withheld|COGS|costs/i);
      }
      const payload = buildAskPayload({
        question: item.q,
        metrics: engine.metrics,
        reconciliation: engine.reconciliation,
        context: { sectionId: item.sectionId },
        guided: response,
      });
      assert.equal(JSON.stringify(payload).includes('"bytes"'), false, item.q);
      assert.equal(payload.evidence.productProfitAvailable, false);
    }
  });

  it("exposes product monthly, fee-by-size, and bulk impact evidence when calculated", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const evidence = selectEvidenceMetrics(engine.metrics, engine.reconciliation, {
      sectionId: "product_performance",
    });
    assert.ok(Array.isArray(evidence.productMonthly));
    assert.ok(Array.isArray(evidence.feeBurdenByOrderSize));
    assert.ok(evidence.bulkImpact);
    assert.equal(JSON.stringify(evidence).includes("orderId"), false);

    const growth = investigate("Which products are growing or declining?", {
      sectionId: "product_performance",
    }, engine.metrics);
    assert.match(growth.answer, /top products|monthly|MoM|unavailable/i);

    const bulk = investigate("How do bulk orders affect product rankings?", {
      sectionId: "product_performance",
    }, engine.metrics);
    assert.match(bulk.answer, /bulk|rank|candidates/i);
  });

  it("keeps dashboard KPI numbers as the evidence source of truth", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const response = investigate("Where is Amazon taking the money?", {
      sectionId: "amazon_economics",
    }, engine.metrics);
    const ads = response.evidence.find((row) => /advertis/i.test(row.label) || row.metricId === "advertising");
    assert.ok(ads);
    assert.equal(ads.value, engine.metrics.kpis.advertising);
  });
});
