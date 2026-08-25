import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextDrillDimension } from "./explorers.js";
import { createDefaultFilters, createEmptyFilters } from "./filters.js";
import {
  INVESTIGATION_HIERARCHY,
  investigationPreservesUnrelated,
  narrowScope,
  nextDrillDimension as nextDrillFromContract,
  nextExplorerDimension,
  resolveInvestigation,
  resolveInvestigationSurface,
} from "./investigation.js";

const periodRange = { min: "2025-12", max: "2026-03" };

function baseFilters(overrides = {}) {
  return {
    ...createDefaultFilters(periodRange),
    ...overrides,
  };
}

describe("investigation hierarchy contract", () => {
  it("A1: company → investigate channel D2C Website → category next", () => {
    const filters = baseFilters();
    const result = resolveInvestigation({
      filters,
      dimension: "channel",
      value: "D2C Website",
      signal: { signal_type: "MARKETING_PRESSURE", entity_type: "channel", entity: "D2C Website" },
    });
    assert.deepEqual(result.filters.channel, ["D2C Website"]);
    assert.deepEqual(result.filters.category, []);
    assert.deepEqual(result.filters.sku, []);
    assert.equal(result.dimension, "category");
    assert.equal(result.surface, "margin");
  });

  it("A2: existing category preserved; next is sku", () => {
    const filters = baseFilters({
      category: ["Lips"],
      month_from: "2025-12",
      month_to: "2026-03",
    });
    const result = resolveInvestigation({
      filters,
      dimension: "channel",
      value: "D2C Website",
      signal: { signal_type: "positive_cm1_negative_cm2", entity_type: "channel", entity: "D2C Website" },
    });
    assert.deepEqual(result.filters.channel, ["D2C Website"]);
    assert.deepEqual(result.filters.category, ["Lips"]);
    assert.equal(result.filters.month_from, "2025-12");
    assert.equal(result.filters.month_to, "2026-03");
    assert.equal(result.dimension, "sku");
    assert.ok(investigationPreservesUnrelated(filters, result.filters, "channel"));
  });

  it("A3: channel → category Lips → sku next", () => {
    const filters = baseFilters({ channel: ["D2C Website"] });
    const result = resolveInvestigation({
      filters,
      dimension: "category",
      value: "Lips",
    });
    assert.deepEqual(result.filters.channel, ["D2C Website"]);
    assert.deepEqual(result.filters.category, ["Lips"]);
    assert.equal(result.dimension, "sku");
  });

  it("A4: channel + category → SKU is terminal", () => {
    const filters = baseFilters({
      channel: ["D2C Website"],
      category: ["Lips"],
    });
    const result = resolveInvestigation({
      filters,
      dimension: "sku",
      value: "SKU007",
    });
    assert.deepEqual(result.filters.channel, ["D2C Website"]);
    assert.deepEqual(result.filters.category, ["Lips"]);
    assert.deepEqual(result.filters.sku, ["SKU007"]);
    assert.equal(result.dimension, null);
  });

  it("A5: preserves unrelated dimensions and period", () => {
    const filters = baseFilters({
      channel: ["Amazon"],
      region: ["South"],
      platform: ["Marketplace"],
      month_from: "2025-12",
      month_to: "2026-03",
    });
    const result = resolveInvestigation({
      filters,
      dimension: "category",
      value: "Lips",
    });
    assert.deepEqual(result.filters.channel, ["Amazon"]);
    assert.deepEqual(result.filters.category, ["Lips"]);
    assert.deepEqual(result.filters.region, ["South"]);
    assert.deepEqual(result.filters.platform, ["Marketplace"]);
    assert.equal(result.filters.month_from, "2025-12");
    assert.equal(result.filters.month_to, "2026-03");
    assert.ok(investigationPreservesUnrelated(filters, result.filters, "category"));
  });

  it("A6: multi-value dimension is replaced (narrowed), never broadened", () => {
    const filters = baseFilters({
      channel: ["Amazon", "Nykaa"],
      category: ["Lips"],
    });
    const narrowed = narrowScope(filters, "channel", "Amazon");
    assert.deepEqual(narrowed.channel, ["Amazon"]);
    assert.deepEqual(narrowed.category, ["Lips"]);
    assert.equal(narrowed.channel.length, 1);
    assert.ok(!narrowed.channel.includes("Nykaa"));
  });

  it("A7: signal Investigate uses entity_type + entity; preserves Lips; routes Margin; next sku", () => {
    const filters = baseFilters({
      category: ["Lips"],
      month_from: "2025-12",
      month_to: "2026-03",
    });
    const signal = {
      signal_type: "MARKETING_PRESSURE",
      entity_type: "channel",
      entity: "D2C Website",
      stage: "MARKETING",
      // Must be ignored as filter authority:
      filters: { channel: ["Amazon"], category: [] },
    };
    const result = resolveInvestigation({
      filters,
      dimension: signal.entity_type,
      value: signal.entity,
      signal,
    });
    assert.deepEqual(result.filters.channel, ["D2C Website"]);
    assert.deepEqual(result.filters.category, ["Lips"]);
    assert.equal(result.filters.month_from, "2025-12");
    assert.equal(result.surface, "margin");
    assert.equal(result.dimension, "sku");
    // signal.filters must not win
    assert.notDeepEqual(result.filters.channel, signal.filters.channel);
  });

  it("A8: growth/revenue signals route to Revenue explorer", () => {
    assert.equal(
      resolveInvestigationSurface({ signal_type: "HIGH_GROWTH_MARGIN_COMPRESSION" }),
      "revenue",
    );
    assert.equal(
      resolveInvestigationSurface({ signal_type: "DECLINING_REVENUE_MARGIN_EXPANSION" }),
      "revenue",
    );
    assert.equal(
      resolveInvestigationSurface({ signal_type: "MARKETING_PRESSURE" }),
      "margin",
    );
    assert.equal(
      resolveInvestigationSurface({ signal_type: "TOP_CM2_CONTRIBUTOR" }),
      "margin",
    );
    const result = resolveInvestigation({
      filters: baseFilters(),
      dimension: "channel",
      value: "Amazon",
      signal: { signal_type: "HIGH_GROWTH_QUALITY_DETERIORATION", entity_type: "channel", entity: "Amazon" },
    });
    assert.equal(result.surface, "revenue");
  });

  it("A9: investigation helpers do not construct scope_hash", () => {
    const src = [
      narrowScope.toString(),
      nextExplorerDimension.toString(),
      resolveInvestigation.toString(),
    ].join("\n");
    assert.equal(/scope_hash/i.test(src), false);
    assert.deepEqual(INVESTIGATION_HIERARCHY, ["channel", "category", "sku"]);
  });

  it("fixes nextDrillDimension(channel) → category (not channel)", () => {
    assert.equal(nextDrillDimension("channel"), "category");
    assert.equal(nextDrillFromContract("channel"), "category");
    assert.equal(nextDrillDimension("category"), "sku");
    assert.equal(nextDrillDimension("sku"), null);
  });

  it("Lips-only + investigate Amazon → Amazon+Lips, next sku", () => {
    const filters = baseFilters({ category: ["Lips"] });
    const result = resolveInvestigation({
      filters,
      dimension: "channel",
      value: "Amazon",
      signal: { signal_type: "CHANNEL_COST_PRESSURE", entity_type: "channel", entity: "Amazon" },
    });
    assert.deepEqual(result.filters.channel, ["Amazon"]);
    assert.deepEqual(result.filters.category, ["Lips"]);
    assert.equal(result.dimension, "sku");
  });

  it("empty filters → nextExplorerDimension is channel", () => {
    assert.equal(nextExplorerDimension(createEmptyFilters()), "channel");
  });

  it("channel singleton only → nextExplorerDimension is category", () => {
    assert.equal(nextExplorerDimension(baseFilters({ channel: ["D2C Website"] })), "category");
  });
});
