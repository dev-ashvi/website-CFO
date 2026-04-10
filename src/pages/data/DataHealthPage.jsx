import { AlertTriangle, ArrowRight, CheckCircle2, Database, Sparkles } from "lucide-react";

const MISSING = [
  {
    id: "m1",
    label: "Bank statements · Apr 1–15",
    detail: "Operating account · HDFC",
    impact: ["Cash flow incomplete", "Runway may be inaccurate"],
  },
  {
    id: "m2",
    label: "Payroll accrual file",
    detail: "Expected weekly upload",
    impact: ["Burn and headcount cost tiles understated", "Forecast bridge out of date"],
  },
];

const ERRORS = [
  {
    id: "e1",
    label: "Duplicate vendor payment",
    detail: "Two rows share txn ID INV-8841",
    impact: ["Vendor spend and AP totals skewed", "Cash forecast may double-count"],
  },
  {
    id: "e2",
    label: "GL mismatch · March close",
    detail: "TB vs. sub-ledger variance ₹2.4L",
    impact: ["Board pack variance narrative unreliable", "Close checklist blocked"],
  },
];

const RECOMMENDATIONS = [
  "Upload missing bank statements before month-end close.",
  "Reconcile Zoho payout batch from Mar 28 with bank feed.",
  "Deduplicate AP export before rolling forecast refresh.",
];

export default function DataHealthPage() {
  const completeness = 78;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-gray-200/80 bg-white/80 px-4 py-4 sm:px-6">
        <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Data Health</h1>
        <p className="mt-0.5 max-w-2xl text-[12px] text-slate-500">
          See what’s complete, what’s missing, and how gaps affect the views you rely on.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-8">
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#1a3673]/10 text-[#1a3673]">
                  <Database className="h-7 w-7" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[13px] font-semibold text-slate-800">Data completeness</h2>
                  <p className="mt-1 text-[12px] text-slate-500">How much of what your workspace needs is present and current.</p>
                  <p className="mt-4 text-4xl font-semibold tabular-nums text-[#1a3673]">{completeness}%</p>
                </div>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#1a3673] to-[#fc7d25] transition-all"
                    style={{ width: `${completeness}%` }}
                  />
                </div>
                <button
                  type="button"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#fc7d25] px-4 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#e86f16] sm:w-auto"
                >
                  Fix now
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" strokeWidth={2} />
              Missing data
            </h2>
            <ul className="mt-4 space-y-3">
              {MISSING.map((m) => (
                <li key={m.id} className="rounded-xl border border-amber-100/80 bg-amber-50/40 px-4 py-3">
                  <p className="text-[13px] font-semibold text-slate-800">{m.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{m.detail}</p>
                  <p className="mt-2 text-[11px] font-medium text-amber-900/70">Impact</p>
                  <ul className="mt-1 list-none space-y-0.5 text-[12px] leading-snug text-slate-600">
                    {m.impact.map((line) => (
                      <li key={line} className="flex gap-2 pl-0.5">
                        <span className="text-amber-700/50" aria-hidden>
                          •
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
              <Sparkles className="h-4 w-4 text-rose-600" strokeWidth={2} />
              Errors and inconsistencies
            </h2>
            <ul className="mt-4 space-y-3">
              {ERRORS.map((e) => (
                <li key={e.id} className="rounded-xl border border-rose-100/80 bg-rose-50/40 px-4 py-3">
                  <p className="text-[13px] font-semibold text-slate-800">{e.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{e.detail}</p>
                  <p className="mt-2 text-[11px] font-medium text-rose-900/70">Impact</p>
                  <ul className="mt-1 list-none space-y-0.5 text-[12px] leading-snug text-slate-600">
                    {e.impact.map((line) => (
                      <li key={line} className="flex gap-2 pl-0.5">
                        <span className="text-rose-700/50" aria-hidden>
                          •
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-[13px] font-semibold text-slate-800">Recommendations</h2>
            <p className="mt-1 text-[12px] text-slate-500">Next steps to improve confidence in your numbers.</p>
            <ul className="mt-4 space-y-3">
              {RECOMMENDATIONS.map((r, i) => (
                <li key={i} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1a3673]" strokeWidth={2} />
                  <span className="text-[13px] leading-snug text-slate-700">{r}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-100 pt-5">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-[#1a3673] px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
              >
                Fix now
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-[#1a3673] hover:bg-slate-50"
              >
                Share with team
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
