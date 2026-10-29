import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  buildSampleDataset,
  calculateMarketplace,
  countDistinctOrders,
  createEmptyFilters,
  createMarketplaceSession,
  investigate,
  normalizeAmazonCsvText,
  normalizeProductName,
  parseIndianNumber,
  parseUnifiedSummaryPdf,
  requestSampleDataset,
  runMarketplaceEngine,
} from "./index.js";

const REAL_CSV = "C:/Users/apoor/Downloads/Transactions for time period 1_4_2026 - 30_9_2026.csv";
const REAL_PDF = "C:/Users/apoor/Downloads/2026Apr1-2026Sep30CustomUnifiedSummary.pdf";

describe("marketplace intelligence money parsing", () => {
  it("parses Indian and negative amounts", () => {
    assert.equal(parseIndianNumber("1,12,517.41").value, 112517.41);
    assert.equal(parseIndianNumber("-4,742.99").value, -4742.99);
    assert.equal(parseIndianNumber("(100.50)").value, -100.5);
    assert.equal(parseIndianNumber("").empty, true);
    assert.ok(parseIndianNumber("12.3.4").error);
  });
});

describe("marketplace intelligence correctness helpers", () => {
  it("groups truncated product names and counts distinct orders", () => {
    assert.equal(
      normalizeProductName("TUMMY & MUMMY Lemon Ginger Syrup 650ml,"),
      normalizeProductName("TUMMY & MUMMY Lemon Ginger Syrup 650ml |"),
    );
    assert.equal(normalizeProductName("Demo Rose Syrup 500ml..."), "Demo Rose Syrup 500ml");

    const stats = countDistinctOrders([
      { orderId: "A-1" },
      { orderId: "A-1" },
      { orderId: "A-2" },
      { orderId: "---" },
      { orderId: null },
    ]);
    assert.equal(stats.orderCount, 4);
    assert.equal(stats.distinctOrderIds, 2);
    assert.equal(stats.paymentRows, 5);
  });

  it("builds a sequential waterfall that lands on settlement movement", () => {
    const sample = buildSampleDataset();
    const normalized = normalizeAmazonCsvText(sample.csvText);
    const metrics = calculateMarketplace({ ...normalized, summary: sample.summary });
    const steps = metrics.sections.profitability.waterfall.steps;
    assert.equal(steps[0].kind, "start");
    assert.equal(steps[0].id, "gross_product_sales");
    const result = steps.find((step) => step.kind === "result");
    assert.equal(result.amount, metrics.kpis.netSettlementMovement);
    const bank = steps.find((step) => step.id === "bank_transfers");
    assert.equal(bank.kind, "info");
    assert.equal(bank.runningBalance, null);
    assert.equal(metrics.sections.profitability.waterfall.complete, true);

    const products = metrics.sections.product_performance.products;
    assert.ok(products.every((row) => Object.prototype.hasOwnProperty.call(row, "revenueShare")));
    assert.equal(Object.prototype.hasOwnProperty.call(products[0], "contribution"), false);
  });
});

describe("marketplace intelligence sample engine", () => {
  it("calculates sample metrics without inventing profit", async () => {
    const loaded = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(loaded.session);
    assert.equal(engine.normalized.status, "ready");
    assert.equal(engine.metrics.status, "calculated");
    assert.equal(engine.metrics.kpis.productProfit, null);
    assert.equal(engine.metrics.kpis.unitsSold, null);
    assert.ok(engine.metrics.kpis.grossProductSales > 0);
    assert.ok(engine.metrics.kpis.orderCount >= 1);
    assert.equal(engine.metrics.sections.amazon_economics.referralFeesAvailable, false);

    const unknown = engine.metrics.transactions.filter((tx) => tx.unknown);
    assert.ok(unknown.length >= 1);

    const answer = investigate(
      "Where is Amazon taking the money?",
      { sectionId: "amazon_economics", sessionId: loaded.session.id },
      engine.metrics,
    );
    assert.equal(answer.status, "answered");
    assert.equal(answer.liveModel, false);
    assert.ok(answer.evidence.length > 0);
    assert.match(answer.answer, /Advertising|selling fees/i);
  });

  it("supports date filters and missing PDF analytics", async () => {
    const sample = buildSampleDataset();
    const normalized = normalizeAmazonCsvText(sample.csvText);
    const filtered = calculateMarketplace(normalized, {
      ...createEmptyFilters(),
      dateRange: { start: "2026-07-01", end: "2026-07-31" },
    });
    assert.equal(filtered.status, "calculated");
    assert.ok(filtered.kpis.orderCount < calculateMarketplace(normalized).kpis.orderCount);

    const session = {
      ...createMarketplaceSession(),
      mode: "sample",
      sampleDataset: { ...sample, summary: null },
    };
    const engine = await runMarketplaceEngine(session);
    assert.equal(engine.reconciliation.status, "pdf_missing");
    assert.equal(engine.metrics.status, "calculated");
  });

  it("rejects malformed CSV headers", () => {
    const bad = normalizeAmazonCsvText("a,b,c\n1,2,3\n");
    assert.equal(bad.ok, false);
    assert.equal(bad.issues[0].code, "unsupported_csv_format");
  });
});

describe("marketplace intelligence client golden fixtures", () => {
  it("reconciles supplied Amazon reports when present locally", async () => {
    if (!existsSync(REAL_CSV) || !existsSync(REAL_PDF)) {
      return;
    }
    const csvText = readFileSync(REAL_CSV, "utf8");
    const normalized = normalizeAmazonCsvText(csvText);
    assert.equal(normalized.ok, true);
    assert.ok(normalized.transactions.length > 200);

    const pdf = await parseUnifiedSummaryPdf(new Uint8Array(readFileSync(REAL_PDF)));
    assert.equal(pdf.ok, true);
    assert.equal(pdf.summary.income, 112517.41);
    assert.equal(pdf.summary.expenses, -12757.72);
    assert.equal(pdf.summary.netGstCollected, 6633.89);
    assert.equal(pdf.summary.transfers, -100585.29);

    const withSummary = { ...normalized, summary: pdf.summary };
    const metrics = calculateMarketplace(withSummary);
    assert.equal(metrics.status, "calculated");
    assert.equal(metrics.kpis.productProfit, null);
    assert.ok(Math.abs(metrics.kpis.grossProductSales - 104994.21) < 0.02);
    assert.ok(Math.abs(metrics.kpis.advertising - -4742.99) < 0.02);
    assert.ok(Math.abs(metrics.kpis.inboundTransportation - -1488.14) < 0.02);
    assert.ok(metrics.kpis.top8Concentration != null);
    assert.ok(metrics.kpis.top8Concentration < 1);
    assert.equal(metrics.sections.profitability.waterfall.complete, true);
    assert.equal(
      metrics.sections.profitability.waterfall.steps.find((s) => s.kind === "result").amount,
      metrics.kpis.netSettlementMovement,
    );

    // Lemon Ginger truncated variants should group after name normalization.
    const lemon = metrics.sections.product_performance.products.filter((p) =>
      /Lemon Ginger Syrup 650ml$/i.test(p.productName),
    );
    assert.equal(lemon.length, 1);

    const orders = metrics.transactions.filter((tx) => tx.classification.kind === "order_payment");
    const orderStats = countDistinctOrders(orders);
    assert.equal(metrics.kpis.orderCount, orderStats.orderCount);

    const refunds = metrics.transactions.filter((tx) => tx.classification.kind === "refund");
    assert.ok(refunds.length >= 1);

    const duplicateOrders = metrics.transactions.filter((tx) => tx.orderId === "406-1400779-9241134");
    assert.ok(duplicateOrders.length >= 2);

    const engineSession = createMarketplaceSession();
    const csvBytes = new TextEncoder().encode(csvText);
    engineSession.mode = "upload";
    engineSession.files.transactionsCsv = {
      fileName: "transactions.csv",
      byteLength: csvBytes.byteLength,
      mediaType: "text/csv",
      bytes: csvBytes,
      formatId: "amazon_transaction_csv_v1",
      validation: "extension_only",
      detection: "pending",
      parsed: false,
    };
    engineSession.files.unifiedSummaryPdf = {
      fileName: "summary.pdf",
      byteLength: readFileSync(REAL_PDF).byteLength,
      mediaType: "application/pdf",
      bytes: new Uint8Array(readFileSync(REAL_PDF)),
      formatId: "amazon_unified_summary_pdf_v1",
      validation: "extension_only",
      detection: "pending",
      parsed: false,
    };
    const engine = await runMarketplaceEngine(engineSession);
    assert.equal(engine.reconciliation.summaryTotals.income, 112517.41);
    assert.equal(engine.reconciliation.summaryTotals.expenses, -12757.72);
    assert.equal(engine.reconciliation.summaryTotals.netGstCollected, 6633.89);
    assert.equal(engine.reconciliation.summaryTotals.transfers, -100585.29);

    const byId = Object.fromEntries(engine.reconciliation.comparisons.map((row) => [row.id, row]));
    assert.equal(byId.refunds.status, "matched");
    assert.equal(byId.advertising.status, "matched");
    assert.equal(byId.inbound.status, "matched");
    assert.equal(byId.income.status, "not_comparable");
    assert.equal(byId.expenses.status, "not_comparable");
    assert.equal(byId.settlement_vs_transfers.status, "not_comparable");
    assert.equal(byId.net_gst.status, "missing_information");
    assert.equal(byId.bank_transfers.status, "missing_information");
    assert.equal(byId.product_sales.status, "difference");
    assert.equal(byId.promotional_rebates.status, "difference");
    assert.ok(engine.reconciliation.differences.every((row) => row.comparable));
    assert.ok(engine.reconciliation.notComparable.every((row) => row.comparable === false));
  });
});
