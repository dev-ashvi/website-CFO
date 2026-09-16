import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FEEDBACK_REASONS,
  normalizeClientError,
  normalizeFeedbackRequest,
} from "./aiFeedback.js";

describe("P1 AI feedback frontend", () => {
  it("O25/O26 useful and not-useful normalization", () => {
    const useful = normalizeFeedbackRequest({
      turnId: "t1",
      conversationId: "c1",
      rating: "useful",
      telemetry: { answer_source: "strategic_partner", final_selected_action: "EXPERIMENT" },
    });
    assert.equal(useful.rating, "USEFUL");
    assert.equal(useful.reason, null);
    assert.equal(useful.selected_action, "EXPERIMENT");

    const bad = normalizeFeedbackRequest({
      turnId: "t2",
      rating: "NOT_USEFUL",
      reason: "TOO_GENERIC",
    });
    assert.equal(bad.rating, "NOT_USEFUL");
    assert.equal(bad.reason, "TOO_GENERIC");
    assert.ok(FEEDBACK_REASONS.includes("WRONG_NUMBERS"));
  });

  it("O27 client error normalization is lean", () => {
    const err = normalizeClientError({
      errorCode: "restore_failed",
      surface: "RevenueMarginPage",
      datasetId: "ds_abcdef123456",
      message: "We couldn't restore this analysis.",
    });
    assert.equal(err.error_code, "restore_failed");
    assert.equal(err.dataset_id, "ds_abcdef123456");
    assert.doesNotMatch(JSON.stringify(err), /net_revenue|cm2|prompt/i);
  });

  it("O28 drawer wires feedback without storing answer text in request helper", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const drawer = readFileSync(join(root, "../../components/revenue-margin/AiCfoDrawer.jsx"), "utf8");
    const api = readFileSync(join(root, "../../api/revenueMargin.js"), "utf8");
    assert.match(drawer, /submitAiFeedback/);
    assert.match(drawer, /Useful/);
    assert.match(drawer, /Not useful/);
    assert.match(api, /\/ai-feedback/);
    assert.doesNotMatch(drawer, /answer_text:/);
  });
});
