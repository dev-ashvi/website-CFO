import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import {
  formatLibraryDate,
  formatLibraryStatus,
  isLibraryItemSelectable,
  libraryDisplayTitle,
  normalizeDatasetLibrary,
} from "../../lib/revenue-margin/datasetLibrary.js";

/**
 * Compact previous-analyses switcher.
 * Active workspace remains URL/activeDatasetId — this list is discovery only.
 */
export default function DatasetLibrarySwitcher({
  activeDatasetId,
  activeDatasetName,
  listDatasets,
  onSelectDataset,
  onNewAnalysis,
}) {
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const rootRef = useRef(null);
  const loadGenRef = useRef(0);

  async function loadLibrary() {
    const gen = ++loadGenRef.current;
    setStatus("loading");
    setError(null);
    try {
      const payload = await listDatasets({ workspace_id: "local" });
      if (gen !== loadGenRef.current) return;
      const normalized = normalizeDatasetLibrary(payload);
      setLibrary(normalized.datasets);
      setStatus("ready");
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      setLibrary([]);
      setError(err?.message || "Previous analyses couldn't be loaded.");
      setStatus("error");
    }
  }

  useEffect(() => {
    void loadLibrary();
    return () => {
      loadGenRef.current += 1;
    };
  }, [activeDatasetId]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    library.find((item) => item.dataset_id === activeDatasetId) ||
    (activeDatasetId
      ? {
          dataset_id: activeDatasetId,
          name: activeDatasetName || "Current analysis",
          status: "COMPLETED",
        }
      : null);

  const triggerLabel = current ? libraryDisplayTitle(current) : "Previous analyses";

  return (
    <div ref={rootRef} className="relative min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Analysis</p>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (status === "error") void loadLibrary();
        }}
        className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[rgba(26,54,115,0.14)] bg-white px-2.5 py-1.5 text-left text-[12px] font-semibold text-[#1a3673] hover:bg-[#f8fafc]"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-1 w-[min(100vw-2rem,20rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Previous analyses</p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {status === "loading" && (
              <p className="flex items-center gap-2 px-3 py-3 text-[12px] text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </p>
            )}
            {status === "error" && (
              <div className="space-y-2 px-3 py-3 text-[12px] text-rose-700">
                <p>Previous analyses couldn&apos;t be loaded.</p>
                <button
                  type="button"
                  className="font-semibold text-[#1a3673] underline-offset-2 hover:underline"
                  onClick={() => void loadLibrary()}
                >
                  Retry
                </button>
              </div>
            )}
            {status === "ready" && library.length === 0 && (
              <p className="px-3 py-3 text-[12px] text-slate-500">No saved analyses yet.</p>
            )}
            {status === "ready" &&
              library.map((item) => {
                const isCurrent = item.dataset_id === activeDatasetId;
                const selectable = isLibraryItemSelectable(item);
                const when = formatLibraryDate(item.created_at);
                return (
                  <button
                    key={item.dataset_id}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    disabled={!selectable && !isCurrent}
                    onClick={() => {
                      if (isCurrent) {
                        setOpen(false);
                        return;
                      }
                      if (!selectable) return;
                      setOpen(false);
                      onSelectDataset?.(item.dataset_id);
                    }}
                    className={`flex w-full flex-col gap-0.5 border-b border-gray-50 px-3 py-2.5 text-left last:border-b-0 ${
                      selectable || isCurrent ? "hover:bg-[#f8fafc]" : "cursor-not-allowed opacity-60"
                    } ${isCurrent ? "bg-[#1a3673]/5" : ""}`}
                  >
                    <span className="truncate text-[12px] font-semibold text-[#1a3673]">
                      {libraryDisplayTitle(item)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatLibraryStatus(item.status)}
                      {when ? ` · ${when}` : ""}
                      {isCurrent ? " · Current" : ""}
                    </span>
                  </button>
                );
              })}
          </div>

          <div className="border-t border-gray-100 p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNewAnalysis?.();
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-semibold text-[#1a3673] hover:bg-[#f8fafc]"
            >
              <Plus className="h-3.5 w-3.5" />
              New analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
