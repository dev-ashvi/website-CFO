import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  LayoutDashboard,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import PlanningDetailDrawer from "../../components/planning/PlanningDetailDrawer.jsx";
import { usePlanningAI } from "../../planning/PlanningAIContext.jsx";
import {
  AI_OBSERVATIONS,
  INSIGHTS_DEMO_EMPTY_STATE,
  INSIGHTS_PAGE_AI_OVERVIEW,
  INSIGHTS_SUMMARY,
  INSIGHTS_TRUST_NOTE,
  KEY_SIGNALS,
  OPPORTUNITY_ITEMS,
  RISK_ITEMS,
  RISK_OPPORTUNITY_NET_OUTLOOK,
  RISK_OPPORTUNITY_SUBTITLE,
  SCENARIO_DECISION_STRIP,
  SCENARIO_INSIGHTS,
  SCENARIO_INSIGHTS_SUBTITLE,
  SUGGESTED_ACTIONS,
  TOP_PRIORITY_ITEMS,
} from "../../planning/mockInsightsData.js";

function severityPill(severity) {
  if (severity === "High") return "bg-rose-50 text-rose-900 ring-rose-200/80";
  if (severity === "Medium") return "bg-amber-50 text-amber-900 ring-amber-200/80";
  return "bg-slate-100 text-slate-700 ring-slate-200/80";
}

function confidencePill(level) {
  if (level === "High") return "bg-[#1a3673]/10 text-[#1a3673] ring-[#1a3673]/20";
  return "bg-slate-100 text-slate-600 ring-slate-200/80";
}

function LinkedRow({ label, items, className = "" }) {
  if (!items?.length) return null;
  return (
    <p className={`text-[12px] leading-relaxed text-slate-700 ${className}`}>
      <span className="font-semibold text-slate-500">{label} · </span>
      {items.join(", ")}
    </p>
  );
}

function insightAIPayloadFromSignal(s) {
  return {
    title: s.title,
    description: s.explanation,
    whyItMatters: s.whyItMatters,
    linkedAssumptions: s.linkedAssumptions,
    linkedScenarios: s.linkedScenarios,
    linkedModels: s.linkedModels,
    suggestedNextStep: s.suggestedNextStep,
  };
}

function insightAIPayloadFromPriority(p) {
  return {
    title: p.title,
    description: p.narrative.replace(/\n\n/g, " "),
    whyItMatters: p.whyItMatters,
    linkedAssumptions: p.linkedAssumptions,
    linkedScenarios: p.linkedScenarios,
    linkedModels: p.linkedModels,
    suggestedNextStep: p.suggestedNextStep,
  };
}

function insightAIPayloadFromObservation(o) {
  return {
    title: o.headline,
    description: o.body,
    whyItMatters: o.whyItMatters,
    linkedAssumptions: o.linkedAssumptions,
    linkedScenarios: o.linkedScenarios,
    linkedModels: o.linkedModels,
    suggestedNextStep: o.suggestedNextStep,
  };
}

function insightAIPayloadFromRiskOpportunity(x) {
  return {
    title: x.title,
    description: x.description,
    whyItMatters: x.whyItMatters,
    linkedAssumptions: x.linkedAssumptions,
    linkedScenarios: x.linkedScenarios,
    linkedModels: x.linkedModels,
    suggestedNextStep: x.suggestedNextStep,
  };
}

function insightAIPayloadFromScenario(s) {
  return {
    title: s.keyFinding,
    description: `${s.comparedScenarios}. ${s.explanation}`,
    whyItMatters: s.whyItMatters,
    linkedAssumptions: s.linkedAssumptions,
    linkedScenarios: s.linkedScenarios,
    linkedModels: s.linkedModels,
    suggestedNextStep: s.suggestedNextStep,
  };
}

function insightAIPayloadFromAction(a) {
  return {
    title: a.title,
    description: a.description,
    whyItMatters: `${a.rationale} Expected impact: ${a.expectedImpact}`,
    linkedAssumptions: a.linkedAssumptions,
    linkedScenarios: a.linkedScenarios,
    linkedModels: a.linkedModels,
    suggestedNextStep: a.suggestedNextStep,
  };
}

function observationsFollowUpPayload(obsList) {
  const assumptions = [...new Set(obsList.flatMap((o) => o.linkedAssumptions || []))];
  const scenarios = [...new Set(obsList.flatMap((o) => o.linkedScenarios || []))];
  const models = [...new Set(obsList.flatMap((o) => o.linkedModels || []))];
  return {
    title: "AI CFO perspective",
    description: obsList.map((o) => `${o.headline} — ${o.body}`).join("\n\n"),
    whyItMatters:
      "These are the themes that should frame your next leadership conversation — ask for a deeper read on trade-offs or sequencing.",
    linkedAssumptions: assumptions,
    linkedScenarios: scenarios,
    linkedModels: models,
    suggestedNextStep: "Pick one theme to stress-test in Scenarios, then convert the outcome to a plan.",
  };
}

const SIGNAL_ORDER = { High: 0, Medium: 1, Low: 2 };

export default function PlanningInsightsPage() {
  const { openAI } = usePlanningAI();
  const [toast, setToast] = useState(null);
  const [drawer, setDrawer] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const discussAndCloseDrawer = useCallback(
    (payload) => {
      setDrawer(null);
      openAI({ type: "insight", data: payload });
    },
    [openAI],
  );

  const showEmpty = INSIGHTS_DEMO_EMPTY_STATE || (TOP_PRIORITY_ITEMS.length === 0 && KEY_SIGNALS.length === 0);

  const visibleObservations = useMemo(() => AI_OBSERVATIONS.slice(0, 2), []);

  const signalsByPriority = useMemo(() => {
    const sorted = [...KEY_SIGNALS].sort((a, b) => SIGNAL_ORDER[a.severity] - SIGNAL_ORDER[b.severity]);
    return {
      High: sorted.filter((s) => s.severity === "High"),
      Medium: sorted.filter((s) => s.severity === "Medium"),
      Low: sorted.filter((s) => s.severity === "Low"),
    };
  }, []);

  const drawerTitle =
    drawer?.kind === "observation"
      ? drawer.item.headline
      : drawer?.kind === "scenario"
        ? drawer.item.comparedScenarios
        : drawer?.item?.title;

  function signalCardClass(severity) {
    if (severity === "High") {
      return "flex flex-col rounded-2xl border-2 border-rose-200/85 bg-white p-5 shadow-md ring-1 ring-rose-100/40 sm:min-h-[11.5rem]";
    }
    if (severity === "Medium") {
      return "flex flex-col rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-sm";
    }
    return "flex flex-col rounded-2xl border border-slate-100/90 bg-slate-50/55 p-3.5 opacity-[0.9] shadow-none";
  }

  function renderSignalCard(s) {
    return (
      <article key={s.id} className={`${signalCardClass(s.severity)} transition hover:border-[#1a3673]/20`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3
            className={`font-semibold leading-snug text-slate-900 ${s.severity === "High" ? "text-[15px]" : "text-[14px]"}`}
          >
            {s.title}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${severityPill(s.severity)}`}
          >
            {s.severity}
          </span>
        </div>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.category}</p>
        <p className={`mt-2 flex-1 leading-relaxed text-slate-600 ${s.severity === "High" ? "text-[13px]" : "text-[12px]"}`}>
          {s.explanation}
        </p>
        <div
          className={`mt-4 flex flex-wrap gap-2 ${s.severity === "High" ? "border-t border-rose-100/80 pt-3.5" : "border-t border-slate-100/80 pt-2.5"}`}
        >
          <button
            type="button"
            onClick={() => setDrawer({ kind: "signal", item: s })}
            className="rounded-lg border border-[#1a3673]/20 bg-[#1a3673]/[0.06] px-3 py-1.5 text-[11px] font-semibold text-[#1a3673] transition hover:bg-[#1a3673]/[0.1]"
          >
            View details
          </button>
          <button
            type="button"
            onClick={() => discussAndCloseDrawer(insightAIPayloadFromSignal(s))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Discuss with AI
          </button>
          <button
            type="button"
            onClick={() => showToast(`“${s.title}” queued to convert to plan (demo).`)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Convert to plan
          </button>
        </div>
      </article>
    );
  }

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
            <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Insights</h1>
            <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-slate-500">
              Signals, opportunities, and risks derived from your assumptions, scenarios, and financial models.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => showToast("Insights refreshed — demo preview.")}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              Refresh insights
            </button>
            <button
              type="button"
              onClick={() => openAI({ type: "insight", data: INSIGHTS_PAGE_AI_OVERVIEW })}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1a3673] px-3.5 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
            >
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
              Discuss with AI
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-8 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-10">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/80 px-6 py-16 text-center shadow-sm">
              <Sparkles className="h-10 w-10 text-[#1a3673]/40" strokeWidth={1.5} />
              <h2 className="mt-4 text-lg font-semibold text-[#1a3673]">No insights yet</h2>
              <p className="mt-2 max-w-md text-[13px] leading-relaxed text-slate-600">
                Connect data or explore scenarios to generate CFO-level insights.
              </p>
              <Link
                to="/app/data/planning/scenarios"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
              >
                Go to Scenarios
                <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
              </Link>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm sm:px-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-slate-50/90 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Active signals</p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums text-[#1a3673]">{INSIGHTS_SUMMARY.activeSignals}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50/90 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Risks flagged</p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums text-rose-800">{INSIGHTS_SUMMARY.risksFlagged}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50/90 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Opportunities</p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums text-emerald-800">
                      {INSIGHTS_SUMMARY.opportunitiesIdentified}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50/90 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Suggested actions</p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums text-[#1a3673]">
                      {INSIGHTS_SUMMARY.suggestedActions}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-700">Trust · </span>
                  {INSIGHTS_TRUST_NOTE}
                </p>
              </section>

              {/* Top priority */}
              {TOP_PRIORITY_ITEMS.length > 0 ? (
                <section>
                  <h2 className="text-[16px] font-semibold text-[#1a3673]">Top priority right now</h2>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-slate-500">
                    The few moves that deserve attention before you dive into the full signal list.
                  </p>
                  <div
                    className={`mt-6 grid gap-6 ${TOP_PRIORITY_ITEMS.length > 1 ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}
                  >
                    {TOP_PRIORITY_ITEMS.map((t) => (
                      <article
                        key={t.id}
                        className="flex flex-col rounded-2xl border-2 border-[#1a3673]/20 bg-gradient-to-br from-[#1a3673]/[0.07] via-white to-white p-6 shadow-[0_12px_40px_-12px_rgba(26,54,115,0.18)] ring-1 ring-[#1a3673]/10"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1a3673] ring-1 ring-[#1a3673]/15">
                            {t.category}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${severityPill(t.severity)}`}
                          >
                            {t.severity}
                          </span>
                        </div>
                        <h3 className="mt-4 text-[18px] font-semibold leading-snug tracking-tight text-slate-900">{t.title}</h3>
                        <div className="mt-3 space-y-3 text-[14px] leading-[1.65] text-slate-700">
                          {t.narrative.split(/\n\n+/).map((para, i) => (
                            <p key={i}>{para}</p>
                          ))}
                        </div>
                        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">{t.whyItMatters}</p>
                        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <Link
                            to="/app/data/planning/scenarios"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a3673] px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
                          >
                            Explore scenario
                            <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => showToast(`“${t.title}” queued to convert to plan (demo).`)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                          >
                            Convert to plan
                          </button>
                          <button
                            type="button"
                            onClick={() => discussAndCloseDrawer(insightAIPayloadFromPriority(t))}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                          >
                            Discuss with AI
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* A. Key signals */}
              <section>
                <h2 className="text-[15px] font-semibold text-[#1a3673]">Key signals</h2>
                <p className="mt-1 text-[12px] text-slate-500">
                  Grouped by urgency — address high-priority items first, then monitor the rest.
                </p>
                <div className="mt-6 space-y-8">
                  {signalsByPriority.High.length ? (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rose-800/90">High priority</p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">{signalsByPriority.High.map(renderSignalCard)}</div>
                    </div>
                  ) : null}
                  {signalsByPriority.Medium.length ? (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800/80">Medium</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">{signalsByPriority.Medium.map(renderSignalCard)}</div>
                    </div>
                  ) : null}
                  {signalsByPriority.Low.length ? (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Low</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">{signalsByPriority.Low.map(renderSignalCard)}</div>
                    </div>
                  ) : null}
                </div>
              </section>

              {/* B. AI observations */}
              <section>
                <h2 className="text-[15px] font-semibold text-[#1a3673]">AI observations</h2>
                <p className="mt-1 text-[12px] text-slate-500">
                  Plain-language read on what your planning stack implies for the next decisions.
                </p>
                <div className="mt-5 rounded-2xl border border-[#1a3673]/12 bg-gradient-to-br from-[#1a3673]/[0.07] via-slate-50/40 to-white p-6 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1a3673]/85">AI CFO perspective</p>
                  <div className="mt-5 divide-y divide-[#1a3673]/10">
                    {visibleObservations.map((o) => (
                      <div key={o.id} className="py-5 first:pt-0 last:pb-0">
                        <h3 className="text-[17px] font-semibold leading-snug text-[#1a3673]">{o.headline}</h3>
                        <p className="mt-3 text-[14px] leading-[1.7] text-slate-800">{o.body}</p>
                        <div className="mt-4 space-y-1 text-[11px] text-slate-600">
                          <LinkedRow label="Assumptions" items={o.linkedAssumptions} />
                          <LinkedRow label="Scenarios" items={o.linkedScenarios} />
                          <LinkedRow label="Models" items={o.linkedModels} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => discussAndCloseDrawer(observationsFollowUpPayload(visibleObservations))}
                    className="mt-6 w-full rounded-xl border border-[#1a3673]/25 bg-white py-3 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:bg-[#1a3673]/[0.06] sm:w-auto sm:px-6"
                  >
                    Ask follow-up
                  </button>
                </div>
              </section>

              {/* C. Risk vs opportunity */}
              <section className="space-y-5">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#1a3673]">Risk vs opportunity</h2>
                  <p className="mt-1 text-[12px] font-medium text-slate-600">{RISK_OPPORTUNITY_SUBTITLE}</p>
                  <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-slate-600">{RISK_OPPORTUNITY_NET_OUTLOOK}</p>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-rose-800/90">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" strokeWidth={2} aria-hidden />
                      Risks
                    </p>
                    <div className="mt-3 space-y-2.5">
                      {RISK_ITEMS.map((r) => (
                        <article
                          key={r.id}
                          className="rounded-xl bg-rose-50/40 p-3.5 shadow-sm ring-1 ring-rose-100/60"
                        >
                          <h3 className="text-[13px] font-semibold text-slate-900">{r.title}</h3>
                          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">{r.explanation}</p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-600">Driver · </span>
                            {r.driver}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-600">Scenario · </span>
                            {r.linkedScenario}
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <Link
                              to="/app/data/planning/scenarios"
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-900/90 transition hover:bg-rose-50"
                            >
                              Explore scenario
                              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                            </Link>
                            <button
                              type="button"
                              onClick={() => showToast(`“${r.title}” queued as plan draft (demo).`)}
                              className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Convert to plan
                            </button>
                            <button
                              type="button"
                              onClick={() => discussAndCloseDrawer(insightAIPayloadFromRiskOpportunity(r))}
                              className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Discuss with AI
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-emerald-800/90">
                      <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
                      Opportunities
                    </p>
                    <div className="mt-3 space-y-2.5">
                      {OPPORTUNITY_ITEMS.map((o) => (
                        <article
                          key={o.id}
                          className="rounded-xl bg-emerald-50/35 p-3.5 shadow-sm ring-1 ring-emerald-100/50"
                        >
                          <h3 className="text-[13px] font-semibold text-slate-900">{o.title}</h3>
                          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">{o.explanation}</p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-600">Driver · </span>
                            {o.driver}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-600">Scenario · </span>
                            {o.linkedScenario}
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <Link
                              to="/app/data/planning/scenarios"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900/90 transition hover:bg-emerald-50/80"
                            >
                              Explore scenario
                              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                            </Link>
                            <button
                              type="button"
                              onClick={() => showToast(`“${o.title}” queued as plan draft (demo).`)}
                              className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Convert to plan
                            </button>
                            <button
                              type="button"
                              onClick={() => discussAndCloseDrawer(insightAIPayloadFromRiskOpportunity(o))}
                              className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Discuss with AI
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* D. Scenario insights */}
              <section className="space-y-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#1a3673]">Scenario insights</h2>
                  <p className="mt-1 text-[12px] font-medium text-slate-700">{SCENARIO_INSIGHTS_SUBTITLE}</p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    How cases diverge across your saved scenarios — open Scenarios to adjust assumptions and compare cases.
                  </p>
                </div>
                <div className="flex flex-col gap-3 rounded-xl bg-slate-50/90 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1 sm:flex-none">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Biggest driver</p>
                    <p className="text-[13px] font-semibold text-slate-900">{SCENARIO_DECISION_STRIP.biggestDriver}</p>
                  </div>
                  <div className="hidden h-8 w-px bg-slate-200/90 sm:block" aria-hidden />
                  <div className="min-w-0 flex-1 sm:flex-none">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Biggest risk</p>
                    <p className="text-[13px] font-semibold text-rose-900/90">{SCENARIO_DECISION_STRIP.biggestRisk}</p>
                  </div>
                  <div className="hidden h-8 w-px bg-slate-200/90 sm:block" aria-hidden />
                  <div className="min-w-0 flex-1 sm:flex-none">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Best lever</p>
                    <p className="text-[13px] font-semibold text-emerald-900/90">{SCENARIO_DECISION_STRIP.bestLever}</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SCENARIO_INSIGHTS.map((sc) => (
                    <article key={sc.id} className="flex flex-col rounded-xl bg-white/90 p-3.5 shadow-sm ring-1 ring-slate-100/80">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Scenario comparison</p>
                      <h3 className="mt-0.5 text-[14px] font-semibold text-slate-900">{sc.comparedScenarios}</h3>
                      <p className="mt-2 text-[12px] font-semibold text-[#1a3673]">{sc.keyFinding}</p>
                      <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-slate-600">{sc.explanation}</p>
                      <div className="mt-3 space-y-1 text-[11px] text-slate-600">
                        <LinkedRow label="Assumptions" items={sc.linkedAssumptions} />
                        <LinkedRow label="Scenarios" items={sc.linkedScenarios} />
                        <LinkedRow label="Models" items={sc.linkedModels} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          to="/app/data/planning/scenarios"
                          className="inline-flex items-center gap-1 rounded-lg bg-[#1a3673] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#142a5c]"
                        >
                          Open scenario
                          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                        </Link>
                        <Link
                          to="/app/dashboard"
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200/80"
                        >
                          <LayoutDashboard className="h-3.5 w-3.5" strokeWidth={2} />
                          View on dashboard
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDrawer({ kind: "scenario", item: sc })}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200/80"
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          onClick={() => discussAndCloseDrawer(insightAIPayloadFromScenario(sc))}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200/80"
                        >
                          Discuss with AI
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* E. Suggested actions */}
              <section className="space-y-4 pb-2">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#1a3673]">Suggested actions</h2>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Decision-ready moves — convert when leadership aligns.
                  </p>
                </div>
                <div className="space-y-3">
                  {SUGGESTED_ACTIONS.map((a) => (
                    <article
                      key={a.id}
                      className="rounded-xl bg-white/95 p-4 shadow-sm ring-1 ring-slate-100/80 transition hover:ring-[#1a3673]/15"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-[15px] font-semibold text-[#1a3673]">{a.title}</h3>
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${confidencePill(a.confidence)}`}
                          >
                            {a.confidence} confidence
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200/80">
                            {a.timeHorizon}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-slate-700">{a.rationale}</p>
                      <div className="mt-2.5 rounded-lg bg-emerald-50/50 px-3 py-2 ring-1 ring-emerald-100/60">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/75">Expected impact</p>
                        <p className="mt-0.5 text-[13px] font-semibold text-emerald-950">{a.expectedImpact}</p>
                      </div>
                      <div className="mt-2.5 space-y-0.5 text-[12px]">
                        <LinkedRow label="Assumptions" items={a.linkedAssumptions} />
                        <LinkedRow label="Scenarios" items={a.linkedScenarios} />
                        <LinkedRow label="Models" items={a.linkedModels} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => showToast(`“${a.title}” converted to plan queue (demo).`)}
                          className="rounded-lg bg-[#1a3673] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
                        >
                          Convert to plan
                        </button>
                        <button
                          type="button"
                          onClick={() => discussAndCloseDrawer(insightAIPayloadFromAction(a))}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200/80"
                        >
                          Discuss with AI
                        </button>
                        <button
                          type="button"
                          onClick={() => setDrawer({ kind: "action", item: a })}
                          className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200/80"
                        >
                          View details
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <PlanningDetailDrawer open={Boolean(drawer)} title={drawerTitle ?? ""} onClose={() => setDrawer(null)}>
        {drawer?.kind === "signal" ? (
          <div className="space-y-4 text-[13px] leading-relaxed text-slate-700">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
              <p className="mt-1">{drawer.item.description}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Why it matters</p>
              <p className="mt-1">{drawer.item.whyItMatters}</p>
            </div>
            <div className="space-y-2 pt-1">
              <LinkedRow label="Linked assumptions" items={drawer.item.linkedAssumptions} />
              <LinkedRow label="Linked scenarios" items={drawer.item.linkedScenarios} />
              <LinkedRow label="Linked models" items={drawer.item.linkedModels} />
            </div>
            <div className="rounded-xl bg-slate-50/90 px-3 py-2.5 text-[12px] text-slate-600 ring-1 ring-slate-100/80">
              <span className="font-semibold text-slate-700">Suggested next step · </span>
              {drawer.item.suggestedNextStep}
            </div>
            <button
              type="button"
              onClick={() => discussAndCloseDrawer(insightAIPayloadFromSignal(drawer.item))}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1a3673] py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#142a5c]"
            >
              <MessageSquare className="h-4 w-4" strokeWidth={2} />
              Discuss with AI
            </button>
          </div>
        ) : null}
        {drawer?.kind === "scenario" ? (
          <div className="space-y-4 text-[13px] leading-relaxed text-slate-700">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Key finding</p>
              <p className="mt-1 font-semibold text-[#1a3673]">{drawer.item.keyFinding}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Explanation</p>
              <p className="mt-1">{drawer.item.explanation}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Why it matters</p>
              <p className="mt-1">{drawer.item.whyItMatters}</p>
            </div>
            <div className="space-y-2 pt-1">
              <LinkedRow label="Linked assumptions" items={drawer.item.linkedAssumptions} />
              <LinkedRow label="Linked scenarios" items={drawer.item.linkedScenarios} />
              <LinkedRow label="Linked models" items={drawer.item.linkedModels} />
            </div>
            <div className="rounded-xl bg-slate-50/90 px-3 py-2.5 text-[12px] text-slate-600 ring-1 ring-slate-100/80">
              <span className="font-semibold text-slate-700">Suggested next step · </span>
              {drawer.item.suggestedNextStep}
            </div>
            <div className="flex flex-col gap-2">
              <Link
                to="/app/data/planning/scenarios"
                onClick={() => setDrawer(null)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-[12px] font-semibold text-[#1a3673] transition hover:bg-slate-50"
              >
                Open scenario
              </Link>
              <button
                type="button"
                onClick={() => discussAndCloseDrawer(insightAIPayloadFromScenario(drawer.item))}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a3673] py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#142a5c]"
              >
                <MessageSquare className="h-4 w-4" strokeWidth={2} />
                Discuss with AI
              </button>
            </div>
          </div>
        ) : null}
        {drawer?.kind === "action" ? (
          <div className="space-y-4 text-[13px] leading-relaxed text-slate-700">
            <div className="flex flex-wrap gap-2">
              {drawer.item.confidence ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${confidencePill(drawer.item.confidence)}`}
                >
                  {drawer.item.confidence} confidence
                </span>
              ) : null}
              {drawer.item.timeHorizon ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200/80">
                  {drawer.item.timeHorizon}
                </span>
              ) : null}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rationale</p>
              <p className="mt-1">{drawer.item.rationale}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
              <p className="mt-1">{drawer.item.description}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Why it matters</p>
              <p className="mt-1">{drawer.item.whyItMatters}</p>
            </div>
            <div className="rounded-lg bg-emerald-50/50 px-3 py-2 ring-1 ring-emerald-100/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/75">Expected impact</p>
              <p className="mt-0.5 font-semibold text-emerald-950">{drawer.item.expectedImpact}</p>
            </div>
            <div className="space-y-2 pt-1">
              <LinkedRow label="Linked assumptions" items={drawer.item.linkedAssumptions} />
              <LinkedRow label="Linked scenarios" items={drawer.item.linkedScenarios} />
              <LinkedRow label="Linked models" items={drawer.item.linkedModels} />
            </div>
            <div className="rounded-xl bg-slate-50/90 px-3 py-2.5 text-[12px] text-slate-600 ring-1 ring-slate-100/80">
              <span className="font-semibold text-slate-700">Suggested next step · </span>
              {drawer.item.suggestedNextStep}
            </div>
            <button
              type="button"
              onClick={() => discussAndCloseDrawer(insightAIPayloadFromAction(drawer.item))}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1a3673] py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#142a5c]"
            >
              <MessageSquare className="h-4 w-4" strokeWidth={2} />
              Discuss with AI
            </button>
          </div>
        ) : null}
      </PlanningDetailDrawer>
    </div>
  );
}
