import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  Pencil,
  PenLine,
  Plus,
  Sparkles,
} from "lucide-react";
import PlanningAssumptionDrawer from "../../components/planning/PlanningAssumptionDrawer.jsx";
import AssumptionContextChatPanel from "../../components/planning/AssumptionContextChatPanel.jsx";
import { useAssumptions } from "../../planning/AssumptionsContext.jsx";
import { useScenarioDraft } from "../../planning/ScenarioDraftContext.jsx";
import { businessAffectsFromOutputs } from "../../planning/assumptions/businessAffects.js";
import { formatPlanningRelative } from "../../planning/formatPlanningRelative.js";
import { ASSUMPTION_SOURCE } from "../../planning/assumptions/types.js";

const RECENT_MS = 2 * 60 * 1000;

function isRecentlyUpdated(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < RECENT_MS;
}

function cardBadges(a, recent) {
  const items = [];
  if (!a.lastUpdatedAt) {
    items.push({ key: "base", label: "Base", className: "bg-slate-100 text-slate-600 ring-slate-200/80" });
  } else if (a.source === ASSUMPTION_SOURCE.CHAT) {
    items.push({
      key: "chat",
      label: "Chat-updated",
      className: "bg-[#1a3673]/10 text-[#1a3673] ring-[#1a3673]/20",
    });
  } else {
    items.push({
      key: "manual",
      label: "Updated",
      className: "bg-amber-50 text-amber-900 ring-amber-200/70",
    });
  }
  if (recent && a.lastUpdatedAt) {
    items.push({
      key: "recent",
      label: "Active change",
      className: "bg-[#fc7d25]/12 text-[#b45309] ring-[#fc7d25]/25",
    });
  }
  return items;
}

function affectsForCard(a) {
  return a.affects?.length ? a.affects : businessAffectsFromOutputs(a.usedIn);
}

export default function PlanningAssumptionsPage() {
  const { assumptions, applyAssumptionUpdate, addAssumption } = useAssumptions();
  const { hasScenarioDraft, scenarioKeyCount, clearScenarioDraft } = useScenarioDraft();
  const [panel, setPanel] = useState(null);
  const [ctxChat, setCtxChat] = useState(null);
  const [toast, setToast] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const initializedRef = useRef(false);
  const prevUpdatedRef = useRef({});
  const flashTimeoutRef = useRef(null);

  const summary = useMemo(() => {
    const active = assumptions.length;
    const recentN = assumptions.filter((a) => isRecentlyUpdated(a.lastUpdatedAt)).length;
    const outIds = new Set();
    assumptions.forEach((a) => a.usedIn.forEach((r) => outIds.add(r.id)));
    return { active, recentN, outputs: outIds.size };
  }, [assumptions]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!initializedRef.current) {
      assumptions.forEach((a) => {
        prevUpdatedRef.current[a.id] = a.lastUpdatedAt;
      });
      initializedRef.current = true;
      return;
    }

    let changed = null;
    for (const a of assumptions) {
      const prev = prevUpdatedRef.current[a.id];
      if (a.lastUpdatedAt && prev !== a.lastUpdatedAt) {
        changed = { assumption: a, isNew: prev === undefined };
      }
      prevUpdatedRef.current[a.id] = a.lastUpdatedAt;
    }

    if (changed) {
      const { assumption: row, isNew } = changed;
      setToast(isNew ? "New planning input added." : `${row.label} updated. Forecasts refreshed.`);
      setFlashId(row.id);
      if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = window.setTimeout(() => {
        setFlashId(null);
        flashTimeoutRef.current = null;
      }, 2800);
    }
  }, [assumptions]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }
    };
  }, []);

  const openEdit = (a) => setPanel({ mode: "edit", assumption: a });
  const openAdd = () => setPanel({ mode: "add", initialAddMode: "manual" });
  const openAddWithAi = () => setPanel({ mode: "add", initialAddMode: "ai" });
  const closePanel = () => setPanel(null);

  const openContextDiscuss = (a, seedPrompt = null) => {
    setCtxChat((prev) => ({
      key: a.key,
      simulate: false,
      seedPrompt,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  const openContextSimulate = (a) => {
    setCtxChat((prev) => ({
      key: a.key,
      simulate: true,
      seedPrompt: null,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  const closeContextChat = () => setCtxChat(null);

  const ctxAssumption = useMemo(
    () => (ctxChat ? assumptions.find((x) => x.key === ctxChat.key) ?? null : null),
    [assumptions, ctxChat],
  );

  useEffect(() => {
    if (ctxChat && !ctxAssumption) setCtxChat(null);
  }, [ctxChat, ctxAssumption]);

  const cardQuickChips = (a) => {
    if (a.key === "revenue_growth") {
      return [
        {
          label: "What if 12%?",
          onClick: () => openContextDiscuss(a, "What if revenue growth becomes 12%?"),
        },
        {
          label: "Runway impact?",
          onClick: () => openContextDiscuss(a, "How does this affect runway?"),
        },
      ];
    }
    if (a.key === "hiring") {
      return [
        {
          label: "What if 5 roles?",
          onClick: () => openContextDiscuss(a, "What if hiring becomes 5?"),
        },
        {
          label: "Runway impact?",
          onClick: () => openContextDiscuss(a, "How does hiring affect runway?"),
        },
      ];
    }
    if (a.key === "fx") {
      return [
        {
          label: "What if 88?",
          onClick: () => openContextDiscuss(a, "What if USD/INR becomes 88?"),
        },
        {
          label: "Board impact?",
          onClick: () => openContextDiscuss(a, "How does FX affect the board pack?"),
        },
      ];
    }
    return [{ label: "Discuss with AI", onClick: () => openContextDiscuss(a) }];
  };

  const handleCommitEdit = (parsed) => {
    if (!panel || panel.mode !== "edit") return;
    applyAssumptionUpdate({
      assumptionKey: panel.assumption.key,
      proposedValue: parsed.value,
      valueDisplay: parsed.valueDisplay,
      source: ASSUMPTION_SOURCE.MANUAL,
      chatSessionId: null,
      relatedUserMessage: null,
      changeReason: "Updated manually",
    });
  };

  const handleCommitAdd = (payload) => {
    addAssumption(payload);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[80] w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 px-4">
          <div
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-200/90 bg-white px-4 py-3.5 shadow-lg shadow-slate-900/10"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
            <p className="text-[13px] font-medium leading-snug text-slate-800">{toast}</p>
          </div>
        </div>
      )}

      <header className="shrink-0 border-b border-gray-200/80 bg-white/80 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#1a3673] sm:text-xl">Assumptions</h1>
            <p className="mt-0.5 max-w-2xl text-[12px] text-slate-500">
              Your planning baseline — connected to chat, dashboards, and board-ready outputs.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddWithAi}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#1a3673]/20 bg-[#1a3673]/[0.06] px-4 py-2.5 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:border-[#1a3673]/30 hover:bg-[#1a3673]/10"
          >
            <Sparkles className="h-4 w-4 text-[#fc7d25]" strokeWidth={2} />
            Create with AI
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-5">
          {hasScenarioDraft && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-[12px] text-amber-950 shadow-sm"
              role="status"
            >
              <p>
                <span className="font-semibold">Scenario preview active</span>
                {" — "}
                {scenarioKeyCount} override{scenarioKeyCount === 1 ? "" : "s"}. Baseline assumptions are unchanged.
              </p>
              <button
                type="button"
                onClick={clearScenarioDraft}
                className="shrink-0 rounded-lg border border-amber-300/80 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100/70"
              >
                Clear preview
              </button>
            </div>
          )}
          <section className="rounded-2xl border border-[#1a3673]/10 bg-gradient-to-br from-[#1a3673]/[0.05] to-white px-4 py-4 shadow-sm sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#fc7d25]" strokeWidth={2} />
                <span className="text-[13px] text-slate-600">
                  <span className="font-semibold tabular-nums text-[#1a3673]">{summary.active}</span> active assumptions
                </span>
              </div>
              <div className="h-4 w-px bg-slate-200/90 max-sm:hidden" aria-hidden />
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-[#1a3673]/70" strokeWidth={2} />
                <span className="text-[13px] text-slate-600">
                  <span className="font-semibold tabular-nums text-[#1a3673]">{summary.recentN}</span> updated recently
                </span>
              </div>
              <div className="h-4 w-px bg-slate-200/90 max-sm:hidden" aria-hidden />
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-slate-600">
                  Used across dashboards & reports:{" "}
                  <span className="font-semibold tabular-nums text-[#1a3673]">{summary.outputs}</span> outputs
                </span>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              These baseline inputs drive planning outputs across your workspace.
            </p>
          </section>

          {assumptions.map((a) => {
            const recent = isRecentlyUpdated(a.lastUpdatedAt);
            const flashing = flashId === a.id;
            const badges = cardBadges(a, recent);
            const affects = affectsForCard(a);

            const chatActive = ctxChat?.key === a.key;

            return (
              <article
                key={a.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition-[box-shadow,background-color,border-color] duration-500 ${
                  flashing
                    ? "border-[#fc7d25]/50 bg-[#fff8f4] shadow-[0_0_0_1px_rgba(252,125,37,0.25)]"
                    : chatActive
                      ? "border-[#1a3673]/25 ring-2 ring-[#1a3673]/10"
                      : "border-gray-100"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-[16px] font-semibold text-slate-900">
                          <span className="text-[#1a3673]">{a.label}</span>
                          <span className="text-slate-400"> · </span>
                          <span className="tabular-nums text-slate-900">{a.valueDisplay}</span>
                        </h2>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {badges.map((b) => (
                            <span
                              key={b.key}
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${b.className}`}
                            >
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        <button
                          type="button"
                          onClick={() => openEdit(a)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:border-[#1a3673]/20 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openContextDiscuss(a)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#1a3673]/15 bg-[#1a3673]/[0.04] px-3 py-2 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:border-[#1a3673]/25 hover:bg-[#1a3673]/[0.07]"
                        >
                          <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                          Discuss with AI
                        </button>
                        <button
                          type="button"
                          onClick={() => openContextSimulate(a)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <FlaskConical className="h-3.5 w-3.5" strokeWidth={2} />
                          Simulate
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {cardQuickChips(a).map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={c.onClick}
                          className="rounded-full border border-slate-200/90 bg-white px-2.5 py-1 text-[10px] font-medium text-[#1a3673]/90 shadow-sm transition hover:border-[#1a3673]/20 hover:bg-slate-50"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 space-y-2 rounded-xl border border-slate-100/90 bg-slate-50/60 px-3.5 py-3">
                      {!a.lastUpdatedAt ? (
                        <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-slate-600">
                          <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200/80">
                            Baseline
                          </span>
                          <span className="text-slate-600">Default baseline assumption — not yet changed in this workspace.</span>
                        </p>
                      ) : (
                        <p className="flex flex-wrap items-center gap-x-1 text-[12px] text-slate-600">
                          {a.source === ASSUMPTION_SOURCE.CHAT ? (
                            <>
                              <MessageSquare className="inline h-3.5 w-3.5 shrink-0 text-[#1a3673]/70" strokeWidth={2} />
                              <span className="font-medium text-slate-800">Updated via chat</span>
                            </>
                          ) : (
                            <>
                              <PenLine className="inline h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} />
                              <span className="font-medium text-slate-800">Updated manually</span>
                            </>
                          )}
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-500">{formatPlanningRelative(a.lastUpdatedAt)}</span>
                        </p>
                      )}

                      {a.source === ASSUMPTION_SOURCE.CHAT && a.chatSessionId && (
                        <p className="text-[11px] text-slate-500">
                          Conversation{" "}
                          <span className="font-mono text-slate-600">{String(a.chatSessionId).slice(0, 10)}…</span>
                        </p>
                      )}

                      {a.relatedUserMessage && (
                        <p className="text-[12px] leading-relaxed text-slate-700">
                          <span className="font-semibold text-slate-500">From:</span>{" "}
                          <span className="text-slate-900">“{a.relatedUserMessage}”</span>
                        </p>
                      )}

                      {a.note && (
                        <p className="border-t border-slate-200/80 pt-2 text-[12px] leading-relaxed text-slate-600">
                          <span className="font-semibold text-slate-500">Note:</span> {a.note}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Used in</p>
                        <ul className="mt-2 space-y-1 text-[13px] text-slate-700">
                          {a.usedIn.map((ref) => (
                            <li key={ref.id} className="flex gap-2">
                              <span className="text-slate-300">•</span>
                              <span>{ref.label}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Affects</p>
                        <ul className="mt-2 space-y-1 text-[13px] text-slate-700">
                          {affects.map((line) => (
                            <li key={line} className="flex gap-2">
                              <span className="text-[#fc7d25]/70">•</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          <button
            type="button"
            onClick={openAdd}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300/90 bg-white/60 py-4 text-[13px] font-semibold text-[#1a3673] transition hover:border-[#1a3673]/35 hover:bg-[#1a3673]/[0.04]"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            + Add assumption
          </button>
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
              />
            </div>
          </>
        )}
      </div>

      <PlanningAssumptionDrawer
        open={panel != null}
        mode={panel?.mode ?? "edit"}
        assumption={panel?.mode === "edit" ? panel.assumption : undefined}
        initialAddMode={panel?.mode === "add" ? panel.initialAddMode ?? "manual" : "manual"}
        onClose={closePanel}
        onCommitEdit={handleCommitEdit}
        onCommitAdd={handleCommitAdd}
      />
    </div>
  );
}
