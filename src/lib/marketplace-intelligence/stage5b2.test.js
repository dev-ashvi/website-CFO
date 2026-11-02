import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  COMPARISON_STATUS,
  INVESTIGATION_ITEM_STATUS,
  buildChartInsights,
  buildFinancialIntelligence,
  calculateMarketplace,
  connectionToStatus,
  createMarketplaceSession,
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
  postedAt = "2026-08-10",
  sourceRow = 1,
  productName = "Demo",
} = {}) {
  return {
    orderId,
    productCharges,
    amazonFees: 0,
    amazonFeesMissing: false,
    promotionalRebates: 0,
    totalInr: productCharges,
    postedAt,
    sourceRow,
    productName,
    transactionType: "Order Payment",
    classification: { kind: "order_payment" },
    lines: [{ role: "product_sale", amount: productCharges }],
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

describe("stage 5B.2 incomplete-period integrity", () => {
  it("sample August leads with incomplete coverage, not a definitive decline", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    const engine = await runMarketplaceEngine(sample.session);
    const mom = engine.metrics.intelligence.insights.find((row) =>
      row.id.startsWith("revenue_mom_"),
    );
    assert.ok(mom);
    assert.equal(mom.provisional, true);
    assert.match(mom.headline, /aren't fully comparable|not fully comparable/i);
    assert.doesNotMatch(mom.headline, /declined/i);
    assert.match(mom.shortWhy, /available records|Not a verified full-month/i);
    assert.doesNotMatch(mom.shortWhy, /symmetric split/i);
    assert.doesNotMatch(mom.headline, /fell by|declined/i);
    assert.match(
      mom.what,
      /available only through|Compare complete months|available records|Incomplete|Incompatible|Matched/i,
    );
    assert.doesNotMatch(mom.what, /2026-08-01 → 2026-08-29/);

    const charts = engine.metrics.chartInsights || buildChartInsights(engine.metrics, engine.reconciliation);
    assert.doesNotMatch(charts["monthly-sales"]?.worthInvestigating || "", /declined .*MoM/i);
    assert.match(
      charts["monthly-sales"]?.worthInvestigating || "",
      /incomplete|observed|not a verified full-month/i,
    );

    // Provisional MoM must not be auto-promoted as primary when non-provisional findings exist
    const primary = engine.metrics.intelligence.brief.primary;
    if (primary?.id?.startsWith("revenue_mom_")) {
      assert.equal(primary.provisional, false);
    } else {
      assert.ok(!primary?.provisional || primary.type !== "revenue_movement" || !primary.id.startsWith("revenue_mom_"));
    }
  });

  it("preserves TUMMYMUMMY September verified decline and attribution", async () => {
    const engine = await tummyEngine();
    if (!engine) return;
    const insight = engine.metrics.intelligence.insights.find(
      (row) => row.id === "revenue_mom_2026-08_2026-09",
    );
    assert.ok(insight);
    assert.equal(insight.provisional, false);
    assert.equal(insight.comparisonStatus, COMPARISON_STATUS.COMPLETE_COMPARABLE);
    assert.match(insight.headline, /September sales fell by 17%/i);
    assert.match(insight.shortWhy, /average order value accounted for 68%/i);
    assert.match(insight.shortWhy, /fewer orders accounted for 32%/i);
    assert.match(insight.what || insight.summary, /₹20,781\.97|₹20,782/);
    assert.match(insight.what || insight.summary, /₹17,257/);
    assert.match(insight.whatNext?.[0]?.question || "", /smaller-value orders in September/i);

    const planned = planInvestigation({
      insight,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: "tummy-5b2",
    });
    const orders = planned.plan.measuredDrivers.find((d) => d.id === "orders");
    const aov = planned.plan.measuredDrivers.find((d) => d.id === "gross_aov");
    assert.equal(orders.amount, -1127.76);
    assert.equal(aov.amount, -2397.08);

    const salesChart = engine.metrics.chartInsights["monthly-sales"]?.worthInvestigating || "";
    // Full-month September may still mention MoM; must not say provisional for Sep pair
    assert.doesNotMatch(salesChart, /August 2026 vs September 2026.*not a verified/i);
  });

  it("labels overall large-order share as background fact, period bulk as period check", async () => {
    const engine = await tummyEngine();
    if (!engine) return;
    const insight = engine.metrics.intelligence.insights.find(
      (row) => row.id === "revenue_mom_2026-08_2026-09",
    );
    const planned = planInvestigation({
      insight,
      metrics: engine.metrics,
      reconciliation: engine.reconciliation,
      sessionId: "labels",
    });
    const skew = planned.plan.checkedItems.find((c) => c.id === "skew_overall_related");
    const bulk = planned.plan.checkedItems.find((c) => c.id === "bulk_orders_period_change");
    assert.ok(skew);
    assert.equal(skew.status, INVESTIGATION_ITEM_STATUS.BACKGROUND_FACT);
    assert.match(skew.text, /Background fact|overall filter/i);
    assert.match(skew.text, /not a period-specific check/i);
    if (bulk) {
      assert.equal(bulk.status, INVESTIGATION_ITEM_STATUS.CHECKED_HYPOTHESIS);
    }
    assert.equal(
      connectionToStatus({ strength: "related_observation", assertion: "verified_level" }),
      INVESTIGATION_ITEM_STATUS.BACKGROUND_FACT,
    );
  });

  it("charts and brief agree on provisional semantics for filtered unequal windows", () => {
    const metrics = calculateMarketplace(
      {
        status: "ready",
        transactions: [
          tx({ orderId: "1", productCharges: 900, postedAt: "2026-08-20", sourceRow: 1 }),
          tx({ orderId: "2", productCharges: 800, postedAt: "2026-08-25", sourceRow: 2 }),
          tx({ orderId: "3", productCharges: 200, postedAt: "2026-09-02", sourceRow: 3 }),
          tx({ orderId: "4", productCharges: 150, postedAt: "2026-09-08", sourceRow: 4 }),
        ],
      },
      { dateRange: { start: "2026-08-15", end: "2026-09-10" }, products: [] },
    );
    metrics.chartInsights = buildChartInsights(metrics, null);
    metrics.intelligence = buildFinancialIntelligence(metrics, null);
    const mom = metrics.intelligence.insights.find((row) => row.id.startsWith("revenue_mom_"));
    assert.ok(mom?.provisional);
    assert.doesNotMatch(mom.headline, /declined/i);
    assert.doesNotMatch(metrics.chartInsights["monthly-sales"].worthInvestigating, /declined .*MoM/i);
    assert.match(metrics.chartInsights["monthly-sales"].worthInvestigating, /not a verified full-month/i);
    assert.match(metrics.chartInsights["monthly-orders"].worthInvestigating, /Observed-record|Not a verified full-month/i);
  });
});
