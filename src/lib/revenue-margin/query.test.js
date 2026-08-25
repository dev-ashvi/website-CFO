import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFactQueryPayload,
  buildQueryCacheKey,
  clearFactQueryCache,
  createStaleGuard,
  executeFactQuery,
  hasFactsUri,
  mapQueryRows,
  mixFromQueryRows,
  trendSeriesFromQueryRows,
} from "./query.js";
import { createDefaultFilters } from "./filters.js";
import { overviewSectionsFromQuerySummary, waterfallFromQuerySummary } from "./summary.js";

const result = {
  workspace_id: "local",
  job_id: "job_1",
  facts_uri: "wyz-blob://facts/job_1/financial_facts.parquet",
};

const periodRange = { min: "2025-10", max: "2025-12", months: ["2025-10", "2025-11", "2025-12"] };

describe("revenue-margin query builder", () => {
  it("detects dynamic query availability from facts_uri", () => {
    assert.equal(hasFactsUri(result), true);
    assert.equal(hasFactsUri({}), false);
  });

  it("builds a normalized query payload from shared filters", () => {
    const filters = {
      ...createDefaultFilters(periodRange),
      channel: ["Amazon"],
      category: ["Lips"],
    };
    const payload = buildFactQueryPayload({
      result,
      filters,
      groupBy: ["sku"],
      metrics: ["net_revenue", "cm2"],
      sort: { metric: "cm2", direction: "desc" },
    });
    assert.deepEqual(payload.filters.channel, ["Amazon"]);
    assert.deepEqual(payload.filters.category, ["Lips"]);
    assert.deepEqual(payload.group_by, ["sku"]);
    assert.equal(payload.sort.metric, "cm2");
  });

  it("scenario B/C/D/E: combined channel, category, period and OR channels", () => {
    const scenarioB = buildFactQueryPayload({
      result,
      filters: { ...createDefaultFilters(periodRange), channel: ["Amazon"] },
      groupBy: ["category"],
      metrics: ["net_revenue"],
    });
    assert.deepEqual(scenarioB.filters.channel, ["Amazon"]);
    assert.deepEqual(scenarioB.group_by, ["category"]);

    const scenarioC = buildFactQueryPayload({
      result,
      filters: { ...createDefaultFilters(periodRange), channel: ["Amazon"], category: ["Lips"] },
      groupBy: ["sku"],
      metrics: ["net_revenue", "gross_margin", "cm1", "cm2"],
    });
    assert.deepEqual(scenarioC.filters.category, ["Lips"]);

    const scenarioD = buildFactQueryPayload({
      result,
      filters: {
        ...createDefaultFilters(periodRange),
        month_from: "2025-10",
        month_to: "2025-12",
        channel: ["Amazon"],
        category: ["Lips"],
      },
      groupBy: ["sku"],
      metrics: ["net_revenue", "gross_margin", "cm1", "cm2"],
    });
    assert.equal(scenarioD.filters.month_from, "2025-10");
    assert.equal(scenarioD.filters.month_to, "2025-12");

    const scenarioE = buildFactQueryPayload({
      result,
      filters: { ...createDefaultFilters(periodRange), channel: ["Amazon", "Nykaa"], category: ["Lips"] },
      groupBy: ["sku"],
      metrics: ["net_revenue"],
    });
    assert.deepEqual(scenarioE.filters.channel, ["Amazon", "Nykaa"]);
  });

  it("uses a lightweight in-memory cache keyed by normalized payload", async () => {
    clearFactQueryCache();
    let calls = 0;
    const queryFn = async () => {
      calls += 1;
      return { summary: { net_revenue: 100 }, rows: [] };
    };
    const payload = buildFactQueryPayload({ result, filters: createDefaultFilters(periodRange), metrics: ["net_revenue"] });
    const key = buildQueryCacheKey("ds_1", payload);
    assert.ok(key.includes("ds_1"));
    await executeFactQuery("ds_1", payload, { queryFn });
    await executeFactQuery("ds_1", payload, { queryFn });
    assert.equal(calls, 1);
  });

  it("maps query rows with shares without recalculating financial formulas", () => {
    const rows = mapQueryRows([
      { channel: "Amazon", net_revenue: 600, orders: 6 },
      { channel: "D2C", net_revenue: 400, orders: 4 },
    ], "channel");
    assert.equal(rows[0].revenue_share, 0.6);
    assert.equal(rows[1].revenue_share, 0.4);
  });

  it("builds overview and waterfall views from query summary only", () => {
    const summary = {
      gross_revenue: 1000,
      discount: 50,
      refund: 50,
      net_revenue: 900,
      product_cogs: 400,
      gross_margin: 500,
      gross_margin_pct: 500 / 900,
      cm1_cost: 200,
      cm1: 300,
      cm1_pct: 300 / 900,
      allocated_marketing: 100,
      marketing_pct: 100 / 900,
      cm2: 200,
      cm2_pct: 200 / 900,
      orders: 10,
      customers: 8,
      units: 20,
      gross_aov: 100,
      net_aov: 90,
      units_per_order: 2,
      discount_pct: 0.05,
      return_pct: 0.01,
      rto_pct: 0.02,
      revenue_realisation_pct: 0.9,
    };
    const sections = overviewSectionsFromQuerySummary(summary);
    assert.equal(sections.revenue.find((item) => item.key === "net_revenue").value, 900);
    const waterfall = waterfallFromQuerySummary(summary);
    assert.equal(waterfall.find((step) => step.key === "net_revenue").value, 900);
    assert.equal(waterfall.find((step) => step.key === "marketing_spend").value, 100);
  });

  it("builds trend and mix series from query rows", () => {
    const rows = trendSeriesFromQueryRows([
      { month: "2025-11", net_revenue: 120, gross_margin_pct: 0.5 },
      { month: "2025-10", net_revenue: 100, gross_margin_pct: 0.48 },
    ], "net_revenue");
    assert.equal(rows[0].month, "2025-10");
    assert.equal(rows[1].value, 120);
    const mix = mixFromQueryRows(mapQueryRows([
      { channel: "Amazon", net_revenue: 300, orders: 3, units: 6, customers: 2 },
      { channel: "Nykaa", net_revenue: 100, orders: 1, units: 2, customers: 1 },
    ], "channel"));
    assert.equal(mix.revenue[0].share, 0.75);
  });

  it("shared filter context persists across overview, revenue and margin queries", () => {
    const filters = {
      ...createDefaultFilters(periodRange),
      channel: ["Amazon"],
      category: ["Lips"],
      month_from: "2025-10",
      month_to: "2025-12",
    };
    const overview = buildFactQueryPayload({ result, filters, metrics: ["net_revenue"] });
    const revenue = buildFactQueryPayload({ result, filters, groupBy: ["sku"], metrics: ["net_revenue"] });
    const margin = buildFactQueryPayload({ result, filters, groupBy: ["sku"], metrics: ["cm2"] });
    assert.deepEqual(overview.filters, revenue.filters);
    assert.deepEqual(revenue.filters, margin.filters);
  });

  it("stale request protection ignores outdated responses", () => {
    const guard = createStaleGuard();
    const first = guard.next();
    const second = guard.next();
    assert.equal(guard.isCurrent(first), false);
    assert.equal(guard.isCurrent(second), true);
  });
});
