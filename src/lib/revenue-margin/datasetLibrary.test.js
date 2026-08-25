import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLibraryPayloadIsLean,
  formatLibraryStatus,
  isLibraryItemSelectable,
  libraryDisplayTitle,
  normalizeDatasetLibrary,
  normalizeDatasetLibraryItem,
} from "./datasetLibrary.js";
import {
  ACTIVE_DATASET_STORAGE_KEY,
  assertSessionPayloadIsLean,
  resolveActiveDatasetId,
  writeActiveDatasetId,
} from "./workspaceSession.js";

describe("Phase 2E.1 dataset library frontend", () => {
  it("L3/L21/L22 library normalize stays lean", () => {
    const payload = {
      datasets: [
        {
          dataset_id: "ds_abcdef123456",
          name: "FY26 commerce dataset",
          status: "COMPLETED",
          created_at: "2026-08-25T10:00:00Z",
          file_count: 4,
        },
      ],
    };
    const normalized = normalizeDatasetLibrary(payload);
    assert.equal(normalized.count, 1);
    assertLibraryPayloadIsLean(normalized);
    assert.equal(assertSessionPayloadIsLean({ dataset_id: "ds_abcdef123456" }), true);
  });

  it("L4/L6/L17 display + selectable helpers", () => {
    const completed = normalizeDatasetLibraryItem({
      dataset_id: "ds_abcdef123456",
      name: "FY26 commerce dataset",
      status: "COMPLETED",
      created_at: "2026-08-25T10:00:00Z",
    });
    assert.equal(libraryDisplayTitle(completed), "FY26 commerce dataset");
    assert.equal(formatLibraryStatus("COMPLETED"), "Completed");
    assert.equal(formatLibraryStatus("ANALYSING"), "Processing");
    assert.equal(formatLibraryStatus("FAILED"), "Failed");
    assert.equal(isLibraryItemSelectable(completed), true);
    assert.equal(isLibraryItemSelectable({ dataset_id: "ds_abcdef123456", status: "FAILED" }), true);
  });

  it("L12 URL wins over localStorage", () => {
    const mem = new Map([[ACTIVE_DATASET_STORAGE_KEY, "ds_fromstorage99"]]);
    const storage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
    writeActiveDatasetId("ds_fromstorage99", storage);
    const params = new URLSearchParams("dataset=ds_fromurl123456");
    assert.equal(resolveActiveDatasetId({ searchParams: params, storage }), "ds_fromurl123456");
  });

  it("L11 localStorage fallback without URL", () => {
    const mem = new Map();
    const storage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
    writeActiveDatasetId("ds_abcdef123456", storage);
    assert.equal(resolveActiveDatasetId({ searchParams: new URLSearchParams(""), storage }), "ds_abcdef123456");
  });

  it("L25 malformed items skipped", () => {
    const normalized = normalizeDatasetLibrary({
      datasets: [null, { foo: 1 }, { dataset_id: "ds_abcdef123456", name: "Ok", status: "COMPLETED" }],
    });
    assert.equal(normalized.count, 1);
    assert.equal(normalized.datasets[0].dataset_id, "ds_abcdef123456");
  });

  it("L7/L8/L9/L13 page wiring: switch pushes URL and reuses restore", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    const workspace = readFileSync(join(root, "../../components/revenue-margin/AnalysisWorkspace.jsx"), "utf8");
    assert.match(page, /DatasetLibrarySwitcher/);
    assert.match(page, /switchActiveDataset/);
    assert.match(page, /listDatasets/);
    assert.match(page, /runWorkspaceRestore/);
    assert.match(page, /replace:\s*false/);
    assert.match(page, /history\s*===\s*"replace"/);
    assert.match(page, /key=\{dataset\?\.dataset_id/);
    assert.match(workspace, /key=\{datasetId/);
    assert.doesNotMatch(page, /localStorage\.setItem\([^)]*datasets/);
  });

  it("L18 library failure does not own the page workspace", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const switcher = readFileSync(join(root, "../../components/revenue-margin/DatasetLibrarySwitcher.jsx"), "utf8");
    assert.match(switcher, /Previous analyses couldn&apos;t be loaded/);
    assert.match(switcher, /Retry/);
  });
});
