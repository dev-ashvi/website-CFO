import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mayUseLegacyCostBreakdown,
  presentCostBreakdown,
} from "./costBreakdown.js";
import { createDefaultFilters } from "./filters.js";

const periodRange = { min: "2025-12", max: "2026-03" };

describe("scoped cost breakdown presentation", () => {
  it("presents scoped API shape with components and totals metadata", () => {
    const presented = presentCostBreakdown({
      available: true,
      row_count: 10,
      net_revenue: 1000,
      scope_hash: "scope_abc",
      product_cogs: {
        total: 400,
        components: [{ key: "manufacturing_cogs", label: "Manufacturing", value: 250, pct_of_net_revenue: 0.25 }],
      },
      cm1_costs: {
        total: 100,
        components: [{ key: "fulfilment", label: "Fulfilment", value: 100, pct_of_net_revenue: 0.1 }],
      },
      reconciliation: { status: "ok" },
      limitations: [],
    });
    assert.equal(presented.scoped, true);
    assert.equal(presented.available, true);
    assert.equal(presented.product_cogs[0].label, "Manufacturing");
    assert.equal(presented.scope_hash, "scope_abc");
  });

  it("empty scoped result is unavailable — not company fallback", () => {
    const presented = presentCostBreakdown({
      available: false,
      row_count: 0,
      product_cogs: { total: null, components: [] },
      cm1_costs: { total: null, components: [] },
      reconciliation: { status: "empty" },
      limitations: ["No financial facts match the active filters."],
    });
    assert.equal(presented.available, false);
    assert.equal(presented.empty, true);
    assert.deepEqual(presented.product_cogs, []);
  });

  it("legacy explorers shape still presents when allowed", () => {
    const presented = presentCostBreakdown({
      product_cogs: [{ key: "unit_manufacturing_cogs", label: "Manufacturing", value: 1 }],
      cm1_costs: [],
      net_revenue: 10,
    });
    assert.equal(presented.scoped, false);
    assert.equal(presented.available, true);
  });

  it("active filters must not use legacy company breakdown", () => {
    const company = createDefaultFilters(periodRange);
    assert.equal(mayUseLegacyCostBreakdown(company, periodRange), true);
    const filtered = { ...company, channel: ["Amazon"] };
    assert.equal(mayUseLegacyCostBreakdown(filtered, periodRange), false);
  });
});
