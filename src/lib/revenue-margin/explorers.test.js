import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_VIEWS,
  compareGrowthDisplay,
  dataQualityItems,
  dimensionRows,
  explorerPayload,
  filterRowsForExplorer,
  MARGIN_METRICS,
  overviewSections,
  pushDrillTrail,
  sortRows,
} from "./explorers.js";
import { formatExplorerValue } from "./format.js";

const sampleResult = {
  reconciled: true,
  orders: 100,
  units: 250,
  customers: 80,
  waterfall: {
    gross_revenue: 1000,
    net_revenue: 900,
    gross_margin: 500,
    gross_margin_pct: 500 / 900,
    cm1: 300,
    cm1_pct: 300 / 900,
    marketing_spend: 100,
    marketing_pct: 100 / 900,
    cm2: 200,
    cm2_pct: 200 / 900,
    discounts: 50,
  },
  validation: { joins: [{ name: "orders_to_sku", ok: true, match_pct: 1 }], missing_required_fields: [] },
  reconciliation: { ok: true, failed_checks: [] },
  explorers: {
    company: {
      gross_aov: 10,
      net_aov: 9,
      units_per_order: 2.5,
      discount_pct: 0.05,
      return_pct: null,
    },
    monthly_trend: [
      { month: "2025-04", net_revenue: 100, gross_margin_pct: 0.5, cm1_pct: 0.3, cm2_pct: 0.2 },
      { month: "2025-05", net_revenue: 120, gross_margin_pct: 0.51, cm1_pct: 0.31, cm2_pct: 0.21 },
    ],
    dimensions: {
      channel: {
        rows: [
          {
            _entity: "Amazon",
            channel: "Amazon",
            net_revenue: 600,
            orders: 60,
            gross_margin: 300,
            cm1: 180,
            cm2: 120,
            gross_margin_pct: 0.5,
            cm1_pct: 0.3,
            cm2_pct: 0.2,
            marketing_pct: 0.1,
            revenue_share: 0.6,
            profitability_class: "profitable",
            growth: { available: true, net_revenue: { pct: 0.1 }, contribution_delta: 20 },
          },
          {
            _entity: "D2C",
            channel: "D2C",
            net_revenue: 100,
            orders: 10,
            gross_margin: -20,
            cm1: -30,
            cm2: -40,
            gross_margin_pct: -0.2,
            cm1_pct: -0.3,
            cm2_pct: -0.4,
            marketing_pct: 0.2,
            revenue_share: 0.1,
            profitability_class: "negative_gross_margin",
            growth: { available: false },
          },
        ],
        mix: { revenue: [{ entity: "Amazon", share: 0.6 }] },
      },
    },
    concentration: { cm2: { top: [{ entity: "Amazon", value: 120 }] } },
    gaps: ["yoy_growth_requires_12_month_history"],
  },
};

describe("revenue-margin explorers", () => {
  it("exposes analysis view ids for navigation", () => {
    assert.equal(ANALYSIS_VIEWS.OVERVIEW, "overview");
    assert.equal(ANALYSIS_VIEWS.REVENUE, "revenue");
    assert.equal(ANALYSIS_VIEWS.MARGIN, "margin");
    assert.equal(ANALYSIS_VIEWS.DATA_QUALITY, "data_quality");
  });

  it("builds overview sections from persisted explorer payload", () => {
    const sections = overviewSections(sampleResult);
    assert.equal(sections.revenue.find((item) => item.key === "net_aov").value, 9);
    assert.equal(sections.profitability.find((item) => item.key === "cm2_pct").value, 200 / 900);
  });

  it("sorts dimension rows without recalculating values", () => {
    const rows = dimensionRows(sampleResult, "channel");
    const sorted = sortRows(rows, "net_revenue");
    assert.equal(sorted[0]._entity, "Amazon");
  });

  it("surfaces unsupported metrics as unavailable", () => {
    const formatted = formatExplorerValue(null, "pct");
    assert.equal(formatted.supported, false);
    assert.equal(formatted.text, "—");
  });

  it("shows structured negative contribution classes", () => {
    const rows = dimensionRows(sampleResult, "channel");
    const lossMaker = rows.find((row) => row._entity === "D2C");
    assert.equal(lossMaker.profitability_class, "negative_gross_margin");
  });

  it("prefers growth contribution alongside percentage", () => {
    const rows = dimensionRows(sampleResult, "channel");
    const amazon = rows.find((row) => row._entity === "Amazon");
    const growth = compareGrowthDisplay(amazon);
    assert.equal(growth.supported, true);
    assert.equal(growth.delta, 20);
    assert.ok(growth.materiality > 0);
  });

  it("keeps data quality accessible from analysis workspace", () => {
    const dq = dataQualityItems(sampleResult);
    assert.equal(dq.reconciled, true);
    assert.ok(explorerPayload(sampleResult));
    assert.ok(dq.gaps.length >= 1);
  });

  it("filters sku rows when drilling from category", () => {
    const skuResult = {
      ...sampleResult,
      explorers: {
        ...sampleResult.explorers,
        dimensions: {
          ...sampleResult.explorers.dimensions,
          sku: {
            rows: [
              { _entity: "SKU-1", sku_id: "SKU-1", category: "Face", net_revenue: 50 },
              { _entity: "SKU-2", sku_id: "SKU-2", category: "Lips", net_revenue: 30 },
            ],
          },
        },
      },
    };
    const trail = pushDrillTrail([{ level: "company", label: "Company", value: null }], "category", "Face", "Face");
    const filtered = filterRowsForExplorer(dimensionRows(skuResult, "sku"), {
      dimensionId: "sku",
      trail,
    });
    assert.equal(filtered.rows.length, 1);
    assert.equal(filtered.rows[0].sku_id, "SKU-1");
  });

  it("surfaces drill gap when channel scope cannot filter category rows", () => {
    const trail = pushDrillTrail([{ level: "company", label: "Company", value: null }], "channel", "Amazon", "Amazon");
    const filtered = filterRowsForExplorer(dimensionRows(sampleResult, "category"), {
      dimensionId: "category",
      trail,
    });
    assert.ok(filtered.gap);
    assert.equal(filtered.rows.length, 0);
  });

  it("sorts by growth materiality without recalculating engine values", () => {
    const rows = dimensionRows(sampleResult, "channel");
    const sorted = sortRows(rows, "growth_materiality");
    assert.equal(sorted[0]._entity, "Amazon");
  });

  it("uses attributed marketing terminology instead of ambiguous MKT labels", () => {
    const marketing = MARGIN_METRICS.find((item) => item.id === "marketing_pct");
    assert.ok(marketing.label.includes("Attributed Marketing"));
    assert.ok(marketing.tooltip.includes("attribution methodology"));
    assert.equal(marketing.label.includes("MKT"), false);
  });
});
