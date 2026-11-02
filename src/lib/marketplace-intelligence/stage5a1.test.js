import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  DECOMPOSITION_PRESENTATION_METHOD,
  DECOMPOSITION_TOLERANCE_INR,
  buildChartInsights,
  buildFinancialIntelligence,
  buildSampleDataset,
  calculateMarketplace,
  createEmptyFilters,
  createMarketplaceSession,
  decomposeSalesOrdersAov,
  discoverInsights,
  dedupeInsights,
  normalizeAmazonCsvText,
  parseUnifiedSummaryPdf,
  reconcileSettlement,
  requestSampleDataset,
  runMarketplaceEngine,
  selectBriefInsights,
} from "./index.js";

const REAL_CSV = "C:/Users/apoor/Downloads/Transactions for time period 1_4_2026 - 30_9_2026.csv";
const REAL_PDF = "C:/Users/apoor/Downloads/2026Apr1-2026Sep30CustomUnifiedSummary.pdf";

function tx({
  kind = "order_payment",
  orderId,
  productCharges = 0,
  amazonFees = 0,
  totalInr = null,
  postedAt = "2026-05-10",
  sourceRow = 1,
  productName = "Demo Product",
} = {}) {
  return {
    orderId: orderId ?? null,
    productCharges,
    amazonFees,
    amazonFeesMissing: false,
    promotionalRebates: 0,
    totalInr: totalInr ?? productCharges + amazonFees,
    postedAt,
    sourceRow,
    productName,
    transactionType: kind === "refund" ? "Refund" : "Order Payment",
    classification: { kind },
    lines:
      kind === "refund"
        ? [{ role: "refund_product", amount: productCharges }]
        : [
            { role: "product_sale", amount: productCharges },
            ...(amazonFees ? [{ role: "selling_fee", amount: amazonFees }] : []),
          ],
  };
}

describe("stage 5A.1 symmetric Orders/AOV decomposition", () => {
  it("splits interaction equally and reconciles to Δ sales", () => {
    const prior = { month: "2026-08", sales: 20781.97, orders: 52, aov: 20781.97 / 52 };
    const current = { month: "2026-09", sales: 17257.13, orders: 49, aov: 17257.13 / 49 };
    const decomp = decomposeSalesOrdersAov(prior, current);
    assert.equal(decomp.presentationMethod, DECOMPOSITION_PRESENTATION_METHOD);
    assert.ok(decomp.reconciles);
    assert.ok(decomp.presentationReconciles);
    assert.ok(Math.abs(decomp.orderContribution - -1127.76) < 0.02);
    assert.ok(Math.abs(decomp.aovContribution - -2397.08) < 0.02);
    assert.ok(
      Math.abs(decomp.orderContribution + decomp.aovContribution - decomp.deltaSales) <=
        DECOMPOSITION_TOLERANCE_INR,
    );
    // Audit three-term still present
    assert.ok(
      Math.abs(decomp.orderEffect + decomp.aovEffect + decomp.interactionEffect - decomp.deltaSales) <=
        DECOMPOSITION_TOLERANCE_INR,
    );
  });
});

describe("stage 5A.1 insight quality rules", () => {
  it("suppresses top-eight concentration for assortments with ≤8 SKUs", () => {
    const products = Array.from({ length: 6 }, (_, i) =>
      tx({
        orderId: `O${i}`,
        productCharges: 100 + i * 10,
        postedAt: "2026-08-10",
        sourceRow: i + 1,
        productName: `SKU ${i}`,
      }),
    );
    const metrics = calculateMarketplace({ status: "ready", transactions: products });
    const insights = discoverInsights(metrics, null);
    assert.ok(!insights.some((row) => row.id === "product_concentration_top8"));
    const small = insights.find((row) => row.id === "product_concentration_small_assortment");
    assert.ok(small);
    assert.match(small.what, /only .* products in scope/i);
    assert.match(small.what, /of sales/i);
  });

  it("keeps top-eight concentration only when more than 8 products exist", () => {
    const products = Array.from({ length: 10 }, (_, i) =>
      tx({
        orderId: `O${i}`,
        productCharges: 200,
        postedAt: "2026-08-10",
        sourceRow: i + 1,
        productName: `SKU ${i}`,
      }),
    );
    const metrics = calculateMarketplace({ status: "ready", transactions: products });
    const insights = discoverInsights(metrics, null);
    assert.ok(insights.some((row) => row.id === "product_concentration_top8"));
  });

  it("labels zero recorded sales without calling it confirmed demand decline", () => {
    const metrics = {
      status: "calculated",
      currency: "INR",
      period: { start: "2026-07-01", end: "2026-08-31" },
      filters: createEmptyFilters(),
      kpis: {
        grossProductSales: 1000,
        top8Concentration: 1,
        orderValues: {
          orderCount: 2,
          aov: 500,
          medianOrderValue: 500,
          ordersAbove2xMedian: 0,
          salesAbove2xMedian: 0,
          salesShareAbove2xMedian: 0,
          skewMaterial: false,
        },
        effectiveMarketplaceDeductionRate: 0.1,
        refundAmountAbs: 0,
        productProfit: null,
        netSettlementMovement: 800,
        promotionalRebates: 0,
      },
      sections: {
        topline: {
          monthly: [
            { month: "2026-07", sales: 700, orders: 2, aov: 350, growth: null },
            { month: "2026-08", sales: 300, orders: 1, aov: 300, growth: -0.571 },
          ],
          orderValues: {
            orderCount: 2,
            aov: 500,
            medianOrderValue: 500,
            ordersAbove2xMedian: 0,
            salesAbove2xMedian: 0,
            salesShareAbove2xMedian: 0,
            skewMaterial: false,
          },
        },
        amazon_economics: { marketplaceFeeDrains: [{ id: "selling_fee", label: "Fees", amount: -100 }] },
        product_performance: {
          products: [
            { productName: "Alpha", sales: 700, revenueShare: 0.7, orders: 2 },
            { productName: "Beta", sales: 300, revenueShare: 0.3, orders: 1 },
          ],
          productMonthly: [
            {
              productName: "Alpha",
              months: [
                { month: "2026-07", sales: 700, orders: 2 },
                { month: "2026-08", sales: 0, orders: 0 },
              ],
            },
          ],
          top8Concentration: 1,
        },
        profitability: {},
      },
    };
    const insights = discoverInsights(metrics, null);
    const move = insights.find((row) => row.id.startsWith("product_move_"));
    assert.ok(move);
    assert.match(move.headline, /no recorded sales/i);
    assert.match(move.what, /not the same as a confirmed demand decline/i);
    assert.doesNotMatch(move.headline, /confirmed (product )?demand decline/i);
    const pctMetric = move.metrics.find((m) => m.metricId === "pct_vs_prior_product");
    assert.ok(pctMetric);
    assert.match(pctMetric.label, /prior-month Gross Product Sales/i);
    // Must not misuse revenue share as MoM %
    assert.doesNotMatch(move.summary, /70\.0% MoM/);
  });

  it("qualifies product moves when months are partial under the date filter", () => {
    const metrics = {
      status: "calculated",
      currency: "INR",
      period: { start: "2026-08-15", end: "2026-09-10" },
      filters: { dateRange: { start: "2026-08-15", end: "2026-09-10" }, products: [] },
      kpis: {
        grossProductSales: 500,
        top8Concentration: 1,
        orderValues: {
          orderCount: 2,
          aov: 250,
          medianOrderValue: 250,
          ordersAbove2xMedian: 0,
          salesAbove2xMedian: 0,
          salesShareAbove2xMedian: 0,
          skewMaterial: false,
        },
        effectiveMarketplaceDeductionRate: null,
        refundAmountAbs: 0,
        productProfit: null,
        netSettlementMovement: 400,
        promotionalRebates: 0,
      },
      sections: {
        topline: {
          monthly: [
            { month: "2026-08", sales: 300, orders: 1, aov: 300, growth: null },
            { month: "2026-09", sales: 200, orders: 1, aov: 200, growth: -0.333 },
          ],
          orderValues: {
            orderCount: 2,
            aov: 250,
            medianOrderValue: 250,
            ordersAbove2xMedian: 0,
            salesAbove2xMedian: 0,
            salesShareAbove2xMedian: 0,
            skewMaterial: false,
          },
        },
        amazon_economics: { marketplaceFeeDrains: [] },
        product_performance: {
          products: [{ productName: "PartialSKU", sales: 500, revenueShare: 1, orders: 2 }],
          productMonthly: [
            {
              productName: "PartialSKU",
              months: [
                { month: "2026-08", sales: 300, orders: 1 },
                { month: "2026-09", sales: 200, orders: 1 },
              ],
            },
          ],
          top8Concentration: 1,
        },
        profitability: {},
      },
    };
    const insights = discoverInsights(metrics, null);
    const move = insights.find((row) => row.id.startsWith("product_move_"));
    assert.ok(move);
    assert.equal(move.confidenceFacets.coverage, "incomplete");
    assert.ok(move.limitations.some((line) => /partial/i.test(line)));
  });
});

describe("stage 5A.1 confidence facets & ranking", () => {
  it("separates calculation confidence from incomplete reconciliation", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [
        tx({ orderId: "1", productCharges: 500, postedAt: "2026-08-01", sourceRow: 1 }),
        tx({ orderId: "2", productCharges: 400, postedAt: "2026-09-01", sourceRow: 2 }),
      ],
    });
    const intelligence = buildFinancialIntelligence(metrics, {
      status: "differences_found",
      statusLabel: "Differences",
      comparisons: [
        { id: "product_sales", status: "difference", difference: -100, unresolved: true },
        { id: "gst", status: "missing_information", difference: null },
      ],
    });
    assert.equal(intelligence.coverage.facets.calculation, "high");
    assert.equal(intelligence.coverage.facets.reconciliation, "differences");
    assert.equal(intelligence.coverage.facets.businessCause, "unverified_only");
    // No single global "high confidence" meaning the whole report is complete
    assert.notEqual(intelligence.coverage.facets.reconciliation, "matched");
  });

  it("ranks recent revenue decline above stable small-assortment concentration", () => {
    // Full September month so MoM is definitive (not trailing_partial).
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [
        tx({ orderId: "a1", productCharges: 800, postedAt: "2026-08-01", productName: "A", sourceRow: 1 }),
        tx({ orderId: "a2", productCharges: 700, postedAt: "2026-08-02", productName: "A", sourceRow: 2 }),
        tx({ orderId: "b1", productCharges: 200, postedAt: "2026-08-03", productName: "B", sourceRow: 3 }),
        tx({ orderId: "a3", productCharges: 300, postedAt: "2026-09-01", productName: "A", sourceRow: 4 }),
        tx({ orderId: "b2", productCharges: 100, postedAt: "2026-09-15", productName: "B", sourceRow: 5 }),
        tx({ orderId: "b3", productCharges: 50, postedAt: "2026-09-30", productName: "B", sourceRow: 6 }),
      ],
    });
    const intelligence = buildFinancialIntelligence(metrics, null);
    const ranked = intelligence.insights;
    const revenue = ranked.find((row) => row.id.startsWith("revenue_mom_"));
    const concentrationIdx = ranked.findIndex((row) => row.id.includes("product_concentration"));
    assert.ok(revenue);
    assert.equal(revenue.provisional, false);
    assert.ok(concentrationIdx >= 0);
    assert.ok(ranked.indexOf(revenue) < concentrationIdx);
    assert.equal(intelligence.brief.primary.type, "revenue_movement");
  });

  it("deduplicates revenue and orders_vs_aov on the same groupKey", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [
        tx({ orderId: "1", productCharges: 500, postedAt: "2026-08-01", sourceRow: 1 }),
        tx({ orderId: "2", productCharges: 500, postedAt: "2026-08-02", sourceRow: 2 }),
        tx({ orderId: "3", productCharges: 400, postedAt: "2026-09-01", sourceRow: 3 }),
      ],
    });
    const ranked = dedupeInsights(discoverInsights(metrics, null));
    const groups = ranked.filter((row) => row.groupKey === "revenue_2026-08_2026-09");
    assert.equal(groups.length, 1);
    const brief = selectBriefInsights(ranked, 5);
    assert.ok(brief.primary);
    assert.ok(Array.isArray(brief.secondary));
    assert.ok(brief.all.length <= 5);
  });

  it("keeps filter-specific findings scoped to filtered products", () => {
    const metrics = calculateMarketplace(
      {
        status: "ready",
        transactions: [
          tx({ orderId: "1", productCharges: 900, postedAt: "2026-08-01", productName: "OnlyA", sourceRow: 1 }),
          tx({ orderId: "2", productCharges: 100, postedAt: "2026-08-02", productName: "Other", sourceRow: 2 }),
          tx({ orderId: "3", productCharges: 400, postedAt: "2026-09-01", productName: "OnlyA", sourceRow: 3 }),
        ],
      },
      { ...createEmptyFilters(), products: ["OnlyA"] },
    );
    const intelligence = buildFinancialIntelligence(metrics, null);
    assert.deepEqual(intelligence.coverage.filters.products, ["OnlyA"]);
    assert.ok(Math.abs(metrics.kpis.grossProductSales - 1300) < 0.01);
    for (const insight of intelligence.insights) {
      assert.deepEqual(insight.filters.products, ["OnlyA"]);
    }
  });
});

describe("stage 5A.1 TUMMYMUMMY + sample ranked findings", () => {
  it("reports TUMMYMUMMY Aug–Sep symmetric split and ranked brief", async () => {
    if (!existsSync(REAL_CSV)) return;
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
    const intelligence = buildFinancialIntelligence(metrics, reconciliation);
    const monthly = metrics.sections.topline.monthly;
    const aug = monthly.find((row) => row.month === "2026-08");
    const sep = monthly.find((row) => row.month === "2026-09");
    const decomp = decomposeSalesOrdersAov(aug, sep);
    assert.ok(Math.abs(decomp.orderContribution - -1127.76) < 0.02);
    assert.ok(Math.abs(decomp.aovContribution - -2397.08) < 0.02);

    console.log(
      JSON.stringify({
        tummySymmetric: {
          orderContribution: decomp.orderContribution,
          aovContribution: decomp.aovContribution,
          deltaSales: decomp.deltaSales,
          audit: {
            orderEffect: decomp.orderEffect,
            aovEffect: decomp.aovEffect,
            interactionEffect: decomp.interactionEffect,
          },
        },
        tummyRanked: intelligence.brief.all.map((row) => ({
          id: row.id,
          type: row.type,
          headline: row.headline,
          score: row.ranking.score,
          stable: row.isStableObservation,
          recent: row.isRecentChange,
        })),
        facets: intelligence.coverage.facets,
      }),
    );

    assert.ok(intelligence.brief.primary);
    // With >8 products, top8 may exist but should not beat a material Aug–Sep decline when scored recently
    const revenue = intelligence.insights.find((row) => row.id === "revenue_mom_2026-08_2026-09");
    assert.ok(revenue);
    assert.match(revenue.shortWhy, /orders|average order value/i);
    assert.equal(revenue.why.method, DECOMPOSITION_PRESENTATION_METHOD);
  });

  it("reports sample dataset ranked brief without top-eight false alarm", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session, createEmptyFilters());
    const intelligence = engine.metrics.intelligence;
    assert.equal(intelligence.status, "ready");
    assert.ok(!intelligence.insights.some((row) => row.id === "product_concentration_top8"));
    assert.ok(intelligence.insights.some((row) => row.id === "product_concentration_small_assortment"));
    console.log(
      JSON.stringify({
        sampleRanked: intelligence.brief.all.map((row) => ({
          id: row.id,
          type: row.type,
          headline: row.headline,
          score: row.ranking.score,
        })),
        facets: intelligence.coverage.facets,
      }),
    );
    assert.ok(buildSampleDataset().summary.currency === "INR");
  });
});
