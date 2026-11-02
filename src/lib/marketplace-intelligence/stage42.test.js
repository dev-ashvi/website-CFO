import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  askMarketplaceWyz,
  buildAskPayload,
  createMarketplaceSession,
  formatMonthLabel,
  humanizePeriodLabels,
  investigate,
  normalizeAmazonCsvText,
  presentAskExplanation,
  calculateMarketplace,
  requestSampleDataset,
  runMarketplaceEngine,
  selectEvidenceMetrics,
  validateAskPayload,
  validateInrCurrencyPresentation,
} from "./index.js";

const REAL_CSV = "C:/Users/apoor/Downloads/Transactions for time period 1_4_2026 - 30_9_2026.csv";

describe("stage 4.2 currency and presentation", () => {
  it("rejects USD / foreign currency claims without rewriting amounts", () => {
    assert.equal(validateInrCurrencyPresentation("Sales fell to $12,000 in September.").ok, false);
    assert.equal(validateInrCurrencyPresentation("Gross Product Sales fell to USD 12000.").ok, false);
    assert.equal(validateInrCurrencyPresentation("Gross Product Sales fell to ₹12,000.").ok, true);

    const presented = presentAskExplanation({
      aiExplanation: "August sales were $35,000 and September fell to $17,000.",
      guidedAnswer: "Gross Product Sales fell from ₹30,000 in August 2026 to ₹17,000 in September 2026.",
      question: "What happened from August to September?",
      source: "ai",
    });
    assert.equal(presented.liveRejected, true);
    assert.equal(presented.source, "guided");
    assert.match(presented.explanation, /₹30,000/);
    assert.equal(presented.explanation.includes("$"), false);
  });

  it("rejects unsupported report currency codes", () => {
    assert.equal(validateInrCurrencyPresentation("ok", "USD").ok, false);
    assert.equal(validateInrCurrencyPresentation("ok", "INR").ok, true);
  });

  it("humanizes internal period labels without inventing values", () => {
    assert.equal(formatMonthLabel("2026-09"), "September 2026");
    assert.equal(formatMonthLabel("2026-08", { style: "short" }), "Aug 2026");
    assert.equal(
      humanizePeriodLabels("Sales declined from 2026-08 to 2026-09."),
      "Sales declined from August 2026 to September 2026.",
    );
  });

  it("falls back when AI conflates gross and net sales bases", () => {
    const presented = presentAskExplanation({
      aiExplanation: "Gross product sales after refunds are the same as net, so treat net as gross for August.",
      guidedAnswer: "Gross Product Sales fell from ₹30,000 in August 2026 to ₹17,000 in September 2026.",
      question: "How did August and September Gross Product Sales move?",
      source: "ai",
    });
    assert.equal(presented.liveRejected, true);
    assert.match(presented.explanation, /Gross Product Sales fell/);
  });

  it("puts INR currency contract into evidence payloads", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const evidence = selectEvidenceMetrics(engine.metrics, engine.reconciliation, { sectionId: "topline" });
    assert.equal(evidence.currency, "INR");
    assert.equal(evidence.currencySymbol, "₹");
    assert.match(evidence.amountPresentation, /Indian rupees/i);
    assert.equal(evidence.terminology.grossProductSales, "Gross Product Sales");
    const payload = buildAskPayload({
      question: "How did monthly sales move?",
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      context: { sectionId: "topline" },
      guided: investigate("How did monthly sales move?", { sectionId: "topline" }, engine.metrics),
    });
    assert.equal(validateAskPayload(payload).ok, true);
    assert.equal(payload.evidence.currency, "INR");
  });
});

describe("stage 4.2 August–September decline + Ask client gates", () => {
  it("answers August–September decline with INR and human months on TUMMYMUMMY", () => {
    if (!existsSync(REAL_CSV)) return;
    const metrics = calculateMarketplace(normalizeAmazonCsvText(readFileSync(REAL_CSV, "utf8")));
    const response = investigate(
      "What happened to sales from August to September?",
      { sectionId: "topline" },
      metrics,
    );
    assert.match(response.answer, /August 2026/);
    assert.match(response.answer, /September 2026/);
    assert.match(response.answer, /Gross Product Sales/);
    assert.match(response.answer, /Indian rupees|₹/);
    assert.equal(response.answer.includes("$"), false);
    assert.equal(/2026-0[89]/.test(response.answer), false);
    assert.equal(response.currency, "INR");
  });

  it("rejects live USD hallucination and keeps guided evidence numbers", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const fetchImpl = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        explanation: "Sales declined from $4,200 in August to $3,500 in September.",
        limitations: [],
        followUps: ["Check order volume"],
        chartRefs: ["monthly-sales"],
        source: "ai",
        provider: "nvidia_nim",
        model: "openai/gpt-oss-20b",
      }),
    }));
    const response = await askMarketplaceWyz({
      question: "How did August and September sales move?",
      context: { sectionId: "topline" },
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      fetchImpl,
    });
    assert.equal(response.liveRejected, true);
    assert.equal(response.liveModel, false);
    assert.equal(response.source, "guided");
    assert.equal(response.answer.includes("$"), false);
    assert.ok(response.evidence.length > 0);
  });

  it("falls back on API failure and rate limiting without inventing figures", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const fail = await askMarketplaceWyz({
      question: "Where is Amazon taking the money?",
      context: { sectionId: "amazon_economics" },
      metrics: engine.metrics,
      fetchImpl: mock.fn(async () => ({ ok: false, status: 500 })),
    });
    assert.equal(fail.source, "guided");
    assert.equal(fail.status, "provider_error");
    assert.ok(fail.answer);

    const limited = await askMarketplaceWyz({
      question: "Where is Amazon taking the money?",
      context: { sectionId: "amazon_economics" },
      metrics: engine.metrics,
      fetchImpl: mock.fn(async () => ({ ok: false, status: 429 })),
    });
    assert.equal(limited.status, "rate_limited");
    assert.match(limited.answer, /rate-limited/i);
  });
});
