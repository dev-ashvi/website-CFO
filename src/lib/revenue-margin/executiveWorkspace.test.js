import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRIMARY_KPI_KEYS,
  overviewSectionsFromQuerySummary,
  secondaryOverviewSections,
  selectPrimaryKpis,
  selectWaterfall,
  waterfallRowTone,
} from "./summary.js";
import { overviewSections } from "./explorers.js";

const root = dirname(fileURLToPath(import.meta.url));

describe("P7.1 Pass 2 executive workspace helpers", () => {
  it("B. primary KPI row uses existing summary values only", () => {
    const sections = overviewSectionsFromQuerySummary({
      net_revenue: 141_400_000,
      gross_margin_pct: 0.631,
      cm1: 52_200_000,
      cm2: 23_500_000,
      gross_revenue: 160_000_000,
      orders: 10,
    });
    const primary = selectPrimaryKpis(sections);
    assert.deepEqual(
      primary.map((item) => item.key),
      ["net_revenue", "gross_margin_pct", "cm1", "cm2"],
    );
    assert.equal(primary.find((item) => item.key === "net_revenue").value, 141_400_000);
    assert.equal(primary.find((item) => item.key === "gross_margin_pct").value, 0.631);
    assert.equal(primary.find((item) => item.key === "cm1").value, 52_200_000);
    assert.equal(primary.find((item) => item.key === "cm2").value, 23_500_000);
  });

  it("C. no hardcoded screenshot currency strings in Pass 2 components", () => {
    const files = [
      "../../components/revenue-margin/PrimaryKpiRow.jsx",
      "../../components/revenue-margin/FinancialWaterfall.jsx",
      "../../components/revenue-margin/AnalysisWorkspace.jsx",
    ];
    for (const rel of files) {
      const src = readFileSync(join(root, rel), "utf8");
      assert.doesNotMatch(src, /₹14\.14/);
      assert.doesNotMatch(src, /14\.14\s*Cr/);
      assert.doesNotMatch(src, /63\.1%/);
      assert.doesNotMatch(src, /₹5\.22/);
      assert.doesNotMatch(src, /₹2\.35/);
    }
  });

  it("G. secondary metrics drop primary keys to avoid duplication", () => {
    const sections = overviewSections({
      waterfall: {
        net_revenue: 100,
        gross_margin: 60,
        gross_margin_pct: 0.6,
        cm1: 40,
        cm2: 20,
      },
      company: {
        net_revenue: 100,
        gross_margin_pct: 0.6,
        cm1: 40,
        cm2: 20,
        orders: 3,
        discount_pct: 0.1,
      },
    });
    const secondary = secondaryOverviewSections(sections);
    for (const key of PRIMARY_KPI_KEYS) {
      assert.equal(
        [...secondary.revenue, ...secondary.profitability, ...secondary.quality].some((item) => item.key === key),
        false,
        `primary key ${key} should not appear in secondary`,
      );
    }
    assert.ok(secondary.revenue.some((item) => item.key === "orders"));
    assert.ok(secondary.quality.some((item) => item.key === "discount_pct"));
  });

  it("waterfall result rows are marked distinctly", () => {
    const steps = selectWaterfall({
      waterfall: {
        gross_revenue: 100,
        discounts: 5,
        net_revenue: 90,
        cm2: 20,
      },
    });
    assert.equal(waterfallRowTone(steps.find((s) => s.key === "net_revenue")), "result");
    assert.equal(waterfallRowTone(steps.find((s) => s.key === "discounts")), "deduction");
    assert.equal(waterfallRowTone(steps.find((s) => s.key === "cm2")), "result");
  });
});

describe("P7.1 Pass 2 workspace wiring", () => {
  it("A/D/E/F Overview hierarchy: primary → signals → trend → waterfall → secondary", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    const primaryIdx = src.indexOf("<PrimaryKpiRow");
    const signalsIdx = src.indexOf('title="What Needs Your Attention"');
    const trendIdx = src.indexOf("<TrendPanel");
    const waterfallIdx = src.indexOf("<FinancialWaterfall");
    const secondaryIdx = src.indexOf("Business metrics");
    assert.ok(primaryIdx > 0);
    assert.ok(signalsIdx > primaryIdx);
    assert.ok(trendIdx > signalsIdx);
    assert.ok(waterfallIdx > trendIdx);
    assert.ok(secondaryIdx > waterfallIdx);
  });

  it("H. filters remain compact with clear/expand and unchanged helpers", () => {
    const filters = readFileSync(join(root, "../../components/revenue-margin/AnalysisFilters.jsx"), "utf8");
    assert.match(filters, /Clear/);
    assert.match(filters, /Filters/);
    assert.match(filters, /clearFilters/);
    assert.match(filters, /removeFilterChip/);
    assert.match(filters, /aria-expanded/);
    assert.match(filters, /More filters/);
  });

  it("I. tabs Overview/Revenue/Margin/Data Quality preserved", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    assert.match(src, /label: "Overview"/);
    assert.match(src, /label: "Revenue"/);
    assert.match(src, /label: "Margin"/);
    assert.match(src, /label: "Data Quality"/);
  });

  it("J. Ask WYZ / Investigate wiring unchanged", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    assert.match(src, /onInvestigate=\{handleInvestigate\}/);
    assert.match(src, /onAskWyz=\{handleAskWyz\}/);
    assert.match(src, /ASK_WYZ_STARTER_QUESTION/);
    assert.match(src, /buildSignalContext/);
  });

  it("K. Tracked Decisions still mounted with seed + refresh", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    assert.match(src, /TrackedDecisionsPanel/);
    assert.match(src, /seedDecision/);
    assert.match(src, /trackedRefreshKey/);
    const panel = readFileSync(join(root, "../../components/revenue-margin/TrackedDecisionsPanel.jsx"), "utf8");
    assert.match(panel, /None yet/);
    assert.match(panel, /listStrategicDecisions/);
  });

  it("L. AI CFO still receives view/filter/signal context", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    assert.match(src, /<AiCfoDrawer/);
    assert.match(src, /filters=\{filters\}/);
    assert.match(src, /surface=\{surface\}/);
    assert.match(src, /signals=\{cfoSignals\}/);
    assert.match(src, /askWyzRequest=\{askWyzRequest\}/);
  });

  it("M. completed workspace header is business-oriented", () => {
    const src = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    assert.match(src, /Financial workspace/);
    assert.match(src, /Understand revenue, profitability and the decisions driving performance/);
    assert.doesNotMatch(src, /deterministic WYZ engine/);
    assert.doesNotMatch(src, /Dynamic financial query/);
    assert.match(src, /DataQualityWorkspace/);
  });

  it("completed page still routes Mode B without onboarding stack", () => {
    const page = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(page, /resolvePresentationMode/);
    assert.match(page, /PRESENTATION_MODE\.WORKSPACE/);
    assert.doesNotMatch(page, /1\. Dataset/);
  });
});
