import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DETECT_ROLE_LABELS,
  ONBOARDING_STAGES,
  PRESENTATION_MODE,
  REVIEW_STEPS,
  clearDetectAcknowledged,
  clearStepReviewed,
  detectSourceCards,
  hasDetectedSources,
  mappingGroupsByRole,
  needsMapPresentation,
  onboardingBackTarget,
  onboardingStepperModel,
  readDetectAcknowledged,
  readStepReviewed,
  resolveOnboardingStage,
  resolvePresentationMode,
  validateExecutiveSummary,
  validateReadinessHighlights,
  writeDetectAcknowledged,
  writeStepReviewed,
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

const READY_WITH_MAPPINGS = {
  dataset_id: "ds_ready_mapped01",
  status: DATASET_STATUSES.READY,
  files: [
    { filename: "orders.csv", file_role: "ORDER_LINES", row_count: 10 },
    { filename: "sku.csv", file_role: "SKU_MASTER", row_count: 4 },
  ],
  mappings: [
    {
      source_file: "orders.csv",
      source_column: "sku",
      canonical_field: "sku_id",
      file_role: "ORDER_LINES",
      status: "auto_accepted",
      final_confidence: 0.98,
    },
    {
      source_file: "sku.csv",
      source_column: "cogs",
      canonical_field: "unit_cogs",
      file_role: "SKU_MASTER",
      status: "auto_accepted",
      final_confidence: 0.95,
    },
  ],
  readiness: {
    ready_for_engine: true,
    joins: [
      { name: "order_lines.sku_id→sku_master.sku_id", ok: true, match_pct: 1 },
      { name: "order_lines.order_id→settlements.order_id", ok: true, match_pct: 1 },
    ],
  },
};

describe("P7.1 Pass 1 onboarding mode routing", () => {
  it("A. CREATED / new dataset → onboarding upload", () => {
    assert.equal(resolvePresentationMode({ dataset: null, result: null }), PRESENTATION_MODE.ONBOARDING);
    assert.equal(
      resolveOnboardingStage({ dataset: { status: DATASET_STATUSES.CREATED }, detectReviewed: false }),
      "upload",
    );
  });

  it("B. upload / profiling → upload or detect from file results", () => {
    assert.equal(
      resolveOnboardingStage({
        dataset: { status: DATASET_STATUSES.UPLOADING, files: [] },
        detectReviewed: false,
      }),
      "upload",
    );
    assert.equal(
      resolveOnboardingStage({
        dataset: {
          status: DATASET_STATUSES.PROFILING,
          files: [{ filename: "orders.csv", file_role: "ORDER_LINES", row_count: 10 }],
        },
        detectReviewed: false,
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
    assert.equal(resolveOnboardingStage({ dataset, detectReviewed: false }), "detect");
    assert.equal(resolveOnboardingStage({ dataset, detectReviewed: true, mappingReviewed: false }), "map");
  });

  it("D. READY without map review still requires Map after detect", () => {
    assert.equal(
      resolveOnboardingStage({
        dataset: READY_WITH_MAPPINGS,
        detectReviewed: false,
        mappingReviewed: false,
      }),
      "detect",
    );
    assert.equal(
      resolveOnboardingStage({
        dataset: READY_WITH_MAPPINGS,
        detectReviewed: true,
        mappingReviewed: false,
      }),
      "map",
    );
  });

  it("E. ANALYSING → analysis progress only", () => {
    assert.equal(
      resolveOnboardingStage({
        dataset: { status: DATASET_STATUSES.ANALYSING },
        job: { status: "RUNNING", message: "Building model" },
        detectReviewed: true,
        mappingReviewed: true,
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
        detectReviewed: false,
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
        detectReviewed: true,
        mappingReviewed: true,
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

describe("P7.1 onboarding journey presentation reviews", () => {
  it("A. backend mapping complete + Map not reviewed → Map MUST render", () => {
    assert.equal(needsMapPresentation(READY_WITH_MAPPINGS), true);
    assert.equal(
      resolveOnboardingStage({
        dataset: READY_WITH_MAPPINGS,
        detectReviewed: true,
        mappingReviewed: false,
      }),
      "map",
    );
  });

  it("B. Map reviewed + backend ready → Validate", () => {
    assert.equal(
      resolveOnboardingStage({
        dataset: READY_WITH_MAPPINGS,
        detectReviewed: true,
        mappingReviewed: true,
      }),
      "validate",
    );
  });

  it("C. Validate → Back clears map review → Map without backend mutation", () => {
    const storage = memStorage();
    writeStepReviewed(READY_WITH_MAPPINGS.dataset_id, REVIEW_STEPS.DETECT, true, storage);
    writeStepReviewed(READY_WITH_MAPPINGS.dataset_id, REVIEW_STEPS.MAP, true, storage);
    assert.equal(onboardingBackTarget("validate"), "map");
    clearStepReviewed(READY_WITH_MAPPINGS.dataset_id, REVIEW_STEPS.MAP, storage);
    assert.equal(readStepReviewed(READY_WITH_MAPPINGS.dataset_id, REVIEW_STEPS.MAP, storage), false);
    assert.equal(
      resolveOnboardingStage({
        dataset: READY_WITH_MAPPINGS,
        detectReviewed: true,
        mappingReviewed: false,
      }),
      "map",
    );
  });

  it("D. Map → Back clears detect review → Detect without backend mutation", () => {
    assert.equal(onboardingBackTarget("map"), "detect");
    assert.equal(onboardingBackTarget("detect"), null);
    assert.equal(onboardingBackTarget("analyse"), null);
    assert.equal(
      resolveOnboardingStage({
        dataset: READY_WITH_MAPPINGS,
        detectReviewed: false,
        mappingReviewed: false,
      }),
      "detect",
    );
  });

  it("E. forward after reviewing prior step reuses existing backend results", () => {
    const afterBackForward = resolveOnboardingStage({
      dataset: READY_WITH_MAPPINGS,
      detectReviewed: true,
      mappingReviewed: false,
    });
    assert.equal(afterBackForward, "map");
    assert.equal(READY_WITH_MAPPINGS.mappings.length, 2);
    assert.equal(READY_WITH_MAPPINGS.readiness.ready_for_engine, true);
  });

  it("F. refresh during Map restores session map/review state", () => {
    const storage = memStorage();
    writeStepReviewed("ds_ready_mapped01", REVIEW_STEPS.DETECT, true, storage);
    assert.equal(readStepReviewed("ds_ready_mapped01", REVIEW_STEPS.DETECT, storage), true);
    assert.equal(readStepReviewed("ds_ready_mapped01", REVIEW_STEPS.MAP, storage), false);
    assert.equal(
      resolveOnboardingStage({
        dataset: READY_WITH_MAPPINGS,
        detectReviewed: readStepReviewed("ds_ready_mapped01", REVIEW_STEPS.DETECT, storage),
        mappingReviewed: readStepReviewed("ds_ready_mapped01", REVIEW_STEPS.MAP, storage),
      }),
      "map",
    );
  });

  it("G. completed dataset + restorable result → Mode B", () => {
    assert.equal(
      resolvePresentationMode({ dataset: COMPLETED_DS, result: RESULT }),
      PRESENTATION_MODE.WORKSPACE,
    );
  });

  it("H. analysis submitted → Analyse remains authoritative", () => {
    assert.equal(
      resolveOnboardingStage({
        dataset: { ...READY_WITH_MAPPINGS, status: DATASET_STATUSES.ANALYSING },
        job: { status: "QUEUED", progress: 0 },
        detectReviewed: false,
        mappingReviewed: false,
      }),
      "analyse",
    );
  });

  it("I. new dataset acknowledgement state does not leak", () => {
    const storage = memStorage();
    writeStepReviewed("ds_a", REVIEW_STEPS.DETECT, true, storage);
    writeStepReviewed("ds_a", REVIEW_STEPS.MAP, true, storage);
    assert.equal(readStepReviewed("ds_b", REVIEW_STEPS.DETECT, storage), false);
    assert.equal(readStepReviewed("ds_b", REVIEW_STEPS.MAP, storage), false);
  });

  it("J. Back targets are presentation-only (no API surface in helpers)", () => {
    const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../pages/RevenueMarginPage.jsx"), "utf8");
    const backFn = page.slice(page.indexOf("function navigateOnboardingBack"), page.indexOf("function markMappingReviewed"));
    assert.match(backFn, /writeStepReviewed/);
    assert.doesNotMatch(backFn, /confirmMappings|getDataset|uploadDatasetFiles|startAnalysisJob/);
    assert.equal(onboardingBackTarget("validate"), "map");
    assert.equal(onboardingBackTarget("map"), "detect");
  });

  it("mapping groups use business roles from existing rows only", () => {
    const groups = mappingGroupsByRole(READY_WITH_MAPPINGS);
    assert.deepEqual(
      groups.map((g) => g.title),
      ["Orders", "Products / COGS"],
    );
    assert.equal(groups[0].rows[0].canonicalField, "sku_id");
    assert.equal(groups[0].rows[0].confidence, 0.98);
  });

  it("validate executive summary derives counts from dataset only", () => {
    const chips = validateExecutiveSummary(READY_WITH_MAPPINGS);
    assert.deepEqual(
      chips.map((c) => c.label),
      ["2 Data sources", "2 Mapped", "100% Product joins", "100% Settlement joins"],
    );
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
    assert.match(page, /navigateOnboardingBack/);
    assert.match(page, /mappingReviewed/);
    assert.match(page, /Map your financial data/);
    assert.doesNotMatch(page, /Run financial engine/);
    assert.doesNotMatch(page, /1\. Dataset/);
    assert.doesNotMatch(page, /2\. Upload your business data/);
    assert.doesNotMatch(page, /3\. Mapping review/);
    assert.doesNotMatch(page, /4\. Data readiness/);

    const panels = readFileSync(join(root, "../../components/revenue-margin/OnboardingPanels.jsx"), "utf8");
    assert.match(panels, /mappingGroupsByRole/);
    assert.match(panels, /validateExecutiveSummary/);
    assert.match(panels, /Technical details/);
    assert.match(panels, /This usually completes in a few moments/);
    assert.match(panels, /wyzOnboardingIndeterminate/);
    assert.doesNotMatch(panels, /Progress: \{/);
    assert.doesNotMatch(panels, /Run financial engine/);
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
    assert.match(stepper, /h-6 w-6/);
    assert.match(shell, /max-w-\[880px\]/);
    assert.match(shell, /OnboardingBackButton/);
    assert.match(page, /max-w-\[880px\]/);
    assert.match(page, /Confirm mappings/);
    assert.match(page, /Analyse my business/);
    assert.match(panels, /UploadStepPanel/);
    assert.match(panels, /DetectStepPanel/);
    assert.match(panels, /MappingStepPanel/);
    assert.match(panels, /ValidateStepPanel/);
    assert.match(panels, /AnalyseStepPanel/);
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
