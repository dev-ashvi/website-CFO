import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evidenceStatusLabel,
  revisionSummaryLabel,
  normalizeTrackedDecisionCard,
} from "./trackedDecisions.js";
import {
  ACTIVE_DATASET_STORAGE_KEY,
  assertSessionPayloadIsLean,
  buildRevenueMarginPath,
  canRestoreAnalysisWorkspace,
  clearActiveDatasetId,
  isValidDatasetId,
  readActiveDatasetIdFromStorage,
  resolveActiveDatasetId,
  writeActiveDatasetId,
} from "./workspaceSession.js";

describe("Phase 2E acceptance — evidence vs recommendation labels", () => {
  it("R9 separates evidence status labels from recommendation", () => {
    assert.equal(evidenceStatusLabel("UNCHANGED"), "Evidence unchanged");
    assert.equal(evidenceStatusLabel("SUPPORTING"), "Evidence supporting");
    const card = normalizeTrackedDecisionCard({
      decision_id: "sdr_1",
      selected_action: "INVESTIGATE",
      evidence_status: "UNCHANGED",
      original_selected_action: "EXPERIMENT",
      latest_revision: {
        disposition: "CHANGE",
        previous_action: "EXPERIMENT",
        new_action: "INVESTIGATE",
        previous_strength: "MODERATE",
        new_strength: "TENTATIVE",
      },
    });
    assert.equal(card.evidence_status, "UNCHANGED");
    assert.equal(card.selected_action, "INVESTIGATE");
    assert.equal(card.original_selected_action, "EXPERIMENT");
    assert.match(revisionSummaryLabel(card.latest_revision), /changed/i);
  });

  it("TrackedDecisionsPanel shows Evidence status separately from recommendation", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(root, "../../components/revenue-margin/TrackedDecisionsPanel.jsx"), "utf8");
    assert.match(src, /Evidence status:/);
    assert.match(src, /Current recommendation:/);
    assert.match(src, /Last review:/);
    assert.doesNotMatch(src, /statusLabel\(decision\.status, decision\.evaluation_status\)/);
  });
});

describe("Phase 2E acceptance — workspace restore", () => {
  it("W1 stores and restores active dataset identifier", () => {
    const mem = new Map();
    const storage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
    assert.equal(writeActiveDatasetId("ds_abcdef123456", storage), true);
    assert.equal(readActiveDatasetIdFromStorage(storage), "ds_abcdef123456");
    assert.equal(ACTIVE_DATASET_STORAGE_KEY, "wyz_revenue_margin_active_dataset_id");
  });

  it("W2/W7 restore gate requires backend result", () => {
    assert.equal(
      canRestoreAnalysisWorkspace({ dataset_id: "ds_abcdef123456", status: "COMPLETED" }, { job_id: "job_1" }),
      true,
    );
    assert.equal(canRestoreAnalysisWorkspace({ dataset_id: "ds_abcdef123456", status: "COMPLETED" }, null), false);
    assert.equal(
      canRestoreAnalysisWorkspace({ dataset_id: "ds_abcdef123456", status: "FAILED" }, { job_id: "job_1" }),
      false,
    );
  });

  it("W5/W6 invalid or stale ids are rejected/cleared", () => {
    assert.equal(isValidDatasetId("not-a-dataset"), false);
    assert.equal(isValidDatasetId("ds_abcdef123456"), true);
    const mem = new Map([[ACTIVE_DATASET_STORAGE_KEY, "bogus"]]);
    const storage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
    assert.equal(readActiveDatasetIdFromStorage(storage), null);
    writeActiveDatasetId("ds_abcdef123456", storage);
    clearActiveDatasetId(storage);
    assert.equal(readActiveDatasetIdFromStorage(storage), null);
  });

  it("W8 session helpers never accept financial payload keys", () => {
    assert.equal(assertSessionPayloadIsLean({ dataset_id: "ds_abcdef123456" }), true);
    assert.throws(() => assertSessionPayloadIsLean({ cm2: 1 }), /session_payload_banned_key/);
  });

  it("URL dataset preferred over localStorage", () => {
    const mem = new Map([[ACTIVE_DATASET_STORAGE_KEY, "ds_fromstorage999"]]);
    const storage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
    const params = new URLSearchParams("dataset=ds_fromurl123456");
    assert.equal(resolveActiveDatasetId({ searchParams: params, storage }), "ds_fromurl123456");
    assert.match(buildRevenueMarginPath("ds_fromurl123456"), /\?dataset=ds_fromurl123456/);
  });

  it("RevenueMarginPage wires restore + persistence", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(src, /resolveRestoreTarget/);
    assert.match(src, /runWorkspaceRestore/);
    assert.match(src, /writeActiveDatasetId/);
    assert.match(src, /getAnalysisResult/);
    assert.match(src, /Restoring Revenue/);
    assert.match(src, /useSearchParams/);
    assert.doesNotMatch(src, /restoreAttempted/);
  });
});
