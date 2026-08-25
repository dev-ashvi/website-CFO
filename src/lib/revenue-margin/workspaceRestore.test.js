import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_DATASET_STORAGE_KEY,
  assertSessionPayloadIsLean,
  canRestoreAnalysisWorkspace,
  clearActiveDatasetId,
  writeActiveDatasetId,
} from "./workspaceSession.js";
import {
  normalizeRevenueMarginWorkspaceResult,
  RESTORE_PHASE,
  resolveRestoreTarget,
  runWorkspaceRestore,
} from "./workspaceRestore.js";

function memStorage(seed = {}) {
  const mem = new Map(Object.entries(seed));
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    _mem: mem,
  };
}

const COMPLETED_META = {
  dataset_id: "ds_abcdef123456",
  status: "COMPLETED",
  name: "Test",
  latest_job_id: "job_1",
};

const RESULT_PAYLOAD = {
  dataset_id: "ds_abcdef123456",
  job_id: "job_1",
  engine_version: "2026.08.19",
  facts_uri: "wyz-blob://facts/job_1/financial_facts.parquet",
  company: { net_revenue: 1 },
};

describe("workspace restore state machine", () => {
  it("W1 URL dataset restores successfully", async () => {
    const storage = memStorage();
    const params = new URLSearchParams("dataset=ds_abcdef123456");
    const target = resolveRestoreTarget({ searchParams: params, storage });
    assert.equal(target.source, "url");
    const outcome = await runWorkspaceRestore({
      target,
      storage,
      getDataset: async () => COMPLETED_META,
      getAnalysisResult: async () => RESULT_PAYLOAD,
    });
    assert.equal(outcome.phase, RESTORE_PHASE.RESTORED);
    assert.equal(outcome.dataset.dataset_id, "ds_abcdef123456");
    assert.equal(outcome.result.job_id, "job_1");
    assert.equal(storage.getItem(ACTIVE_DATASET_STORAGE_KEY), "ds_abcdef123456");
  });

  it("W2 localStorage dataset restores when URL absent", async () => {
    const storage = memStorage({ [ACTIVE_DATASET_STORAGE_KEY]: "ds_abcdef123456" });
    const params = new URLSearchParams("");
    const target = resolveRestoreTarget({ searchParams: params, storage });
    assert.equal(target.source, "storage");
    const outcome = await runWorkspaceRestore({
      target,
      storage,
      getDataset: async () => COMPLETED_META,
      getAnalysisResult: async () => RESULT_PAYLOAD,
    });
    assert.equal(outcome.phase, RESTORE_PHASE.RESTORED);
  });

  it("W3 URL wins over localStorage", () => {
    const storage = memStorage({ [ACTIVE_DATASET_STORAGE_KEY]: "ds_fromstorage99" });
    const params = new URLSearchParams("dataset=ds_fromurl123456");
    const target = resolveRestoreTarget({ searchParams: params, storage });
    assert.equal(target.datasetId, "ds_fromurl123456");
    assert.equal(target.source, "url");
  });

  it("W4 completed dataset fetches result", async () => {
    let resultCalls = 0;
    const outcome = await runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "url" },
      storage: memStorage(),
      getDataset: async () => COMPLETED_META,
      getAnalysisResult: async () => {
        resultCalls += 1;
        return RESULT_PAYLOAD;
      },
    });
    assert.equal(resultCalls, 1);
    assert.ok(outcome.result);
  });

  it("W5 dataset 404 terminates restore with NOT_FOUND", async () => {
    const storage = memStorage({ [ACTIVE_DATASET_STORAGE_KEY]: "ds_abcdef123456" });
    const outcome = await runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "url" },
      storage,
      getDataset: async () => {
        throw { status: 404, message: "not found" };
      },
      getAnalysisResult: async () => RESULT_PAYLOAD,
    });
    assert.equal(outcome.phase, RESTORE_PHASE.NOT_FOUND);
    assert.match(outcome.error, /couldn.t restore/i);
    assert.equal(storage.getItem(ACTIVE_DATASET_STORAGE_KEY), null);
  });

  it("W6 result 404/500 terminates restore for COMPLETED", async () => {
    const outcome = await runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "url" },
      storage: memStorage(),
      getDataset: async () => COMPLETED_META,
      getAnalysisResult: async () => {
        throw { status: 500, message: "boom" };
      },
    });
    assert.equal(outcome.phase, RESTORE_PHASE.FAILED);
    assert.equal(outcome.result, null);
  });

  it("W7 malformed result terminates restore", async () => {
    const outcome = await runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "url" },
      storage: memStorage(),
      getDataset: async () => COMPLETED_META,
      getAnalysisResult: async () => ({ foo: 1 }),
    });
    assert.equal(outcome.phase, RESTORE_PHASE.FAILED);
  });

  it("W8 restoring always reaches a terminal phase on failure", async () => {
    const terminals = new Set([
      RESTORE_PHASE.IDLE,
      RESTORE_PHASE.RESTORED,
      RESTORE_PHASE.FAILED,
      RESTORE_PHASE.NOT_FOUND,
    ]);
    const outcome = await runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "storage" },
      storage: memStorage(),
      getDataset: async () => {
        throw { status: 0, message: "network" };
      },
      getAnalysisResult: async () => RESULT_PAYLOAD,
    });
    assert.ok(terminals.has(outcome.phase));
    assert.notEqual(outcome.phase, RESTORE_PHASE.RESTORING);
  });

  it("W9 StrictMode/double invocation is safe via isStale", async () => {
    let stale = false;
    const p1 = runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "url" },
      storage: memStorage(),
      isStale: () => stale,
      getDataset: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return COMPLETED_META;
      },
      getAnalysisResult: async () => RESULT_PAYLOAD,
    });
    stale = true;
    const first = await p1;
    assert.equal(first.aborted, true);

    const second = await runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "url" },
      storage: memStorage(),
      getDataset: async () => COMPLETED_META,
      getAnalysisResult: async () => RESULT_PAYLOAD,
    });
    assert.equal(second.phase, RESTORE_PHASE.RESTORED);
  });

  it("W10 stale first request cannot overwrite second restore", async () => {
    const applied = [];
    let generation = 0;
    async function runGen(id, delayMs) {
      const gen = ++generation;
      const outcome = await runWorkspaceRestore({
        target: { datasetId: id, source: "url" },
        storage: memStorage(),
        isStale: () => gen !== generation,
        getDataset: async () => {
          await new Promise((r) => setTimeout(r, delayMs));
          return { ...COMPLETED_META, dataset_id: id };
        },
        getAnalysisResult: async () => ({ ...RESULT_PAYLOAD, dataset_id: id, job_id: `job_${id}` }),
      });
      if (!outcome.aborted && outcome.phase === RESTORE_PHASE.RESTORED) {
        applied.push(outcome.dataset.dataset_id);
      }
      return outcome;
    }
    const slow = runGen("ds_slowwwwwwwww", 40);
    const fast = runGen("ds_fasttttttttt", 5);
    await Promise.all([slow, fast]);
    assert.deepEqual(applied, ["ds_fasttttttttt"]);
  });

  it("W11 successful restore hydrates workspace-shaped result", async () => {
    const outcome = await runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "url" },
      storage: memStorage(),
      getDataset: async () => COMPLETED_META,
      getAnalysisResult: async () => RESULT_PAYLOAD,
    });
    assert.equal(outcome.phase, RESTORE_PHASE.RESTORED);
    assert.equal(outcome.result.engine_version, "2026.08.19");
    assert.equal(canRestoreAnalysisWorkspace(outcome.dataset, outcome.result), true);
  });

  it("W12 tracked decisions use restored dataset id (page wiring)", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    const panel = readFileSync(join(root, "../../components/revenue-margin/TrackedDecisionsPanel.jsx"), "utf8");
    assert.match(page, /runWorkspaceRestore/);
    assert.match(page, /AnalysisWorkspace result=\{result\} datasetId=\{dataset\?\.dataset_id\}/);
    assert.match(panel, /listStrategicDecisions/);
  });

  it("W13 fresh and restored result use same normalizer", () => {
    const a = normalizeRevenueMarginWorkspaceResult(RESULT_PAYLOAD);
    const b = normalizeRevenueMarginWorkspaceResult({ ...RESULT_PAYLOAD });
    assert.deepEqual(a.job_id, b.job_id);
    assert.deepEqual(a.dataset_id, b.dataset_id);
    const root = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(page, /normalizeRevenueMarginWorkspaceResult/);
    assert.match(page, /setResult\(normalizeRevenueMarginWorkspaceResult\(summary\)\)/);
  });

  it("W8 session storage stays lean / no financial keys", () => {
    assert.equal(assertSessionPayloadIsLean({ dataset_id: "ds_abcdef123456" }), true);
    assert.throws(() => assertSessionPayloadIsLean({ net_revenue: 1 }), /banned/);
  });

  it("URL failure does not load a different localStorage dataset", async () => {
    const storage = memStorage({ [ACTIVE_DATASET_STORAGE_KEY]: "ds_otherdataset01" });
    const outcome = await runWorkspaceRestore({
      target: { datasetId: "ds_abcdef123456", source: "url" },
      storage,
      getDataset: async () => {
        throw { status: 404, message: "missing" };
      },
      getAnalysisResult: async () => RESULT_PAYLOAD,
    });
    assert.equal(outcome.phase, RESTORE_PHASE.NOT_FOUND);
    // Matching id cleared only when stored == failed id; other id must remain.
    assert.equal(storage.getItem(ACTIVE_DATASET_STORAGE_KEY), "ds_otherdataset01");
  });

  it("recovery UI wiring exists on RevenueMarginPage", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(page, /We couldn&apos;t restore this analysis/);
    assert.match(page, /Start a new analysis/);
    assert.match(page, /executeRestore/);
    assert.doesNotMatch(page, /restoreAttempted/);
  });
});
