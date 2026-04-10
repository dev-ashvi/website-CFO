import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { seedDefaultDetectedMetricsForWorkspace } from "../../planning/workspaceGuide/workspaceDataBridge.js";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  Grid3x3,
  List,
  MoreHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  BarChart3,
} from "lucide-react";

const MOCK_FILES = [
  {
    id: "f1",
    name: "March_2026_MIS.pdf",
    type: "PDF",
    ext: "pdf",
    size: "2.4 MB",
    updatedAt: "Apr 2, 2026 · 09:14",
    status: "processed",
    aiReady: true,
    confidenceLevel: "High",
    usedIn: [
      { scope: "Dashboard", items: "Revenue, Burn" },
      { scope: "Report", items: "Board Pack (March)" },
      { scope: "Model", items: "Cash Flow Forecast" },
    ],
  },
  {
    id: "f2",
    name: "bank_feed_apr1-5.csv",
    type: "CSV",
    ext: "csv",
    size: "890 KB",
    updatedAt: "Apr 5, 2026 · 18:02",
    status: "processing",
    aiReady: false,
    confidenceLevel: "In review",
    usedIn: [
      { scope: "Dashboard", items: "Cash position, Liquidity" },
      { scope: "Model", items: "Runway, Weekly burn" },
    ],
  },
  {
    id: "f3",
    name: "FY26_forecast_model.xlsx",
    type: "Excel",
    ext: "xlsx",
    size: "1.1 MB",
    updatedAt: "Mar 30, 2026 · 11:40",
    status: "processed",
    aiReady: true,
    confidenceLevel: "High",
    usedIn: [
      { scope: "Model", items: "12-month runway" },
      { scope: "Report", items: "Investor snapshot" },
      { scope: "Dashboard", items: "Forecast vs. actual" },
    ],
  },
  {
    id: "f4",
    name: "payroll_export_mar.json",
    type: "JSON",
    ext: "json",
    size: "412 KB",
    updatedAt: "Mar 29, 2026 · 07:55",
    status: "failed",
    aiReady: false,
    confidenceLevel: "Limited",
    usedIn: [
      { scope: "Dashboard", items: "Burn, Headcount cost" },
      { scope: "Report", items: "Payroll bridge (stale)" },
    ],
  },
  {
    id: "f5",
    name: "Vendor_invoices_Q1.xlsx",
    type: "Excel",
    ext: "xlsx",
    size: "3.2 MB",
    updatedAt: "Mar 28, 2026 · 16:20",
    status: "processed",
    aiReady: true,
    confidenceLevel: "High",
    usedIn: [
      { scope: "Report", items: "AP aging" },
      { scope: "Dashboard", items: "Vendor spend, Opex" },
    ],
  },
];

const BREADCRUMBS = ["All files", "Finance", "March 2026"];

function FileTypeIcon({ ext }) {
  if (ext === "pdf") return <FileText className="h-5 w-5 text-rose-600" strokeWidth={2} />;
  if (ext === "csv" || ext === "xlsx") return <FileSpreadsheet className="h-5 w-5 text-emerald-600" strokeWidth={2} />;
  if (ext === "json") return <FileJson className="h-5 w-5 text-violet-600" strokeWidth={2} />;
  return <FileText className="h-5 w-5 text-slate-500" strokeWidth={2} />;
}

function statusBadge(status) {
  const map = {
    processed: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
    processing: "bg-amber-50 text-amber-900 ring-amber-200/70",
    failed: "bg-rose-50 text-rose-800 ring-rose-200/70",
  };
  return map[status] || map.processed;
}

const SCOPE_LABELS = { Dashboard: "Dashboards", Report: "Reports", Model: "Models" };
const SCOPE_ORDER = ["Dashboard", "Report", "Model"];

function usedInTooltip(usedIn) {
  if (!usedIn?.length) return "";
  return usedIn.map((u) => `${SCOPE_LABELS[u.scope] ?? u.scope}: ${u.items}`).join("\n");
}

function groupUsedInByScope(usedIn) {
  const map = new Map();
  for (const u of usedIn || []) {
    const prev = map.get(u.scope) || [];
    prev.push(u.items);
    map.set(u.scope, prev);
  }
  return SCOPE_ORDER.filter((s) => map.has(s)).map((s) => ({
    scope: s,
    label: SCOPE_LABELS[s] || s,
    text: map.get(s).join("; "),
  }));
}

function BusinessImpactBlock({ usedIn, dense }) {
  const groups = groupUsedInByScope(usedIn);
  if (!groups.length) {
    return <p className={`text-[12px] text-slate-400 ${dense ? "" : "mt-2"}`}>Not tied to live views yet.</p>;
  }
  return (
    <div className={`${dense ? "mt-0 space-y-2" : "mt-3 space-y-3"} text-[12px] leading-snug text-slate-700`}>
      {groups.map((g) => (
        <div key={g.scope}>
          <p className="text-[11px] font-medium text-slate-500">{g.label}</p>
          <p className="mt-0.5 text-slate-800">{g.text}</p>
        </div>
      ))}
    </div>
  );
}

function usedInPlacesCount(usedIn) {
  return usedIn?.length ?? 0;
}

function statusLabel(status) {
  if (status === "processed") return "Ready";
  if (status === "processing") return "In progress";
  if (status === "failed") return "Needs review";
  return status;
}

export default function DataFilesPage() {
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(MOCK_FILES[0]?.id ?? null);
  const [expandedFileId, setExpandedFileId] = useState(null);
  const selected = useMemo(() => MOCK_FILES.find((f) => f.id === selectedId) ?? null, [selectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200/80 bg-white/80 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Files</h1>
              <p className="mt-0.5 text-[12px] text-slate-500">The documents behind your CFO views and answers.</p>
              <nav className="mt-3 flex flex-wrap items-center gap-1 text-[12px] text-slate-500" aria-label="Breadcrumb">
                {BREADCRUMBS.map((crumb, i) => (
                  <span key={crumb} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                    <button
                      type="button"
                      className={`rounded-md px-1 py-0.5 font-medium transition hover:bg-slate-100 hover:text-[#1a3673] ${
                        i === BREADCRUMBS.length - 1 ? "text-[#1a3673]" : ""
                      }`}
                    >
                      {i === 0 && <Folder className="mr-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2} />}
                      {crumb}
                    </button>
                  </span>
                ))}
              </nav>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => seedDefaultDetectedMetricsForWorkspace()}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" strokeWidth={2} />
                Upload
              </button>
              <div className="flex rounded-xl border border-gray-200 bg-slate-100/80 p-0.5">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`rounded-lg p-2 transition ${view === "list" ? "bg-white text-[#1a3673] shadow-sm" : "text-slate-500"}`}
                  aria-label="List view"
                >
                  <List className="h-4 w-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setView("grid")}
                  className={`rounded-lg p-2 transition ${view === "grid" ? "bg-white text-[#1a3673] shadow-sm" : "text-slate-500"}`}
                  aria-label="Grid view"
                >
                  <Grid3x3 className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {view === "list" ? (
            <div className="overflow-hidden rounded-xl border border-gray-100/90 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-[12px] sm:min-w-0">
                <thead>
                  <tr className="border-b border-gray-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Name</th>
                    <th className="hidden px-3 py-3 sm:table-cell">Type</th>
                    <th className="hidden px-3 py-3 md:table-cell">Updated</th>
                    <th className="hidden px-3 py-3 lg:table-cell">Size</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">AI</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MOCK_FILES.map((f) => {
                    const nPlaces = usedInPlacesCount(f.usedIn);
                    const isOpen = expandedFileId === f.id;
                    return (
                      <Fragment key={f.id}>
                    <tr
                      onClick={() => setSelectedId(f.id)}
                      className={`cursor-pointer transition hover:bg-slate-50/80 ${
                        selectedId === f.id ? "bg-[rgba(26,54,115,0.04)]" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <FileTypeIcon ext={f.ext} />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-slate-800">{f.name}</span>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedFileId((id) => (id === f.id ? null : f.id));
                                }}
                                className="inline-flex items-center gap-0.5 rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#1a3673]"
                                aria-expanded={isOpen}
                                aria-label={isOpen ? "Hide where this file is used" : "Show where this file is used"}
                              >
                                <ChevronDown
                                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                  strokeWidth={2}
                                />
                              </button>
                              <span
                                className="text-[11px] text-slate-500 cursor-help"
                                title={nPlaces ? usedInTooltip(f.usedIn) : undefined}
                              >
                                {nPlaces ? `Used in ${nPlaces} ${nPlaces === 1 ? "place" : "places"}` : "Not in use yet"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">{f.type}</td>
                      <td className="hidden px-3 py-3 text-slate-500 md:table-cell">{f.updatedAt}</td>
                      <td className="hidden px-3 py-3 tabular-nums text-slate-600 lg:table-cell">{f.size}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide ring-1 ${statusBadge(f.status)}`}
                        >
                          {statusLabel(f.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {f.aiReady ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                            Ready
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#1a3673]"
                          aria-label="More actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={7} className="px-4 py-3 pl-12">
                          <p className="text-[11px] font-medium text-slate-500">Where this file shows up</p>
                          <BusinessImpactBlock usedIn={f.usedIn} dense />
                        </td>
                      </tr>
                    )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {MOCK_FILES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md ${
                    selectedId === f.id ? "border-[#1a3673]/40 ring-2 ring-[#1a3673]/15" : "border-gray-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <FileTypeIcon ext={f.ext} />
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusBadge(f.status)}`}>
                      {statusLabel(f.status)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-[13px] font-semibold text-slate-800">{f.name}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {f.type} · {f.size}
                  </p>
                  <p className="mt-2 text-[10px] text-slate-400">{f.updatedAt}</p>
                  <p
                    className="mt-1 text-[11px] text-slate-500 cursor-help"
                    title={usedInPlacesCount(f.usedIn) ? usedInTooltip(f.usedIn) : undefined}
                  >
                    {usedInPlacesCount(f.usedIn)
                      ? `Used in ${usedInPlacesCount(f.usedIn)} ${usedInPlacesCount(f.usedIn) === 1 ? "place" : "places"}`
                      : "Not in use yet"}
                  </p>
                  {f.aiReady && (
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                      AI ready
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:hidden">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Selected file</p>
              <p className="mt-1 text-[13px] font-semibold text-[#1a3673]">{selected.name}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/app/chat"
                  className="inline-flex flex-1 min-w-[140px] items-center justify-center gap-1 rounded-xl bg-[#fc7d25] px-3 py-2 text-[11px] font-semibold text-white"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  Ask AI
                </Link>
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-semibold text-[#1a3673]"
                >
                  Summary
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-semibold text-[#1a3673]"
                >
                  Metrics
                </button>
              </div>
              <p
                className="mt-3 text-[11px] text-slate-500 cursor-help"
                title={usedInPlacesCount(selected.usedIn) ? usedInTooltip(selected.usedIn) : undefined}
              >
                {usedInPlacesCount(selected.usedIn)
                  ? `Used in ${usedInPlacesCount(selected.usedIn)} ${usedInPlacesCount(selected.usedIn) === 1 ? "place" : "places"}`
                  : "Not in use yet"}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-200/80 pt-4">
            <span className="text-[11px] font-medium text-slate-400">Bulk:</span>
            <button type="button" className="text-[11px] font-semibold text-slate-600 hover:text-[#1a3673]">
              Delete
            </button>
            <button type="button" className="text-[11px] font-semibold text-slate-600 hover:text-[#1a3673]">
              Move
            </button>
            <button type="button" className="text-[11px] font-semibold text-slate-600 hover:text-[#1a3673]">
              Rename
            </button>
            <button type="button" className="text-[11px] font-semibold text-slate-600 hover:text-[#1a3673]">
              Download
            </button>
          </div>
        </div>
      </div>

      {selected && (
        <aside className="hidden w-full max-w-md shrink-0 border-l border-gray-200/80 bg-white lg:flex lg:flex-col lg:overflow-hidden">
          <div className="shrink-0 border-b border-gray-100 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">File</p>
            <h2 className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-[#1a3673]">{selected.name}</h2>

            <div className="mt-4 space-y-2">
              <Link
                to="/app/chat"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#fc7d25] px-3 py-2.5 text-center text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#e86f16]"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                Ask AI about this file
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-2 text-[11px] font-semibold text-[#1a3673] hover:bg-slate-50"
                >
                  <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
                  Summary
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-2 text-[11px] font-semibold text-[#1a3673] hover:bg-slate-50"
                >
                  <BarChart3 className="h-3.5 w-3.5" strokeWidth={2} />
                  Extract metrics
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Business impact</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">Dashboards, reports, and models this file supports.</p>
              <BusinessImpactBlock usedIn={selected.usedIn} />
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Confidence</h3>
              <dl className="mt-2 space-y-2 border-t border-gray-50 pt-2 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">AI ready</dt>
                  <dd className="font-medium text-slate-800">{selected.aiReady ? "Yes" : "Not yet"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Confidence level</dt>
                  <dd className="font-medium text-slate-800">{selected.confidenceLevel}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Details</h3>
              <dl className="mt-2 space-y-2 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Type</dt>
                  <dd className="font-medium text-slate-800">{selected.type}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Last updated</dt>
                  <dd className="text-right text-slate-800">{selected.updatedAt}</dd>
                </div>
              </dl>
            </section>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-4 text-[11px]">
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold text-[#1a3673] hover:underline"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Download
              </button>
              <button type="button" className="font-semibold text-rose-600 hover:underline">
                <span className="inline-flex items-center gap-1">
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  Remove file
                </span>
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
