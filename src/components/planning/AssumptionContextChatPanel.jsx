import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import AssumptionProposalCard from "../chat/AssumptionProposalCard.jsx";
import {
  CHAT_MESSAGE_TYPE,
  createSystemMessage,
  createTextMessage,
  resolveMessageType,
} from "../chat/chatMessageTypes.js";
import { useAssumptions } from "../../planning/AssumptionsContext.jsx";
import { onUserMessageSent } from "../../planning/planningFromChat.js";
import { PROPOSAL_MODE } from "../../planning/assumptions/types.js";
import { businessAffectsFromOutputs } from "../../planning/assumptions/businessAffects.js";

const PANEL_SESSION_ID = null;

/** Mock numeric ranges for CFO-style quick read (illustrative). */
function quickEstimatedImpact(assumptionKey) {
  switch (assumptionKey) {
    case "hiring":
      return [
        { metric: "Runway", value: "+2–4 mo" },
        { metric: "Revenue (12 mo)", value: "−1.5–2%" },
        { metric: "Burn", value: "−3–6% near term" },
      ];
    case "revenue_growth":
      return [
        { metric: "Runway", value: "+2–3 mo" },
        { metric: "Revenue (12 mo)", value: "+8–12%" },
        { metric: "Burn", value: "unchanged" },
      ];
    case "fx":
      return [
        { metric: "INR reporting", value: "±3–5%" },
        { metric: "USD-denom. costs", value: "inverse to rate" },
        { metric: "Runway", value: "±~0.5–1 mo" },
      ];
    default:
      return [
        { metric: "Linked outputs", value: "recalc on preview" },
        { metric: "Baseline", value: "unchanged until commit" },
      ];
  }
}

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[95%] rounded-2xl rounded-br-md bg-[#1a3673] px-3 py-2 text-[12px] leading-relaxed text-white">
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

function AssistantBubble({ content }) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="flex justify-start">
      <div className="max-w-[100%] rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-3.5 py-2.5 text-[12px] leading-relaxed text-slate-800 shadow-sm">
        <p className="whitespace-pre-wrap">
          {parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <span key={i} className="font-semibold text-slate-900">
                {part.slice(2, -2)}
              </span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </p>
      </div>
    </div>
  );
}

function mockReplyForMessage(text, focusRow, affectsLines) {
  const t = text.toLowerCase();
  if (/\brunway\b/i.test(t)) {
    return `Runway in your model is sensitive to ${focusRow.label.toLowerCase()} because it flows through ${affectsLines.slice(0, 2).join(" and ") || "downstream forecasts"}. A higher growth assumption tends to extend runway if revenue converts to cash; hiring moves usually shorten it.`;
  }
  if (/compare|optimistic|downside|stress/i.test(t)) {
    return `For ${focusRow.label}, suggest a concrete value to get a proposal card. **Apply scenario** saves a preview to your scenario draft; **Apply change** updates the workspace baseline.`;
  }
  if (/reduce|lower|cut/i.test(t)) {
    return `Tell me the new level you want (with a number), or use a quick prompt below. I’ll show a proposal you can apply or cancel.`;
  }
  return `I’m focused on **${focusRow.label}** (**${focusRow.valueDisplay}**). Ask a what‑if, request a change with a number, or use the chips above.`;
}

export default function AssumptionContextChatPanel({
  open,
  assumption,
  onClose,
  bootSimulate = false,
  resetNonce = 0,
  seedPrompt,
  surface,
  bootFromComposer = false,
}) {
  const { assumptions } = useAssumptions();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [entryStreamPhase, setEntryStreamPhase] = useState(
    /** @type {null | 'thinking' | 'evaluating' | 'generating'} */ (null),
  );
  const listRef = useRef(null);
  const sendGuardRef = useRef(false);
  const isScenariosSurface = surface === "scenarios";

  const focusRow = useMemo(() => {
    if (!assumption?.key) return null;
    return assumptions.find((a) => a.key === assumption.key) ?? assumption;
  }, [assumption, assumptions]);

  const affectsLines = useMemo(() => {
    if (!focusRow) return [];
    return focusRow.affects?.length ? focusRow.affects : businessAffectsFromOutputs(focusRow.usedIn);
  }, [focusRow]);

  useEffect(() => {
    if (!open || !focusRow) {
      setMessages([]);
      setInput("");
      return;
    }
    const starter = createTextMessage({
      id: "ctx-starter",
      role: "assistant",
      content: `You’re reviewing the assumption **${focusRow.label} = ${focusRow.valueDisplay}**.\nYou can ask what happens if this changes, compare scenarios, or update it.`,
      created_at: new Date().toISOString(),
    });
    if (bootSimulate) {
      setMessages([
        starter,
        createTextMessage({
          id: "ctx-boot-u",
          role: "user",
          content: "Walk me through a stress case vs base for this assumption.",
          created_at: new Date().toISOString(),
        }),
        createTextMessage({
          id: "ctx-boot-a",
          role: "assistant",
          content: `A common pattern is to hold **${focusRow.label}** at the current **${focusRow.valueDisplay}** as baseline, then preview a downside (for example a what‑if with a lower growth rate, fewer hires, or a weaker FX level). **Apply scenario** saves to your scenario preview only — it does not overwrite the workspace baseline.`,
          created_at: new Date().toISOString(),
        }),
      ]);
    } else {
      setMessages([starter]);
    }
    setInput(typeof seedPrompt === "string" && seedPrompt ? seedPrompt : "");
  }, [open, focusRow?.key, bootSimulate, resetNonce, seedPrompt]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open || !bootFromComposer || !isScenariosSurface) {
      setEntryStreamPhase(null);
      return;
    }
    setEntryStreamPhase("thinking");
    const t1 = window.setTimeout(() => setEntryStreamPhase("evaluating"), 380);
    const t2 = window.setTimeout(() => setEntryStreamPhase("generating"), 760);
    const t3 = window.setTimeout(() => setEntryStreamPhase(null), 1180);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [open, resetNonce, bootFromComposer, isScenariosSurface]);

  const handleSend = useCallback(
    (raw) => {
      const trimmed = (raw ?? input).trim();
      if (!trimmed || !focusRow || sendGuardRef.current) return;
      sendGuardRef.current = true;
      setSending(true);
      setInput("");

      const userMsg = createTextMessage({
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
      });

      const { proposalsToAppend } = onUserMessageSent({
        text: trimmed,
        assumptions,
        sessionId: PANEL_SESSION_ID,
        focusAssumption: focusRow,
        proposalIdPrefix: "ctx-p-",
      });

      const assistantText =
        proposalsToAppend.length === 0 ? mockReplyForMessage(trimmed, focusRow, affectsLines) : null;
      const assistantBubble =
        assistantText &&
        createTextMessage({
          id: `a-${Date.now()}`,
          role: "assistant",
          content: assistantText,
          created_at: new Date().toISOString(),
        });

      setMessages((prev) => {
        const next = [...prev, userMsg];
        for (const p of proposalsToAppend) {
          next.push(p);
        }
        if (assistantBubble) next.push(assistantBubble);
        return next;
      });

      const finishSend = () => {
        sendGuardRef.current = false;
        setSending(false);
      };
      if (isScenariosSurface) {
        window.setTimeout(finishSend, 520);
      } else {
        finishSend();
      }
    },
    [affectsLines, assumptions, focusRow, input, isScenariosSurface],
  );

  const chips = useMemo(() => {
    if (!focusRow) return [];
    const label = focusRow.label;
    if (focusRow.key === "revenue_growth") {
      return [
        { label: "What if this becomes 12%?", text: "What if revenue growth becomes 12%?" },
        { label: "How does this affect runway?", text: "How does this affect runway?" },
        { label: "Reduce this assumption", text: "Reduce revenue growth to 5%" },
        { label: "Compare optimistic vs downside", text: "Compare optimistic vs downside for revenue growth" },
      ];
    }
    if (focusRow.key === "hiring") {
      return [
        { label: "What if this is 5 roles?", text: "What if hiring becomes 5?" },
        { label: "Impact on runway?", text: "How does hiring affect runway?" },
        { label: "Reduce headcount plan", text: "Reduce hiring to 2" },
        { label: "Compare optimistic vs downside", text: "Compare optimistic vs downside for hiring" },
      ];
    }
    if (focusRow.key === "fx") {
      return [
        { label: "What if USD is 88?", text: "What if USD/INR becomes 88?" },
        { label: "Impact on board pack?", text: "How does FX affect the board pack?" },
        { label: "Set a new FX rate", text: "Set FX to 85" },
        { label: "Compare optimistic vs downside", text: "Compare optimistic vs downside for FX" },
      ];
    }
    return [
      { label: `What if ${label} changes?`, text: `What if ${label} changes?` },
      { label: "Impact on outputs?", text: "How does this affect connected outputs?" },
    ];
  }, [focusRow]);

  if (!open || !focusRow) return null;

  const entryStreamLabel =
    entryStreamPhase === "thinking"
      ? "Thinking…"
      : entryStreamPhase === "evaluating"
        ? "Evaluating impact…"
        : entryStreamPhase === "generating"
          ? "Generating preview…"
          : "";

  return (
    <aside
      className="flex h-full min-h-0 w-[min(22rem,100%)] shrink-0 flex-col border-l border-slate-200/90 bg-[#f8fafc]"
      aria-label="Assumption discussion"
    >
      <div className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={`text-[10px] uppercase tracking-[0.14em] ${
                isScenariosSurface ? "font-bold text-[#1a3673]" : "font-semibold text-slate-400"
              }`}
            >
              Discuss assumption
            </p>
            <h2 className="mt-1 truncate text-[15px] font-semibold text-[#1a3673]">{focusRow.label}</h2>
            <p className="mt-0.5 text-[13px] font-medium tabular-nums text-slate-800">{focusRow.valueDisplay}</p>
            {isScenariosSurface ? (
              <p className="mt-2 text-[10px] leading-snug text-slate-500">
                Planning context <span className="text-slate-300">·</span> Scenario preview
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close discussion panel"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mt-3 space-y-2 text-[11px] leading-snug text-slate-600">
          <div>
            <p className="font-semibold text-slate-500">Used in</p>
            <ul className="mt-1 space-y-0.5">
              {focusRow.usedIn.map((ref) => (
                <li key={ref.id} className="flex gap-1.5">
                  <span className="text-slate-300">•</span>
                  <span>{ref.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-500">Affects</p>
            <ul className="mt-1 space-y-0.5">
              {affectsLines.map((line) => (
                <li key={line} className="flex gap-1.5">
                  <span className="text-[#fc7d25]/70">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-slate-200/60 bg-white/60 px-3 py-2.5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Suggestions</p>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={sending}
              onClick={() => {
                setInput(c.text);
                handleSend(c.text);
              }}
              className="rounded-full border border-slate-200/90 bg-white px-2.5 py-1 text-[10px] font-medium text-[#1a3673] shadow-sm transition hover:border-[#1a3673]/25 hover:bg-[#1a3673]/[0.04] disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isScenariosSurface && entryStreamPhase ? (
        <div
          className="shrink-0 border-b border-[#1a3673]/10 bg-[#1a3673]/[0.04] px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <p className="flex items-center gap-2 text-[10px] font-medium text-[#1a3673]">
            <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#1a3673]" />
            {entryStreamLabel}
          </p>
        </div>
      ) : null}

      {isScenariosSurface ? (
        <div className="shrink-0 border-b border-slate-200/70 bg-amber-50/40 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/90">Quick insights</p>
          <p className="mt-1.5 text-[10px] font-semibold text-slate-800">Estimated impact</p>
          <ul className="mt-1 space-y-1 text-[10px] leading-snug text-slate-700">
            {quickEstimatedImpact(focusRow.key).map(({ metric, value }) => (
              <li key={metric} className="flex gap-1.5">
                <span className="shrink-0 text-amber-700/80">•</span>
                <span>
                  <span className="font-medium text-slate-800">{metric}:</span>{" "}
                  <span className="tabular-nums text-slate-900">{value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
        {messages.map((m) => {
          const messageType = resolveMessageType(m);

          if (messageType === CHAT_MESSAGE_TYPE.TEXT) {
            if (m.role === "user") {
              return <UserBubble key={m.id} content={m.content} />;
            }
            return <AssistantBubble key={m.id} content={m.content} />;
          }

          if (messageType === CHAT_MESSAGE_TYPE.SYSTEM) {
            return <AssistantBubble key={m.id} content={m.content} />;
          }

          if (messageType === CHAT_MESSAGE_TYPE.ASSUMPTION_PROPOSAL) {
            const p = m.assumptionProposal;
            const isScenario = p.mode === PROPOSAL_MODE.SCENARIO;
            return (
              <div key={m.id} className="flex justify-start">
                <AssumptionProposalCard
                  embedded
                  proposal={p}
                  onConfirm={() => {
                    setMessages((prev) => [
                      ...prev,
                      createSystemMessage({
                        id: `done-${Date.now()}`,
                        content: isScenario
                          ? `Scenario preview saved (${p.assumptionLabel} → ${p.displayTo}). Baseline unchanged.`
                          : `Done. **${p.assumptionLabel}** updated to **${p.displayTo}**. Forecasts and dashboards refreshed.`,
                        created_at: new Date().toISOString(),
                      }),
                    ]);
                  }}
                  onDismiss={() => {
                    setMessages((prev) => [
                      ...prev,
                      createSystemMessage({
                        id: `skip-${Date.now()}`,
                        content: "Okay — I didn’t change this assumption.",
                        created_at: new Date().toISOString(),
                      }),
                    ]);
                  }}
                />
              </div>
            );
          }

          return null;
        })}
      </div>

      <div className="shrink-0 border-t border-slate-200/80 bg-white px-3 py-3">
        {isScenariosSurface && sending ? (
          <p className="mb-2 flex items-center gap-2 text-[10px] text-slate-500" role="status" aria-live="polite">
            <span className="inline-flex h-1 w-1 shrink-0 animate-pulse rounded-full bg-[#1a3673]/70" />
            Thinking…
          </p>
        ) : null}
        <div className="relative min-w-0">
          <input
            type="text"
            value={input}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about this assumption…"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-2 pl-3 pr-10 text-[12px] text-slate-900 placeholder:text-slate-400 outline-none ring-[#1a3673]/20 focus:border-[#1a3673]/30 focus:bg-white focus:ring-2 disabled:opacity-60"
          />
          <button
            type="button"
            disabled={sending || !input.trim()}
            onClick={() => handleSend()}
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-[#1a3673] transition hover:bg-[#1a3673]/[0.08] disabled:pointer-events-none disabled:opacity-30"
            aria-label="Explore"
          >
            {sending ? (
              <span
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#1a3673]/25 border-t-[#1a3673]"
                aria-hidden
              />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>
        {isScenariosSurface && input.trim() && !sending ? (
          <p className="mt-1.5 text-[10px] text-slate-400">Press Enter to explore</p>
        ) : null}
      </div>
    </aside>
  );
}
