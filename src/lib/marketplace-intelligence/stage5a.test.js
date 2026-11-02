import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  BRIEF_SCHEMA_VERSION,
  DECOMPOSITION_METHOD,
  DECOMPOSITION_TOLERANCE_INR,
  INSIGHT_CURRENCY,
  INSIGHT_SCHEMA_VERSION,
  INSIGHT_TYPES,
  buildChartInsights,
  buildFinancialIntelligence,
  buildSampleDataset,
  calculateMarketplace,
  createEmptyFilters,
  createMarketplaceSession,
  decomposeSalesOrdersAov,
  densifyMonthly,
  discoverInsights,
  dedupeInsights,
  findInsight,
  latestMonthDecomposition,
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
  promotionalRebates = 0,
} = {}) {
  const roles =
    kind === "refund"
      ? [
          { role: "refund_product", amount: productCharges },
          ...(amazonFees ? [{ role: "selling_fee", amount: amazonFees }] : []),
        ]
      : [
          { role: "product_sale", amount: productCharges },
          ...(amazonFees ? [{ role: "selling_fee", amount: amazonFees }] : []),
          ...(promotionalRebates ? [{ role: "promotional_rebate", amount: promotionalRebates }] : []),
        ];
  return {
    orderId: orderId ?? null,
    productCharges,
    amazonFees,
    amazonFeesMissing: false,
    promotionalRebates,
    totalInr: totalInr ?? productCharges + amazonFees + promotionalRebates,
    postedAt,
    sourceRow,
    productName,
    transactionType: kind === "refund" ? "Refund" : "Order Payment",
    classification: { kind },
    lines: roles,
  };
}

describe("stage 5A sales = orders × AOV decomposition", () => {
  it("reconciles the three-term identity without double-counting", () => {
    // Constructed: prior 40 orders × ₹519.54925 ≈ 20781.97; current 35 × ₹493.06086 ≈ 17257.13
    const prior = { month: "2026-08", sales: 20781.97, orders: 40, aov: 20781.97 / 40 };
    const current = { month: "2026-09", sales: 17257.13, orders: 35, aov: 17257.13 / 35 };
    const decomp = decomposeSalesOrdersAov(prior, current);
    assert.equal(decomp.method, DECOMPOSITION_METHOD);
    assert.equal(decomp.comparable, true);
    assert.ok(decomp.reconciles);
    assert.ok(Math.abs(decomp.residual) <= DECOMPOSITION_TOLERANCE_INR);
    const sum = decomp.orderEffect + decomp.aovEffect + decomp.interactionEffect;
    assert.ok(Math.abs(sum - decomp.deltaSales) <= DECOMPOSITION_TOLERANCE_INR);
    assert.ok(decomp.deltaSales < 0);
    assert.equal(decomp.deltaOrders, -5);
  });

  it("handles zero prior orders without inventing AOV effects", () => {
    const decomp = decomposeSalesOrdersAov(
      { month: "2026-07", sales: 0, orders: 0, aov: null },
      { month: "2026-08", sales: 1000, orders: 4, aov: 250 },
    );
    assert.equal(decomp.comparable, false);
    assert.equal(decomp.incomparableReason, "zero_prior_orders");
    assert.equal(decomp.orderEffect, null);
  });

  it("handles zero current orders with volume effect only", () => {
    const decomp = decomposeSalesOrdersAov(
      { month: "2026-08", sales: 1000, orders: 4, aov: 250 },
      { month: "2026-09", sales: 0, orders: 0, aov: null },
    );
    assert.equal(decomp.comparable, true);
    assert.equal(decomp.orderEffect, -1000);
    assert.ok(Math.abs(decomp.residual) <= DECOMPOSITION_TOLERANCE_INR);
  });

  it("marks missing months / incomplete rows incomparable", () => {
    const decomp = decomposeSalesOrdersAov(
      { month: "2026-08", sales: null, orders: 10, aov: 100 },
      { month: "2026-09", sales: 500, orders: 5, aov: 100 },
    );
    assert.equal(decomp.comparable, false);
    assert.equal(decomp.incomparableReason, "missing_sales_or_orders");
  });
});

describe("stage 5A densify + consecutive declines", () => {
  it("flags consecutive declines across densified months", () => {
    const monthly = [
      { month: "2026-06", sales: 3000, orders: 10, aov: 300, growth: null },
      { month: "2026-07", sales: 2500, orders: 9, aov: 277.78, growth: -0.1667 },
      { month: "2026-09", sales: 1800, orders: 7, aov: 257.14, growth: null },
    ];
    const dense = densifyMonthly(monthly);
    assert.ok(dense.some((row) => row.month === "2026-08" && row.zeroFilled));
    const metrics = {
      status: "calculated",
      currency: "INR",
      period: { start: "2026-06-01", end: "2026-09-30" },
      filters: createEmptyFilters(),
      kpis: {
        grossProductSales: 7300,
        refundAmountAbs: 0,
        netProductSales: 7300,
        top8Concentration: 1,
        orderValues: {
          orderCount: 26,
          aov: 280,
          medianOrderValue: 250,
          ordersAbove2xMedian: 0,
          salesAbove2xMedian: 0,
          salesShareAbove2xMedian: 0,
          skewMaterial: false,
        },
        effectiveMarketplaceDeductionRate: 0.1,
        promotionalRebates: 0,
        productProfit: null,
        netSettlementMovement: 5000,
      },
      sections: {
        topline: {
          monthly: dense.map((row) => ({
            month: row.month,
            sales: row.sales,
            orders: row.orders,
            aov: row.aov,
            growth: row.growth,
          })),
          orderValues: {
            orderCount: 26,
            aov: 280,
            medianOrderValue: 250,
            ordersAbove2xMedian: 0,
            salesAbove2xMedian: 0,
            salesShareAbove2xMedian: 0,
            skewMaterial: false,
          },
        },
        amazon_economics: {
          marketplaceFeeDrains: [{ id: "selling_fee", label: "Amazon selling fees", amount: -730 }],
        },
        product_performance: {
          products: [{ productName: "A", sales: 7300, revenueShare: 1, orders: 26 }],
          productMonthly: [],
          top8Concentration: 1,
        },
        profitability: {},
      },
    };
    const insights = discoverInsights(metrics, null);
    assert.ok(insights.some((row) => /consecutive/i.test(row.headline)));
  });
});

describe("stage 5A discovery families on synthetic calculated metrics", () => {
  it("emits skew, concentration, fees, refunds and keeps INR + gross basis", () => {
    const orders = [];
    let row = 1;
    // June: 5 small + 1 large
    for (let i = 0; i < 5; i += 1) {
      orders.push(
        tx({
          orderId: `J-${i}`,
          productCharges: 200,
          amazonFees: -20,
          postedAt: `2026-06-${10 + i}`,
          sourceRow: row++,
          productName: "Nuts",
        }),
      );
    }
    orders.push(
      tx({
        orderId: "J-BULK",
        productCharges: 2000,
        amazonFees: -160,
        postedAt: "2026-06-20",
        sourceRow: row++,
        productName: "Nuts",
      }),
    );
    // July decline
    for (let i = 0; i < 4; i += 1) {
      orders.push(
        tx({
          orderId: `L-${i}`,
          productCharges: 180,
          amazonFees: -18,
          postedAt: `2026-07-${10 + i}`,
          sourceRow: row++,
          productName: "Chips",
        }),
      );
    }
    // August further decline
    for (let i = 0; i < 3; i += 1) {
      orders.push(
        tx({
          orderId: `A-${i}`,
          productCharges: 150,
          amazonFees: -15,
          postedAt: `2026-08-${10 + i}`,
          sourceRow: row++,
          productName: "Chips",
        }),
      );
    }
    const refunds = [
      tx({
        kind: "refund",
        orderId: "J-0",
        productCharges: -200,
        amazonFees: 20,
        postedAt: "2026-06-25",
        sourceRow: row++,
        productName: "Nuts",
      }),
    ];
    const metrics = calculateMarketplace({ transactions: [...orders, ...refunds], status: "ready" });
    metrics.chartInsights = buildChartInsights(metrics, null);
    const intelligence = buildFinancialIntelligence(metrics, {
      status: "differences_found",
      statusLabel: "Differences",
      comparisons: [
        {
          id: "product_sales",
          status: "difference",
          difference: -7100.66,
          txValue: 100000,
          pdfValue: 107100.66,
          explanation: "Unresolved",
          unresolved: true,
        },
      ],
    });

    assert.equal(intelligence.schemaVersion, BRIEF_SCHEMA_VERSION);
    assert.equal(intelligence.insightSchemaVersion, INSIGHT_SCHEMA_VERSION);
    assert.equal(intelligence.currency, INSIGHT_CURRENCY);
    assert.equal(intelligence.status, "ready");
    assert.ok(intelligence.briefInsights.length >= 3);
    assert.ok(intelligence.briefInsights.length <= 5);

    const types = new Set(intelligence.insights.map((row) => row.type));
    assert.ok(types.has(INSIGHT_TYPES.REVENUE_MOVEMENT) || types.has(INSIGHT_TYPES.ORDERS_VS_AOV));
    assert.ok(types.has(INSIGHT_TYPES.ORDER_VALUE_SKEW));
    assert.ok(types.has(INSIGHT_TYPES.PRODUCT_CONCENTRATION));
    assert.ok(types.has(INSIGHT_TYPES.FEE_BURDEN));
    assert.ok(types.has(INSIGHT_TYPES.REFUNDS_RECON_GAPS));

    for (const insight of intelligence.insights) {
      assert.equal(insight.currency, "INR");
      assert.equal(insight.schemaVersion, INSIGHT_SCHEMA_VERSION);
      assert.ok(insight.headline);
      assert.ok(insight.what);
      assert.ok(Array.isArray(insight.hypotheses));
      for (const h of insight.hypotheses) assert.equal(h.status, "unverified");
      // No fabricated currency symbols in what text other than INR framing
      assert.doesNotMatch(insight.what, /\$\d|USD|dollars/i);
    }

    const refundInsight = intelligence.insights.find((row) => row.id === "refunds_topline");
    assert.ok(refundInsight);
    assert.match(refundInsight.what, /Topline/i);
    assert.match(refundInsight.what, /not Amazon Economics fee drains/i);

    const recon = intelligence.insights.find((row) => row.groupKey === "recon_exceptions");
    assert.ok(recon);
    assert.ok(Math.abs(recon.metrics.find((m) => m.metricId === "recon_product_sales").value - -7100.66) < 0.02);
  });

  it("deduplicates revenue + orders_vs_aov into one group", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [
        tx({ orderId: "1", productCharges: 500, postedAt: "2026-08-01", sourceRow: 1 }),
        tx({ orderId: "2", productCharges: 500, postedAt: "2026-08-02", sourceRow: 2 }),
        tx({ orderId: "3", productCharges: 400, postedAt: "2026-09-01", sourceRow: 3 }),
      ],
    });
    const raw = discoverInsights(metrics, null);
    const ranked = dedupeInsights(raw);
    const revenueGroups = ranked.filter((row) => row.groupKey.startsWith("revenue_2026-08_2026-09"));
    assert.ok(revenueGroups.length <= 1);
    const brief = selectBriefInsights(ranked, 5);
    assert.ok(brief.all.length <= 5);
    assert.ok(brief.primary);
  });

  it("respects filter-scoped metrics for intelligence", () => {
    const metrics = calculateMarketplace(
      {
        status: "ready",
        transactions: [
          tx({ orderId: "1", productCharges: 500, postedAt: "2026-08-01", productName: "A", sourceRow: 1 }),
          tx({ orderId: "2", productCharges: 800, postedAt: "2026-08-02", productName: "B", sourceRow: 2 }),
          tx({ orderId: "3", productCharges: 400, postedAt: "2026-09-01", productName: "A", sourceRow: 3 }),
          tx({ orderId: "4", productCharges: 200, postedAt: "2026-09-02", productName: "B", sourceRow: 4 }),
        ],
      },
      { ...createEmptyFilters(), products: ["A"] },
    );
    const intelligence = buildFinancialIntelligence(metrics, null);
    assert.deepEqual(intelligence.coverage.filters.products, ["A"]);
    assert.ok(Math.abs(metrics.kpis.grossProductSales - 900) < 0.01);
    for (const insight of intelligence.insights) {
      assert.deepEqual(insight.filters.products, ["A"]);
    }
  });
});

describe("stage 5A sample engine wiring", () => {
  it("attaches intelligence via runMarketplaceEngine without NVIDIA", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session, createEmptyFilters());
    assert.equal(engine.metrics.status, "calculated");
    assert.equal(engine.metrics.intelligence.status, "ready");
    assert.ok(engine.metrics.intelligence.briefInsights.length >= 1);
    assert.equal(engine.metrics.intelligence.source, "deterministic_local");
    const first = engine.metrics.intelligence.briefInsights[0];
    const found = findInsight(engine.metrics, first.id);
    assert.equal(found.id, first.id);
    const decomp = latestMonthDecomposition(engine.metrics);
    if (decomp?.comparable) {
      assert.ok(Math.abs(decomp.residual) <= DECOMPOSITION_TOLERANCE_INR);
    }
  });

  it("buildSampleDataset remains anonymized INR", () => {
    const sample = buildSampleDataset();
    assert.equal(sample.summary.currency, "INR");
  });
});

describe("stage 5A TUMMYMUMMY when CSV present", () => {
  it("computes August–September decomposition and top-ranked findings", async () => {
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
    assert.ok(aug && sep);
    assert.ok(Math.abs(aug.sales - 20781.97) < 0.5);
    assert.ok(Math.abs(sep.sales - 17257.13) < 0.5);

    const decomp = decomposeSalesOrdersAov(aug, sep);
    assert.equal(decomp.comparable, true);
    assert.ok(decomp.reconciles);
    assert.ok(Math.abs(decomp.orderEffect + decomp.aovEffect + decomp.interactionEffect - decomp.deltaSales) <= DECOMPOSITION_TOLERANCE_INR);

    // Expose exact numbers for the Stage 5A report.
    console.log(
      JSON.stringify({
        tummyAugSep: {
          prior: { month: aug.month, sales: aug.sales, orders: aug.orders, aov: aug.aov },
          current: { month: sep.month, sales: sep.sales, orders: sep.orders, aov: sep.aov },
          deltaSales: decomp.deltaSales,
          orderEffect: decomp.orderEffect,
          aovEffect: decomp.aovEffect,
          interactionEffect: decomp.interactionEffect,
          residual: decomp.residual,
        },
        topFindings: intelligence.briefInsights.map((row) => ({
          id: row.id,
          type: row.type,
          headline: row.headline,
          ranking: row.ranking.score,
        })),
      }),
    );

    assert.ok(intelligence.briefInsights.length >= 3);
    assert.ok(
      intelligence.insights.some(
        (row) => row.type === INSIGHT_TYPES.REVENUE_MOVEMENT || row.type === INSIGHT_TYPES.ORDERS_VS_AOV,
      ),
    );
    const refund = intelligence.insights.find((row) => row.id === "refunds_topline");
    assert.ok(refund);
    assert.ok(Math.abs(metrics.kpis.refundAmountAbs - 1541.9) < 0.05);

    if (existsSync(REAL_PDF)) {
      const reconInsight = intelligence.insights.find((row) => row.groupKey === "recon_exceptions");
      assert.ok(reconInsight);
    }
  });
});
