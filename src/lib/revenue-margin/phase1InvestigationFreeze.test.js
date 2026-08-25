/**
 * Phase 1 freeze: frontend investigation + Ask WYZ + cost-breakdown contracts
 * stay consistent (no React mount).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultFilters } from "./filters.js";
import { resolveInvestigation, nextExplorerDimension } from "./investigation.js";
import {
  ASK_WYZ_STARTER_QUESTION,
  askWyzPreservesFilters,
  buildSignalContext,
} from "./signalContext.js";
import { mayUseLegacyCostBreakdown, presentCostBreakdown } from "./costBreakdown.js";

const periodRange = { min: "2025-12", max: "2026-03" };

describe("Phase 1 investigation freeze (frontend contracts)", () => {
  it("SIGNAL→INVESTIGATE→ASK WYZ→cost-breakdown rules stay coherent", () => {
    const company = {
      ...createDefaultFilters(periodRange),
      region: ["South"],
      platform: ["Marketplace"],
    };
    const signal = {
      signal_type: "positive_cm1_negative_cm2",
      entity: "D2C Website",
      entity_type: "channel",
      stage: "MARKETING",
      label: "Positive CM1 / Negative CM2",
      evidence: { cm2: -1 },
      filters: { channel: ["Amazon"] },
    };

    // Investigate narrows; Ask WYZ does not
    const stepB = resolveInvestigation({
      filters: company,
      dimension: signal.entity_type,
      value: signal.entity,
      signal,
    });
    assert.deepEqual(stepB.filters.channel, ["D2C Website"]);
    assert.deepEqual(stepB.filters.region, ["South"]);
    assert.deepEqual(stepB.filters.platform, ["Marketplace"]);
    assert.equal(stepB.filters.month_from, "2025-12");
    assert.equal(stepB.dimension, "category");
    assert.equal(stepB.surface, "margin");

    const afterAsk = { ...stepB.filters };
    const ctx = buildSignalContext(signal, {
      datasetId: "beautyco",
      scopeHash: "scope_deadbeefcafe01",
    });
    assert.ok(ctx);
    assert.ok(askWyzPreservesFilters(stepB.filters, afterAsk));
    assert.equal(ASK_WYZ_STARTER_QUESTION, "Explain this signal.");

    // Active filters: never use legacy company cost breakdown
    assert.equal(mayUseLegacyCostBreakdown(stepB.filters, periodRange), false);

    const stepD = resolveInvestigation({
      filters: stepB.filters,
      dimension: "category",
      value: "Lips",
    });
    assert.deepEqual(stepD.filters.channel, ["D2C Website"]);
    assert.deepEqual(stepD.filters.category, ["Lips"]);
    assert.equal(stepD.dimension, "sku");
    assert.equal(nextExplorerDimension(stepD.filters), "sku");

    const emptyScoped = presentCostBreakdown({
      available: false,
      row_count: 0,
      product_cogs: { total: null, components: [] },
      cm1_costs: { total: null, components: [] },
      reconciliation: { status: "empty" },
      limitations: ["No financial facts match the active filters."],
    });
    assert.equal(emptyScoped.available, false);
    assert.equal(emptyScoped.empty, true);
  });
});
