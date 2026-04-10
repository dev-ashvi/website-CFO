import { CheckCircle2, Clock, RefreshCw, Shield, Sparkles } from "lucide-react";
import { seedDefaultDetectedMetricsForWorkspace } from "../../planning/workspaceGuide/workspaceDataBridge.js";

const CONNECTED = [
  {
    id: "c1",
    name: "HDFC Bank · Operating",
    lastSync: "Apr 5, 2026 · 17:45",
    status: "ok",
    powers: ["Cash flow", "Runway", "Collections analysis"],
  },
  {
    id: "c2",
    name: "Zoho Books · Production",
    lastSync: "Apr 5, 2026 · 12:10",
    status: "warning",
    powers: ["Revenue and margin views", "AR aging", "Month-end close checklist"],
  },
];

const AVAILABLE = [
  { name: "Tally", desc: "Ledger, vouchers, and masters" },
  { name: "Zoho", desc: "Books, invoices, and contacts" },
  { name: "QuickBooks", desc: "P&L, balance sheet, classes" },
  { name: "Bank feeds", desc: "Statements and transaction sync" },
  { name: "Google Sheets", desc: "Models and manual MIS bridges" },
];

function syncStatus(s) {
  if (s === "ok") return { label: "Synced", className: "bg-emerald-50 text-emerald-800 ring-emerald-200/70" };
  return { label: "Needs attention", className: "bg-amber-50 text-amber-900 ring-amber-200/70" };
}

export default function DataConnectPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-gray-200/80 bg-white/80 px-4 py-4 sm:px-6">
        <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Connect</h1>
        <p className="mt-0.5 max-w-2xl text-[12px] text-slate-500">
          Wire your books, banks, and spreadsheets into one financial graph. Wyz AI CFO reasons on what you connect—not
          what you upload alone.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-10">
          <section>
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-[13px] font-semibold text-slate-800">Connected sources</h2>
            </div>
            <div className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {CONNECTED.map((c) => {
                const st = syncStatus(c.status);
                return (
                  <div key={c.id} className="flex flex-col gap-2 px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[14px] font-semibold text-[#1a3673]">{c.name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                        <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                        Last sync · {c.lastSync}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${st.className}`}>
                        {st.label}
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:bg-slate-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                        Reconnect
                      </button>
                    </div>
                    </div>
                    <div className="text-[12px] leading-relaxed text-slate-600">
                      <p className="text-[11px] font-medium text-slate-500">Powers</p>
                      <ul className="mt-1 list-none space-y-0.5">
                        {c.powers.map((p) => (
                          <li key={p} className="flex gap-2 pl-0.5">
                            <span className="text-slate-400" aria-hidden>
                              •
                            </span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-[13px] font-semibold text-slate-800">Available integrations</h2>
            <p className="mt-1 text-[12px] text-slate-500">Connect in minutes. We normalize schemas so your CFO view stays consistent.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {AVAILABLE.map((a) => (
                <li key={a.name} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-slate-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold text-[#1a3673]">{a.name}</p>
                    <button
                      type="button"
                      onClick={() => seedDefaultDetectedMetricsForWorkspace()}
                      className="shrink-0 rounded-lg bg-[#1a3673] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#142a5c]"
                    >
                      Connect
                    </button>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{a.desc}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/60 px-5 py-6">
            <h2 className="text-[13px] font-semibold text-slate-800">Custom integration</h2>
            <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-slate-600">
              Need a proprietary ERP, data warehouse, or internal API? We’ll design a secure pipeline with your team.
            </p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#1a3673]/25 bg-white px-4 py-2.5 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:bg-[#1a3673]/5"
            >
              Integrate new source
            </button>
            <p className="mt-3 text-[11px] font-medium text-slate-500">Developer CFO support needed</p>
          </section>

          <section className="rounded-2xl border border-[#1a3673]/15 bg-gradient-to-br from-[#1a3673]/[0.06] to-white px-5 py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1a3673] text-white">
                  <Shield className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#1a3673]">What data powers your AI CFO?</h2>
                  <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-slate-600">
                    Only the sources you explicitly connect and files you place in this workspace. We do not train public models on your
                    numbers. Row-level access follows your integration permissions; summaries shown in chat cite the underlying documents
                    and ledgers you’ve linked.
                  </p>
                  <ul className="mt-4 space-y-2 text-[12px] text-slate-700">
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
                      Encrypted in transit and at rest
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
                      You control disconnect and retention
                    </li>
                    <li className="flex gap-2">
                      <Sparkles className="h-4 w-4 shrink-0 text-[#fc7d25]" strokeWidth={2} />
                      AI answers are traceable to connected data
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
