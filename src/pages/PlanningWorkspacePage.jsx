import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  Lock,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import KPIStrip from "../components/dashboard/KPIStrip.jsx";
import AnalyticsRow from "../components/dashboard/AnalyticsRow.jsx";
import ScenarioDashboardBanner from "../components/dashboard/ScenarioDashboardBanner.jsx";
import { usePlanningWorkspace } from "../planning/workspaceGuide/PlanningWorkspaceContext.jsx";
import {
  defaultCopilotReply,
  parseGuideMessage,
  summarizeActions,
} from "../planning/workspaceGuide/guideActions.js";
import { WORKSPACE_STEPS } from "../workspace/workspaceFlowConfig.js";
import { formatAssumptionValue } from "../planning/workspaceGuide/workspaceAssumptionsDefaults.js";
import {
  PLANNING_WORKSPACE_METRICS_EVENT,
  PLANNING_WORKSPACE_METRICS_STORAGE_KEY,
} from "../planning/workspaceGuide/workspaceDataBridge.js";

function statusBadge(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-900 ring-emerald-200/80";
  if (status === "in_progress") return "bg-[#1a3673]/10 text-[#1a3673] ring-[#1a3673]/25";
  if (status === "locked") return "bg-slate-100 text-slate-400 ring-slate-200/70";
  return "bg-slate-50 text-slate-500 ring-slate-200/70";
}

function stepUiStatus(index, ws) {
  const id = WORKSPACE_STEPS[index].id;
  if (index > ws.furthestStepIndex) return "locked";
  if (ws.completedStepIds.includes(id)) return "completed";
  if (ws.currentStepId === id) return "in_progress";
  return "not_started";
}

function statusLabel(s) {
  if (s === "completed") return "Completed";
  if (s === "in_progress") return "In progress";
  if (s === "locked") return "Locked";
  return "Not started";
}

function insightSeverityClass(sev) {
  if (sev === "Medium") return "bg-amber-100/90 text-amber-950";
  return "bg-rose-100/80 text-rose-900";
}

function insightBorderClass(sev) {
  if (sev === "Medium") return "border-amber-100/90 bg-amber-50/25 ring-amber-100/50";
  return "border-rose-100/90 bg-rose-50/30 ring-rose-100/50";
}

export default function PlanningWorkspacePage() {
  const ws = usePlanningWorkspace();
  const {
    currentStepId,
    furthestStepIndex,
    completedStepIds,
    data,
    assumptions,
    models,
    scenarios,
    insights,
    dashboard,
    plans,
    applyGuideActions,
    refreshDetectedMetricsFromStorage,
    continueStep,
    selectStep,
    snapshotForGuide,
  } = ws;

  const [toast, setToast] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  const activeStep = useMemo(
    () => Math.max(0, WORKSPACE_STEPS.findIndex((s) => s.id === currentStepId)),
    [currentStepId],
  );

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    refreshDetectedMetricsFromStorage();
    const onStorage = (e) => {
      if (e.key === PLANNING_WORKSPACE_METRICS_STORAGE_KEY || e.key === null) refreshDetectedMetricsFromStorage();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshDetectedMetricsFromStorage();
    };
    const onMetricsUpdated = () => refreshDetectedMetricsFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener(PLANNING_WORKSPACE_METRICS_EVENT, onMetricsUpdated);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PLANNING_WORKSPACE_METRICS_EVENT, onMetricsUpdated);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshDetectedMetricsFromStorage]);

  const sendChat = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed || chatSending) return;
    setChatInput("");
    setChatSending(true);
    setChatMessages((m) => [...m, { role: "user", content: trimmed, id: `u-${Date.now()}` }]);

    window.setTimeout(() => {
      const snap = snapshotForGuide();
      const { actions, reply } = parseGuideMessage(trimmed, snap);
      if (actions.length) {
        applyGuideActions(actions);
      }
      const assistantText =
        reply ||
        (actions.length ? summarizeActions(actions) : null) ||
        defaultCopilotReply(trimmed, currentStepId);

      setChatMessages((m) => [...m, { role: "assistant", content: assistantText, id: `a-${Date.now()}` }]);
      setChatSending(false);
    }, 380);
  }, [chatInput, chatSending, snapshotForGuide, applyGuideActions, currentStepId]);

  const continueDisabled = (() => {
    if (activeStep === 0) return data.metrics.length === 0;
    if (activeStep === 6) return true;
    return false;
  })();

  const primaryContinue = (
    <button
      type="button"
      disabled={continueDisabled}
      onClick={() => continueStep()}
      className="inline-flex items-center gap-2 rounded-xl bg-[#1a3673] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c] disabled:cursor-not-allowed disabled:opacity-40"
    >
      Continue
      <ArrowRight className="h-4 w-4" strokeWidth={2} />
    </button>
  );

  const scenarioPreview = scenarios.preview;
  const scenarioLevers = scenarios.levers;
  const revArrow = scenarioPreview.active && scenarioPreview.revenueDelta != null ? scenarioPreview.revenueDelta : "→";
  const runwayArrow =
    scenarioPreview.active && scenarioPreview.runwayDelta != null ? scenarioPreview.runwayDelta : "→";
  const burnArrow = scenarioPreview.active && scenarioPreview.burnDelta != null ? scenarioPreview.burnDelta : "→";

  let stepBody = null;
  if (activeStep === 0) {
    const hasMetrics = data.metrics.length > 0;
    const selectedLabels = data.files.filter((f) => data.selectedFiles.includes(f.id)).map((f) => f.name);
    stepBody = (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 ring-1 ring-slate-100/80">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Workspace data (read-only)</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Files in workspace</p>
              <ul className="mt-2 space-y-1.5 text-[13px] text-slate-800">
                {data.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${data.selectedFiles.includes(f.id) ? "bg-emerald-500" : "bg-slate-300"}`}
                    />
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Selected for modeling</p>
              <p className="mt-2 text-[13px] text-slate-700">
                {selectedLabels.length ? selectedLabels.join(", ") : "None — say “use revenue.csv” or “use all” in chat."}
              </p>
            </div>
          </div>
        </div>
        <div
          className={`rounded-2xl border p-5 ring-1 ${
            hasMetrics
              ? "border-emerald-100/90 bg-emerald-50/40 ring-emerald-100/60"
              : "border-slate-200/90 bg-slate-50/50 ring-slate-100/80"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Detected metrics</p>
          {hasMetrics ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {data.metrics.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-[13px] font-medium text-slate-800 ring-1 ring-slate-100/80"
                >
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
                  {m.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
              None in state yet. Use chat to bind files, or complete uploads in Data → Files / Connect.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primaryContinue}
          <span className="text-[12px] text-slate-500">Continue when at least one metric is present</span>
        </div>
        <p className="text-[11px] text-slate-500">
          Shortcuts:{" "}
          <Link to="/app/data/files" className="font-semibold text-[#1a3673] hover:underline">
            Data → Files
          </Link>
          {" · "}
          <Link to="/app/data/connect" className="font-semibold text-[#1a3673] hover:underline">
            Data → Connect
          </Link>
          {" · "}
          <Link to="/app/data" className="font-semibold text-[#1a3673] hover:underline">
            Data workspace
          </Link>
        </p>
      </div>
    );
  } else if (activeStep === 1) {
    const items = assumptions.items;
    stepBody = (
      <div className="space-y-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {items.length} driver{items.length === 1 ? "" : "s"} · chat-only edits
        </p>
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-[13px] text-slate-500">
              No assumptions in state — ask chat to add one (e.g. “add CAC growing 5% monthly”).
            </p>
          ) : (
            items.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100/80"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-[#1a3673]">{a.name}</h3>
                  <span className="text-[13px] font-semibold tabular-nums text-slate-900">
                    {formatAssumptionValue(a.type, a.value)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-medium uppercase text-slate-400">{a.type}</p>
                {a.description ? <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{a.description}</p> : null}
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Used in</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(a.usedIn || []).map((u) => (
                      <span
                        key={u}
                        className="rounded-full bg-slate-100/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200/80"
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primaryContinue}
          <span className="text-[12px] text-slate-500">Continue to models</span>
        </div>
        <Link
          to="/app/data/planning/assumptions"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a3673] hover:underline"
        >
          Open full Assumptions
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    );
  } else if (activeStep === 2) {
    const previewNames = assumptions.items
      .slice(0, 4)
      .map((a) => `${a.name} (${formatAssumptionValue(a.type, a.value)})`)
      .join(" · ");
    stepBody = (
      <div className="space-y-6">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Core models roll up your workspace drivers
          {assumptions.items.length ? (
            <>
              : <span className="font-medium text-slate-800">{previewNames}</span>
              {assumptions.items.length > 4 ? " · …" : ""}
            </>
          ) : (
            " — add assumptions via chat in the previous step to see them referenced here."
          )}{" "}
          Same model families as Planning → Models.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {models.items.map((m) => (
            <article
              key={m.id}
              className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-100/60"
            >
              <h3 className="text-[14px] font-semibold text-[#1a3673]">{m.name}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{m.blurb}</p>
              <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/80">
                {m.status}
              </p>
            </article>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primaryContinue}
          <span className="text-[12px] text-slate-500">Continue to scenarios</span>
        </div>
        <Link
          to="/app/data/planning/models"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a3673] hover:underline"
        >
          Open full Models
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    );
  } else if (activeStep === 3) {
    stepBody = (
      <div className="space-y-6">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Scenario levers and preview are driven from chat (e.g. “create downside scenario”, “apply preview”).
        </p>
        {scenarioPreview.label ? (
          <p className="text-[12px] font-semibold text-[#1a3673]">
            Active preview: {scenarioPreview.label}
            {scenarioPreview.applied ? (
              <span className="ml-2 font-normal text-emerald-700">· Applied to dashboard context</span>
            ) : null}
          </p>
        ) : (
          <p className="text-[12px] text-slate-500">No active scenario preview — describe one in chat.</p>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Levers (state)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { key: "revenue", label: "Revenue upside" },
              { key: "hiring", label: "Hiring / burn" },
              { key: "fx", label: "FX" },
            ].map(({ key, label }) => (
              <span
                key={key}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${
                  scenarioLevers[key]
                    ? "bg-[#1a3673]/10 text-[#1a3673] ring-[#1a3673]/25"
                    : "bg-slate-100 text-slate-500 ring-slate-200/80"
                }`}
              >
                {label}: {scenarioLevers[key] ? "on" : "off"}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-5 ring-1 ring-slate-100/80">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Preview summary</p>
          <ul className="mt-3 space-y-2 text-[14px] font-semibold text-slate-800">
            <li>
              Revenue <span className="text-[#1a3673]">{revArrow}</span>
            </li>
            <li>
              Runway <span className="text-emerald-700">{runwayArrow}</span>
            </li>
            <li>
              Burn <span className="text-rose-700">{burnArrow}</span>
            </li>
          </ul>
          <p className="mt-4 text-[11px] text-slate-500">Say “apply preview” in chat to commit (demo).</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primaryContinue}
          <span className="text-[12px] text-slate-500">Continue to insights</span>
        </div>
        <Link
          to="/app/data/planning/scenarios"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a3673] hover:underline"
        >
          Open full Scenarios
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    );
  } else if (activeStep === 4) {
    stepBody = (
      <div className="space-y-6">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Signals from workspace state — ask chat for “show top risk” or “convert to plan”.
        </p>
        <div className="space-y-3">
          {insights.items.map((ins) => (
            <article
              key={ins.id}
              className={`rounded-xl border p-4 ring-1 ${insightBorderClass(ins.severity)}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-slate-900">{ins.title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${insightSeverityClass(ins.severity)}`}
                >
                  {ins.severity}
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{ins.detail}</p>
            </article>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primaryContinue}
          <span className="text-[12px] text-slate-500">Continue to dashboard</span>
        </div>
        <Link
          to="/app/data/planning/insights"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a3673] hover:underline"
        >
          Open full Insights
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    );
  } else if (activeStep === 5) {
    stepBody = (
      <div className="space-y-5">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Live dashboard preview — widgets reflect scenario state. Say “save dashboard” in chat to mark saved (demo).
        </p>
        {dashboard.headline ? (
          <div className="rounded-xl border border-[#1a3673]/15 bg-[#1a3673]/[0.05] px-4 py-3 text-[12px] leading-relaxed text-[#1a3673]">
            {dashboard.headline}
          </div>
        ) : null}
        {dashboard.saved ? (
          <p className="text-[11px] font-semibold text-emerald-800">Workspace dashboard snapshot saved (demo).</p>
        ) : null}
        <div className="max-h-[min(70vh,520px)] overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200/90 bg-white ring-1 ring-slate-100/80">
          <div className="space-y-6 p-4 sm:p-5">
            <ScenarioDashboardBanner />
            <KPIStrip />
            <AnalyticsRow />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primaryContinue}
          <span className="text-[12px] text-slate-500">Continue to plans</span>
        </div>
        <Link
          to="/app/dashboard"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a3673] hover:underline"
        >
          Open full Dashboard
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    );
  } else {
    stepBody = (
      <div className="space-y-6">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Plans in workspace state — ask chat to “create burn reduction plan” or similar to add drafts.
        </p>
        <ul className="space-y-3">
          {plans.items.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100/80"
            >
              <p className="text-[15px] font-semibold text-[#1a3673]">{p.title}</p>
              <p className="mt-1 text-[12px] text-slate-600">{p.detail}</p>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-slate-500">Finalize or hand off in the full Plans experience when ready.</p>
        <Link
          to="/app/data/planning/plans"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1a3673] hover:underline"
        >
          Open full Plans
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[#f5f7fb]">
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[90] w-[min(calc(100%-2rem),22rem)] -translate-x-1/2 px-4">
          <div className="pointer-events-auto flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#1a3673]" strokeWidth={2} />
            <p className="text-[13px] font-medium text-slate-800">{toast}</p>
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[#1a3673] sm:text-2xl">Planning workspace</h1>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-500">
                Chat-first planning — describe changes; the panel below reflects workspace state.
              </p>
            </div>
            <button
              type="button"
              onClick={() => showToast("Workspace saved (demo).")}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Save className="h-4 w-4 text-[#1a3673]" strokeWidth={2} />
              Save workspace
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-slate-200/60 bg-white/80 px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-5xl overflow-x-auto pb-1">
            <div className="flex min-w-max items-center gap-1 sm:gap-2">
              {WORKSPACE_STEPS.map((st, i) => {
                const ui = stepUiStatus(i, ws);
                const clickable = i <= furthestStepIndex;
                return (
                  <div key={st.id} className="flex items-center">
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => selectStep(i)}
                      className={`group flex max-w-[7.5rem] flex-col items-center rounded-xl px-2 py-2 text-left transition sm:max-w-none sm:flex-row sm:items-center sm:gap-2 sm:px-3 ${
                        clickable ? "hover:bg-slate-50" : "cursor-not-allowed opacity-60"
                      } ${activeStep === i ? "bg-[#1a3673]/[0.08]" : ""}`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-offset-2 ring-offset-white ${statusBadge(ui)}`}
                      >
                        {ui === "completed" ? (
                          <Check className="h-4 w-4" strokeWidth={2} />
                        ) : ui === "locked" ? (
                          <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                        ) : (
                          <span className="tabular-nums">{i + 1}</span>
                        )}
                      </span>
                      <span className="mt-1 max-w-[5.5rem] text-center sm:mt-0 sm:max-w-none sm:text-left">
                        <span className="block text-[10px] font-semibold leading-tight text-slate-800 sm:hidden">{st.short}</span>
                        <span className="hidden text-[11px] font-semibold text-slate-800 sm:block md:text-[12px]">{st.label}</span>
                        <span
                          className={`mt-0.5 block text-[9px] sm:text-[10px] ${ui === "locked" ? "text-slate-400" : "text-slate-500"}`}
                        >
                          {statusLabel(ui)}
                        </span>
                      </span>
                    </button>
                    {i < WORKSPACE_STEPS.length - 1 ? (
                      <ChevronRight className="mx-0.5 h-4 w-4 shrink-0 text-slate-300 sm:mx-1" strokeWidth={2} aria-hidden />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-100/80 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
                <Circle className="h-2 w-2 fill-[#fc7d25] text-[#fc7d25]" strokeWidth={0} aria-hidden />
                <h2 className="text-[16px] font-semibold text-[#1a3673]">{WORKSPACE_STEPS[activeStep].label}</h2>
                <span
                  className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusBadge(stepUiStatus(activeStep, ws))}`}
                >
                  {statusLabel(stepUiStatus(activeStep, ws))}
                </span>
              </div>

              <div className="border-b border-slate-100 py-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-[#fc7d25]" strokeWidth={2} />
                  <h3 className="text-[13px] font-semibold text-[#1a3673]">AI workspace chat</h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Primary</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Natural language updates global workspace state; the section below is read-only.
                </p>
                <div className="mt-4 max-h-[min(40vh,320px)] min-h-[160px] space-y-3 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  {chatMessages.length === 0 ? (
                    <p className="py-6 text-center text-[12px] text-slate-400">
                      e.g. “use revenue.csv”, “set revenue growth to 12%”, “create downside scenario”…
                    </p>
                  ) : (
                    chatMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[95%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                          m.role === "user"
                            ? "ml-auto bg-[#1a3673] text-white"
                            : "mr-auto bg-white text-slate-800 ring-1 ring-slate-200/80"
                        }`}
                      >
                        {m.content}
                      </div>
                    ))
                  )}
                </div>
                <div className="relative mt-3">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendChat();
                    }}
                    placeholder="Ask the workspace to change data, assumptions, scenarios…"
                    disabled={chatSending}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-3 pr-12 text-[13px] text-slate-900 outline-none focus:border-[#1a3673]/25 focus:ring-2 focus:ring-[#1a3673]/10 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={chatSending || !chatInput.trim()}
                    onClick={sendChat}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#1a3673] hover:bg-[#1a3673]/10 disabled:opacity-30"
                    aria-label="Send"
                  >
                    {chatSending ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a3673]/30 border-t-[#1a3673]" />
                    ) : (
                      <Send className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-5">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">Workspace state</p>
                {stepBody}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
