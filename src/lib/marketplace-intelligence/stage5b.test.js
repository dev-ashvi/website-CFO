import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  FACT_SCHEMA_VERSION,
  INVESTIGATION_PLAN_VERSION,
  askMarketplaceWyz,
  buildAskPayload,
  buildChartInsights,
  buildFactStore,
  buildFinancialIntelligence,
  calculateMarketplace,
  createEmptyFilters,
  createMarketplaceSession,
  investigationPlanForWire,
  measureBulkOrdersByMonth,
  normalizeAmazonCsvText,
  parseUnifiedSummaryPdf,
  planInvestigation,
  reconcileSettlement,
  requestSampleDataset,
  runMarketplaceEngine,
} from "./index.js";

const REAL_CSV = "C:/Users/apoor/Downloads/Transactions for time period 1_4_2026 - 30_9_2026.csv";
const REAL_PDF = "C:/Users/apoor/Downloads/2026Apr1-2026Sep30CustomUnifiedSummary.pdf";

function tx({
  orderId,
  productCharges = 0,
  amazonFees = 0,
  postedAt = "2026-08-10",
  sourceRow = 1,
  productName = "Demo",
  kind = "order_payment",
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

describe("stage 5B investigation planner mapping", () => {
  it("maps revenue, skew, fees, product, and recon insights to families", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [
        tx({ orderId: "1", productCharges: 800, postedAt: "2026-08-01", sourceRow: 1, productName: "A" }),
        tx({ orderId: "2", productCharges: 700, postedAt: "2026-08-02", sourceRow: 2, productName: "A" }),
        tx({ orderId: "3", productCharges: 2000, postedAt: "2026-08-03", sourceRow: 3, productName: "B" }),
        tx({ orderId: "4", productCharges: 300, postedAt: "2026-09-01", sourceRow: 4, productName: "A" }),
        tx({ orderId: "5", productCharges: 200, postedAt: "2026-09-02", sourceRow: 5, productName: "B" }),
        tx({ orderId: "6", productCharges: 100, amazonFees: -40, postedAt: "2026-09-03", sourceRow: 6, productName: "C" }),
      ],
    });
    metrics.intelligence = buildFinancialIntelligence(metrics, {
      comparisons: [{ id: "product_sales", status: "difference", difference: -50, unresolved: true }],
    });

    const byType = Object.fromEntries(
      metrics.intelligence.insights.map((row) => [
        row.type,
        planInvestigation({ insight: row, metrics, sessionId: "sess-a" }),
      ]),
    );

    assert.equal(byType.revenue_movement.family, "revenue_decline");
    assert.equal(byType.revenue_movement.status, "ready");
    if (byType.order_value_skew) {
      assert.equal(byType.order_value_skew.family, "large_order_dependence");
      assert.equal(byType.order_value_skew.status, "ready");
    }
    if (byType.fee_burden) assert.equal(byType.fee_burden.family, "fee_burden");
    if (byType.product_concentration) {
      assert.equal(byType.product_concentration.family, "product_movement");
    }
    const recon = metrics.intelligence.insights.find((row) => row.groupKey === "recon_exceptions");
    if (recon) {
      const plan = planInvestigation({ insight: recon, metrics, sessionId: "sess-a" });
      assert.equal(plan.family, "reconciliation_exceptions");
    }
  });
});

describe("stage 5B September decline + Orders/AOV + large-order connection rules", () => {
  it("plans September investigation with symmetric drivers and non-causal skew link", async () => {
    const engine = await tummyEngine();
    if (!engine) return;
    const insight = engine.metrics.intelligence.insights.find(
      (row) => row.id === "revenue_mom_2026-08_2026-09",
    );
    assert.ok(insight);
    const planned = planInvestigation({
      insight,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: "tummy-session",
    });
    assert.equal(planned.schemaVersion, INVESTIGATION_PLAN_VERSION);
    assert.equal(planned.family, "revenue_decline");
    assert.ok(planned.plan.measuredDrivers.some((d) => d.id === "orders" || d.id === "gross_aov"));
    const aovDriver = planned.plan.measuredDrivers.find((d) => d.id === "gross_aov");
    const orderDriver = planned.plan.measuredDrivers.find((d) => d.id === "orders");
    assert.ok(aovDriver && orderDriver);
    assert.ok(Math.abs(aovDriver.amount) > Math.abs(orderDriver.amount));

    const skewLink = planned.plan.connections.find((c) => c.id === "skew_overall_related");
    assert.ok(skewLink);
    assert.equal(skewLink.requiresFurtherAnalysis, true);
    assert.match(skewLink.text, /not a period-specific check|Background fact/i);

    const causalUpgrade = planned.plan.connections.find(
      (c) => c.assertion === "proven_large_order_causation",
    );
    assert.equal(causalUpgrade, undefined);

    console.log(
      JSON.stringify({
        septemberInvestigation: {
          question: planned.question,
          drivers: planned.plan.measuredDrivers,
          connections: planned.plan.connections.map((c) => ({
            id: c.id,
            strength: c.strength,
            assertion: c.assertion,
          })),
          next: planned.plan.nextInvestigations.map((n) => n.question),
        },
      }),
    );
  });

  it("only asserts period bulk change when bulkOrders evidence exists", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [
        tx({ orderId: "b1", productCharges: 2000, postedAt: "2026-08-05", sourceRow: 1 }),
        tx({ orderId: "s1", productCharges: 200, postedAt: "2026-08-06", sourceRow: 2 }),
        tx({ orderId: "s2", productCharges: 200, postedAt: "2026-08-07", sourceRow: 3 }),
        tx({ orderId: "s3", productCharges: 180, postedAt: "2026-09-05", sourceRow: 4 }),
        tx({ orderId: "s4", productCharges: 180, postedAt: "2026-09-06", sourceRow: 5 }),
      ],
    });
    metrics.intelligence = buildFinancialIntelligence(metrics, null);
    const revenue = metrics.intelligence.insights.find((row) => row.type === "revenue_movement");
    const planned = planInvestigation({ insight: revenue, metrics, sessionId: "bulk" });
    const bulkConn = planned.plan.connections.find((c) => c.id === "bulk_orders_period_change");
    // May or may not qualify as bulk depending on threshold; never "proven causation"
    if (bulkConn) {
      assert.notEqual(bulkConn.assertion, "proven_large_order_causation");
      assert.equal(bulkConn.requiresFurtherAnalysis, true);
    }
    const measured = measureBulkOrdersByMonth(metrics, "2026-08", "2026-09");
    assert.equal(typeof measured.available, "boolean");
  });
});

describe("stage 5B missing data, COGS, recon, currency grounding", () => {
  it("flags missing COGS and unresolved recon in the plan", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [tx({ orderId: "1", productCharges: 500, postedAt: "2026-08-01", sourceRow: 1 })],
    });
    metrics.intelligence = buildFinancialIntelligence(metrics, {
      comparisons: [
        { id: "product_sales", status: "difference", difference: -7100.66, unresolved: true },
        { id: "gst", status: "missing_information" },
      ],
    });
    const recon = metrics.intelligence.insights.find((row) => row.groupKey === "recon_exceptions");
    const planned = planInvestigation({
      insight: recon || metrics.intelligence.brief.primary,
      metrics,
      reconciliation: {
        comparisons: [
          { id: "product_sales", status: "difference", difference: -7100.66 },
          { id: "gst", status: "missing_information" },
        ],
      },
      sessionId: "recon",
    });
    assert.ok(planned.plan.missingData.some((m) => /gst|product_sales|bank_transfers|settlement/i.test(m.id)));
    assert.ok(planned.plan.missingData.every((m) => !/not_comparable|missing_information/.test(m.label)));
  });

  it("fact store is INR and session-scoped without cross-session leakage", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [tx({ orderId: "1", productCharges: 500, postedAt: "2026-08-01", sourceRow: 1 })],
    });
    const a = buildFactStore({ metrics, sessionId: "session-a" });
    const b = buildFactStore({ metrics, sessionId: "session-b" });
    assert.equal(a.schemaVersion, FACT_SCHEMA_VERSION);
    assert.equal(a.currency, "INR");
    assert.equal(a.sessionId, "session-a");
    assert.equal(b.sessionId, "session-b");
    assert.notEqual(a.sessionId, b.sessionId);
    assert.ok(a.byId["kpi.gross_product_sales"]);
  });

  it("wire payload includes investigation facts and stays within size limits", () => {
    const metrics = calculateMarketplace({
      status: "ready",
      transactions: [
        tx({ orderId: "1", productCharges: 800, postedAt: "2026-08-01", sourceRow: 1 }),
        tx({ orderId: "2", productCharges: 400, postedAt: "2026-09-01", sourceRow: 2 }),
      ],
    });
    metrics.intelligence = buildFinancialIntelligence(metrics, null);
    const planned = planInvestigation({
      insight: metrics.intelligence.brief.primary,
      metrics,
      sessionId: "wire",
    });
    const wirePlan = investigationPlanForWire(planned);
    const payload = buildAskPayload({
      question: planned.question,
      metrics,
      context: { sectionId: "topline", insightId: planned.insightId },
      guided: { answer: "Guided INR answer", evidence: [] },
      investigationPlan: wirePlan,
    });
    assert.ok(payload.investigation);
    assert.ok(Array.isArray(payload.investigation.facts));
    assert.ok(JSON.stringify(payload).length <= 14000);
    assert.ok(payload.investigation.rules.some((r) => /factId/i.test(r)));
  });

  it("Ask falls back when NVIDIA is unavailable and keeps investigation plan", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session, createEmptyFilters());
    const insight = engine.metrics.intelligence.brief.primary;
    const planned = planInvestigation({
      insight,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: sample.session.id,
    });
    const response = await askMarketplaceWyz({
      question: planned.question,
      context: { sectionId: "topline", insightId: insight.id, sessionId: sample.session.id },
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      investigation: planned,
      fetchImpl: async () => {
        throw new Error("network");
      },
    });
    assert.equal(response.source, "guided");
    assert.equal(response.status, "network_error");
    assert.equal(response.currency, "INR");
    assert.ok(response.investigation);
    assert.doesNotMatch(response.answer, /\$\d|USD/);
  });

  it("rejects unsupported business-cause upgrades in connection assertions", async () => {
    const engine = await tummyEngine();
    if (!engine) return;
    const insight = engine.metrics.intelligence.insights.find((row) =>
      row.id.startsWith("revenue_mom_"),
    );
    const planned = planInvestigation({
      insight,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: "cause",
    });
    for (const c of planned.plan.connections) {
      assert.notEqual(c.assertion, "business_cause_proven");
      assert.doesNotMatch(c.text || "", /therefore demand fell|competitors stole/i);
    }
    assert.ok(planned.plan.unverifiedHypotheses.every((h) => h.status === "unverified"));
  });
});

describe("stage 5B product incomplete coverage + sample workspace plan", () => {
  it("qualifies incomplete product movement in the planner", () => {
    const metrics = {
      status: "calculated",
      currency: "INR",
      period: { start: "2026-08-15", end: "2026-09-10" },
      filters: { dateRange: { start: "2026-08-15", end: "2026-09-10" }, products: [] },
      kpis: {
        grossProductSales: 500,
        productProfit: null,
        orderValues: { orderCount: 2, aov: 250, medianOrderValue: 250, ordersAbove2xMedian: 0 },
      },
      sections: {
        topline: {
          monthly: [
            { month: "2026-08", sales: 300, orders: 1, aov: 300 },
            { month: "2026-09", sales: 200, orders: 1, aov: 200 },
          ],
          bulkOrders: [],
        },
        amazon_economics: {},
        product_performance: { products: [], productMonthly: [] },
        profitability: {},
      },
      intelligence: {
        insights: [
          {
            id: "product_move_X",
            type: "product_concentration",
            headline: "X: move",
            what: "move",
            summary: "s",
            hypotheses: [],
            whatNext: [],
            why: { drivers: [] },
            metrics: [],
            links: { sectionIds: ["product_performance"], chartIds: ["product-mix"] },
            confidenceFacets: { coverage: "incomplete", calculation: "high" },
          },
        ],
      },
    };
    const planned = planInvestigation({
      insight: metrics.intelligence.insights[0],
      metrics,
      sessionId: "partial",
    });
    assert.ok(planned.plan.connections.some((c) => c.id === "product_incomplete_coverage"));
  });
});
