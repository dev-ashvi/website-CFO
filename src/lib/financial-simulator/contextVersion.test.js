import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeContextVersion, isContextVersionStale, FINANCIAL_ENGINE_VERSION } from "./contextVersion.js";
import { getScenario1FormInputs } from "./scenarioFormPresets.js";
import { normalizeFormInputs } from "./normalizeFormInputs.js";

describe("contextVersion", () => {
  it("produces stable hash for same inputs", () => {
    const inputs = normalizeFormInputs(getScenario1FormInputs());
    const a = computeContextVersion(inputs);
    const b = computeContextVersion(inputs);
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{8}$/);
  });

  it("changes when inputs change", () => {
    const base = normalizeFormInputs(getScenario1FormInputs());
    const changed = normalizeFormInputs({
      ...getScenario1FormInputs(),
      currentCashBalance: Number(getScenario1FormInputs().currentCashBalance) + 100_000,
    });
    assert.notEqual(computeContextVersion(base), computeContextVersion(changed));
  });

  it("detects stale client version", () => {
    const inputs = normalizeFormInputs(getScenario1FormInputs());
    const version = computeContextVersion(inputs);
    assert.equal(isContextVersionStale(version, version), false);
    assert.equal(isContextVersionStale("old", version), true);
    assert.equal(isContextVersionStale(null, version), true);
  });

  it("exports engine version constant", () => {
    assert.ok(FINANCIAL_ENGINE_VERSION);
  });
});
