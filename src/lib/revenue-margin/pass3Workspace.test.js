import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dataQualityStatusSummary,
  mappingProvenanceSummary,
} from "./dataQuality.js";

const root = dirname(fileURLToPath(import.meta.url));

describe("P7.1 Pass 3 Data Quality provenance", () => {
  it("A/B/C. Data Quality workspace renders sources, mappings, validation sections", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/DataQualityWorkspace.jsx"), "utf8");
    assert.match(src, /Data sources/);
    assert.match(src, /Data mappings/);
    assert.match(src, /Validation & join coverage/);
    assert.match(src, /Technical details/);
    assert.match(src, /detectSourceCards/);
    assert.match(src, /mappingProvenanceSummary/);
    assert.match(src, /readinessDisplayItems/);
    assert.doesNotMatch(src, /Data Quality Score/);
    assert.doesNotMatch(src, /92\/100/);
  });

  it("D. status summary never invents a numeric score", () => {
    const healthy = dataQualityStatusSummary({
      result: { reconciled: true, validation: { joins: [{ name: "a", ok: true, match_pct: 1 }] } },
      dataset: { readiness: { ready_for_engine: true, joins: [{ name: "a", ok: true, match_pct: 1 }] } },
    });
    assert.equal(healthy.label, "Healthy");
    assert.equal(healthy.tone, "healthy");

    const attention = dataQualityStatusSummary({
      result: {
        reconciled: false,
        validation: { missing_required_fields: ["ORDER_LINES:order_id"] },
      },
      dataset: { readiness: { ready_for_engine: false } },
    });
    assert.equal(attention.label, "Needs attention");
    assert.ok(attention.failingCount >= 1);
    assert.equal(Object.prototype.hasOwnProperty.call(healthy, "score"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(attention, "score"), false);
  });

  it("E. technical metadata stays out of Overview, lives in Data Quality", () => {
    const workspace = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    const overviewSlice = workspace.slice(
      workspace.indexOf("view === ANALYSIS_VIEWS.OVERVIEW"),
      workspace.indexOf("view === ANALYSIS_VIEWS.REVENUE"),
    );
    assert.doesNotMatch(overviewSlice, /engine_version/);
    assert.doesNotMatch(overviewSlice, /mapping_version/);
    assert.match(workspace, /DataQualityWorkspace/);
    const dq = readFileSync(join(root, "../../components/revenue-margin/DataQualityWorkspace.jsx"), "utf8");
    assert.match(dq, /engine_version/);
    assert.match(dq, /mapping_version/);
  });

  it("mapping provenance counts come from existing rows", () => {
    const summary = mappingProvenanceSummary([
      { status: "auto_accepted", needs_attention: false, source_file: "a", source_column: "x", canonical_field: "net_revenue" },
      { status: "user_confirmation_required", needs_attention: true, source_file: "a", source_column: "y", canonical_field: "sku_id" },
      { status: "confirmed", origin: "user_confirmed", needs_attention: false, source_file: "a", source_column: "z", canonical_field: "qty" },
    ]);
    assert.equal(summary.total, 3);
    assert.equal(summary.needingAttention, 1);
    assert.equal(summary.autoAccepted, 2);
    assert.equal(summary.userConfirmed, 1);
  });
});

describe("P7.1 Pass 3 AI CFO / decisions / hierarchy", () => {
  it("F. AI CFO question submission wiring unchanged", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AiCfoDrawer.jsx"), "utf8");
    assert.match(src, /askAiCfo/);
    assert.match(src, /async function submit\(question/);
    assert.match(src, /placeholder="Ask WYZ about this view/);
    assert.match(src, /WYZ AI CFO/);
  });

  it("G. Ask WYZ from signal still sends signal context", () => {
    const workspace = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    const drawer = readFileSync(join(root, "../../components/revenue-margin/AiCfoDrawer.jsx"), "utf8");
    const signals = readFileSync(join(root, "../../components/revenue-margin/CfoSignalsPanel.jsx"), "utf8");
    assert.match(workspace, /buildSignalContext/);
    assert.match(workspace, /setAskWyzRequest/);
    assert.match(workspace, /askWyzRequest=\{askWyzRequest\}/);
    assert.match(drawer, /signalContext/);
    assert.match(drawer, /askWyzRequest\.signalContext/);
    assert.match(signals, /Ask WYZ about this/);
  });

  it("H/I. scenario + track decision APIs unchanged", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AiCfoDrawer.jsx"), "utf8");
    assert.match(src, /isScenarioAnswer/);
    assert.match(src, /presentScenarioEvidenceList/);
    assert.match(src, /trackStrategicDecision/);
    assert.match(src, /Track this decision/);
    assert.match(src, /TRACK_STRATEGIC_DECISION/);
  });

  it("J/K. tracked decisions populated + compact empty", () => {
    const panel = readFileSync(join(root, "../../components/revenue-margin/TrackedDecisionsPanel.jsx"), "utf8");
    assert.match(panel, /Review decision/);
    assert.match(panel, /None yet/);
    assert.match(panel, /border-dashed/);
    assert.match(panel, /listStrategicDecisions/);
    assert.match(panel, /reviewStrategicDecision/);
  });

  it("L. completed dataset still excludes onboarding", () => {
    const page = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(page, /PRESENTATION_MODE\.WORKSPACE/);
    assert.match(page, /dataset=\{dataset\}/);
    assert.doesNotMatch(page, /1\. Dataset/);
  });

  it("M. Pass 2 Overview hierarchy unchanged", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    const primaryIdx = src.indexOf("<PrimaryKpiRow");
    const signalsIdx = src.indexOf('title="What Needs Your Attention"');
    const trendIdx = src.indexOf("<TrendPanel");
    const waterfallIdx = src.indexOf("<FinancialWaterfall");
    const secondaryIdx = src.indexOf("Business metrics");
    assert.ok(primaryIdx > 0 && signalsIdx > primaryIdx && trendIdx > signalsIdx);
    assert.ok(waterfallIdx > trendIdx && secondaryIdx > waterfallIdx);
  });
});
