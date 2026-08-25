import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activeFilterChips,
  clearFilters,
  createDefaultFilters,
  filtersToQueryFilters,
  formatScopeViewLabel,
  hasActiveFilters,
  removeFilterChip,
} from "./filters.js";

const periodRange = { min: "2025-01", max: "2025-12", months: ["2025-01", "2025-06", "2025-12"] };

describe("revenue-margin filters", () => {
  it("defaults period to full dataset range", () => {
    const filters = createDefaultFilters(periodRange);
    assert.equal(filters.month_from, "2025-01");
    assert.equal(filters.month_to, "2025-12");
    assert.deepEqual(filters.channel, []);
  });

  it("maps shared filter state to query filters with AND/OR semantics", () => {
    const filters = {
      ...createDefaultFilters(periodRange),
      channel: ["Amazon", "Nykaa"],
      category: ["Lips"],
    };
    const queryFilters = filtersToQueryFilters(filters);
    assert.equal(queryFilters.month_from, "2025-01");
    assert.deepEqual(queryFilters.channel, ["Amazon", "Nykaa"]);
    assert.deepEqual(queryFilters.category, ["Lips"]);
  });

  it("formats a subtle active-scope viewing label", () => {
    const scoped = {
      ...createDefaultFilters(periodRange),
      channel: ["Amazon"],
      category: ["Lips"],
      month_from: "2025-04",
      month_to: "2025-06",
    };
    const label = formatScopeViewLabel(scoped, periodRange);
    assert.ok(label.includes("Amazon"));
    assert.ok(label.includes("Lips"));
    assert.ok(label.includes("2025-04"));
    const company = formatScopeViewLabel(createDefaultFilters(periodRange), periodRange);
    assert.ok(company.startsWith("Company view"));
  });

  it("detects active filters beyond default period", () => {
    const filters = createDefaultFilters(periodRange);
    assert.equal(hasActiveFilters(filters, periodRange), false);
    const scoped = { ...filters, channel: ["Amazon"], month_from: "2025-06" };
    assert.equal(hasActiveFilters(scoped, periodRange), true);
  });

  it("builds removable chips for period and dimensions", () => {
    const filters = {
      ...createDefaultFilters(periodRange),
      month_from: "2025-06",
      channel: ["Amazon"],
    };
    const chips = activeFilterChips(filters, periodRange);
    assert.ok(chips.some((chip) => chip.kind === "period"));
    assert.ok(chips.some((chip) => chip.label.includes("Amazon")));
    const cleared = removeFilterChip(filters, chips.find((chip) => chip.kind === "dimension"));
    assert.deepEqual(cleared.channel, []);
  });

  it("clears filters back to full period", () => {
    const filters = {
      ...createDefaultFilters(periodRange),
      channel: ["Amazon"],
      category: ["Lips"],
    };
    const reset = clearFilters(periodRange);
    assert.deepEqual(reset.channel, []);
    assert.equal(reset.month_from, "2025-01");
  });
});
