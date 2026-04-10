import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import AssumptionContextChatPanel from "../../components/planning/AssumptionContextChatPanel.jsx";
import ScenarioImpactView from "../../components/scenario/ScenarioImpactView.jsx";
import SaveScenarioModal from "../../components/planning/SaveScenarioModal.jsx";
import { useScenarioSimulation } from "../../hooks/useScenarioSimulation.js";
import { useAssumptions } from "../../planning/AssumptionsContext.jsx";
import { useScenarioDraft } from "../../planning/ScenarioDraftContext.jsx";
import { usePlanningView } from "../../planning/PlanningViewContext.jsx";
import { businessAffectsFromOutputs } from "../../planning/assumptions/businessAffects.js";
import { formatPlanningRelative } from "../../planning/formatPlanningRelative.js";
import { draftOriginSummary, previewVsBaselineNote } from "../../planning/scenarioViewHelpers.js";

const WHAT_IF_CHIPS = [
  {
    label: "Revenue growth",
    teaser: "What if revenue grows 12%?",
    assumptionKey: "revenue_growth",
    seed: "What if revenue growth is 12% for the next planning cycle? Walk me through the impact and show a scenario proposal.",
  },
  {
    label: "Hiring",
    teaser: "What if hiring slows down?",
    assumptionKey: "hiring",
    seed: "What if we slow hiring to 2 roles instead of the current plan? Help me preview that as a scenario.",
  },
  {
    label: "FX",
    teaser: "What if USD/INR goes to 85?",
    assumptionKey: "fx",
    seed: "What if USD/INR moves to 85? I want to explore that as a scenario preview, not change baseline yet.",
  },
];

/** Human-readable delta vs baseline for save-summary (illustrative, mock-friendly). */
function baselineDeltaLine(assumptionLabel, baselineDisplay, previewDisplay) {
  const parseNum = (s) => {
    const n = parseFloat(String(s).replace(/%/g, "").replace(/[₹,]/g, "").replace(/USD/gi, "").trim());
    return Number.isNaN(n) ? NaN : n;
  };
  const bu = String(baselineDisplay);
  const pu = String(previewDisplay);
  if (/%/.test(bu) && /%/.test(pu)) {
    const b = parseNum(bu);
    const p = parseNum(pu);
    if (!Number.isNaN(b) && !Number.isNaN(p)) {
      const d = p - b;
      const sig = d > 0 ? "+" : "";
      return `${sig}${d.toFixed(1)} pts on ${assumptionLabel.toLowerCase()} vs baseline`;
    }
  }
  if (/^\s*\d+\s*$/.test(bu) && /^\s*\d+\s*$/.test(pu)) {
    const b = parseInt(bu, 10);
    const p = parseInt(pu, 10);
    const d = p - b;
    const sig = d > 0 ? "+" : "";
    return `${sig}${d} hire${Math.abs(d) === 1 ? "" : "s"} vs baseline`;
  }
  if (/[\d.]/.test(bu) && /[\d.]/.test(pu)) {
    const b = parseNum(bu);
    const p = parseNum(pu);
    if (!Number.isNaN(b) && !Number.isNaN(p)) {
      const d = p - b;
      const sig = d > 0 ? "+" : "";
      return `${sig}${d.toFixed(1)} vs baseline on ${assumptionLabel.toLowerCase()}`;
    }
  }
  return `Different from baseline (${bu} → ${pu})`;
}

function inferAssumptionKeyFromPrompt(text, assumptions) {
  const t = text.toLowerCase();
  if (/fx|usd|inr|currency|exchange/i.test(t)) {
    const row = assumptions.find((a) => a.key === "fx");
    if (row) return row.key;
  }
  if (/hiring|headcount|roles?|fte/i.test(t)) {
    const row = assumptions.find((a) => a.key === "hiring");
    if (row) return row.key;
  }
  if (/revenue|growth|mrr|sales/i.test(t)) {
    const row = assumptions.find((a) => a.key === "revenue_growth");
    if (row) return row.key;
  }
  return assumptions[0]?.key ?? "revenue_growth";
}

function explorationStatusLabel(status) {
  switch (status) {
    case "exploring":
      return "Exploring";
    case "previewed":
      return "Previewed";
    case "applied":
      return "Applied";
    case "cleared":
      return "Cleared";
    default:
      return status ? String(status) : "—";
  }
}

function explorationStatusStyles(status) {
  switch (status) {
    case "exploring":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "previewed":
      return "border-[#1a3673]/20 bg-[#1a3673]/[0.06] text-[#1a3673]";
    case "applied":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "cleared":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function ScenarioExploreComposer({ value, onChange, onSubmit, placeholder, loadingPhase, inputRef }) {
  const busy = Boolean(loadingPhase);
  const canSend = value.trim().length > 0 && !busy;

  const submit = useCallback(() => {
    if (busy) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (typeof onSubmit === "function") onSubmit(trimmed);
  }, [value, onSubmit, busy]);

  const phaseMessage =
    loadingPhase === "thinking"
      ? "Thinking…"
      : loadingPhase === "evaluating"
        ? "Evaluating impact…"
        : loadingPhase === "generating"
          ? "Generating preview…"
          : "";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative min-w-0">
        <MessageSquare
          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[#1a3673]/40"
          strokeWidth={2}
        />
        <input
          ref={inputRef}
          id="scenario-explore-input"
          type="text"
          value={value}
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-200/90 bg-white py-2.5 pl-10 pr-11 text-[13px] text-slate-800 shadow-sm outline-none ring-[#1a3673]/20 transition placeholder:text-slate-400 focus:border-[#1a3673]/30 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
          aria-label="What-if message — Enter to explore"
          aria-busy={busy}
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={submit}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-[#1a3673] transition hover:bg-[#1a3673]/[0.08] disabled:pointer-events-none disabled:opacity-30"
          aria-label="Explore"
        >
          {busy ? (
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#1a3673]/25 border-t-[#1a3673]"
              aria-hidden
            />
          ) : (
            <Send className="h-4 w-4" strokeWidth={2} />
          )}
        </button>
      </div>
      <div className="min-h-[1.125rem]">
        {busy ? (
          <p className="flex items-center gap-2 text-[10px] text-slate-500" role="status" aria-live="polite">
            <span
              className="inline-flex h-1 w-1 shrink-0 animate-pulse rounded-full bg-[#1a3673]/70"
              aria-hidden
            />
            {phaseMessage}
          </p>
        ) : value.trim() ? (
          <p className="text-[10px] text-slate-400">Press Enter to explore</p>
        ) : null}
      </div>
    </div>
  );
}

export default function PlanningScenariosPage() {
  const assumptionsCtx = useAssumptions();
  const assumptions = Array.isArray(assumptionsCtx?.assumptions) ? assumptionsCtx.assumptions : [];

  const scenarioCtx = useScenarioDraft();
  const draftByKey =
    scenarioCtx?.draftByKey && typeof scenarioCtx.draftByKey === "object" ? scenarioCtx.draftByKey : {};
  const hasScenarioDraft = Boolean(scenarioCtx?.hasScenarioDraft);
  const scenarioKeyCount = Number.isFinite(scenarioCtx?.scenarioKeyCount) ? scenarioCtx.scenarioKeyCount : 0;
  const clearScenarioDraft =
    typeof scenarioCtx?.clearScenarioDraft === "function" ? scenarioCtx.clearScenarioDraft : () => {};
  const saveCurrentDraftAsScenario =
    typeof scenarioCtx?.saveCurrentDraftAsScenario === "function"
      ? scenarioCtx.saveCurrentDraftAsScenario
      : () => null;
  const savedScenarios = Array.isArray(scenarioCtx?.savedScenarios) ? scenarioCtx.savedScenarios : [];
  const applyPreviewToDashboard =
    typeof scenarioCtx?.applyPreviewToDashboard === "function" ? scenarioCtx.applyPreviewToDashboard : () => {};
  const applySavedScenarioToDashboard =
    typeof scenarioCtx?.applySavedScenarioToDashboard === "function"
      ? scenarioCtx.applySavedScenarioToDashboard
      : () => {};
  const activeDashboardScenario =
    scenarioCtx?.activeDashboardScenario && typeof scenarioCtx.activeDashboardScenario === "object"
      ? scenarioCtx.activeDashboardScenario
      : null;
  const recentExplorations = Array.isArray(scenarioCtx?.recentExplorations)
    ? scenarioCtx.recentExplorations
    : [];
  const logExploration =
    typeof scenarioCtx?.logExploration === "function" ? scenarioCtx.logExploration : () => {};

  const navigate = useNavigate();
  const { enterPreviewFromScenarios } = usePlanningView();

  const scenarioSimulation = useScenarioSimulation();

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [ctxChat, setCtxChat] = useState(null);
  const exploreRef = useRef(null);
  const exploreInputRef = useRef(null);
  const exploreSubmittingRef = useRef(false);
  const exploreTimersRef = useRef([]);
  const [exploreInput, setExploreInput] = useState("");
  const [exploreLoadingPhase, setExploreLoadingPhase] = useState(
    /** @type {null | 'thinking' | 'evaluating' | 'generating'} */ (null),
  );
  const [scenarioWorkingTitle, setScenarioWorkingTitle] = useState(/** @type {string | null} */ (null));

  const draftEntries = useMemo(
    () => Object.values(draftByKey).filter((e) => e && typeof e === "object" && e.assumptionKey),
    [draftByKey],
  );

  const outputsAffected = useMemo(() => {
    const map = new Map();
    for (const key of Object.keys(draftByKey)) {
      const row = assumptions.find((a) => a.key === key);
      if (!row?.usedIn) continue;
      for (const ref of row.usedIn) {
        map.set(ref.id, ref.label);
      }
    }
    return Array.from(map.values());
  }, [draftByKey, assumptions]);

  const comparisonRows = useMemo(() => {
    return draftEntries.map((entry) => {
      const baseline = assumptions.find((a) => a.key === entry.assumptionKey);
      const baselineDisplay = baseline?.valueDisplay ?? entry.displayFromSnapshot;
      const affects =
        baseline?.affects?.length ? baseline.affects : businessAffectsFromOutputs(baseline?.usedIn || []);
      const source =
        entry.relatedUserMessage || entry.chatSessionId
          ? "From planning chat"
          : "Captured in preview";
      const direction = previewVsBaselineNote(baselineDisplay, entry.displayTo);
      return { entry, baseline, baselineDisplay, affects, source, direction };
    });
  }, [draftEntries, assumptions]);

  const originLabel = useMemo(() => draftOriginSummary(draftEntries), [draftEntries]);

  const saveScenarioSummary = useMemo(() => {
    if (!comparisonRows.length) return { deltaLines: [], previewChangeLines: [] };
    const deltaLines = comparisonRows.map(({ entry, baselineDisplay }) =>
      `• ${baselineDeltaLine(entry.assumptionLabel, baselineDisplay, entry.displayTo)}`,
    );
    const previewChangeLines = WHAT_IF_CHIPS.map(({ assumptionKey }) => {
      const baseline = assumptions.find((a) => a.key === assumptionKey);
      const entry = draftByKey[assumptionKey];
      const label = baseline?.label ?? assumptionKey;
      if (!entry) {
        return `• ${label}: unchanged`;
      }
      const from = baseline?.valueDisplay ?? entry.displayFromSnapshot ?? "—";
      const to = entry.displayTo;
      return `• ${label}: ${from} → ${to}`;
    });
    return { deltaLines, previewChangeLines };
  }, [comparisonRows, assumptions, draftByKey]);

  const ctxAssumption = useMemo(
    () => (ctxChat ? assumptions.find((x) => x.key === ctxChat.key) ?? null : null),
    [assumptions, ctxChat],
  );

  useEffect(() => {
    if (ctxChat && !ctxAssumption) setCtxChat(null);
  }, [ctxChat, ctxAssumption]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    return () => {
      exploreTimersRef.current.forEach((id) => window.clearTimeout(id));
      exploreTimersRef.current = [];
      exploreSubmittingRef.current = false;
    };
  }, []);

  const openDiscuss = useCallback((key, seedPrompt = null, opts = {}) => {
    setCtxChat((prev) => ({
      key,
      simulate: false,
      seedPrompt,
      nonce: (prev?.nonce ?? 0) + 1,
      bootFromComposer: opts.bootFromComposer === true,
    }));
  }, []);

  const closeContextChat = () => setCtxChat(null);

  const firstDraftKey = draftEntries[0]?.assumptionKey;

  const startWhatIfFromPrompt = useCallback(
    (trimmed, assumptionKeyOverride = null) => {
      const key = assumptionKeyOverride ?? inferAssumptionKeyFromPrompt(trimmed, assumptions);
      const row = assumptions.find((a) => a.key === key);
      logExploration({
        label: row?.label ?? "Planning",
        detail: trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed,
        assumptionKey: key,
        status: "exploring",
        seedPrompt: trimmed,
      });
      openDiscuss(key, trimmed, { bootFromComposer: true });
    },
    [assumptions, logExploration, openDiscuss],
  );

  const runExploreAfterLoading = useCallback(
    (trimmed) => {
      if (!trimmed || exploreSubmittingRef.current) return;
      exploreSubmittingRef.current = true;
      setScenarioWorkingTitle(trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed);
      exploreTimersRef.current.forEach((id) => window.clearTimeout(id));
      exploreTimersRef.current = [];
      setExploreLoadingPhase("thinking");
      exploreTimersRef.current.push(window.setTimeout(() => setExploreLoadingPhase("evaluating"), 520));
      exploreTimersRef.current.push(window.setTimeout(() => setExploreLoadingPhase("generating"), 1040));
      exploreTimersRef.current.push(
        window.setTimeout(() => {
          startWhatIfFromPrompt(trimmed);
          setExploreInput("");
          setExploreLoadingPhase(null);
          exploreSubmittingRef.current = false;
          exploreTimersRef.current = [];
        }, 1680),
      );
    },
    [startWhatIfFromPrompt],
  );

  const onChipFill = useCallback((chip) => {
    setExploreInput(chip.teaser);
    setScenarioWorkingTitle(chip.teaser);
    window.requestAnimationFrame(() => {
      exploreInputRef.current?.focus();
    });
  }, []);

  const handleClearScenarioDraft = useCallback(() => {
    clearScenarioDraft();
    setScenarioWorkingTitle(null);
  }, [clearScenarioDraft]);

  const keyPreviewPills = useMemo(() => {
    return comparisonRows.slice(0, 4).map(({ entry, baselineDisplay }) => ({
      key: entry.assumptionKey,
      text: `${entry.assumptionLabel}: ${entry.displayTo}`,
      sub: `was ${baselineDisplay}`,
    }));
  }, [comparisonRows]);

  const handleSaveScenario = (name) => {
    const id = saveCurrentDraftAsScenario({ name, outputsAffected });
    if (id) {
      setToast(`Scenario “${name.trim()}” saved for this session.`);
    }
  };

  const scrollToExplore = () => {
    exploreRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const resumeExploration = (ex) => {
    if (!ex.assumptionKey) {
      scrollToExplore();
      return;
    }
    openDiscuss(ex.assumptionKey, ex.seedPrompt ?? null);
  };

  const openExplorationInAi = (ex) => {
    if (!ex.assumptionKey) {
      scrollToExplore();
      return;
    }
    openDiscuss(ex.assumptionKey, null);
  };

  const trySaveFromExploration = () => {
    if (!hasScenarioDraft) {
      setToast("Start a live preview first — use the what-if field below or Assumptions, then save.");
      return;
    }
    setSaveModalOpen(true);
  };

  const planningPanelOpen = Boolean(ctxChat && ctxAssumption);

  const dedupedRecentExplorations = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const ex of recentExplorations) {
      if (!ex || typeof ex !== "object") continue;
      const k = ex.assumptionKey;
      if (k == null || k === "") {
        out.push(ex);
        continue;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(ex);
    }
    return out;
  }, [recentExplorations]);

  const planningExploring = Boolean(exploreLoadingPhase || (planningPanelOpen && !hasScenarioDraft));
  const scenarioTitleLine =
    scenarioWorkingTitle ??
    (hasScenarioDraft
      ? `Preview · ${scenarioKeyCount} lever${scenarioKeyCount === 1 ? "" : "s"} updated`
      : ctxAssumption
        ? `What-if · ${ctxAssumption.label}`
        : null);
  const scenarioStatusLine = exploreLoadingPhase
    ? "Exploring"
    : hasScenarioDraft
      ? "Preview active"
      : planningPanelOpen
        ? "Exploring"
        : scenarioWorkingTitle
          ? "Ready to explore"
          : null;
  const showScenarioIdentity = Boolean(scenarioTitleLine || scenarioStatusLine);

  const handleViewOnDashboard = useCallback(() => {
    if (!hasScenarioDraft) return;
    applyPreviewToDashboard();
    enterPreviewFromScenarios({
      scenarioLabel:
        scenarioTitleLine || `Preview · ${scenarioKeyCount} lever${scenarioKeyCount === 1 ? "" : "s"}`,
    });
    navigate("/app/dashboard");
  }, [
    hasScenarioDraft,
    applyPreviewToDashboard,
    enterPreviewFromScenarios,
    navigate,
    scenarioTitleLine,
    scenarioKeyCount,
  ]);

  return (
    <div className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[80] w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 px-4">
          <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-200/90 bg-white px-4 py-3.5 shadow-lg">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
            <p className="text-[13px] font-medium text-slate-800">{toast}</p>
          </div>
        </div>
      )}

      <SaveScenarioModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveScenario}
      />

      <header className="shrink-0 border-b border-gray-200/80 bg-white/80 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Scenarios</h1>
            <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-slate-500">
              A live surface for alternate futures — preview shifts next to baseline, discuss with AI in context, and
              only commit when you are ready elsewhere. Nothing here overwrites workspace assumptions on its own.
            </p>
          </div>
          <div className="flex w-full max-w-xl flex-col gap-2 lg:max-w-md lg:items-end">
            {hasScenarioDraft && saveScenarioSummary.previewChangeLines.length > 0 ? (
              <div className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 px-3 py-2.5 lg:text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Preview you’ll commit
                </p>
                <p className="mt-2 text-[10px] font-semibold text-slate-600">Preview changes</p>
                <ul className="mt-1 space-y-0.5 text-left text-[11px] leading-snug text-slate-800 tabular-nums lg:text-right">
                  {saveScenarioSummary.previewChangeLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                {saveScenarioSummary.deltaLines.length > 0 ? (
                  <div className="mt-2 border-t border-slate-200/80 pt-2 text-left lg:text-right">
                    <p className="text-[10px] font-semibold text-slate-500">Compared to baseline</p>
                    <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-slate-700">
                      {saveScenarioSummary.deltaLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                type="button"
                disabled={!hasScenarioDraft}
                onClick={handleViewOnDashboard}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#1a3673] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:bg-[#1a3673]/[0.06] disabled:opacity-40"
              >
                <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={2} />
                View on dashboard
              </button>
              <button
                type="button"
                disabled={!hasScenarioDraft}
                onClick={() => setSaveModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a3673] px-4 py-2.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c] disabled:opacity-40"
              >
                Save scenario
              </button>
              <button
                type="button"
                disabled={!hasScenarioDraft}
                onClick={() => handleClearScenarioDraft()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Clear preview
              </button>
            </div>
          </div>
        </div>
      </header>

      {showScenarioIdentity ? (
        <div className="shrink-0 border-b border-slate-200/80 bg-white/90 px-4 py-2 sm:px-6">
          <p className="text-[11px] text-slate-800">
            <span className="text-slate-500">Scenario:</span>{" "}
            <span className="font-medium text-slate-900">{scenarioTitleLine ?? "—"}</span>
          </p>
          {scenarioStatusLine ? (
            <p className="mt-0.5 text-[11px]">
              <span className="text-slate-500">Status:</span>{" "}
              <span
                className={`font-semibold ${
                  planningExploring ? "text-violet-700" : hasScenarioDraft ? "text-[#1a3673]" : "text-slate-700"
                }`}
              >
                {scenarioStatusLine}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {hasScenarioDraft || planningPanelOpen ? (
        <div
          className="shrink-0 border-b border-[#1a3673]/10 bg-gradient-to-r from-[#1a3673]/[0.06] to-slate-50/80 px-4 py-2 sm:px-6"
          role="status"
        >
          <p className="text-[11px] leading-snug text-slate-700">
            <span className="font-semibold text-[#1a3673]">Preview mode</span>
            <span className="mx-2 text-slate-300" aria-hidden>
              ·
            </span>
            <span className="text-slate-600">Not applied yet — baseline unchanged</span>
          </p>
        </div>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/30 to-[#1a3673]/[0.04] px-4 py-4 shadow-sm sm:px-5">
              {!hasScenarioDraft ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 gap-y-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#1a3673] shadow-sm ring-1 ring-[#1a3673]/12">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                        aria-hidden
                      />
                      Live planning workspace
                    </span>
                    <p className="text-[13px] text-slate-600">
                      <span className="font-semibold tabular-nums text-[#1a3673]">{assumptions.length}</span>{" "}
                      baseline assumptions
                      <span className="mx-2 hidden text-slate-300 sm:inline">·</span>
                      <span className="mt-1 block font-medium text-slate-800 sm:mt-0 sm:inline">
                        No preview yet
                      </span>
                    </p>
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
                    Pick a prompt or type your own — contextual AI opens here so you stay in planning. Baseline stays
                    as-is until you apply changes elsewhere.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {WHAT_IF_CHIPS.map((chip) => (
                      <button
                        key={chip.assumptionKey}
                        type="button"
                        onClick={() => onChipFill(chip)}
                        className="rounded-full border border-[#1a3673]/18 bg-white/90 px-3 py-1.5 text-left text-[11px] font-medium text-[#1a3673] shadow-sm transition hover:border-[#1a3673]/28 hover:bg-[#1a3673]/[0.05]"
                      >
                        {chip.teaser}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 gap-y-2">
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200/90">
                        Preview only
                      </span>
                      <p className="text-[13px] text-slate-600">
                        <span className="font-semibold tabular-nums text-[#1a3673]">{scenarioKeyCount}</span> draft
                        change{scenarioKeyCount === 1 ? "" : "s"}
                        <span className="mx-2 text-slate-300">·</span>
                        <span className="font-semibold tabular-nums text-[#1a3673]">{outputsAffected.length}</span>{" "}
                        output{outputsAffected.length === 1 ? "" : "s"} likely affected
                      </p>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500">Not applied to baseline</p>
                  </div>
                  {keyPreviewPills.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {keyPreviewPills.map((p) => (
                        <span
                          key={p.key}
                          title={p.sub}
                          className="max-w-[min(100%,18rem)] truncate rounded-full border border-[#1a3673]/18 bg-white/95 px-3 py-1 text-[11px] font-medium text-[#1a3673] shadow-sm"
                        >
                          {p.text}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </section>

            {!hasScenarioDraft ? (
              <div className="rounded-2xl border border-[#1a3673]/10 bg-gradient-to-b from-white to-slate-50/50 px-5 py-8 shadow-sm sm:px-8 sm:py-10">
                <div className="mx-auto max-w-xl text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1a3673]/[0.08] text-[#1a3673]">
                    <GitBranch className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <p className="mt-5 text-[17px] font-semibold tracking-tight text-slate-900">
                    Start exploring alternate outcomes
                  </p>
                  <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-slate-600">
                    Ask a what-if question or adjust assumptions to see how your business changes — nothing is applied
                    until you choose to commit.
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-slate-600">
                    From{" "}
                    <Link to="/app/data/planning/assumptions" className="font-semibold text-[#1a3673] underline-offset-2 hover:underline">
                      Assumptions
                    </Link>
                    , choose <span className="font-medium text-slate-800">Apply scenario</span> to land a preview in
                    this workspace.
                  </p>
                </div>
                <div ref={exploreRef} className="mx-auto mt-8 max-w-2xl">
                  <ScenarioExploreComposer
                    inputRef={exploreInputRef}
                    value={exploreInput}
                    onChange={setExploreInput}
                    onSubmit={runExploreAfterLoading}
                    placeholder="Ask AI to explore a what-if scenario…"
                    loadingPhase={exploreLoadingPhase}
                  />
                  <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-500">
                    Your preview will appear here — compared side by side with your baseline.
                  </p>
                  <p className="mt-3 text-center text-[11px] text-slate-500">Examples</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {WHAT_IF_CHIPS.map((chip) => (
                      <button
                        key={`inner-${chip.assumptionKey}`}
                        type="button"
                        onClick={() => onChipFill(chip)}
                        className="rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-[#1a3673]/25 hover:text-[#1a3673]"
                      >
                        {chip.teaser}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mx-auto mt-8 flex max-w-md flex-wrap justify-center gap-3 border-t border-slate-200/80 pt-6">
                  <Link
                    to="/app/data/planning/assumptions"
                    className="inline-flex items-center gap-2 rounded-xl border border-[#1a3673]/20 bg-[#1a3673]/[0.06] px-4 py-2.5 text-[12px] font-semibold text-[#1a3673] transition hover:border-[#1a3673]/30"
                  >
                    Open Assumptions
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <ScenarioImpactView
                  series={scenarioSimulation.series}
                  summary={scenarioSimulation.summary}
                  breakdown={scenarioSimulation.breakdown}
                  explanation={scenarioSimulation.explanation}
                  loading={scenarioSimulation.loading}
                  loadingMessage={scenarioSimulation.loadingMessage}
                  originLabel={originLabel}
                  originChatSnippet={scenarioSimulation.originChatSnippet}
                  onDiscuss={firstDraftKey ? () => openDiscuss(firstDraftKey) : undefined}
                />

                <section
                  ref={exploreRef}
                  className="rounded-2xl border border-dashed border-[#1a3673]/20 bg-gradient-to-br from-white to-[#1a3673]/[0.03] p-4 shadow-sm sm:p-5"
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Explore another what-if
                  </h3>
                  <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-slate-500">
                    Stress another lever while this preview stays active — still an alternate planning view, not your
                    baseline.
                  </p>
                  <div className="mt-4">
                    <ScenarioExploreComposer
                      inputRef={exploreInputRef}
                      value={exploreInput}
                      onChange={setExploreInput}
                      onSubmit={runExploreAfterLoading}
                      placeholder="Ask AI to explore a what-if scenario…"
                      loadingPhase={exploreLoadingPhase}
                    />
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      Your preview will appear here — compared side by side with your baseline.
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {WHAT_IF_CHIPS.map((chip) => (
                      <button
                        key={`draft-${chip.assumptionKey}`}
                        type="button"
                        onClick={() => onChipFill(chip)}
                        className="rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-[#1a3673]/25 hover:text-[#1a3673]"
                      >
                        {chip.teaser}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Baseline vs preview
                  </h3>
                  <ul className="mt-3 space-y-4">
                    {comparisonRows.map(({ entry, baseline, baselineDisplay, affects, source, direction }) => (
                      <li
                        key={entry.assumptionKey}
                        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h4 className="text-[15px] font-semibold text-slate-900">{entry.assumptionLabel}</h4>
                          <button
                            type="button"
                            onClick={() => openDiscuss(entry.assumptionKey)}
                            className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#1a3673] hover:underline"
                          >
                            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                            Discuss scenario with AI
                          </button>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Baseline
                            </p>
                            <p className="mt-1 text-[14px] font-semibold tabular-nums text-slate-800">
                              {baselineDisplay}
                            </p>
                          </div>
                          <div className="rounded-xl border border-[#1a3673]/15 bg-[#1a3673]/[0.04] px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a3673]/80">
                              Preview
                            </p>
                            <p className="mt-1 text-[14px] font-semibold tabular-nums text-[#1a3673]">
                              {entry.displayTo}
                            </p>
                          </div>
                        </div>
                        {direction && (
                          <p className="mt-2 text-[11px] font-medium text-slate-500">{direction}</p>
                        )}
                        <p className="mt-2 text-[11px] text-slate-500">{source}</p>
                        {baseline?.usedIn?.length ? (
                          <div className="mt-4 border-t border-slate-100 pt-3">
                            <p className="text-[10px] font-semibold uppercase text-slate-400">Used in</p>
                            <ul className="mt-1.5 space-y-0.5 text-[12px] text-slate-700">
                              {baseline.usedIn.map((ref) => (
                                <li key={ref.id} className="flex gap-2">
                                  <span className="text-slate-300">•</span>
                                  {ref.label}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {affects.length ? (
                          <div className="mt-3">
                            <p className="text-[10px] font-semibold uppercase text-slate-400">Affects</p>
                            <ul className="mt-1.5 space-y-0.5 text-[12px] text-slate-700">
                              {affects.map((line) => (
                                <li key={line} className="flex gap-2">
                                  <span className="text-[#fc7d25]/70">•</span>
                                  {line}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Affected outputs
                  </h3>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Where this preview would flow in today’s model — dashboard figures still reflect baseline until
                    scenario-aware views ship.
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {outputsAffected.map((label) => (
                      <li
                        key={label}
                        className="rounded-full border border-slate-200/90 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700"
                      >
                        {label}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Actions</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => applyPreviewToDashboard()}
                      className="flex flex-col items-start gap-1 rounded-xl border border-[#1a3673]/15 bg-[#1a3673]/[0.04] px-4 py-3 text-left transition hover:border-[#1a3673]/25"
                    >
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-[#1a3673]">
                        <LayoutDashboard className="h-4 w-4" strokeWidth={2} />
                        Apply preview to dashboard
                      </span>
                      <span className="text-[11px] leading-snug text-slate-600">
                        Show a “viewing scenario” indicator on the dashboard. Baseline data stays the same.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveModalOpen(true)}
                      className="flex flex-col items-start gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
                        <Sparkles className="h-4 w-4 text-[#fc7d25]" strokeWidth={2} />
                        Save as custom scenario
                      </span>
                      <span className="text-[11px] leading-snug text-slate-600">
                        Store this draft with a name for this session.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearScenarioDraft()}
                      className="flex flex-col items-start gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
                        <Trash2 className="h-4 w-4 text-slate-500" strokeWidth={2} />
                        Clear preview
                      </span>
                      <span className="text-[11px] leading-snug text-slate-600">
                        Remove all draft overrides. Does not change baseline.
                      </span>
                    </button>
                    {firstDraftKey ? (
                      <button
                        type="button"
                        onClick={() => openDiscuss(firstDraftKey)}
                        className="flex flex-col items-start gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
                          <MessageSquare className="h-4 w-4 text-[#1a3673]" strokeWidth={2} />
                          Discuss scenario with AI
                        </span>
                        <span className="text-[11px] leading-snug text-slate-600">
                          Planning chat in context — you stay on this page.
                        </span>
                      </button>
                    ) : null}
                  </div>
                  {activeDashboardScenario && (
                    <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                      Dashboard is set to:{" "}
                      <span className="font-semibold text-slate-800">{activeDashboardScenario.label}</span>. Clear
                      or change from the dashboard banner.
                    </p>
                  )}
                </section>
              </>
            )}

            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Recent what-if explorations
                </h3>
                <p className="text-[11px] text-slate-400">This session</p>
              </div>
              <p className="mt-1 text-[12px] text-slate-500">
                Latest note per lever (deduplicated) plus session events — less noise, same trail.
              </p>
              {dedupedRecentExplorations.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-6 text-center text-[12px] text-slate-500">
                  Nothing logged yet. Use the{" "}
                  <button type="button" onClick={scrollToExplore} className="font-semibold text-[#1a3673] underline-offset-2 hover:underline">
                    what-if field above
                  </button>{" "}
                  or Assumptions to start.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {dedupedRecentExplorations.map((ex, idx) => {
                    if (!ex || typeof ex !== "object") return null;
                    return (
                    <li
                      key={ex.id ?? `exploration-${idx}`}
                      className="rounded-xl border border-slate-100 bg-slate-50/40 px-4 py-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 gap-y-1">
                            <p className="text-[13px] font-semibold text-slate-900">{ex.label}</p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${explorationStatusStyles(ex?.status)}`}
                            >
                              {explorationStatusLabel(ex?.status)}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-snug text-slate-600">{ex.detail}</p>
                          <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock className="h-3 w-3 shrink-0" strokeWidth={2} />
                            {formatPlanningRelative(ex.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => resumeExploration(ex)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <span className="inline-flex items-center gap-1">
                              <RotateCcw className="h-3 w-3" strokeWidth={2} />
                              Resume
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openExplorationInAi(ex)}
                            className="rounded-lg border border-[#1a3673]/20 bg-[#1a3673]/[0.06] px-2.5 py-1 text-[10px] font-semibold text-[#1a3673] transition hover:bg-[#1a3673]/[0.1]"
                          >
                            Open in AI
                          </button>
                          <button
                            type="button"
                            onClick={trySaveFromExploration}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Save as scenario
                          </button>
                        </div>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {savedScenarios.length > 0 && (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Saved this session
                </h3>
                <p className="mt-1 text-[12px] text-slate-500">
                  Named snapshots of previews. Stored locally until you leave or refresh.
                </p>
                <ul className="mt-4 space-y-3">
                  {savedScenarios
                    .filter((s) => s && typeof s === "object" && s.id && s.snapshot && typeof s.snapshot === "object")
                    .map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-[14px] font-semibold text-slate-900">{s.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {Object.keys(s.snapshot).length} change(s) ·{" "}
                          {new Date(s.createdAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => applySavedScenarioToDashboard(s.id)}
                        className="rounded-lg border border-[#1a3673]/20 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#1a3673] transition hover:bg-[#1a3673]/[0.04]"
                      >
                        Apply to dashboard
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        {ctxChat && ctxAssumption && (
          <>
            <button
              type="button"
              aria-label="Close discussion panel"
              className="absolute inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px] md:hidden"
              onClick={closeContextChat}
            />
            <div className="absolute inset-y-0 right-0 z-50 flex h-full w-[min(22rem,100%)] shadow-[0_0_32px_rgba(15,23,42,0.12)] md:static md:z-auto md:shadow-none">
              <AssumptionContextChatPanel
                open
                assumption={ctxAssumption}
                bootSimulate={ctxChat.simulate}
                resetNonce={ctxChat.nonce}
                seedPrompt={ctxChat.seedPrompt ?? undefined}
                onClose={closeContextChat}
                surface="scenarios"
                bootFromComposer={Boolean(ctxChat.bootFromComposer)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
