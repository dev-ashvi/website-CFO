import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeTrackedDecisionLists,
  normalizeTrackedDecisionCard,
} from "./trackedDecisions.js";

describe("tracked decisions UI helpers", () => {
  it("normalizes track POST decision payloads into list cards", () => {
    const card = normalizeTrackedDecisionCard({
      decision_id: "sdr_abc",
      dataset_id: "ds_1",
      scope_hash: "scope_xyz",
      decision_theme: "MARKETING",
      recommendation: { selected_action: "EXPERIMENT", recommendation_strength: "MODERATE" },
      status: "ACTIVE",
      created_at: "2026-08-25T07:11:02Z",
    });
    assert.equal(card.decision_id, "sdr_abc");
    assert.equal(card.dataset_id, "ds_1");
    assert.equal(card.selected_action, "EXPERIMENT");
    assert.equal(card.scope_hash, "scope_xyz");
  });

  it("merges optimistic seed with list without duplicating ids", () => {
    const merged = mergeTrackedDecisionLists(
      [{ decision_id: "sdr_abc", status: "ACTIVE", selected_action: "EXPERIMENT", dataset_id: "ds_1" }],
      {
        decision_id: "sdr_abc",
        status: "ACTIVE",
        selected_action: "EXPERIMENT",
        dataset_id: "ds_1",
        created_at: "2026-08-25T07:11:02Z",
      },
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].created_at, "2026-08-25T07:11:02Z");
  });

  it("keeps seed visible before list refetch returns", () => {
    const merged = mergeTrackedDecisionLists([], {
      decision_id: "sdr_new",
      dataset_id: "ds_1",
      status: "ACTIVE",
      decision_theme: "MARKETING",
      selected_action: "INVESTIGATE",
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].decision_id, "sdr_new");
  });

  it("AnalysisWorkspace mounts TrackedDecisionsPanel with seed + refresh wiring", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    assert.match(src, /TrackedDecisionsPanel/);
    assert.match(src, /seedDecision=\{/);
    assert.match(src, /trackedSeed/);
    assert.match(src, /onDecisionTracked/);
    assert.match(src, /normalizeTrackedDecisionCard/);
  });

  it("TrackedDecisionsPanel stays visible when list is empty", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(root, "../../components/revenue-margin/TrackedDecisionsPanel.jsx"), "utf8");
    assert.match(src, /No tracked decisions yet/);
    assert.match(src, /data-testid="tracked-decisions-panel"/);
    assert.doesNotMatch(src, /if \(!dynamicEnabled \|\| decisions\.length === 0\)/);
  });
});
