import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DETECT_ROLE_LABELS,
  ONBOARDING_STAGES,
  PRESENTATION_MODE,
  detectSourceCards,
  hasDetectedSources,
  onboardingStepperModel,
  resolveOnboardingStage,
  resolvePresentationMode,
  readDetectAcknowledged,
  writeDetectAcknowledged,
  clearDetectAcknowledged,
  validateReadinessHighlights,
} from "./onboarding.js";
import { DATASET_STATUSES } from "./workflow.js";

function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const COMPLETED_DS = {
  dataset_id: "ds_abcdef123456",
  status: DATASET_STATUSES.COMPLETED,
  name: "BeautyCo",
};

const RESULT = {
  dataset_id: "ds_abcdef123456",
  job_id: "job_1",
  engine_version: "2026.08.19",
  facts_uri: "s3://facts",
};

describe("P7.1 Pass 1 onboarding mode routing", () => {
  it("A. CREATED / new dataset → onboarding upload", () => {
    assert.equal(resolvePresentationMode({ dataset: null, result: null }), PRESENTATION_MODE.ONBOARDING);
    assert.equal(
      resolveOnboardingStage({ dataset: { status: DATASET_STATUSES.CREATED }, detectAcknowledged: false }),
      "upload",
    );
  });

  it("B. upload / profiling → upload or detect from file results", () => {
    assert.equal(
      resolveOnboardingStage({
        dataset: { status: DATASET_STATUSES.UPLOADING, files: [] },
        detectAcknowledged: false,
      }),
      "upload",
    );
    assert.equal(
      resolveOnboardingStage({
        dataset: {
          status: DATASET_STATUSES.PROFILING,
          files: [{ filename: "orders.csv", file_role: "ORDER_LINES", row_count: 10 }],
        },
        detectAcknowledged: false,
      }),
      "detect",
    );
  });

  it("C. mapping review → only map stage after detect ack", () => {
    const dataset = {
      status: DATASET_STATUSES.NEEDS_REVIEW,
      files: [{ filename: "a.csv", file_role: "ORDER_LINES" }],
      mappings: [{ status: "user_confirmation_required", needs_attention: true, source_file: "a", source_column: "x" }],
    };
    assert.equal(resolveOnboardingStage({ dataset, detectAcknowledged: false }), "detect");
    assert.equal(resolveOnboardingStage({ dataset, detectAcknowledged: true }), "map");
  });

  it("D. READY → validate / Analyse step after detect ack", () => {
    const dataset = {
      status: DATASET_STATUSES.READY,
      files: [{ filename: "a.csv", file_role: "ORDER_LINES" }],
      readiness: { ready_for_engine: true },
    };
    assert.equal(resolveOnboardingStage({ dataset, detectAcknowledged: false }), "detect");
    assert.equal(resolveOnboardingStage({ dataset, detectAcknowledged: true }), "validate");
  });

  it("E. ANALYSING → analysis progress only", () => {
    assert.equal(
      resolveOnboardingStage({
        dataset: { status: DATASET_STATUSES.ANALYSING },
        job: { status: "RUNNING", message: "Building model" },
        detectAcknowledged: true,
      }),
      "analyse",
    );
  });

  it("F. COMPLETED + restorable result → workspace mode", () => {
    assert.equal(
      resolvePresentationMode({ dataset: COMPLETED_DS, result: RESULT }),
      PRESENTATION_MODE.WORKSPACE,
    );
  });

  it("G. FAILED surfaces in an actionable onboarding stage", () => {
    assert.equal(
      resolveOnboardingStage({
        dataset: { status: DATASET_STATUSES.FAILED, files: [] },
        detectAcknowledged: false,
      }),
      "upload",
    );
    assert.equal(
      resolveOnboardingStage({
        dataset: {
          status: DATASET_STATUSES.FAILED,
          analysis_status: "FAILED",
          files: [{ filename: "a.csv", file_role: "ORDER_LINES" }],
          readiness: { ready_for_engine: false },
        },
        job: { status: "FAILED" },
        detectAcknowledged: true,
      }),
      "analyse",
    );
  });

  it("H/I. switching datasets flips mode via result presence", () => {
    assert.equal(
      resolvePresentationMode({ dataset: COMPLETED_DS, result: RESULT }),
      PRESENTATION_MODE.WORKSPACE,
    );
    assert.equal(
      resolvePresentationMode({
        dataset: { dataset_id: "ds_incomplete0001", status: DATASET_STATUSES.READY },
        result: null,
      }),
      PRESENTATION_MODE.ONBOARDING,
    );
    assert.equal(
      resolvePresentationMode({
        dataset: { dataset_id: "ds_incomplete0001", status: DATASET_STATUSES.READY },
        result: RESULT,
      }),
      PRESENTATION_MODE.ONBOARDING,
    );
  });

  it("J. successful analysis result enters workspace without extra click", () => {
    assert.equal(
      resolvePresentationMode({
        dataset: { ...COMPLETED_DS, status: DATASET_STATUSES.ANALYSING },
        result: RESULT,
      }),
      PRESENTATION_MODE.WORKSPACE,
    );
  });

  it("stepper marks prior stages complete", () => {
    const steps = onboardingStepperModel("map");
    assert.deepEqual(
      steps.map((s) => s.state),
      ["complete", "complete", "current", "upcoming", "upcoming"],
    );
    assert.deepEqual(ONBOARDING_STAGES, ["upload", "detect", "map", "validate", "analyse"]);
  });

  it("detect acknowledgement is session-scoped presentation only", () => {
    const storage = memStorage();
    assert.equal(readDetectAcknowledged("ds_abcdef123456", storage), false);
    writeDetectAcknowledged("ds_abcdef123456", true, storage);
    assert.equal(readDetectAcknowledged("ds_abcdef123456", storage), true);
    clearDetectAcknowledged("ds_abcdef123456", storage);
    assert.equal(readDetectAcknowledged("ds_abcdef123456", storage), false);
  });

  it("detect cards prefer role labels without redundant detected suffix", () => {
    assert.equal(DETECT_ROLE_LABELS.ORDER_LINES, "Orders");
    assert.equal(DETECT_ROLE_LABELS.MARKETING_SPEND, "Marketing spend");
    const cards = detectSourceCards({
      files: [
        {
          filename: "o.csv",
          file_role: "ORDER_LINES",
          label: "Orders detected",
          row_count: 12,
          date_min: "2024-01-01",
          date_max: "2024-06-01",
        },
        {
          filename: "m.csv",
          file_role: "MARKETING_SPEND",
          label: "Marketing spend detected",
          row_count: 4,
        },
      ],
    });
    assert.equal(cards[0].title, "Orders");
    assert.equal(cards[1].title, "Marketing spend");
    assert.equal(cards[0].rowCount, 12);
    assert.equal(hasDetectedSources({ files: [] }), false);
    assert.equal(hasDetectedSources({ files: [{ filename: "x.csv", file_role: "SKU_MASTER" }] }), true);
  });
});

describe("P7.1 Pass 1 page wiring", () => {
  it("K. ?dataset= restore wiring unchanged; Mode B skips onboarding stack", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const page = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(page, /runWorkspaceRestore/);
    assert.match(page, /resolveRestoreTarget/);
    assert.match(page, /DATASET_QUERY_PARAM/);
    assert.match(page, /resolvePresentationMode/);
    assert.match(page, /OnboardingShell/);
    assert.match(page, /AnalysisWorkspace/);
    assert.match(page, /ValidateStepPanel/);
    assert.match(page, /isWorkspace/);
    assert.match(page, /PRESENTATION_MODE\.WORKSPACE/);
    assert.match(page, /Turn your business data into financial intelligence/);
    assert.match(page, /Understand revenue, profitability and the decisions driving performance/);
    assert.doesNotMatch(page, /Run financial engine/);
    // Dataset create form only in UploadStepPanel path, not stacked above workspace
    assert.doesNotMatch(page, /1\. Dataset/);
    assert.doesNotMatch(page, /2\. Upload your business data/);
    assert.doesNotMatch(page, /3\. Mapping review/);
    assert.doesNotMatch(page, /4\. Data readiness/);

    const panels = readFileSync(join(root, "../../components/revenue-margin/OnboardingPanels.jsx"), "utf8");
    assert.match(panels, /Analyse my business/);
    assert.match(panels, /validateReadinessHighlights/);
    assert.match(panels, /Technical details/);
    assert.match(panels, /This usually completes in a few moments/);
    assert.doesNotMatch(panels, /Progress: \{/);
    assert.doesNotMatch(panels, /Run financial engine/);
    // Analyse CTA uses WYZ navy, not orange
    const analyseIdx = panels.indexOf("Analyse my business");
    const analyseWindow = panels.slice(Math.max(0, analyseIdx - 280), analyseIdx + 40);
    assert.match(analyseWindow, /bg-\[#1a3673\]/);
    assert.doesNotMatch(analyseWindow, /bg-\[#fc7d25\]/);
  });

  it("page imports canStartAnalysis and onboarding helpers", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const pageSrc = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(pageSrc, /canStartAnalysis/);
    assert.match(pageSrc, /from "\.\.\/lib\/revenue-margin\/workflow\.js"/);
    assert.match(pageSrc, /from "\.\.\/lib\/revenue-margin\/onboarding\.js"/);
    assert.match(pageSrc, /AnalysisWorkspace[^>]*result=\{result\}[^>]*datasetId=\{dataset\?\.dataset_id\}/);
  });

  it("onboarding presentation polish: density, stepper, navy CTAs", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const stepper = readFileSync(join(root, "../../components/revenue-margin/OnboardingStepper.jsx"), "utf8");
    const shell = readFileSync(join(root, "../../components/revenue-margin/OnboardingShell.jsx"), "utf8");
    const panels = readFileSync(join(root, "../../components/revenue-margin/OnboardingPanels.jsx"), "utf8");
    const page = readFileSync(join(root, "../../pages/RevenueMarginPage.jsx"), "utf8");
    assert.match(stepper, /OnboardingStepper/);
    assert.match(stepper, /bg-\[#fc7d25\]/);
    assert.match(stepper, /bg-emerald-600/);
    assert.match(shell, /max-w-\[880px\]/);
    assert.match(page, /max-w-\[880px\]/);
    assert.match(panels, /UploadStepPanel/);
    assert.match(panels, /DetectStepPanel/);
    assert.match(panels, /MappingStepPanel/);
    assert.match(panels, /ValidateStepPanel/);
    assert.match(panels, /AnalyseStepPanel/);
    assert.match(panels, /Confirm mappings/);
    const analyseIdx = panels.indexOf("Analyse my business");
    assert.match(panels.slice(Math.max(0, analyseIdx - 280), analyseIdx + 40), /bg-\[#1a3673\]/);
  });

  it("validate highlights only use verified readiness facts", () => {
    assert.deepEqual(validateReadinessHighlights(null), []);
    assert.deepEqual(validateReadinessHighlights({ ready_for_engine: false, joins: [] }), []);
    assert.deepEqual(
      validateReadinessHighlights({
        ready_for_engine: true,
        joins: [
          { name: "order_lines.sku_id→sku_master.sku_id", ok: true, match_pct: 1 },
          { name: "order_lines.order_id→settlements.order_id", ok: true, match_pct: 1 },
          { name: "order_lines.sku_id→sku_master.sku_id-bad", ok: false, match_pct: 0.5 },
        ],
      }),
      [
        { key: "required", label: "Required data is available" },
        { key: "order_lines.sku_id→sku_master.sku_id", label: "Product join coverage: 100%" },
        { key: "order_lines.order_id→settlements.order_id", label: "Settlement join coverage: 100%" },
      ],
    );
  });
});
