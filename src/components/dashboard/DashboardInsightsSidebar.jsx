import { ChevronRight, PanelRight } from "lucide-react";
import CFOExplanationPanel from "../scenario/CFOExplanationPanel.jsx";

/**
 * @typedef {{
 *   breakdown: { label: string, from: string, to: string }[],
 *   impacts: string[],
 *   outputsAffected: string[],
 *   explanation?: object | null,
 * }} PreviewSidebarContext
 */

const SIGNALS = [
  "Burn is rising faster than revenue",
  "Collections cycle is increasing",
  "Runway fell from 9.1 to 8.4 months",
];

const ASSUMPTIONS = ["Revenue growth 8%", "Hiring +3 roles", "₹/USD 83.2"];

const OBLIGATIONS = [
  { label: "Payroll", when: "Apr 7" },
  { label: "GST filing", when: "Apr 12" },
  { label: "Term loan EMI", when: "Apr 15" },
];

export default function DashboardInsightsSidebar({ collapsed, onToggleCollapse, previewContext }) {
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col">
      <div
        className={`min-h-0 flex-col items-center gap-3 py-2 ${collapsed ? "flex flex-1" : "hidden"}`}
        aria-hidden={!collapsed}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand insights"
          aria-label="Expand insights panel"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-[#1a3673]"
        >
          <ChevronRight
            className="h-4 w-4 rotate-180 transition-transform duration-300 ease-in-out"
            strokeWidth={2}
          />
        </button>
        <PanelRight className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      </div>

      <div
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl border border-gray-100/90 bg-white px-4 py-5 shadow-sm ${
          collapsed ? "hidden" : "flex"
        }`}
        aria-hidden={collapsed}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">AI context</p>
            <h2 className="mt-0.5 text-[14px] font-semibold text-[#1a3673]">
              {previewContext ? "Preview scenario context" : "Signals & snapshot"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse panel"
            aria-label="Collapse insights panel"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-[#1a3673]"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-300" strokeWidth={2} />
          </button>
        </div>

        {previewContext?.explanation ? (
          <>
            <CFOExplanationPanel explanation={previewContext.explanation} className="shrink-0" />
            <div className="my-4 h-px bg-gray-100" aria-hidden />
          </>
        ) : null}

        {previewContext ? (
          <section className="shrink-0 rounded-xl border border-[#1a3673]/15 bg-[#1a3673]/[0.04] px-3 py-3">
            {previewContext.breakdown?.length ? (
              <>
                <h3 className="text-[11px] font-semibold text-[#1a3673]">Changed assumptions</h3>
                <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-slate-700">
                  {previewContext.breakdown.map((row) => (
                    <li key={row.label} className="tabular-nums">
                      <span className="font-medium text-slate-800">{row.label}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="text-slate-500">{row.from}</span>
                      <span className="text-slate-300"> → </span>
                      <span className="font-semibold text-[#1a3673]">{row.to}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {previewContext.impacts?.length ? (
              <>
                <h3 className={`text-[11px] font-semibold text-[#1a3673] ${previewContext.breakdown?.length ? "mt-3" : ""}`}>
                  Impact (model)
                </h3>
                <ul className="mt-1.5 space-y-1 text-[11px] text-slate-700">
                  {previewContext.impacts.map((line) => (
                    <li key={line} className="flex gap-1.5">
                      <span className="text-[#fc7d25]">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {previewContext.outputsAffected?.length ? (
              <>
                <h3 className="mt-3 text-[11px] font-semibold text-slate-700">Outputs touched</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {previewContext.outputsAffected.map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200/80"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
            <p className="mt-3 text-[10px] leading-snug text-slate-500">
              Interpretation is directional — baseline workspace and books are unchanged.
            </p>
          </section>
        ) : null}

        {previewContext ? <div className="my-4 h-px bg-gray-100" aria-hidden /> : null}

        <section className="shrink-0">
          <h3 className="text-[12px] font-semibold text-slate-700">{previewContext ? "Baseline signals" : "Signals"}</h3>
          <ul className="mt-3 space-y-2">
            {SIGNALS.map((s) => (
              <li
                key={s}
                className="rounded-lg border-l-2 border-[#fc7d25]/60 bg-[rgba(252,125,37,0.06)] px-3 py-2 text-[12px] font-medium leading-snug text-slate-800"
              >
                {s}
              </li>
            ))}
          </ul>
        </section>

        <div className="my-5 h-px bg-gray-100" aria-hidden />

        <section className="shrink-0">
          <h3 className="text-[12px] font-semibold text-slate-700">Assumptions snapshot</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {ASSUMPTIONS.map((a) => (
              <span
                key={a}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200/70"
              >
                {a}
              </span>
            ))}
          </div>
        </section>

        <div className="my-5 h-px bg-gray-100" aria-hidden />

        <section className="shrink-0">
          <h3 className="text-[12px] font-semibold text-slate-700">Upcoming obligations</h3>
          <ul className="mt-3 space-y-2">
            {OBLIGATIONS.map((o) => (
              <li
                key={o.label}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50/90 px-3 py-2 text-[12px]"
              >
                <span className="font-medium text-slate-800">{o.label}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{o.when}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
