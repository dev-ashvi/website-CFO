import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterMultiSelectOptions,
  shouldShowMultiSelectSearch,
  toggleMultiSelectValue,
} from "./cfoMultiSelectHelpers.js";

describe("CFO multi-select helpers", () => {
  it("toggles checkbox values with OR semantics within a dimension", () => {
    assert.deepEqual(toggleMultiSelectValue([], "Amazon"), ["Amazon"]);
    assert.deepEqual(toggleMultiSelectValue(["Amazon"], "Nykaa"), ["Amazon", "Nykaa"]);
    assert.deepEqual(toggleMultiSelectValue(["Amazon", "Nykaa"], "Amazon"), ["Nykaa"]);
  });

  it("filters options by search query", () => {
    const options = ["Amazon", "Nykaa", "D2C Website", "Myntra"];
    assert.deepEqual(filterMultiSelectOptions(options, "ny"), ["Nykaa"]);
    assert.deepEqual(filterMultiSelectOptions(options, ""), options);
  });

  it("shows search only for larger option sets", () => {
    const small = ["Amazon", "Nykaa"];
    const large = Array.from({ length: 7 }, (_, index) => `Channel ${index + 1}`);
    assert.equal(shouldShowMultiSelectSearch(small), false);
    assert.equal(shouldShowMultiSelectSearch(large), true);
    assert.equal(shouldShowMultiSelectSearch(large, false), false);
  });

  it("supports clearing an individual chip value", () => {
    const selected = ["Amazon", "Nykaa"];
    assert.deepEqual(toggleMultiSelectValue(selected, "Amazon"), ["Nykaa"]);
  });
});
