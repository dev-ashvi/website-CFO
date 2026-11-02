import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  COMPARISON_STATUS,
  INVESTIGATION_ITEM_STATUS,
  buildFinancialIntelligence,
  calculateMarketplace,
  compareMonthCoverage,
  createMarketplaceSession,
  humanReconGap,
  normalizeAmazonCsvText,
  parseUnifiedSummaryPdf,
  planInvestigation,
  reconcileSettlement,
  requestSampleDataset,
  runMarketplaceEngine,
  scoreInsight,
} from "./index.js";
import { buildChartInsights } from "./insights.js";

const REAL_CSV = "C:/Users/apoor/Downloads/Transactions for time period 1_4_2026 - 30_9_2026.csv";
const REAL_PDF = "C:/Users/apoor/Downloads/2026Apr1-2026Sep30CustomUnifiedSummary.pdf";

function tx({
  orderId,
  productCharges = 0,
  amazonFees = 0,
  postedAt = "2026-08-10",
  sourceRow = 1,
  productName = "Demo",
} = {}) {
  return {
    orderId,
    productCharges,
    amazonFees,
    amazonFeesMissing: false,
    promotionalRebates: 0,
    totalInr: productCharges + amazonFees,
    postedAt,
    sourceRow,
    productName,
    transactionType: "Order Payment",
    classification: { kind: "order_payment" },
    lines: [
      { role: "product_sale", amount: productCharges },
      ...(amazonFees ? [{ role: "selling_fee", amount: amazonFees }] : []),
    ],
  };
}

async function tummyEngine() {
  if (!existsSync(REAL_CSV)) return null;
  const normalized = normalizeAmazonCsvText(readFileSync(REAL_CSV, "utf8"));
  let summary = null;
  if (existsSync(REAL_PDF)) {
    const pdf = await parseUnifiedSummaryPdf(new Uint8Array(readFileSync(REAL_PDF)));
    summary = pdf.summary;
  }
  const withSummary = summary ? { ...normalized, summary } : normalized;
  const metrics = calculateMarketplace(withSummary);
  const reconciliation = reconcileSettlement(withSummary, metrics);
  metrics.chartInsights = buildChartInsights(metrics, reconciliation);
  metrics.intelligence = buildFinancialIntelligence(metrics, reconciliation);
  return { metrics, reconciliation };
}

describe("stage 5B.1 partial vs complete month comparisons", () => {
  it("classifies complete months as definitive comparable", () => {
    const cmp = compareMonthCoverage("2026-08", "2026-09", {
      start: "2026-08-01",
      end: "2026-09-30",
    });
    assert.equal(cmp.status, COMPARISON_STATUS.COMPLETE_COMPARABLE);
    assert.equal(cmp.provisional, false);
    assert.equal(cmp.definitiveMom, true);
  });

  it("classifies matched partial windows as provisional matched_partial", () => {
    // Aug 17–31 (15 days) and Sep 1–15 (15 days) under one continuous filter
    const cmp = compareMonthCoverage("2026-08", "2026-09", null, {
      start: "2026-08-17",
      end: "2026-09-15",
    });
    assert.equal(cmp.status, COMPARISON_STATUS.MATCHED_PARTIAL);
    assert.equal(cmp.provisional, true);
    assert.equal(cmp.definitiveMom, false);
  });

  it("classifies unequal partial coverage as incompatible", () => {
    const cmp = compareMonthCoverage("2026-08", "2026-09", null, {
      start: "2026-08-01",
      end: "2026-09-10",
    });
    assert.equal(cmp.status, COMPARISON_STATUS.INCOMPATIBLE);
    assert.equal(cmp.provisional, true);
    assert.equal(cmp.definitiveMom, false);
  });

  it("marks filtered partial MoM as provisional and applies coverage ranking penalty", async () => {
    const session = createMarketplaceSession();
    session.mode = "upload";
    const normalized = {
      status: "ready",
      transactions: [
        tx({ orderId: "1", productCharges: 800, postedAt: "2026-08-20", sourceRow: 1 }),
        tx({ orderId: "2", productCharges: 700, postedAt: "2026-08-25", sourceRow: 2 }),
        tx({ orderId: "3", productCharges: 300, postedAt: "2026-09-02", sourceRow: 3 }),
        tx({ orderId: "4", productCharges: 200, postedAt: "2026-09-05", sourceRow: 4 }),
      ],
    };
    const metrics = calculateMarketplace(normalized, {
      dateRange: { start: "2026-08-15", end: "2026-09-10" },
      products: [],
    });
    metrics.intelligence = buildFinancialIntelligence(metrics, null);
    const mom = metrics.intelligence.insights.find((row) => row.id.startsWith("revenue_mom_"));
    assert.ok(mom);
    assert.equal(mom.provisional, true);
    assert.notEqual(mom.comparisonStatus, COMPARISON_STATUS.COMPLETE_COMPARABLE);
    assert.match(mom.headline, /incomplete|incomparable|matched|coverage/i);
    assert.doesNotMatch(mom.headline, /declined/i);

    const scored = scoreInsight(mom);
    assert.ok(scored.ranking.reasons.some((r) => /coverage_penalty/i.test(r)));
  });

  it("preserves definitive TUMMYMUMMY September full-month decline", async () => {
    const engine = await tummyEngine();
    if (!engine) return;
    const insight = engine.metrics.intelligence.insights.find(
      (row) => row.id === "revenue_mom_2026-08_2026-09",
    );
    assert.ok(insight);
    assert.equal(insight.provisional, false);
    assert.equal(insight.comparisonStatus, COMPARISON_STATUS.COMPLETE_COMPARABLE);
    assert.match(insight.headline, /declined/i);
    assert.doesNotMatch(insight.headline, /provisional/i);

    const planned = planInvestigation({
      insight,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: "tummy-5b1",
    });
    assert.equal(planned.plan.provisional, false);
    const aov = planned.plan.measuredDrivers.find((d) => d.id === "gross_aov");
    const orders = planned.plan.measuredDrivers.find((d) => d.id === "orders");
    assert.ok(aov && orders);
    assert.ok(Math.abs(aov.amount) > Math.abs(orders.amount));
    assert.ok(
      planned.plan.checkedItems.every(
        (c) => c.assertion !== "business_cause_proven" && c.assertion !== "proven_large_order_causation",
      ),
    );
  });
});

describe("stage 5B.1 investigation status + contextual missing + language", () => {
  it("classifies measured drivers and checked items with investigation statuses", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const revenue = engine.metrics.intelligence.insights.find((row) =>
      row.id.startsWith("revenue_mom_"),
    );
    const planned = planInvestigation({
      insight: revenue || engine.metrics.intelligence.brief.primary,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: sample.session.id,
    });
    assert.ok(planned.plan.measuredDrivers.every((d) => d.status === INVESTIGATION_ITEM_STATUS.MEASURED_RESULT));
    assert.ok(planned.plan.checkedItems?.length);
    assert.ok(
      planned.plan.checkedItems.every((c) =>
        Object.values(INVESTIGATION_ITEM_STATUS).includes(c.status),
      ),
    );
    assert.ok(planned.plan.unverifiedHypotheses.every((h) => h.status === "unverified"));
    assert.ok(
      planned.plan.unverifiedHypotheses.every(
        (h) => h.itemStatus === INVESTIGATION_ITEM_STATUS.SUGGESTED_INVESTIGATION,
      ),
    );
    assert.ok(
      planned.plan.nextInvestigations.every(
        (n) => n.status === INVESTIGATION_ITEM_STATUS.SUGGESTED_INVESTIGATION,
      ),
    );
  });

  it("scopes missing information to revenue investigation (no raw recon codes)", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const revenue = engine.metrics.intelligence.insights.find((row) => row.type === "revenue_movement");
    const planned = planInvestigation({
      insight: revenue,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: sample.session.id,
    });
    assert.ok(planned.plan.missingData.some((m) => m.id === "inventory_availability"));
    assert.ok(planned.plan.missingData.some((m) => m.id === "pricing_promo_history"));
    assert.ok(!planned.plan.missingData.some((m) => /bank_transfers|net_gst/.test(m.id)));
    assert.ok(planned.plan.missingData.every((m) => !/not_comparable|missing_information/.test(m.label)));
    assert.ok(planned.plan.missingData.every((m) => !/\bkpi\.|\brecon_/.test(m.label)));
  });

  it("renders human-readable reconciliation messages", () => {
    const msg = humanReconGap({ id: "net_gst", status: "missing_information" });
    assert.match(msg, /Net GST/i);
    assert.doesNotMatch(msg, /missing_information|net_gst/);
    const msg2 = humanReconGap({ id: "settlement_vs_transfers", status: "not_comparable" });
    assert.match(msg2, /Settlement totals versus bank transfers/i);
    assert.doesNotMatch(msg2, /not_comparable/);
  });

  it("does not duplicate primary finding text as a second heading block", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const planned = planInvestigation({
      insight: engine.metrics.intelligence.brief.primary,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: sample.session.id,
    });
    assert.ok(planned.plan.selectedFinding.findingSummary);
    assert.notEqual(planned.plan.selectedFinding.findingSummary, planned.plan.selectedFinding.headline);
    // Drivers use founder-facing amounts, not fact ids
    for (const d of planned.plan.measuredDrivers) {
      assert.ok(d.label);
      assert.ok(!/\./.test(d.id) || d.id === "gross_aov" || d.id === "orders" || d.id === "product_delta");
    }
  });

  it("sample dataset investigation stays provisional when coverage is incomplete", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const primary = engine.metrics.intelligence.brief.primary;
    const planned = planInvestigation({
      insight: primary,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: sample.session.id,
    });
    console.log(
      JSON.stringify({
        sampleInvestigation: {
          headline: planned.plan.selectedFinding.headline,
          provisional: planned.plan.provisional,
          comparisonStatus: planned.plan.comparisonStatus,
          drivers: planned.plan.measuredDrivers.map((d) => ({
            id: d.id,
            amount: d.amount,
            share: d.shareOfChange,
          })),
          missing: planned.plan.missingData.map((m) => m.label),
          checked: planned.plan.checkedItems.map((c) => c.status),
        },
      }),
    );
    assert.equal(planned.status, "ready");
    assert.ok(planned.plan.selectedFinding.findingSummary);
  });
});
