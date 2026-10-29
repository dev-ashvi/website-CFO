import { ChevronDown, ChevronUp, FileSpreadsheet, FileText, X } from "lucide-react";

function formatBytes(byteLength) {
  if (!byteLength) return "0 B";
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

function Slot({ title, hint, accept, file, onPick, onClear, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-[rgba(26,54,115,0.14)] bg-white p-4 shadow-[0_8px_24px_rgba(26,54,115,0.05)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4f7fb] text-[#1a3673]">
          <Icon size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#1a3673]">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
        </div>
      </div>

      {file ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#f7f9fc] px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#1a3673]">{file.fileName}</p>
            <p className="text-xs text-slate-500">
              {formatBytes(file.byteLength)} · {file.parsed ? "parsed in session" : "held in session"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white hover:text-[#1a3673]"
          >
            <X size={14} aria-hidden />
            Remove
          </button>
        </div>
      ) : (
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(26,54,115,0.22)] bg-[#fbfcfe] px-4 py-6 text-center transition-colors hover:border-[#fc7d25] hover:bg-[#fff8f3]">
          <span className="text-sm font-semibold text-[#1a3673]">Choose file</span>
          <span className="mt-1 text-xs text-slate-500">{accept === ".csv" ? "CSV only" : "PDF only"}</span>
          <input type="file" accept={accept} className="sr-only" onChange={onPick} />
        </label>
      )}
    </div>
  );
}

export default function SourcePanel({
  files,
  notice,
  collapsed,
  onToggle,
  onPick,
  onClear,
  onSample,
  mode,
}) {
  if (collapsed) {
    return (
      <section className="rounded-[1.35rem] border border-[rgba(26,54,115,0.12)] bg-white/90 px-4 py-3 shadow-[0_16px_40px_rgba(26,54,115,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1a3673]">
              Sources ready{mode === "sample" ? " · anonymized sample" : ""}
            </p>
            <p className="text-xs text-slate-500">
              {files.transactionsCsv?.fileName || (mode === "sample" ? "Sample CSV" : "No CSV")}
              {files.unifiedSummaryPdf ? ` · ${files.unifiedSummaryPdf.fileName}` : " · PDF optional"}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 rounded-full border border-[rgba(26,54,115,0.14)] px-3 py-1.5 text-xs font-semibold text-[#1a3673]"
          >
            Change sources <ChevronDown size={14} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.35rem] border border-[rgba(26,54,115,0.12)] bg-white/90 p-4 shadow-[0_16px_40px_rgba(26,54,115,0.06)] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#1a3673]">Sources for this session</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            Files stay in this browser tab. They are not saved on the site and are not visible to another visitor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSample}
            className="rounded-full border border-[rgba(26,54,115,0.16)] px-3 py-1.5 text-xs font-semibold text-[#1a3673] hover:border-[#fc7d25] hover:text-[#c55a12]"
          >
            Anonymized sample
          </button>
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-slate-500"
            >
              Collapse <ChevronUp size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p className="mt-4 rounded-xl bg-[#f4f7fb] px-3 py-2 text-sm leading-6 text-[#1a3673]" role="status">
          {notice}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Slot
          title="Amazon transaction CSV"
          hint="Required for analytics. Structure is validated before totals are shown."
          accept=".csv"
          icon={FileSpreadsheet}
          file={files.transactionsCsv}
          onPick={(event) => onPick(event, "transactionsCsv")}
          onClear={() => onClear("transactionsCsv")}
        />
        <Slot
          title="Amazon Unified Summary PDF"
          hint="Optional enrichment for settlement reconciliation. Missing PDF does not block analytics."
          accept=".pdf"
          icon={FileText}
          file={files.unifiedSummaryPdf}
          onPick={(event) => onPick(event, "unifiedSummaryPdf")}
          onClear={() => onClear("unifiedSummaryPdf")}
        />
      </div>
    </section>
  );
}
