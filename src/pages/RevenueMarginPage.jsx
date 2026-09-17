import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Loader2,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
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
import { readinessDisplayItems } from "../lib/revenue-margin/dataQuality.js";
import {
  canStartAnalysis,
  DATASET_STATUSES,
  isIngestBusy,
  isJobBusy,
  jobErrorMessage,
  mappingRowsNeedingAttention,
  ROLE_LABELS,
  workflowStep,
} from "../lib/revenue-margin/workflow.js";
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

function statusTone(status) {
  if (status === DATASET_STATUSES.COMPLETED || status === DATASET_STATUSES.READY) return "text-emerald-700 bg-emerald-50";
  if (status === DATASET_STATUSES.FAILED) return "text-rose-700 bg-rose-50";
  if (status === DATASET_STATUSES.NEEDS_REVIEW) return "text-amber-800 bg-amber-50";
  return "text-[#1a3673] bg-[#1a3673]/10";
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
  const fileRef = useRef(null);
  const restoreGenerationRef = useRef(0);

  const urlDatasetParam = searchParams.get(DATASET_QUERY_PARAM) || searchParams.get("dataset_id") || "";
  const restoring = restorePhase === RESTORE_PHASE.RESTORING;
  const restoreFailed =
    restorePhase === RESTORE_PHASE.FAILED || restorePhase === RESTORE_PHASE.NOT_FOUND;

  const step = workflowStep(dataset?.status);
  const attentionRows = useMemo(
    () => mappingRowsNeedingAttention(dataset?.mappings || []),
    [dataset?.mappings],
  );
  const allMappings = dataset?.mappings || [];
  const autoAcceptedCount = Math.max(0, allMappings.length - attentionRows.length);
  const visibleRows = showAllMappings ? allMappings : attentionRows;

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
    setRestorePhase(RESTORE_PHASE.IDLE);
    // Push so Back can return to the previous dataset URL.
    navigate("/app/revenue-margin", { replace: false });
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
    const items = Object.values(draftConfirms).filter((item) => item.canonical_field);
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

  const fieldOptions = (role) => dataset?.canonical_fields?.[role] || [];

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-gray-200/80 bg-white/90 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(26,54,115,0.55)]">
              Authenticated module
            </p>
            <h1 className="mt-1 text-lg font-semibold text-[#1a3673] sm:text-xl">Revenue & Margin</h1>
            <p className="mt-0.5 max-w-2xl text-[12px] text-slate-500">
              Upload commerce files, review uncertain mappings, then run the deterministic WYZ engine.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <DatasetLibrarySwitcher
              activeDatasetId={dataset?.dataset_id || urlDatasetParam || null}
              activeDatasetName={dataset?.name}
              listDatasets={listDatasets}
              onSelectDataset={switchActiveDataset}
              onNewAnalysis={startNewAnalysis}
            />
            {dataset?.status && (
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusTone(dataset.status)}`}>
                {dataset.status}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-[#1a3673]">1. Dataset</h2>
            <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 rounded-xl border border-[rgba(26,54,115,0.16)] px-3 py-2.5 text-sm text-[#1a3673] outline-none focus:border-[#1a3673]"
                placeholder="Dataset name"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#142a5c] disabled:opacity-60"
              >
                Create dataset
              </button>
            </form>
            {dataset && (
              <p className="mt-3 text-[12px] text-slate-500">
                {dataset.name} · {dataset.dataset_id} · v{dataset.dataset_version}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-[#1a3673]">2. Upload your business data</h2>
            <p className="mt-1 text-[12px] text-slate-500">
              Add order, product, settlement, and marketing files together. WYZ will classify them after profiling.
            </p>
            <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={!dataset || busy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#1a3673]/30 bg-[#1a3673]/5 px-4 py-3 text-[13px] font-semibold text-[#1a3673] hover:bg-[#1a3673]/10 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Upload files
              </button>
              <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
              {isIngestBusy(dataset?.status) && (
                <span className="inline-flex items-center gap-2 text-[12px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Profiling and mapping…
                </span>
              )}
            </div>
            {dataset?.files?.length > 0 && (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {dataset.files.map((file) => (
                  <li key={file.filename} className="rounded-xl border border-gray-100 bg-[#f8fafc] p-3">
                    <div className="flex items-start gap-2">
                      <FileSpreadsheet className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <div>
                        <p className="text-[13px] font-semibold text-[#1a3673]">
                          {file.label || ROLE_LABELS[file.file_role] || file.file_role}
                        </p>
                        <p className="text-[12px] text-slate-500">{file.filename}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {file.row_count != null ? `${file.row_count.toLocaleString("en-IN")} rows` : "Rows pending"}
                          {file.date_min ? ` · ${file.date_min} → ${file.date_max || file.date_min}` : ""}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(step === "review" || step === "ready" || attentionRows.length > 0 || allMappings.length > 0) && dataset && (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#1a3673]">3. Mapping review</h2>
                {allMappings.length > 0 && (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-[#1a3673] underline-offset-2 hover:underline"
                    onClick={() => setShowAllMappings((value) => !value)}
                  >
                    {showAllMappings
                      ? "Show only fields requiring attention"
                      : `View all mappings${autoAcceptedCount > 0 ? ` (${autoAcceptedCount} auto-accepted hidden)` : ""}`}
                  </button>
                )}
              </div>
              <p className="mt-1 text-[12px] text-slate-500">
                {attentionRows.length > 0
                  ? `${attentionRows.length} field(s) need confirmation. High-confidence mappings are auto-accepted and hidden by default.`
                  : "High-confidence mappings are accepted automatically. Expand to inspect the full mapping table."}
              </p>
              {!showAllMappings && autoAcceptedCount > 0 && (
                <p className="mt-2 text-[12px] text-slate-500">
                  {autoAcceptedCount} auto-accepted mapping{autoAcceptedCount === 1 ? "" : "s"} collapsed.
                </p>
              )}
              {visibleRows.length === 0 ? (
                <p className="mt-3 text-[13px] text-emerald-700">No uncertain mappings need attention.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">WYZ field</th>
                        <th className="py-2 pr-3">Confidence</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const key = `${row.source_file}:${row.source_column}`;
                        const draft = draftConfirms[key]?.canonical_field ?? row.canonical_field ?? "";
                        return (
                          <tr key={key} className="border-t border-gray-100">
                            <td className="py-2 pr-3">
                              <div className="font-medium text-slate-700">{row.source_column}</div>
                              <div className="text-[11px] text-slate-400">{row.source_file}</div>
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                value={draft}
                                onChange={(event) =>
                                  setDraftConfirms((prev) => ({
                                    ...prev,
                                    [key]: {
                                      source_file: row.source_file,
                                      source_column: row.source_column,
                                      canonical_field: event.target.value,
                                    },
                                  }))
                                }
                                className="max-w-[220px] rounded-lg border border-[rgba(26,54,115,0.16)] px-2 py-1 text-[12px]"
                              >
                                {fieldOptions(row.file_role).map((field) => (
                                  <option key={field.name} value={field.name}>
                                    {field.name}
                                  </option>
                                ))}
                              </select>
                              <div className="text-[11px] text-slate-400">{row.origin}</div>
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {row.final_confidence != null ? Number(row.final_confidence).toFixed(2) : "—"}
                            </td>
                            <td className="py-2 text-slate-600">{row.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {visibleRows.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmMappings}
                  className="mt-4 rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#142a5c] disabled:opacity-60"
                >
                  Save mapping decisions
                </button>
              )}
            </section>
          )}

          {dataset?.readiness && (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-sm font-semibold text-[#1a3673]">4. Data readiness</h2>
              <ReadinessList readiness={dataset.readiness} />
              <button
                type="button"
                disabled={busy || !canStartAnalysis(dataset)}
                onClick={handleAnalyse}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#fc7d25] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#e86f16] disabled:opacity-50"
              >
                <BarChart3 className="h-4 w-4" />
                Run financial engine
              </button>
              {(dataset.status === DATASET_STATUSES.ANALYSING || isJobBusy(job?.status) || isJobBusy(job?.stage)) && (
                <p className="mt-3 inline-flex items-center gap-2 text-[12px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {job?.message || job?.stage || "Analysis in progress"}
                </p>
              )}
            </section>
          )}

          {result && (
            <AnalysisWorkspace
              key={dataset?.dataset_id || result.dataset_id || "workspace"}
              result={result}
              datasetId={dataset?.dataset_id}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReadinessList({ readiness }) {
  const items = readinessDisplayItems(readiness);
  if (!items.length) {
    return <p className="mt-3 text-[13px] text-emerald-700">No blocking data-quality issues reported by the analytics service.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={`${item.label}-${item.detail}`} className="flex items-start gap-2 text-[13px] text-slate-600">
          {item.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          )}
          <div>
            <p>{item.label}</p>
            {item.detail && (
              <details className="mt-1 text-[11px] text-slate-400">
                <summary className="cursor-pointer">Technical detail</summary>
                <p className="mt-1">{item.detail}</p>
              </details>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
