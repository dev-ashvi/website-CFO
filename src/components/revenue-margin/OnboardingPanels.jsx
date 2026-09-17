import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { readinessDisplayItems } from "../../lib/revenue-margin/dataQuality.js";
import {
  detectSourceCards,
  mappingGroupsByRole,
  validateExecutiveSummary,
  validateReadinessHighlights,
} from "../../lib/revenue-margin/onboarding.js";
import {
  canStartAnalysis,
  isIngestBusy,
  mappingRowsNeedingAttention,
} from "../../lib/revenue-margin/workflow.js";

export function ReadinessList({ readiness }) {
  const items = readinessDisplayItems(readiness);
  if (!items.length) {
    return (
      <p className="mt-1 text-[13px] text-emerald-700">
        No blocking data-quality issues reported.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={`${item.label}-${item.detail}`} className="flex items-start gap-2 text-[13px] text-slate-600">
          {item.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
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

export function UploadStepPanel({
  dataset,
  name,
  onNameChange,
  onCreate,
  onUploadClick,
  fileInputRef,
  onUploadChange,
  busy,
}) {
  return (
    <div className="space-y-5">
      {!dataset ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Create dataset</p>
          <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="flex-1 rounded-xl border border-[rgba(26,54,115,0.16)] px-3 py-2.5 text-sm text-[#1a3673] outline-none focus:border-[#1a3673]"
              placeholder="Dataset name"
              aria-label="Dataset name"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#142a5c] disabled:opacity-60"
            >
              Create dataset
            </button>
          </form>
        </div>
      ) : (
        <p className="text-[12px] text-slate-500">
          Dataset ready: <span className="font-medium text-[#1a3673]">{dataset.name}</span>
        </p>
      )}

      <div className={dataset ? "space-y-2" : "space-y-2 opacity-80"}>
        {dataset ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#fc7d25]">Next step</p>
        ) : null}
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={!dataset || busy}
            onClick={onUploadClick}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold disabled:opacity-50",
              dataset
                ? "bg-[#1a3673] text-white hover:bg-[#142a5c]"
                : "border border-dashed border-[#1a3673]/30 bg-[#1a3673]/5 text-[#1a3673]",
            ].join(" ")}
          >
            <Upload className="h-4 w-4" />
            Upload files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onUploadChange}
          />
          {isIngestBusy(dataset?.status) && (
            <span className="inline-flex items-center gap-2 text-[12px] text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Profiling your files…
            </span>
          )}
          {dataset && !isIngestBusy(dataset?.status) ? (
            <p className="text-[12px] text-slate-500">CSV or Excel — orders, products, settlements, marketing.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DetectStepPanel({ dataset }) {
  const cards = detectSourceCards(dataset);
  const stillWorking = isIngestBusy(dataset?.status);

  return (
    <div className="space-y-4">
      {stillWorking && (
        <p className="inline-flex items-center gap-2 text-[12px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Finishing file detection…
        </p>
      )}
      {cards.length === 0 ? (
        <p className="text-[13px] text-slate-500">Waiting for detected data sources…</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.key} className="rounded-xl border border-gray-100 bg-[#f8fafc] p-3">
              <div className="flex items-start gap-2">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#1a3673]">{card.title}</p>
                  {card.filename ? <p className="truncate text-[12px] text-slate-500">{card.filename}</p> : null}
                  <p className="mt-1 text-[11px] text-slate-500">
                    {card.rowCount != null ? `${Number(card.rowCount).toLocaleString("en-IN")} rows` : "Rows pending"}
                    {card.dateMin ? ` · ${card.dateMin} → ${card.dateMax || card.dateMin}` : ""}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MappingStepPanel({
  dataset,
  draftConfirms,
  setDraftConfirms,
  showAllMappings,
  setShowAllMappings,
}) {
  const allMappings = dataset?.mappings || [];
  const attentionRows = mappingRowsNeedingAttention(allMappings);
  const autoAcceptedCount = Math.max(0, allMappings.length - attentionRows.length);
  const groups = mappingGroupsByRole(dataset);
  const fieldOptions = (role) => dataset?.canonical_fields?.[role] || [];
  const attentionKeys = new Set(attentionRows.map((row) => `${row.source_file}:${row.source_column}`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          {attentionRows.length > 0
            ? `${attentionRows.length} field${attentionRows.length === 1 ? "" : "s"} need confirmation. Accepted mappings stay collapsed.`
            : autoAcceptedCount > 0
              ? `${autoAcceptedCount} field${autoAcceptedCount === 1 ? "" : "s"} accepted. Review how WYZ interpreted your data before confirming.`
              : "Review how source fields map to the financial model."}
        </p>
        {allMappings.length > 0 && attentionRows.length > 0 && (
          <button
            type="button"
            className="text-[12px] font-medium text-[#1a3673] underline-offset-2 hover:underline"
            onClick={() => setShowAllMappings((value) => !value)}
          >
            {showAllMappings
              ? "Show only fields needing review"
              : `View all mappings${autoAcceptedCount > 0 ? ` (${autoAcceptedCount} accepted)` : ""}`}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-[13px] text-slate-500">Waiting for mappings…</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const visibleRows =
              showAllMappings || attentionRows.length === 0
                ? group.rows
                : group.rows.filter((row) => attentionKeys.has(row.key));

            if (!showAllMappings && attentionRows.length > 0 && visibleRows.length === 0) {
              return (
                <div key={group.role} className="rounded-xl border border-gray-100 bg-[#f8fafc] px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13px] font-semibold text-[#1a3673]">{group.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {group.rows.length} accepted
                      {group.filename ? ` · ${group.filename}` : ""}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div key={group.role} className="rounded-xl border border-gray-100 bg-[#f8fafc] p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[#1a3673]">{group.title}</p>
                  {group.filename ? <p className="truncate text-[11px] text-slate-400">{group.filename}</p> : null}
                </div>
                <ul className="space-y-2">
                  {visibleRows.map((row) => {
                    const draft = draftConfirms[row.key]?.canonical_field ?? row.canonicalField ?? "";
                    const editable = row.needsAttention;
                    return (
                      <li
                        key={row.key}
                        className="grid gap-2 rounded-lg border border-white/80 bg-white px-3 py-2 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-slate-700">{row.sourceColumn || "—"}</p>
                          <p className="truncate text-[11px] text-slate-400">{row.sourceFile}</p>
                        </div>
                        <div className="min-w-0">
                          {editable ? (
                            <select
                              value={draft}
                              onChange={(event) =>
                                setDraftConfirms((prev) => ({
                                  ...prev,
                                  [row.key]: {
                                    source_file: row.sourceFile,
                                    source_column: row.sourceColumn,
                                    canonical_field: event.target.value,
                                  },
                                }))
                              }
                              className="w-full max-w-[240px] rounded-lg border border-[rgba(26,54,115,0.16)] px-2 py-1 text-[12px]"
                              aria-label={`Map ${row.sourceColumn}`}
                            >
                              {fieldOptions(row.fileRole).map((field) => (
                                <option key={field.name} value={field.name}>
                                  {field.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-[12px] font-medium text-[#1a3673]">{row.canonicalField || "—"}</p>
                          )}
                          <p className="text-[11px] text-slate-400">Financial field</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-[11px] font-medium text-slate-600">{row.reviewLabel}</p>
                          {row.confidence != null ? (
                            <p className="text-[11px] tabular-nums text-slate-400">
                              Confidence {Number(row.confidence).toFixed(2)}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ValidateStepPanel({ dataset }) {
  const ready = canStartAnalysis(dataset);
  const blocked = dataset?.readiness && dataset.readiness.ready_for_engine === false;
  const items = readinessDisplayItems(dataset?.readiness || {});
  const failing = items.filter((item) => !item.ok);
  const highlights = ready ? validateReadinessHighlights(dataset?.readiness) : [];
  const summary = ready ? validateExecutiveSummary(dataset) : [];

  return (
    <div className="space-y-4">
      {ready ? (
        <p className="text-[13px] font-medium text-emerald-800">
          WYZ has enough connected financial data to analyse the business.
        </p>
      ) : null}

      {summary.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {summary.map((chip) => (
            <span
              key={chip.key}
              className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-2.5 py-1 text-[12px] font-semibold text-emerald-800"
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}

      {ready && highlights.length > 0 ? (
        <ul className="space-y-1.5">
          {highlights.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-[13px] text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      {blocked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
          <p className="font-semibold">Attention required before analysis</p>
          <p className="mt-0.5 text-amber-900/80">Review the checks below. Blocking issues must be resolved.</p>
        </div>
      ) : null}

      {failing.length > 0 ? (
        <ul className="space-y-2">
          {failing.map((item) => (
            <li key={`${item.label}-${item.detail}`} className="flex items-start gap-2 text-[13px] text-slate-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
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
      ) : null}

      {dataset?.readiness ? (
        <details className="rounded-xl border border-gray-100 bg-[#f8fafc] px-3 py-2" open={Boolean(blocked)}>
          <summary className="cursor-pointer text-[12px] font-medium text-slate-500">
            {blocked ? "What needs attention ▾" : "Technical details ▾"}
          </summary>
          <div className="mt-2">
            <ReadinessList readiness={dataset.readiness} />
          </div>
        </details>
      ) : (
        <p className="text-[13px] text-slate-500">Waiting for readiness checks…</p>
      )}
    </div>
  );
}

export function AnalyseStepPanel({ job, dataset }) {
  const message =
    job?.message ||
    job?.stage ||
    (dataset?.status === "ANALYSING" ? "Analysis in progress…" : "Preparing financial model…");
  const failed = job?.status === "FAILED" || dataset?.status === "FAILED";
  const progressNum = Number(job?.progress);
  const hasMeaningfulProgress = Number.isFinite(progressNum) && progressNum > 0;
  const progressPct = hasMeaningfulProgress ? Math.min(100, Math.max(0, progressNum)) : null;

  return (
    <div className="space-y-4">
      {failed ? (
        <p className="inline-flex items-start gap-2 text-[13px] text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Analysis did not complete. You can retry from Validate once the dataset is READY again.
        </p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[#1a3673]" />
            <div>
              <p className="text-[14px] font-medium text-[#1a3673]">{message}</p>
              <p className="mt-1 text-[12px] text-slate-500">This usually completes in a few moments.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div
              className="relative h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct != null ? progressPct : undefined}
              aria-label={progressPct != null ? "Analysis progress" : "Analysis in progress"}
            >
              {progressPct != null ? (
                <div
                  className="h-full rounded-full bg-[#1a3673] transition-[width] duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              ) : (
                <>
                  <div
                    className="absolute inset-y-0 w-1/3 rounded-full bg-[#1a3673]/55"
                    style={{
                      animation: "wyzOnboardingIndeterminate 1.35s ease-in-out infinite",
                    }}
                  />
                  <style>{`
                    @keyframes wyzOnboardingIndeterminate {
                      0% { transform: translateX(-120%); }
                      100% { transform: translateX(360%); }
                    }
                  `}</style>
                </>
              )}
            </div>
            {progressPct != null ? (
              <p className="text-[11px] tabular-nums text-slate-400">{Math.round(progressPct)}% complete</p>
            ) : (
              <p className="text-[11px] text-slate-400">In progress</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
