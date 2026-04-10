import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardCheck,
  GitBranch,
  Layers,
  ListChecks,
  MessageSquare,
  PenLine,
  Sparkles,
} from "lucide-react";
import PlanningDetailDrawer from "../../components/planning/PlanningDetailDrawer.jsx";
import { MOCK_CFO_PLANS, PLANS_SUMMARY } from "../../planning/mockPlansData.js";
import { usePlanningAI } from "../../planning/PlanningAIContext.jsx";

function planStatusClass(status) {
  if (status === "In review") return "bg-violet-50 text-violet-900 ring-violet-200/80";
  if (status === "Draft") return "bg-slate-100 text-slate-700 ring-slate-200/80";
  return "bg-emerald-50 text-emerald-900 ring-emerald-200/80";
}

export default function PlanningPlansPage() {
  const { openAI } = usePlanningAI();
  const [drawerPlan, setDrawerPlan] = useState(null);
  const [toast, setToast] = useState(null);
  const [statusOverrides, setStatusOverrides] = useState({});

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const plansWithStatus = useMemo(() => {
    return MOCK_CFO_PLANS.map((p) => ({
      ...p,
      displayStatus: statusOverrides[p.id] ?? p.status,
    }));
  }, [statusOverrides]);

  const markInReview = (plan) => {
    if (plan.displayStatus === "In review") {
      showToast("Already in review.");
      return;
    }
    setStatusOverrides((prev) => ({ ...prev, [plan.id]: "In review" }));
    showToast(`“${plan.title}” moved to in review.`);
  };

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
            <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Plans</h1>
            <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-slate-500">
              Action plans derived from your assumptions, scenarios, and financial signals.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => showToast("New plan — connect AI CFO to draft from your latest signals (demo).")}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <PenLine className="h-3.5 w-3.5" strokeWidth={2} />
              New plan
            </button>
            <button
              type="button"
              onClick={() =>
                openAI({
                  type: "plan",
                  data: { isGenerateFlow: true, title: "New plan" },
                })
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[#1a3673] px-3.5 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              Generate with AI
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm sm:px-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Active plans</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-[#1a3673]">{PLANS_SUMMARY.activeCount}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">In review</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-violet-800">{PLANS_SUMMARY.inReviewCount}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Est. runway impact
                </p>
                <p className="mt-1 text-[15px] font-semibold text-emerald-800">{PLANS_SUMMARY.runwayImpactLabel}</p>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-700">Note · </span>
              Plans help convert financial insights into concrete next steps — without replacing your judgment or approvals
              process.
            </p>
          </section>

          <div className="grid gap-5">
            {plansWithStatus.map((p) => (
              <article
                key={p.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-[#1a3673]/15 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[16px] font-semibold text-[#1a3673]">{p.title}</h2>
                    <p className="mt-1 text-[12px] font-medium text-slate-500">Objective</p>
                    <p className="mt-0.5 max-w-3xl text-[13px] leading-relaxed text-slate-700">{p.objective}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${planStatusClass(p.displayStatus)}`}
                  >
                    {p.displayStatus}
                  </span>
                </div>

                <div className="mt-4 rounded-xl border border-emerald-100/90 bg-emerald-50/40 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/80">Expected impact</p>
                  <p className="mt-1 text-[13px] font-semibold text-emerald-950">{p.expectedImpact}</p>
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Actions</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-slate-700">
                    {p.actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ol>
                </div>

                <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Linked assumptions</p>
                    <p className="mt-1 text-[12px] text-slate-700">{p.linkedAssumptions.join(" · ")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Linked scenarios</p>
                    <p className="mt-1 text-[12px] text-slate-700">{p.linkedScenarios.join(" · ")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Linked models</p>
                    <p className="mt-1 text-[12px] text-slate-700">{p.linkedModels.join(" · ")}</p>
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-slate-500">
                  Owner: <span className="font-semibold text-slate-700">{p.owner}</span>
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openAI({ type: "plan", data: p })}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a3673] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#142a5c]"
                  >
                    <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                    Open in chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerPlan(p)}
                    className="rounded-lg border border-[#1a3673]/20 bg-[#1a3673]/[0.06] px-3 py-1.5 text-[11px] font-semibold text-[#1a3673] transition hover:bg-[#1a3673]/[0.1]"
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    onClick={() => markInReview(p)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Mark in review
                  </button>
                </div>
              </article>
            ))}
          </div>

          <section className="flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-slate-200/90 bg-white px-4 py-4 text-[12px] text-slate-600 sm:px-6">
            <Link
              to="/app/data/planning/scenarios"
              className="inline-flex items-center gap-2 font-semibold text-[#1a3673] underline-offset-2 hover:underline"
            >
              <GitBranch className="h-4 w-4" strokeWidth={2} />
              Scenarios
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              to="/app/data/planning/models"
              className="inline-flex items-center gap-2 font-semibold text-[#1a3673] underline-offset-2 hover:underline"
            >
              <Layers className="h-4 w-4" strokeWidth={2} />
              Models
            </Link>
            <span className="text-slate-300">·</span>
            <Link
              to="/app/data/planning/assumptions"
              className="inline-flex items-center gap-2 font-semibold text-[#1a3673] underline-offset-2 hover:underline"
            >
              <ListChecks className="h-4 w-4" strokeWidth={2} />
              Assumptions
            </Link>
          </section>
        </div>
      </div>

      <PlanningDetailDrawer
        open={Boolean(drawerPlan)}
        title={drawerPlan?.title ?? ""}
        onClose={() => setDrawerPlan(null)}
      >
        {drawerPlan ? (
          <div className="space-y-5 text-[13px] leading-relaxed text-slate-700">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Objective</p>
              <p className="mt-1">{drawerPlan.objective}</p>
            </div>
            <div className="rounded-xl border border-emerald-100/90 bg-emerald-50/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/80">Expected impact</p>
              <p className="mt-1 font-semibold text-emerald-950">{drawerPlan.expectedImpact}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Linked planning</p>
              <ul className="mt-2 space-y-2 text-[12px]">
                <li>
                  <span className="font-semibold text-slate-600">Assumptions · </span>
                  {drawerPlan.linkedAssumptions.join(", ")}
                </li>
                <li>
                  <span className="font-semibold text-slate-600">Scenarios · </span>
                  {drawerPlan.linkedScenarios.join(", ")}
                </li>
                <li>
                  <span className="font-semibold text-slate-600">Models · </span>
                  {drawerPlan.linkedModels.join(", ")}
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Action list</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                {drawerPlan.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ol>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${planStatusClass(statusOverrides[drawerPlan.id] ?? drawerPlan.status)}`}
              >
                {statusOverrides[drawerPlan.id] ?? drawerPlan.status}
              </span>
              <span className="text-[12px] text-slate-500">
                Owner: <span className="font-semibold text-slate-700">{drawerPlan.owner}</span>
              </span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Notes / rationale</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-700">{drawerPlan.notes}</p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const d = drawerPlan;
                  const merged = {
                    ...d,
                    displayStatus: statusOverrides[d.id] ?? d.status,
                  };
                  setDrawerPlan(null);
                  openAI({ type: "plan", data: merged });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a3673] px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-[#142a5c]"
              >
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                Open in chat
              </button>
              <button
                type="button"
                onClick={() => {
                  markInReview({ ...drawerPlan, displayStatus: statusOverrides[drawerPlan.id] ?? drawerPlan.status });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2} />
                Mark in review
              </button>
            </div>
          </div>
        ) : null}
      </PlanningDetailDrawer>
    </div>
  );
}
