import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  confirmMappings,
  createDataset,
  getAnalysisResult,
  getDataset,
  listDatasets,
  startAnalysisJob,
  uploadDatasetFiles,
  waitForAnalysisJob,
} from "../api/revenueMargin.js";
import {
  canStartAnalysis,
  DATASET_STATUSES,
  isIngestBusy,
  jobErrorMessage,
  mappingRowsNeedingAttention,
} from "../lib/revenue-margin/workflow.js";
import {
  onboardingBackTarget,
  onboardingStepperModel,
  PRESENTATION_MODE,
  readStepReviewed,
  resolveOnboardingStage,
  resolvePresentationMode,
  REVIEW_STEPS,
  writeStepReviewed,
} from "../lib/revenue-margin/onboarding.js";
import {
  buildRevenueMarginPath,
  clearActiveDatasetId,
  DATASET_QUERY_PARAM,
  writeActiveDatasetId,
} from "../lib/revenue-margin/workspaceSession.js";
import {
  normalizeRevenueMarginWorkspaceResult,
  RESTORE_PHASE,
  resolveRestoreTarget,
  runWorkspaceRestore,
} from "../lib/revenue-margin/workspaceRestore.js";
import AnalysisWorkspace from "../components/revenue-margin/AnalysisWorkspace.jsx";
import DatasetLibrarySwitcher from "../components/revenue-margin/DatasetLibrarySwitcher.jsx";
import OnboardingShell, { OnboardingBackButton } from "../components/revenue-margin/OnboardingShell.jsx";
import {
  AnalyseStepPanel,
  DetectStepPanel,
  MappingStepPanel,
  UploadStepPanel,
  ValidateStepPanel,
} from "../components/revenue-margin/OnboardingPanels.jsx";

function statusTone(status) {
  if (status === DATASET_STATUSES.COMPLETED || status === DATASET_STATUSES.READY) return "text-emerald-700 bg-emerald-50";
  if (status === DATASET_STATUSES.FAILED) return "text-rose-700 bg-rose-50";
  if (status === DATASET_STATUSES.NEEDS_REVIEW) return "text-amber-800 bg-amber-50";
  return "text-[#1a3673] bg-[#1a3673]/10";
}

function onboardingCopy(stage, dataset) {
  const sourceCount = dataset?.files?.length || 0;
  switch (stage) {
    case "upload":
      return {
        title: "Upload your business data",
        subtitle:
          "Give WYZ the commerce files needed for revenue and profitability — orders, products/COGS, settlements, and marketing spend.",
      };
    case "detect":
      return {
        title: sourceCount > 0 ? `We found ${sourceCount} data source${sourceCount === 1 ? "" : "s"}` : "We found your business data",
        subtitle: "WYZ identifies what each data source represents. Review before continuing.",
      };
    case "map":
      return {
        title: "Map your financial data",
        subtitle:
          "WYZ has mapped your files to the financial model. Review how your data will be interpreted.",
      };
    case "validate":
      return {
        title: canStartAnalysis(dataset) ? "Your data is ready" : "Data readiness",
        subtitle: canStartAnalysis(dataset)
          ? "WYZ verifies that the data can produce reliable financial analysis."
          : "Resolve any outstanding checks before running analysis.",
      };
    case "analyse":
      return {
        title: "Analysing your business",
        subtitle: "WYZ builds the financial workspace from the validated dataset.",
      };
    default:
      return { title: "Set up your dataset", subtitle: null };
  }
}

export default function RevenueMarginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [name, setName] = useState("FY26 commerce dataset");
  const [dataset, setDataset] = useState(null);
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [draftConfirms, setDraftConfirms] = useState({});
  const [busy, setBusy] = useState(false);
  const [restorePhase, setRestorePhase] = useState(RESTORE_PHASE.RESTORING);
  const [restoreError, setRestoreError] = useState(null);
  const [error, setError] = useState(null);
  const [showAllMappings, setShowAllMappings] = useState(false);
  const [detectReviewed, setDetectReviewed] = useState(false);
  const [mappingReviewed, setMappingReviewed] = useState(false);
  const fileRef = useRef(null);
  const restoreGenerationRef = useRef(0);

  const urlDatasetParam = searchParams.get(DATASET_QUERY_PARAM) || searchParams.get("dataset_id") || "";
  const restoring = restorePhase === RESTORE_PHASE.RESTORING;
  const restoreFailed =
    restorePhase === RESTORE_PHASE.FAILED || restorePhase === RESTORE_PHASE.NOT_FOUND;

  const presentationMode = resolvePresentationMode({ dataset, result });
  const isWorkspace = presentationMode === PRESENTATION_MODE.WORKSPACE;

  const onboardingStage = useMemo(
    () =>
      resolveOnboardingStage({
        dataset,
        job,
        detectReviewed,
        mappingReviewed,
      }),
    [dataset, job, detectReviewed, mappingReviewed],
  );
  const stepperSteps = useMemo(() => onboardingStepperModel(onboardingStage), [onboardingStage]);
  const stageCopy = onboardingCopy(onboardingStage, dataset);
  const backTarget = onboardingBackTarget(onboardingStage);

  useEffect(() => {
    if (!dataset?.dataset_id) {
      setDetectReviewed(false);
      setMappingReviewed(false);
      return;
    }
    setDetectReviewed(readStepReviewed(dataset.dataset_id, REVIEW_STEPS.DETECT));
    setMappingReviewed(readStepReviewed(dataset.dataset_id, REVIEW_STEPS.MAP));
  }, [dataset?.dataset_id]);

  function persistActiveDataset(datasetId, { history = "replace" } = {}) {
    if (!datasetId) return;
    writeActiveDatasetId(datasetId);
    const next = buildRevenueMarginPath(datasetId);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      navigate(next, { replace: history === "replace" });
    }
  }

  /** Explicit library selection — push history so Back/Forward work; restore via URL effect. */
  function switchActiveDataset(datasetId) {
    if (!datasetId) return;
    if (datasetId === urlDatasetParam || datasetId === dataset?.dataset_id) return;
    writeActiveDatasetId(datasetId);
    // Drop ephemeral workspace state immediately so Dataset A UI cannot leak into B.
    setResult(null);
    setJob(null);
    setDraftConfirms({});
    setError(null);
    setRestoreError(null);
    setShowAllMappings(false);
    setDetectReviewed(readStepReviewed(datasetId, REVIEW_STEPS.DETECT));
    setMappingReviewed(readStepReviewed(datasetId, REVIEW_STEPS.MAP));
    navigate(buildRevenueMarginPath(datasetId), { replace: false });
  }

  function startNewAnalysis() {
    clearActiveDatasetId();
    setDataset(null);
    setResult(null);
    setJob(null);
    setDraftConfirms({});
    setRestoreError(null);
    setError(null);
    setShowAllMappings(false);
    setDetectReviewed(false);
    setMappingReviewed(false);
    setRestorePhase(RESTORE_PHASE.IDLE);
    // Push so Back can return to the previous dataset URL.
    navigate("/app/revenue-margin", { replace: false });
  }

  function acknowledgeDetect() {
    if (dataset?.dataset_id) {
      writeStepReviewed(dataset.dataset_id, REVIEW_STEPS.DETECT, true);
    }
    setDetectReviewed(true);
  }

  function navigateOnboardingBack() {
    if (!dataset?.dataset_id || !backTarget) return;
    if (backTarget === "detect") {
      writeStepReviewed(dataset.dataset_id, REVIEW_STEPS.DETECT, false);
      setDetectReviewed(false);
      return;
    }
    if (backTarget === "map") {
      writeStepReviewed(dataset.dataset_id, REVIEW_STEPS.MAP, false);
      setMappingReviewed(false);
    }
  }

  function markMappingReviewed() {
    if (dataset?.dataset_id) {
      writeStepReviewed(dataset.dataset_id, REVIEW_STEPS.MAP, true);
    }
    setMappingReviewed(true);
  }

  async function executeRestore() {
    const generation = ++restoreGenerationRef.current;
    const isStale = () => generation !== restoreGenerationRef.current;
    setRestorePhase(RESTORE_PHASE.RESTORING);
    setRestoreError(null);
    setError(null);

    const target = resolveRestoreTarget({ searchParams });
    try {
      const outcome = await runWorkspaceRestore({
        target,
        getDataset,
        getAnalysisResult,
        isStale,
      });
      if (isStale() || outcome.aborted) return;

      if (outcome.phase === RESTORE_PHASE.IDLE) {
        setDataset(null);
        setResult(null);
        setRestorePhase(RESTORE_PHASE.IDLE);
        return;
      }

      if (outcome.phase === RESTORE_PHASE.RESTORED) {
        setDataset(outcome.dataset);
        setResult(outcome.result);
        setJob(null);
        setRestorePhase(RESTORE_PHASE.RESTORED);
        // Sync URL when restore came from localStorage only; skip navigate if already matching.
        if (outcome.dataset?.dataset_id) {
          persistActiveDataset(outcome.dataset.dataset_id);
        }
        return;
      }

      // FAILED / NOT_FOUND — never silently swap in a different stored dataset.
      setDataset(null);
      setResult(null);
      setJob(null);
      setRestoreError(outcome.error || "We couldn't restore this analysis.");
      setRestorePhase(outcome.phase);
    } catch (err) {
      if (isStale()) return;
      setDataset(null);
      setResult(null);
      setJob(null);
      setRestoreError(err?.message || "We couldn't restore this analysis.");
      setRestorePhase(RESTORE_PHASE.FAILED);
    }
  }

  useEffect(() => {
    // Already hydrated for this URL dataset — avoid RESTORING flash / duplicate fetch
    // when persistActiveDataset only syncs ?dataset= after a storage restore.
    if (
      urlDatasetParam &&
      dataset?.dataset_id === urlDatasetParam &&
      result &&
      (restorePhase === RESTORE_PHASE.RESTORED || restorePhase === RESTORE_PHASE.IDLE)
    ) {
      return undefined;
    }

    let cancelled = false;
    const generation = ++restoreGenerationRef.current;

    (async () => {
      setRestorePhase(RESTORE_PHASE.RESTORING);
      setRestoreError(null);
      const target = resolveRestoreTarget({ searchParams });
      try {
        const outcome = await runWorkspaceRestore({
          target,
          getDataset,
          getAnalysisResult,
          isStale: () => cancelled || generation !== restoreGenerationRef.current,
        });
        if (cancelled || generation !== restoreGenerationRef.current || outcome.aborted) {
          return;
        }
        if (outcome.phase === RESTORE_PHASE.IDLE) {
          setDataset(null);
          setResult(null);
          setRestorePhase(RESTORE_PHASE.IDLE);
          return;
        }
        if (outcome.phase === RESTORE_PHASE.RESTORED) {
          setDataset(outcome.dataset);
          setResult(outcome.result);
          setJob(null);
          setRestorePhase(RESTORE_PHASE.RESTORED);
          if (outcome.dataset?.dataset_id) {
            writeActiveDatasetId(outcome.dataset.dataset_id);
            const next = buildRevenueMarginPath(outcome.dataset.dataset_id);
            const current = `${window.location.pathname}${window.location.search}`;
            if (current !== next) {
              navigate(next, { replace: true });
            }
          }
          return;
        }
        setDataset(null);
        setResult(null);
        setJob(null);
        setRestoreError(outcome.error || "We couldn't restore this analysis.");
        setRestorePhase(outcome.phase);
      } catch (err) {
        if (cancelled || generation !== restoreGenerationRef.current) return;
        setDataset(null);
        setResult(null);
        setJob(null);
        setRestoreError(err?.message || "We couldn't restore this analysis.");
        setRestorePhase(RESTORE_PHASE.FAILED);
      }
    })();

    return () => {
      cancelled = true;
    };
    // URL dataset wins; re-run when it changes. StrictMode-safe via generation + cancelled.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target resolved from searchParams + storage
  }, [urlDatasetParam]);

  useEffect(() => {
    if (!dataset?.dataset_id || !isIngestBusy(dataset.status)) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const next = await getDataset(dataset.dataset_id);
        if (!cancelled) {
          setDataset(next);
          if (next.status === DATASET_STATUSES.FAILED && next.error) {
            setError(jobErrorMessage(next.error_detail || next.error));
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Polling failed");
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [dataset?.dataset_id, dataset?.status]);

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createDataset({ name });
      setDataset(created);
      setResult(null);
      setJob(null);
      persistActiveDataset(created.dataset_id);
    } catch (err) {
      setError(err.message || "Could not create dataset");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !dataset) return;
    setBusy(true);
    setError(null);
    try {
      const next = await uploadDatasetFiles(dataset.dataset_id, files);
      setDataset(next);
      persistActiveDataset(next.dataset_id);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmMappings() {
    if (!dataset) return;
    const attention = mappingRowsNeedingAttention(dataset.mappings || []);

    // Auto-accepted mappings: presentation confirmation only — no API mutation.
    if (attention.length === 0) {
      setError(null);
      markMappingReviewed();
      return;
    }

    const items = attention
      .map((row) => {
        const key = `${row.source_file}:${row.source_column}`;
        const draft = draftConfirms[key];
        return {
          source_file: row.source_file,
          source_column: row.source_column,
          canonical_field: draft?.canonical_field || row.canonical_field,
        };
      })
      .filter((item) => item.canonical_field);

    if (!items.length) {
      setError("Confirm or change at least one field before saving.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const next = await confirmMappings(dataset.dataset_id, items);
      setDataset(next);
      setDraftConfirms({});
      persistActiveDataset(next.dataset_id);
      writeStepReviewed(next.dataset_id, REVIEW_STEPS.MAP, true);
      setMappingReviewed(true);
    } catch (err) {
      setError(err.message || "Could not save mapping confirmations");
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyse() {
    if (!dataset || !canStartAnalysis(dataset)) return;
    setBusy(true);
    setError(null);
    try {
      const createdJob = await startAnalysisJob(dataset.dataset_id);
      setJob(createdJob);
      setDataset((prev) => ({ ...prev, status: DATASET_STATUSES.ANALYSING, analysis_status: DATASET_STATUSES.ANALYSING }));
      const finished = await waitForAnalysisJob(createdJob.analysis_job_id || createdJob.job_id, dataset.dataset_id, {
        intervalMs: 1000,
        timeoutMs: 180000,
        maxTransientErrors: 5,
      });
      setJob(finished);
      if (finished.status === "FAILED") {
        setError(jobErrorMessage(finished.error, "Analysis failed"));
        const latest = await getDataset(dataset.dataset_id);
        setDataset(latest);
        return;
      }
      const summary = await getAnalysisResult(dataset.dataset_id);
      setResult(normalizeRevenueMarginWorkspaceResult(summary));
      const latest = await getDataset(dataset.dataset_id);
      setDataset(latest);
      persistActiveDataset(latest.dataset_id);
    } catch (err) {
      // Never leave the UI permanently on a stale QUEUED/ANALYSING client state.
      try {
        const latest = await getDataset(dataset.dataset_id);
        setDataset(latest);
        if (latest?.status === DATASET_STATUSES.COMPLETED || latest?.analysis_status === DATASET_STATUSES.COMPLETED) {
          const summary = await getAnalysisResult(dataset.dataset_id);
          setResult(normalizeRevenueMarginWorkspaceResult(summary));
          setJob({
            job_id: latest.latest_job_id,
            analysis_job_id: latest.latest_job_id,
            status: "COMPLETED",
            stage: "COMPLETED",
          });
          setError(null);
          return;
        }
        if (latest?.status === DATASET_STATUSES.FAILED || latest?.analysis_status === DATASET_STATUSES.FAILED) {
          setJob({ status: "FAILED", stage: "FAILED", error: latest.error });
        }
      } catch {
        // fall through to error message
      }
      setError(err.message || "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  if (restoring) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Restoring Revenue &amp; Margin workspace…
      </div>
    );
  }

  if (restoreFailed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200/80 bg-white/90 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Revenue & Margin</h1>
            </div>
            <DatasetLibrarySwitcher
              activeDatasetId={urlDatasetParam || null}
              listDatasets={listDatasets}
              onSelectDataset={switchActiveDataset}
              onNewAnalysis={startNewAnalysis}
            />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-[13px] text-amber-950">
            <p className="font-semibold">We couldn&apos;t restore this analysis.</p>
            {restoreError && <p className="mt-1 text-amber-900/80">{restoreError}</p>}
            {urlDatasetParam ? (
              <p className="mt-2 text-[12px] text-amber-900/70">Dataset: {urlDatasetParam}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                void executeRestore();
              }}
              className="rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#142a5c]"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={startNewAnalysis}
              className="rounded-xl border border-[rgba(26,54,115,0.2)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#1a3673] hover:bg-[#f8fafc]"
            >
              Start a new analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  const headerSubtitle = isWorkspace
    ? "Understand revenue, profitability and the decisions driving performance."
    : "Turn your business data into financial intelligence.";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-gray-200/80 bg-white/90 px-4 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(26,54,115,0.55)]">
              Authenticated module
            </p>
            <h1 className="mt-1 text-lg font-semibold text-[#1a3673] sm:text-xl">Revenue & Margin</h1>
            <p className="mt-0.5 max-w-2xl text-[12px] text-slate-500">{headerSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-start gap-2 sm:gap-3">
            <DatasetLibrarySwitcher
              activeDatasetId={dataset?.dataset_id || urlDatasetParam || null}
              activeDatasetName={dataset?.name}
              listDatasets={listDatasets}
              onSelectDataset={switchActiveDataset}
              onNewAnalysis={startNewAnalysis}
            />
            {dataset?.status && (
              <span
                className={
                  isWorkspace
                    ? `rounded-full px-3 py-1 text-[11px] font-semibold ${statusTone(dataset.status)}`
                    : "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 bg-slate-100/90"
                }
                title={dataset.status}
              >
                {dataset.status}
              </span>
            )}
          </div>
        </div>
      </header>

      {isWorkspace ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
          {error && (
            <div className="mx-auto mb-4 flex max-w-6xl items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          <AnalysisWorkspace key={dataset?.dataset_id || result.dataset_id || "workspace"} result={result} datasetId={dataset?.dataset_id} dataset={dataset} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="mx-auto max-w-[880px]">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <OnboardingShell
              steps={stepperSteps}
              title={stageCopy.title}
              subtitle={stageCopy.subtitle}
              footer={
                onboardingStage === "detect" ? (
                  <>
                    <span className="hidden sm:block" aria-hidden />
                    <button
                      type="button"
                      disabled={busy || isIngestBusy(dataset?.status)}
                      onClick={acknowledgeDetect}
                      className="self-stretch rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#142a5c] disabled:opacity-50 sm:self-auto"
                    >
                      Continue
                    </button>
                  </>
                ) : onboardingStage === "map" ? (
                  <>
                    <OnboardingBackButton onClick={navigateOnboardingBack} disabled={busy} />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleConfirmMappings}
                      className="self-stretch rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#142a5c] disabled:opacity-60 sm:self-auto"
                    >
                      Confirm mappings
                    </button>
                  </>
                ) : onboardingStage === "validate" ? (
                  <>
                    <OnboardingBackButton onClick={navigateOnboardingBack} disabled={busy} />
                    <button
                      type="button"
                      disabled={busy || !canStartAnalysis(dataset)}
                      onClick={handleAnalyse}
                      className="inline-flex items-center justify-center gap-2 self-stretch rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#142a5c] disabled:opacity-50 sm:self-auto"
                    >
                      Analyse my business
                    </button>
                  </>
                ) : null
              }
            >
              {onboardingStage === "upload" && (
                <UploadStepPanel
                  dataset={dataset}
                  name={name}
                  onNameChange={setName}
                  onCreate={handleCreate}
                  onUploadClick={() => fileRef.current?.click()}
                  fileInputRef={fileRef}
                  onUploadChange={handleUpload}
                  busy={busy}
                />
              )}
              {onboardingStage === "detect" && <DetectStepPanel dataset={dataset} />}
              {onboardingStage === "map" && (
                <MappingStepPanel
                  dataset={dataset}
                  draftConfirms={draftConfirms}
                  setDraftConfirms={setDraftConfirms}
                  showAllMappings={showAllMappings}
                  setShowAllMappings={setShowAllMappings}
                />
              )}
              {onboardingStage === "validate" && <ValidateStepPanel dataset={dataset} />}
              {onboardingStage === "analyse" && <AnalyseStepPanel job={job} dataset={dataset} />}
            </OnboardingShell>
          </div>
        </div>
      )}
    </div>
  );
}
