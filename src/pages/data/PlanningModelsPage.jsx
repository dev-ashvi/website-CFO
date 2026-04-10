import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, LayoutDashboard, MessageSquare, RefreshCw, Sparkles } from "lucide-react";
import PlanningDetailDrawer from "../../components/planning/PlanningDetailDrawer.jsx";
import {
  MOCK_FINANCIAL_MODELS,
  MODELS_SUMMARY,
  PLANNING_MODELS_AI_OVERVIEW,
} from "../../planning/mockModelsData.js";
import { usePlanningAI } from "../../planning/PlanningAIContext.jsx";
import { formatPlanningRelative } from "../../planning/formatPlanningRelative.js";

function statusPill(tone) {
  if (tone === "emerald") {
    return "bg-emerald-50 text-emerald-900 ring-emerald-200/80";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200/80";
}

function BulletList({ items, iconClass }) {
  return (
    <ul className="mt-1.5 space-y-1">
      {items.map((x) => (
        <li key={x} className="flex gap-2 text-[12px] leading-snug text-slate-700">
          <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${iconClass}`} aria-hidden />
          {x}
        </li>
      ))}
    </ul>
  );
}

export default function PlanningModelsPage() {
  const { openAI } = usePlanningAI();
  const [drawerModel, setDrawerModel] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[80] w-[min(calc(100%-2rem),24rem)] -translate-x-1/2 px-4">
          <div className="pointer-events-auto flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#1a3673]" strokeWidth={2} />
            <p className="text-[13px] font-medium text-slate-800">{toast}</p>
          </div>
        </div>
      )}

      <header className="shrink-0 border-b border-gray-200/80 bg-white/80 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Models</h1>
            <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-slate-500">
              Financial logic powering your forecasts, dashboards, and reports.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => showToast("Models refreshed — demo preview.")}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              Refresh models
            </button>
            <button
              type="button"
              onClick={() => openAI({ type: "model", data: PLANNING_MODELS_AI_OVERVIEW })}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1a3673] px-3.5 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
            >
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
              Discuss with AI
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm sm:px-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Active models</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[#1a3673]">{MODELS_SUMMARY.activeCount}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last refreshed</p>
                <p className="mt-1 text-[15px] font-semibold text-slate-800">
                  {MODELS_SUMMARY.lastGlobalRefreshMins} mins ago
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Outputs powered</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[#1a3673]">
                  {MODELS_SUMMARY.outputsPowered}
                </p>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-700">Trust · </span>
              These models convert your assumptions and business data into planning outputs you already use in dashboards
              and reports.
            </p>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            {MOCK_FINANCIAL_MODELS.map((m) => (
              <article
                key={m.id}
                className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-[#1a3673]/15 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-[16px] font-semibold text-[#1a3673]">{m.name}</h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusPill(m.statusTone)}`}
                  >
                    {m.status}
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{m.description}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Inputs</p>
                    <BulletList items={m.inputs} iconClass="bg-slate-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Assumptions</p>
                    <BulletList items={m.assumptions} iconClass="bg-[#1a3673]/50" />
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Outputs</p>
                  <BulletList items={m.outputs} iconClass="bg-[#fc7d25]/70" />
                </div>

                <p className="mt-3 text-[11px] text-slate-500">
                  Refreshed <span className="font-medium text-slate-700">{formatPlanningRelative(m.lastRefreshedAt)}</span>
                </p>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setDrawerModel(m)}
                    className="rounded-lg border border-[#1a3673]/20 bg-[#1a3673]/[0.06] px-3 py-1.5 text-[11px] font-semibold text-[#1a3673] transition hover:bg-[#1a3673]/[0.1]"
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    onClick={() => openAI({ type: "model", data: m })}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Discuss with AI
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast(`${m.name} refresh queued (demo).`)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerModel(m)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    View affected outputs
                    <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              </article>
            ))}
          </div>

          <section className="rounded-2xl border border-dashed border-slate-200/90 bg-white/60 px-4 py-4 text-center sm:px-6">
            <p className="text-[12px] text-slate-600">
              Need the full picture?{" "}
              <Link to="/app/dashboard" className="font-semibold text-[#1a3673] underline-offset-2 hover:underline">
                Open dashboard
              </Link>{" "}
              or{" "}
              <Link
                to="/app/data/planning/assumptions"
                className="font-semibold text-[#1a3673] underline-offset-2 hover:underline"
              >
                review assumptions
              </Link>
              .
            </p>
          </section>
        </div>
      </div>

      <PlanningDetailDrawer
        open={Boolean(drawerModel)}
        title={drawerModel?.name ?? ""}
        onClose={() => setDrawerModel(null)}
      >
        {drawerModel ? (
          <div className="space-y-5 text-[13px] leading-relaxed text-slate-700">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Purpose</p>
              <p className="mt-1">{drawerModel.description}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Inputs</p>
              <BulletList items={drawerModel.inputs} iconClass="bg-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Assumptions</p>
              <BulletList items={drawerModel.assumptions} iconClass="bg-[#1a3673]/50" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Outputs</p>
              <BulletList items={drawerModel.outputs} iconClass="bg-[#fc7d25]/70" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusPill(drawerModel.statusTone)}`}>
                {drawerModel.status}
              </span>
              <span className="text-[12px] text-slate-500">
                Refreshed {formatPlanningRelative(drawerModel.lastRefreshedAt)}
              </span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-[12px] text-slate-600">
              <span className="font-semibold text-slate-700">Trust · </span>
              {drawerModel.trustNote}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Used in</p>
              <ul className="mt-2 space-y-1.5">
                {drawerModel.usedIn.map((u) => (
                  <li key={u} className="flex items-center gap-2 text-[12px] text-slate-800">
                    <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-[#1a3673]/70" strokeWidth={2} />
                    {u}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const d = drawerModel;
                  setDrawerModel(null);
                  openAI({ type: "model", data: d });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a3673] px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-[#142a5c]"
              >
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                Discuss with AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerModel(null);
                  showToast("Refresh scheduled (demo).");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                Refresh
              </button>
            </div>
          </div>
        ) : null}
      </PlanningDetailDrawer>
    </div>
  );
}
