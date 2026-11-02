import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  COMPARISON_STATUS,
  buildChartInsights,
  buildFinancialIntelligence,
  calculateMarketplace,
  createMarketplaceSession,
  investigate,
  normalizeAmazonCsvText,
  parseUnifiedSummaryPdf,
  presentLatestMomGrowth,
  reconcileSettlement,
  requestSampleDataset,
  runMarketplaceEngine,
} from "./index.js";

const REAL_CSV = "C:/Users/apoor/Downloads/Transactions for time period 1_4_2026 - 30_9_2026.csv";
const REAL_PDF = "C:/Users/apoor/Downloads/2026Apr1-2026Sep30CustomUnifiedSummary.pdf";

function tx({ orderId, productCharges = 0, postedAt = "2026-08-10", sourceRow = 1 } = {}) {
  return {
    orderId,
    productCharges,
    amazonFees: 0,
    amazonFeesMissing: false,
    promotionalRebates: 0,
    totalInr: productCharges,
    postedAt,
    sourceRow,
    productName: "Demo",
    transactionType: "Order Payment",
    classification: { kind: "order_payment" },
    lines: [{ role: "product_sale", amount: productCharges }],
  };
}

describe("stage 5 release gate — Latest MoM KPI consistency", () => {
  it("sample August withholds definitive MoM % on the topline KPI", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const kpis = engine.metrics.sections.topline.kpis;
    assert.equal(kpis.momGrowthComparable, false);
    assert.match(kpis.momGrowthDisplay, /Incomplete period|not comparable/i);
    // Raw observed ratio may still exist for qualified detail — must not be shown as definitive KPI %.
    assert.ok(kpis.momGrowthLatest == null || Number.isFinite(kpis.momGrowthLatest));

    const presented = presentLatestMomGrowth(
      engine.metrics.sections.topline.monthly,
      engine.metrics.period,
      engine.metrics.filters?.dateRange,
    );
    assert.equal(presented.comparable, false);
    assert.match(presented.display, /Incomplete period — MoM not comparable/i);

    const guided = investigate(
      "How did monthly sales and growth move in this period?",
      { sectionId: "topline" },
      engine.metrics,
    );
    assert.doesNotMatch(guided.answer || guided.text || "", /-51\.3%|declined -51/i);
    assert.match(guided.answer || guided.text || "", /Incomplete period|not comparable|Observed-record/i);
  });

  it("TUMMYMUMMY September keeps definitive −17.0% MoM", async () => {
    if (!existsSync(REAL_CSV)) return;
    const normalized = normalizeAmazonCsvText(readFileSync(REAL_CSV, "utf8"));
    let summary = null;
    if (existsSync(REAL_PDF)) {
      const pdf = await parseUnifiedSummaryPdf(new Uint8Array(readFileSync(REAL_PDF)));
      summary = pdf.summary;
    }
    const metrics = calculateMarketplace(summary ? { ...normalized, summary } : normalized);
    const reconciliation = reconcileSettlement(summary ? { ...normalized, summary } : normalized, metrics);
    metrics.chartInsights = buildChartInsights(metrics, reconciliation);
    metrics.intelligence = buildFinancialIntelligence(metrics, reconciliation);

    const kpis = metrics.sections.topline.kpis;
    assert.equal(kpis.momGrowthComparable, true);
    assert.equal(kpis.momGrowthStatus, COMPARISON_STATUS.COMPLETE_COMPARABLE);
    assert.ok(Math.abs(kpis.momGrowthLatest - -0.17) < 0.005);
    assert.match(
      metrics.intelligence.insights.find((r) => r.id === "revenue_mom_2026-08_2026-09").headline,
      /declined -17\.0%/i,
    );
  });

  it("complete comparable months still show MoM %", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [
        tx({ orderId: "1", productCharges: 1000, postedAt: "2026-08-01", sourceRow: 1 }),
        tx({ orderId: "2", productCharges: 1000, postedAt: "2026-08-15", sourceRow: 2 }),
        tx({ orderId: "3", productCharges: 800, postedAt: "2026-09-01", sourceRow: 3 }),
        tx({ orderId: "4", productCharges: 800, postedAt: "2026-09-30", sourceRow: 4 }),
      ],
    });
    const kpis = metrics.sections.topline.kpis;
    assert.equal(kpis.momGrowthComparable, true);
    assert.equal(typeof kpis.momGrowthLatest, "number");
    assert.equal(kpis.momGrowthDisplay, null);
  });
});
