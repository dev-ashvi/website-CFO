import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { usePlanningAI } from "../../planning/PlanningAIContext.jsx";

function BulletMini({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {items.map((x) => (
        <li key={x} className="flex gap-1.5 text-[11px] leading-snug text-slate-600">
          <span className="text-[#1a3673]/60">•</span>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

function mockReply(type, userText, data) {
  const t = (userText || "").trim().toLowerCase();
  if (!t) return null;
  if (/runway|cash|burn/i.test(t)) {
    return "In this planning workspace I focus on how your inputs flow into runway and liquidity — compare the model outputs above with your latest bank and collections data before acting.";
  }
  if (/risk|downside/i.test(t)) {
    return "A useful next step is to stress this view against a downside case (slower revenue or steady burn) and compare side by side with baseline.";
  }
  if (type === "model") {
    return `I’m anchored on **${data?.name ?? "this model"}**. Ask how it connects to dashboards, what assumptions move it most, or what to validate with finance ops.`;
  }
  if (type === "plan") {
    if (data?.isGenerateFlow) {
      return "Describe the outcome, timeline, and any guardrails. I’ll outline **actions**, **linked assumptions**, and **scenarios** in the same style as your existing plans (demo).";
    }
    return `I’m focused on **${data?.title ?? "this plan"}**. We can sharpen actions, sequencing, or how it ties to your assumptions and scenarios — all without leaving Planning.`;
  }
  if (type === "insight") {
    return `I’m anchored on **${data?.title ?? "this insight"}**. Ask how it connects to scenarios, board narrative, or converting to a plan — we stay in Planning.`;
  }
  return "I’m here in context of your planning workspace. Ask a focused question and I’ll keep answers tied to what you’re viewing.";
}

export default function PlanningAIPanel() {
  const { isOpen, contextType, contextData, closeAI } = usePlanningAI();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInput("");
      setMessages([]);
      setSending(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const header = useMemo(() => {
    if (!contextType || !contextData) return { title: "Planning assistant", subtitle: "" };
    if (contextType === "model") {
      return { title: "Model discussion", subtitle: contextData.name ?? "Model" };
    }
    if (contextType === "plan") {
      if (contextData.isGenerateFlow) {
        return { title: "Generate a plan", subtitle: "Planning workspace" };
      }
      return { title: "Plan discussion", subtitle: contextData.title ?? "Plan" };
    }
    if (contextType === "insight") {
      return { title: "Insight discussion", subtitle: contextData.title ?? "Insight" };
    }
    return {
      title: "Scenario discussion",
      subtitle: contextData.scenarioLabel ?? contextData.title ?? "Scenario",
    };
  }, [contextType, contextData]);

  const placeholder = useMemo(() => {
    if (contextType === "model") return "Ask about this model…";
    if (contextType === "plan" && contextData?.isGenerateFlow) return "Describe the plan you want…";
    if (contextType === "plan") return "Ask about this plan…";
    if (contextType === "insight") return "Ask about this insight…";
    if (contextType === "scenario") return "Ask about this scenario…";
    return "Ask a question…";
  }, [contextType, contextData]);

  const contextualBlock = useMemo(() => {
    if (!contextData || !contextType) return null;
    if (contextType === "model") {
      return (
        <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-700">Context</p>
          <p className="mt-1">{contextData.description}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Inputs</p>
              <BulletMini items={contextData.inputs} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Assumptions</p>
              <BulletMini items={contextData.assumptions} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Outputs</p>
              <BulletMini items={contextData.outputs} />
            </div>
          </div>
        </div>
      );
    }
    if (contextType === "plan") {
      if (contextData.isGenerateFlow) {
        return (
          <div className="rounded-xl border border-[#1a3673]/15 bg-[#1a3673]/[0.04] px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
            <p className="font-semibold text-[#1a3673]">Suggest a direction</p>
            <p className="mt-1">
              Describe the outcome you want (e.g. runway extension, cost takeout, collections). I’ll stay in Planning and
              frame a draft plan outline you can refine — no jump to generic chat.
            </p>
          </div>
        );
      }
      return (
        <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-700">Objective</p>
          <p className="mt-1">{contextData.objective}</p>
          <p className="mt-2 font-semibold text-emerald-900/90">Expected impact</p>
          <p className="mt-0.5 text-emerald-950">{contextData.expectedImpact}</p>
          <div className="mt-2 space-y-1 text-[11px]">
            <p>
              <span className="font-semibold text-slate-500">Assumptions · </span>
              {contextData.linkedAssumptions?.join(" · ")}
            </p>
            <p>
              <span className="font-semibold text-slate-500">Scenarios · </span>
              {contextData.linkedScenarios?.join(" · ")}
            </p>
            <p>
              <span className="font-semibold text-slate-500">Models · </span>
              {contextData.linkedModels?.join(" · ")}
            </p>
          </div>
        </div>
      );
    }
    if (contextType === "insight") {
      return (
        <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-700">Summary</p>
          <p className="mt-1">{contextData.description}</p>
          {contextData.whyItMatters ? (
            <>
              <p className="mt-2 font-semibold text-slate-700">Why it matters</p>
              <p className="mt-0.5">{contextData.whyItMatters}</p>
            </>
          ) : null}
          <div className="mt-2 space-y-1.5">
            {contextData.linkedAssumptions?.length ? (
              <p>
                <span className="font-semibold text-slate-500">Assumptions · </span>
                {contextData.linkedAssumptions.join(" · ")}
              </p>
            ) : null}
            {contextData.linkedScenarios?.length ? (
              <p>
                <span className="font-semibold text-slate-500">Scenarios · </span>
                {contextData.linkedScenarios.join(" · ")}
              </p>
            ) : null}
            {contextData.linkedModels?.length ? (
              <p>
                <span className="font-semibold text-slate-500">Models · </span>
                {contextData.linkedModels.join(" · ")}
              </p>
            ) : null}
          </div>
          {contextData.suggestedNextStep ? (
            <p className="mt-2 border-t border-slate-200/80 pt-2 text-[10px] text-slate-500">
              <span className="font-semibold text-slate-600">Suggested next step · </span>
              {contextData.suggestedNextStep}
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Preview context</p>
        <p className="mt-1">{contextData.summaryLine ?? "Explore this scenario while staying in Planning."}</p>
      </div>
    );
  }, [contextType, contextData]);

  const send = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || sending || !contextType || !contextData) return;
    setSending(true);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed, id: `u-${Date.now()}` }]);
    window.setTimeout(() => {
      const reply = mockReply(contextType, trimmed, contextData);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: reply ?? "Thanks — I’ll keep answers tied to this planning context (demo).",
          id: `a-${Date.now()}`,
        },
      ]);
      setSending(false);
    }, 420);
  }, [input, sending, contextType, contextData]);

  if (!isOpen || !contextType || !contextData) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[85] bg-slate-900/20 backdrop-blur-[1px]"
        aria-label="Close planning assistant"
        onClick={closeAI}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[90] flex w-[min(100%,22rem)] flex-col border-l border-slate-200/90 bg-white shadow-[0_0_40px_rgba(15,23,42,0.12)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-ai-title"
      >
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-[#1a3673]/[0.06] to-white px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-[#fc7d25]" strokeWidth={2} />
                <p id="planning-ai-title" className="text-[11px] font-bold uppercase tracking-wide text-[#1a3673]">
                  {header.title}
                </p>
              </div>
              <p className="mt-1 truncate text-[14px] font-semibold text-slate-900">{header.subtitle}</p>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                Planning-aware assistant — stays on this page. Not connected to live model runs (demo).
              </p>
            </div>
            <button
              type="button"
              onClick={closeAI}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/80 hover:text-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {contextualBlock}
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Conversation</p>
          <div ref={listRef} className="mt-2 max-h-[40vh] space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-2">
            {messages.length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-slate-500">Ask anything relevant to the context above.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                    m.role === "user"
                      ? "ml-4 bg-[#1a3673] text-white"
                      : "mr-2 border border-slate-200/80 bg-white text-slate-800 shadow-sm"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <p className="whitespace-pre-wrap [&_strong]:font-semibold">{formatBoldish(m.content)}</p>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              ))
            )}
            {sending ? (
              <p className="px-2 py-1 text-[10px] text-slate-400">Thinking…</p>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-3">
          <div className="relative">
            <input
              type="text"
              value={input}
              disabled={sending}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-2.5 pl-3 pr-10 text-[12px] text-slate-900 outline-none ring-[#1a3673]/15 focus:border-[#1a3673]/25 focus:bg-white focus:ring-2 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={sending || !input.trim()}
              onClick={send}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-[#1a3673] transition hover:bg-[#1a3673]/[0.08] disabled:opacity-30"
              aria-label="Send"
            >
              {sending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a3673]/25 border-t-[#1a3673]" />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function formatBoldish(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
