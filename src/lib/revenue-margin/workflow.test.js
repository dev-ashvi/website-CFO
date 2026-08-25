import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  applyMappingConfirmation,
  canStartAnalysis,
  DATASET_STATUSES,
  isIngestBusy,
  isJobBusy,
  jobErrorMessage,
  mappingRowsNeedingAttention,
  REVENUE_MARGIN_PATH,
  workflowStep,
} from "./workflow.js";
import { reconciliationLabel, selectExecutiveMetrics, selectWaterfall } from "./summary.js";

describe("revenue-margin workflow", () => {
  it("exposes the authenticated module path", () => {
    assert.equal(REVENUE_MARGIN_PATH, "/app/revenue-margin");
  });

  it("App.jsx registers the Revenue & Margin route", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const appSrc = readFileSync(join(root, "../../App.jsx"), "utf8");
    assert.match(appSrc, /revenue-margin/);
    assert.match(appSrc, /RevenueMarginPage/);
  });

  it("RevenueMarginPage imports canStartAnalysis for readiness section", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const pageSrc = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(pageSrc, /canStartAnalysis/);
    assert.match(pageSrc, /from "\.\.\/lib\/revenue-margin\/workflow\.js"/);
  });

  it("treats claimed and writing stages as busy jobs", () => {
    assert.equal(isJobBusy("QUEUED"), true);
    assert.equal(isJobBusy("CLAIMED"), true);
    assert.equal(isJobBusy("WRITING_RESULT"), true);
    assert.equal(isJobBusy("COMPLETED"), false);
  });

  it("shows a safe message for structured job errors", () => {
    assert.equal(jobErrorMessage({ type: "ENGINE_FAILURE", message: "The financial engine could not complete this analysis." }), "The financial engine could not complete this analysis.");
    assert.equal(jobErrorMessage("legacy string"), "legacy string");
  });

  it("treats profiling/mapping as busy ingest states", () => {
    assert.equal(isIngestBusy(DATASET_STATUSES.PROFILING), true);
    assert.equal(isIngestBusy(DATASET_STATUSES.READY), false);
    assert.equal(workflowStep(DATASET_STATUSES.NEEDS_REVIEW), "review");
    assert.equal(workflowStep(DATASET_STATUSES.COMPLETED), "overview");
    assert.equal(workflowStep(DATASET_STATUSES.FAILED), "failed");
  });

  it("blocks analysis until the dataset is READY and engine-ready", () => {
    assert.equal(canStartAnalysis({ status: "NEEDS_REVIEW", readiness: { ready_for_engine: false } }), false);
    assert.equal(canStartAnalysis({ status: "READY", readiness: { ready_for_engine: true } }), true);
  });

  it("focuses mapping review on uncertain statuses", () => {
    const rows = [
      { source_file: "a.csv", source_column: "nsv", canonical_field: "net_revenue", status: "auto_accepted", needs_attention: false },
      { source_file: "a.csv", source_column: "sales", canonical_field: "net_revenue", status: "user_confirmation_required", needs_attention: true },
    ];
    const attention = mappingRowsNeedingAttention(rows);
    assert.equal(attention.length, 1);
    assert.equal(attention[0].source_column, "sales");
  });

  it("preserves user confirmation provenance in local review state", () => {
    const rows = [
      { source_file: "a.csv", source_column: "txn_ref", canonical_field: "order_id", origin: "ai_proposed", status: "review_recommended" },
    ];
    const next = applyMappingConfirmation(rows, {
      source_file: "a.csv",
      source_column: "txn_ref",
      canonical_field: "order_id",
    });
    assert.equal(next[0].origin, "user_confirmed");
    assert.equal(next[0].status, "confirmed");
  });
});

describe("revenue-margin executive summary", () => {
  it("renders engine-returned values and does not invent percentages", () => {
    const result = {
      waterfall: {
        gross_revenue: 100,
        discounts: 5,
        returns_rto_cancellations: 5,
        net_revenue: 90,
        product_cogs: 20,
        gross_margin: 70,
        gross_margin_pct: 70 / 90,
        cm1_costs: 10,
        cm1: 60,
        cm1_pct: 60 / 90,
        marketing_spend: 15,
        cm2: 45,
        cm2_pct: 45 / 90,
      },
      orders: 3,
      units: 8,
      customers: 2,
      reconciled: true,
    };
    const metrics = selectExecutiveMetrics(result);
    assert.equal(metrics.find((item) => item.key === "orders").value, 3);
    assert.equal(metrics.find((item) => item.key === "cm2").value, 45);
    assert.equal(metrics.find((item) => item.key === "cm2_pct").value, 45 / 90);
    const missingPct = selectExecutiveMetrics({ waterfall: { cm2: 45 }, orders: 1 });
    assert.equal(missingPct.find((item) => item.key === "cm2_pct").value, null);
    const waterfall = selectWaterfall(result);
    assert.equal(waterfall[0].key, "gross_revenue");
    assert.equal(waterfall.at(-1).key, "cm2");
    assert.equal(reconciliationLabel(result).ok, true);
    assert.equal(reconciliationLabel({ reconciled: false, reconciliation: { ok: false } }).ok, false);
  });
});
