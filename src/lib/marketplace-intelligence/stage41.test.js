import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  analyzeRefundOrders,
  buildChartInsights,
  buildOrderLevelTotals,
  calculateMarketplace,
  computeOrderValueStats,
  createEmptyFilters,
  densifyMonthly,
  medianOfSorted,
  normalizeAmazonCsvText,
  parseUnifiedSummaryPdf,
  reconcileSettlement,
  selectEvidenceMetrics,
} from "./index.js";

const REAL_CSV = "C:/Users/apoor/Downloads/Transactions for time period 1_4_2026 - 30_9_2026.csv";
const REAL_PDF = "C:/Users/apoor/Downloads/2026Apr1-2026Sep30CustomUnifiedSummary.pdf";

function tx({
  kind = "order_payment",
  orderId,
  productCharges = 0,
  amazonFees = 0,
  amazonFeesMissing = false,
  totalInr = null,
  postedAt = "2026-05-10",
  sourceRow = 1,
  productName = "Demo Product",
  transactionType = kind === "refund" ? "Refund" : "Order Payment",
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
        ];
  return {
    orderId: orderId ?? null,
    productCharges,
    amazonFees,
    amazonFeesMissing,
    totalInr: totalInr ?? productCharges + amazonFees,
    postedAt,
    sourceRow,
    productName,
    transactionType,
    classification: { kind },
    lines: roles,
  };
}

describe("stage 4.1 refund classification", () => {
  it("treats matching refunds as full and allows net orders", () => {
    const orders = [
      tx({ orderId: "O1", productCharges: 100, sourceRow: 1 }),
      tx({ orderId: "O2", productCharges: 200, sourceRow: 2 }),
      tx({ orderId: "O3", productCharges: 50, sourceRow: 3 }),
    ];
    const refunds = [tx({ kind: "refund", orderId: "O1", productCharges: -100, sourceRow: 4 })];
    const levels = buildOrderLevelTotals(orders);
    const analysis = analyzeRefundOrders(levels, refunds);
    assert.equal(analysis.refundedOrderCount, 1);
    assert.equal(analysis.fullRefundOrderCount, 1);
    assert.equal(analysis.partialRefundOrderCount, 0);
    assert.equal(analysis.canSubtractFullRefunds, true);
    assert.equal(analysis.netOrdersBasis, "gross_minus_full_refunds");
  });

  it("labels partial refunds and refuses net-order subtraction", () => {
    const orders = [tx({ orderId: "O1", productCharges: 100, sourceRow: 1 })];
    const refunds = [tx({ kind: "refund", orderId: "O1", productCharges: -40, sourceRow: 2 })];
    const analysis = analyzeRefundOrders(buildOrderLevelTotals(orders), refunds);
    assert.equal(analysis.partialRefundOrderCount, 1);
    assert.equal(analysis.canSubtractFullRefunds, false);
    assert.equal(analysis.netOrdersBasis, "not_subtracted");
  });

  it("aggregates multiple refund rows for one order", () => {
    const orders = [tx({ orderId: "O1", productCharges: 100, sourceRow: 1 })];
    const refunds = [
      tx({ kind: "refund", orderId: "O1", productCharges: -40, sourceRow: 2 }),
      tx({ kind: "refund", orderId: "O1", productCharges: -60, sourceRow: 3 }),
    ];
    const analysis = analyzeRefundOrders(buildOrderLevelTotals(orders), refunds);
    assert.equal(analysis.refundedOrderCount, 1);
    assert.equal(analysis.details[0].refundRows, 2);
    assert.equal(analysis.details[0].classification, "full");
    assert.equal(analysis.canSubtractFullRefunds, true);
  });

  it("marks refunds for orders outside the gross window", () => {
    const orders = [tx({ orderId: "O1", productCharges: 100, sourceRow: 1 })];
    const refunds = [tx({ kind: "refund", orderId: "OUTSIDE", productCharges: -80, sourceRow: 2 })];
    const analysis = analyzeRefundOrders(buildOrderLevelTotals(orders), refunds);
    assert.equal(analysis.outsideGrossWindowCount, 1);
    assert.equal(analysis.details[0].classification, "outside_gross_window");
    assert.equal(analysis.canSubtractFullRefunds, false);
  });
});

describe("stage 4.1 AOV median and skew", () => {
  it("computes median from unique order totals with skew", () => {
    const levels = buildOrderLevelTotals([
      tx({ orderId: "A", productCharges: 100, sourceRow: 1 }),
      tx({ orderId: "B", productCharges: 110, sourceRow: 2 }),
      tx({ orderId: "C", productCharges: 120, sourceRow: 3 }),
      tx({ orderId: "D", productCharges: 1000, sourceRow: 4 }),
    ]);
    const stats = computeOrderValueStats(levels, 1330);
    assert.equal(stats.orderCount, 4);
    assert.equal(stats.medianOrderValue, 115);
    assert.ok(Math.abs(stats.aov - 332.5) < 0.01);
    assert.equal(stats.ordersAbove2xMedian, 1);
    assert.equal(stats.salesAbove2xMedian, 1000);
    assert.ok(stats.skewMaterial);
  });

  it("does not use payment rows for median when one order has multiple lines", () => {
    const levels = buildOrderLevelTotals([
      tx({ orderId: "A", productCharges: 50, sourceRow: 1 }),
      tx({ orderId: "A", productCharges: 50, sourceRow: 2 }),
      tx({ orderId: "B", productCharges: 200, sourceRow: 3 }),
      tx({ orderId: "C", productCharges: 300, sourceRow: 4 }),
    ]);
    assert.equal(levels.length, 3);
    assert.equal(levels.find((row) => row.orderId === "A").sales, 100);
    const stats = computeOrderValueStats(levels, 600);
    assert.equal(stats.medianOrderValue, 200);
    assert.equal(medianOfSorted([100, 200, 300]), 200);
  });

  it("handles zero orders", () => {
    const stats = computeOrderValueStats([], 0);
    assert.equal(stats.orderCount, 0);
    assert.equal(stats.aov, null);
    assert.equal(stats.medianOrderValue, null);
    assert.equal(stats.ordersAbove2xMedian, 0);
  });
});

describe("stage 4.1 chart insights and fee presentation", () => {
  it("flags consecutive monthly declines and respects filters", () => {
    const normalized = {
      transactions: [
        tx({ orderId: "M1", productCharges: 500, postedAt: "2026-04-05", sourceRow: 1 }),
        tx({ orderId: "M2", productCharges: 400, postedAt: "2026-05-05", sourceRow: 2 }),
        tx({ orderId: "M3", productCharges: 300, postedAt: "2026-06-05", sourceRow: 3 }),
        tx({ orderId: "M4", productCharges: 200, postedAt: "2026-07-05", sourceRow: 4 }),
      ],
    };
    const metrics = calculateMarketplace(normalized);
    const insights = buildChartInsights(metrics, null);
    assert.match(insights["monthly-sales"].keyInsight, /April 2026/);
    assert.match(insights["monthly-sales"].worthInvestigating, /consecutive months/);

    const filtered = calculateMarketplace(normalized, {
      ...createEmptyFilters(),
      dateRange: { start: "2026-06-01", end: "2026-07-31" },
    });
    assert.equal(filtered.kpis.grossOrderCount, 2);
    assert.ok(Math.abs(filtered.kpis.grossProductSales - 500) < 0.01);
    const filteredInsights = buildChartInsights(filtered, null);
    assert.match(filteredInsights["monthly-sales"].keyInsight, /June 2026/);
  });

  it("excludes product refunds from Amazon Economics fee drains", () => {
    const normalized = {
      transactions: [
        tx({ orderId: "O1", productCharges: 500, amazonFees: -50, sourceRow: 1 }),
        tx({
          kind: "refund",
          orderId: "O1",
          productCharges: -500,
          amazonFees: 10,
          sourceRow: 2,
        }),
        tx({
          kind: "order_payment",
          orderId: "O2",
          productCharges: 0,
          amazonFees: 0,
          totalInr: -80,
          sourceRow: 3,
          transactionType: "Service Fee",
          classification: { kind: "service_fee" },
          lines: [{ role: "advertising", amount: -80 }],
        }),
      ],
    };
    // Fix advertising row kind for classification filter used by roleSum via lines
    normalized.transactions[2].classification = { kind: "service_fee" };
    const metrics = calculateMarketplace(normalized);
    const drains = metrics.sections.amazon_economics.whereMoneyGoes;
    assert.ok(!drains.some((row) => row.id === "refund_product"));
    assert.equal(metrics.sections.amazon_economics.refundsShownInTopline, true);
    assert.ok(Math.abs(metrics.kpis.refundAmountAbs - 500) < 0.01);
    assert.ok(Math.abs(metrics.kpis.netProductSales - 0) < 0.01);
  });

  it("keeps settlement reconciliation logic independent of Topline refund presentation", () => {
    const normalized = {
      transactions: [
        tx({ orderId: "O1", productCharges: 1000, amazonFees: -100, totalInr: 900, sourceRow: 1 }),
        tx({ kind: "refund", orderId: "O1", productCharges: -100, amazonFees: 5, totalInr: -95, sourceRow: 2 }),
      ],
      summary: {
        sellerFulfilledProductSales: 1000,
        sellerFulfilledProductSaleRefunds: -100,
        advertising: null,
        inboundTransportation: null,
        income: null,
        expenses: null,
        transfers: null,
        netGstCollected: null,
      },
      status: "ready",
    };
    const metrics = calculateMarketplace(normalized);
    const before = metrics.kpis.netSettlementMovement;
    const recon = reconcileSettlement(normalized, metrics);
    assert.equal(metrics.sections.amazon_economics.refundsShownInTopline, true);
    assert.ok(!metrics.sections.amazon_economics.whereMoneyGoes.some((r) => r.id === "refund_product"));
    assert.equal(metrics.kpis.netSettlementMovement, before);
    const refundsCheck = recon.comparisons.find((row) => row.id === "refunds");
    assert.ok(refundsCheck);
    assert.equal(refundsCheck.txValue, metrics.kpis.refundProductCharges);
  });
});

describe("stage 4.1 financial acceptance", () => {
  it("keeps Gross AOV and median on the same gross order population", () => {
    const normalized = {
      transactions: [
        tx({ orderId: "A", productCharges: 100, sourceRow: 1 }),
        tx({ orderId: "A", productCharges: 50, sourceRow: 2 }),
        tx({ orderId: "B", productCharges: 200, sourceRow: 3 }),
        tx({ orderId: "C", productCharges: 300, sourceRow: 4 }),
      ],
    };
    const metrics = calculateMarketplace(normalized);
    assert.equal(metrics.kpis.grossOrderCount, 3);
    assert.equal(metrics.kpis.orderValues.orderCount, 3);
    assert.ok(Math.abs(metrics.kpis.aov - metrics.kpis.grossProductSales / metrics.kpis.grossOrderCount) < 0.01);
    assert.equal(metrics.kpis.aovBasis, "gross_product_sales / gross_order_count");
    assert.equal(metrics.kpis.medianBasis, "gross_unique_order_product_charges");
    assert.equal(metrics.kpis.medianOrderValue, 200);
  });

  it("does not claim net orders for partial refunds", () => {
    const normalized = {
      transactions: [
        tx({ orderId: "O1", productCharges: 100, sourceRow: 1 }),
        tx({ kind: "refund", orderId: "O1", productCharges: -40, sourceRow: 2 }),
      ],
    };
    const metrics = calculateMarketplace(normalized);
    assert.equal(metrics.kpis.canSubtractFullRefunds, false);
    assert.equal(metrics.kpis.netOrderCount, null);
    assert.equal(metrics.kpis.netOrdersBasis, "not_subtracted");
  });

  it("excludes promotional rebates from marketplace fee rate while retaining the line", () => {
    const normalized = {
      transactions: [
        {
          ...tx({ orderId: "O1", productCharges: 1000, amazonFees: -100, sourceRow: 1 }),
          promotionalRebates: -38.1,
          lines: [
            { role: "product_sale", amount: 1000 },
            { role: "selling_fee", amount: -100 },
            { role: "promotional_rebate", amount: -38.1 },
          ],
        },
        {
          ...tx({
            kind: "order_payment",
            orderId: null,
            productCharges: 0,
            amazonFees: 0,
            totalInr: -50,
            sourceRow: 2,
            transactionType: "Service Fees",
            classification: { kind: "service_fee" },
          }),
          lines: [{ role: "advertising", amount: -50 }],
        },
      ],
    };
    const metrics = calculateMarketplace(normalized);
    const economics = metrics.sections.amazon_economics;
    assert.equal(economics.promotionalRebatesAreMarketplaceFees, false);
    assert.ok(economics.whereMoneyGoes.some((row) => row.id === "promotional_rebate"));
    assert.ok(!economics.marketplaceFeeDrains.some((row) => row.id === "promotional_rebate"));
    assert.ok(!economics.marketplaceFeeDrains.some((row) => row.id === "refund_product"));
    // Fee rate = abs(-100 + -50) / 1000 = 0.15 — promo excluded.
    assert.ok(Math.abs(metrics.kpis.effectiveMarketplaceDeductionRate - 0.15) < 0.001);
  });

  it("handles insufficient monthly history, zero-filled gaps, and filter-scoped insights", () => {
    const single = calculateMarketplace({
      transactions: [tx({ orderId: "M1", productCharges: 100, postedAt: "2026-05-10", sourceRow: 1 })],
    });
    assert.match(single.chartInsights["monthly-sales"].worthInvestigating, /Insufficient history/i);

    const gapped = densifyMonthly([
      { month: "2026-04", sales: 100, orders: 1, aov: 100, growth: null },
      { month: "2026-06", sales: 50, orders: 1, aov: 50, growth: -0.5 },
    ]);
    assert.equal(gapped.length, 3);
    assert.equal(gapped[1].month, "2026-05");
    assert.equal(gapped[1].sales, 0);

    const filtered = calculateMarketplace(
      {
        transactions: [
          tx({ orderId: "A", productCharges: 400, postedAt: "2026-04-10", sourceRow: 1 }),
          tx({ orderId: "B", productCharges: 300, postedAt: "2026-05-10", sourceRow: 2 }),
          tx({ orderId: "C", productCharges: 200, postedAt: "2026-06-10", sourceRow: 3 }),
        ],
      },
      { ...createEmptyFilters(), dateRange: { start: "2026-05-01", end: "2026-05-31" } },
    );
    assert.equal(filtered.kpis.grossOrderCount, 1);
    assert.match(filtered.chartInsights["monthly-sales"].keyInsight, /May 2026/);
    assert.doesNotMatch(filtered.chartInsights["monthly-sales"].keyInsight, /April 2026/);
  });

  it("evidence adapter keeps gross denominators for AOV and fee rate", () => {
    const metrics = calculateMarketplace({
      transactions: [
        tx({ orderId: "O1", productCharges: 500, amazonFees: -40, sourceRow: 1 }),
        tx({ kind: "refund", orderId: "O1", productCharges: -500, amazonFees: 5, sourceRow: 2 }),
      ],
    });
    const evidence = selectEvidenceMetrics(metrics, null, { sectionId: "topline" });
    assert.equal(evidence.kpis.aovNumerator, "gross_product_sales");
    assert.equal(evidence.kpis.aovDenominator, "gross_order_count");
    assert.equal(evidence.kpis.feeRateDenominator, "gross_product_sales");
    assert.equal(evidence.kpis.promotionalRebatesAreMarketplaceFees, false);
    assert.equal(evidence.kpis.orderCount, evidence.kpis.grossOrderCount);
  });
});

describe("stage 4.1 TUMMYMUMMY anchors when CSV is present", () => {
  it("verifies gross/net sales, refunded orders, median, fees, and unresolved recon diffs", async () => {
    if (!existsSync(REAL_CSV)) {
      // Skip silently when the private dataset is not on this machine.
      return;
    }
    const normalized = normalizeAmazonCsvText(readFileSync(REAL_CSV, "utf8"));
    const metrics = calculateMarketplace(normalized);
    assert.ok(Math.abs(metrics.kpis.grossProductSales - 104994.21) < 0.02);
    assert.ok(Math.abs(metrics.kpis.refundAmountAbs - 1541.9) < 0.02);
    assert.ok(Math.abs(metrics.kpis.netProductSales - 103452.31) < 0.02);
    assert.equal(metrics.kpis.grossOrderCount, 206);
    assert.ok(Math.abs(metrics.kpis.aov - metrics.kpis.grossProductSales / metrics.kpis.grossOrderCount) < 0.01);
    assert.equal(metrics.kpis.refundedOrderCount, 3);
    assert.equal(metrics.kpis.fullRefundOrderCount, 3);
    assert.equal(metrics.kpis.canSubtractFullRefunds, true);
    assert.equal(metrics.kpis.netOrderCount, 203);
    assert.ok(Math.abs(metrics.kpis.medianOrderValue - 370.48) < 1);
    assert.ok(!metrics.sections.amazon_economics.whereMoneyGoes.some((row) => row.id === "refund_product"));
    assert.ok(!metrics.sections.amazon_economics.marketplaceFeeDrains.some((row) => row.id === "promotional_rebate"));
    assert.equal(metrics.kpis.promotionalRebatesAreMarketplaceFees, false);
    assert.ok(Math.abs(metrics.kpis.promotionalRebates - -38.1) < 0.01);
    // Marketplace fee rate excludes promo (-38.10).
    const expectedFeeRate =
      Math.abs((-3870.4) + (-4742.99) + (-1488.14)) / 104994.21;
    assert.ok(Math.abs(metrics.kpis.effectiveMarketplaceDeductionRate - expectedFeeRate) < 0.0001);
    assert.ok(metrics.chartInsights["monthly-sales"].keyInsight);
    assert.match(metrics.chartInsights["fee-breakdown"].keyInsight, /marketplace fee/i);

    if (!existsSync(REAL_PDF)) return;
    const pdf = await parseUnifiedSummaryPdf(new Uint8Array(readFileSync(REAL_PDF)));
    const withSummary = { ...normalized, summary: pdf.summary };
    const recon = reconcileSettlement(withSummary, calculateMarketplace(withSummary));
    const byId = Object.fromEntries(recon.comparisons.map((row) => [row.id, row]));
    assert.equal(byId.product_sales.status, "difference");
    assert.ok(Math.abs(byId.product_sales.difference - -7100.66) < 0.02);
    assert.equal(byId.product_sales.unresolved, true);
    assert.equal(byId.promotional_rebates.status, "difference");
    assert.ok(Math.abs(byId.promotional_rebates.difference - 38.1) < 0.02);
    assert.equal(byId.promotional_rebates.unresolved, true);
  });
});
