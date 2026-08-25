import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  duplicateKeyLabel,
  joinQualityLabel,
  readinessDisplayItems,
} from "./dataQuality.js";

describe("revenue-margin data quality labels", () => {
  it("uses CFO-facing join labels with technical detail hidden", () => {
    const item = joinQualityLabel({
      name: "order_lines.sku_id→sku_master.sku_id",
      ok: true,
      match_pct: 0.987,
    });
    assert.match(item.label, /Order lines linked to product master/);
    assert.match(item.detail, /sku_master\.sku_id/);
  });

  it("does not treat many-side order line duplicates as duplicate key issues", () => {
    const items = readinessDisplayItems({
      joins: [
        {
          name: "order_lines.sku_id→sku_master.sku_id",
          ok: true,
          match_pct: 1,
          left_duplicate_keys: 50,
          right_duplicate_keys: 0,
          cardinality_ok: true,
          unexpected_duplicate_keys: 0,
        },
      ],
      duplicate_key_issues: [],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].ok, true);
  });

  it("surfaces duplicate identifiers on the one side in plain language", () => {
    const item = duplicateKeyLabel({
      name: "order_lines.sku_id→sku_master.sku_id",
      unexpected_duplicate_keys: 2,
    });
    assert.match(item.label, /duplicate SKU/i);
    assert.match(item.detail, /sku_master/);
  });
});
