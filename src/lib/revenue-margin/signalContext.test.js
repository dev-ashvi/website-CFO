import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultFilters } from "./filters.js";
import { resolveInvestigation } from "./investigation.js";
import {
  ASK_WYZ_STARTER_QUESTION,
  askWyzPreservesFilters,
  buildSignalContext,
  signalContextHasOnlyTopicFields,
} from "./signalContext.js";

const periodRange = { min: "2025-12", max: "2026-03" };
const SCOPE = "scope_abc123def45678";
const DATASET = "beautyco";

const marketingSignal = {
  signal_type: "MARKETING_PRESSURE",
  entity: "D2C Website",
  entity_type: "channel",
  stage: "MARKETING",
  label: "Marketing pressure",
  evidence: { cm2: -120000, cm2_pct: -0.12, net_revenue: 900000 },
  filters: { channel: ["Amazon"] },
  materiality: 0.9,
};

describe("Phase 1B signal context (frontend)", () => {
  it("B1: builds topic-only signal_context; does not put signal into filters", () => {
    const filters = {
      ...createDefaultFilters(periodRange),
      channel: ["D2C Website"],
      category: ["Lips"],
      month_from: "2025-12",
      month_to: "2026-03",
    };
    const ctx = buildSignalContext(marketingSignal, { datasetId: DATASET, scopeHash: SCOPE });
    assert.ok(ctx);
    assert.equal(ctx.signal_type, "MARKETING_PRESSURE");
    assert.equal(ctx.entity, "D2C Website");
    assert.equal(ctx.dimension, "channel");
    assert.equal(ctx.stage, "MARKETING");
    assert.equal(ctx.economic_role, "MARKETING_PRESSURE");
    assert.equal(ctx.scope_hash, SCOPE);
    assert.equal(ctx.dataset_id, DATASET);
    assert.ok(ctx.signal_id.startsWith("sig_"));
    assert.ok(signalContextHasOnlyTopicFields(ctx));
    assert.equal(ctx.evidence, undefined);
    assert.equal(ctx.filters, undefined);
    // analytical.filters remain the UI filters — signal metadata is separate
    assert.deepEqual(filters.channel, ["D2C Website"]);
    assert.deepEqual(filters.category, ["Lips"]);
  });

  it("B2: Ask WYZ without Investigate preserves company-wide filters", () => {
    const before = createDefaultFilters(periodRange);
    const ctx = buildSignalContext(marketingSignal, { datasetId: DATASET, scopeHash: SCOPE });
    const after = { ...before };
    assert.ok(ctx);
    assert.ok(askWyzPreservesFilters(before, after));
    assert.deepEqual(after.channel, []);
    assert.notEqual(ctx.entity, undefined);
  });

  it("B8: rejects / strips raw financial values from signal_context", () => {
    const ctx = buildSignalContext(marketingSignal, { datasetId: DATASET, scopeHash: SCOPE });
    assert.ok(signalContextHasOnlyTopicFields(ctx));
    assert.equal(JSON.stringify(ctx).includes("120000"), false);
    assert.equal(JSON.stringify(ctx).includes("cm2"), false);
  });

  it("M: Investigate narrows filters; Ask WYZ does not", () => {
    const company = createDefaultFilters(periodRange);
    const investigated = resolveInvestigation({
      filters: company,
      dimension: "channel",
      value: "D2C Website",
      signal: marketingSignal,
    });
    assert.deepEqual(investigated.filters.channel, ["D2C Website"]);

    const askFilters = { ...company };
    buildSignalContext(marketingSignal, { datasetId: DATASET, scopeHash: SCOPE });
    assert.ok(askWyzPreservesFilters(company, askFilters));
    assert.deepEqual(askFilters.channel, []);
  });

  it("uses generic starter question (no brittle entity English required)", () => {
    assert.equal(ASK_WYZ_STARTER_QUESTION, "Explain this signal.");
    assert.equal(/D2C|MARKETING_PRESSURE|HIGH_REVENUE/i.test(ASK_WYZ_STARTER_QUESTION), false);
  });

  it("returns null for population / invalid stamps", () => {
    assert.equal(
      buildSignalContext(
        { ...marketingSignal, entity_type: "population" },
        { datasetId: DATASET, scopeHash: SCOPE },
      ),
      null,
    );
    assert.equal(
      buildSignalContext(marketingSignal, { datasetId: DATASET, scopeHash: "not-a-scope" }),
      null,
    );
  });
});
