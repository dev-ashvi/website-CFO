import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { readinessDisplayItems } from "../../lib/revenue-margin/dataQuality.js";
import { detectSourceCards } from "../../lib/revenue-margin/onboarding.js";
import {
  canStartAnalysis,
  isIngestBusy,
  isJobBusy,
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
    <div className="space-y-4">
      {!dataset ? (
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
      ) : (
        <p className="text-[12px] text-slate-500">
          Dataset: <span className="font-medium text-[#1a3673]">{dataset.name}</span>
        </p>
      )}

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={!dataset || busy}
          onClick={onUploadClick}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#1a3673]/30 bg-[#1a3673]/5 px-4 py-3 text-[13px] font-semibold text-[#1a3673] hover:bg-[#1a3673]/10 disabled:opacity-50"
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
  onConfirm,
  busy,
}) {
  const allMappings = dataset?.mappings || [];
  const attentionRows = mappingRowsNeedingAttention(allMappings);
  const autoAcceptedCount = Math.max(0, allMappings.length - attentionRows.length);
  const visibleRows = showAllMappings ? allMappings : attentionRows;
  const fieldOptions = (role) => dataset?.canonical_fields?.[role] || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">
          {attentionRows.length > 0
            ? `${attentionRows.length} field(s) need confirmation. High-confidence mappings stay collapsed.`
            : "High-confidence mappings are accepted automatically. Expand to inspect the full mapping table."}
        </p>
        {allMappings.length > 0 && (
          <button
            type="button"
            className="text-[12px] font-medium text-[#1a3673] underline-offset-2 hover:underline"
            onClick={() => setShowAllMappings((value) => !value)}
          >
            {showAllMappings
              ? "Show only fields requiring attention"
              : `View all mappings${autoAcceptedCount > 0 ? ` (${autoAcceptedCount} auto-accepted)` : ""}`}
          </button>
        )}
      </div>
      {!showAllMappings && autoAcceptedCount > 0 && (
        <p className="text-[12px] text-slate-500">
          {autoAcceptedCount} auto-accepted mapping{autoAcceptedCount === 1 ? "" : "s"} collapsed.
        </p>
      )}
      {visibleRows.length === 0 ? (
        <p className="text-[13px] text-emerald-700">No uncertain mappings need attention.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-3">Source field</th>
                <th className="py-2 pr-3">WYZ understands as</th>
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
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-500">
                      {row.final_confidence != null ? Number(row.final_confidence).toFixed(2) : "—"}
                    </td>
                    <td className="py-2 text-slate-500">{row.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(visibleRows.length > 0 || attentionRows.length > 0) && (
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#142a5c] disabled:opacity-60"
        >
          Confirm mappings
        </button>
      )}
    </div>
  );
}

export function ValidateStepPanel({ dataset, onAnalyse, busy }) {
  const ready = canStartAnalysis(dataset);
  const blocked = dataset?.readiness && dataset.readiness.ready_for_engine === false;
  const items = readinessDisplayItems(dataset?.readiness || {});
  const failing = items.filter((item) => !item.ok);

  return (
    <div className="space-y-4">
      {ready ? (
        <p className="inline-flex items-center gap-2 text-[13px] font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Your data is ready for analysis
        </p>
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
          <summary className="cursor-pointer text-[12px] font-medium text-[#1a3673]">
            {blocked ? "What needs attention" : "Technical details"}
          </summary>
          <div className="mt-2">
            <ReadinessList readiness={dataset.readiness} />
          </div>
        </details>
      ) : (
        <p className="text-[13px] text-slate-500">Waiting for readiness checks…</p>
      )}

      <button
        type="button"
        disabled={busy || !canStartAnalysis(dataset)}
        onClick={onAnalyse}
        className="inline-flex items-center gap-2 rounded-xl bg-[#fc7d25] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#e86f16] disabled:opacity-50"
      >
        <BarChart3 className="h-4 w-4" />
        Analyse my business
      </button>
    </div>
  );
}

export function AnalyseStepPanel({ job, dataset }) {
  const message =
    job?.message ||
    job?.stage ||
    (dataset?.status === "ANALYSING" ? "Analysis in progress…" : "Preparing financial model…");
  const failed = job?.status === "FAILED" || dataset?.status === "FAILED";

  return (
    <div className="space-y-3">
      {failed ? (
        <p className="inline-flex items-start gap-2 text-[13px] text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Analysis did not complete. You can retry from Validate once the dataset is READY again.
        </p>
      ) : (
        <p className="inline-flex items-center gap-2 text-[13px] text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-[#1a3673]" />
          {message}
        </p>
      )}
      {job?.progress != null && !failed ? (
        <p className="text-[12px] tabular-nums text-slate-400">Progress: {job.progress}</p>
      ) : null}
    </div>
  );
}
