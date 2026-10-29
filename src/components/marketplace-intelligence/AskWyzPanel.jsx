import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, SendHorizontal, Sparkles } from "lucide-react";
import { ASK_WYZ_DISCLOSURE_LIVE, formatInr, formatPct, getSection } from "../../lib/marketplace-intelligence/index.js";

function formatEvidenceValue(value) {
  if (value == null) return "—";
  if (typeof value === "number" && Math.abs(value) <= 2 && Number.isFinite(value) && !Number.isInteger(value)) {
    return formatPct(value);
  }
  if (typeof value === "number") return formatInr(value);
  return String(value);
}

function ContextChips({ context }) {
  if (!context) return null;
  const chips = [
    context.sectionId ? `Section: ${getSection(context.sectionId).label}` : null,
    context.product ? `Product: ${context.product}` : null,
    context.chartId ? `Chart: ${context.chartId}` : null,
    context.dateRange?.start || context.dateRange?.end
      ? `Filter: ${context.dateRange.start || "…"} → ${context.dateRange.end || "…"}`
      : null,
  ].filter(Boolean);

  if (!chips.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[#d5e0f2]"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function modeLabel(turn) {
  if (turn.liveModel || turn.source === "ai") return "Live AI answer";
  if (turn.status === "rate_limited") return "Calculated answer · live temporarily limited";
  return "Calculated answer · live unavailable";
}

function TurnCard({ turn }) {
  const isUser = turn.role === "user";
  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-sm leading-6 ${
        isUser ? "bg-white/10 text-white" : "bg-white text-[#1a3673]"
      }`}
    >
      {!isUser ? (
        <p
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            turn.liveModel ? "text-[#0f7a4a]" : "text-[#c55a12]"
          }`}
        >
          {modeLabel(turn)}
        </p>
      ) : null}
      <p className={`whitespace-pre-wrap ${isUser ? "text-white" : "text-slate-700"}`}>{turn.content}</p>
      {!isUser && turn.evidence?.length ? (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Verified session metrics
          </p>
          <ul className="space-y-1 text-xs text-slate-600">
            {turn.evidence.slice(0, 6).map((item) => (
              <li key={`${item.metricId}-${item.label}`} className="flex justify-between gap-3">
                <span>{item.label}</span>
                <span className="font-semibold text-[#1a3673]">{formatEvidenceValue(item.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!isUser && turn.limitations?.length ? (
        <div className="mt-2 rounded-lg bg-[#fff8f3] px-2 py-1.5 text-[11px] leading-4 text-[#8a4b16]">
          {turn.limitations.slice(0, 3).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      {!isUser && turn.chartRefs?.length ? (
        <p className="mt-2 text-[11px] text-slate-500">See dashboard: {turn.chartRefs.join(", ")}</p>
      ) : null}
    </div>
  );
}

export default function AskWyzPanel({
  sectionId,
  context,
  conversation = [],
  loading = false,
  error = null,
  onAsk,
  expanded = false,
  onToggleExpand,
}) {
  const section = getSection(sectionId);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);
  const submittingRef = useRef(false);
  const latest = conversation[conversation.length - 1];
  const followUps = latest?.followUps || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [conversation.length, loading]);

  const submit = (question) => {
    const text = String(question || draft).trim();
    if (!text || loading || submittingRef.current) return;
    submittingRef.current = true;
    setDraft("");
    Promise.resolve(onAsk?.(text)).finally(() => {
      submittingRef.current = false;
    });
  };

  return (
    <aside
      className={`rounded-[1.35rem] border border-[rgba(26,54,115,0.12)] bg-[#10244f] p-5 text-white shadow-[0_18px_40px_rgba(16,36,79,0.18)] ${
        expanded ? "lg:min-h-[32rem]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} aria-hidden />
          <h2 className="text-base font-semibold">Ask WYZ</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#fc7c23]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ffd2ad]">
            <Sparkles size={10} aria-hidden />
            Live capable
          </span>
        </div>
        {onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-[11px] font-semibold text-[#d5e0f2] underline-offset-2 hover:underline"
          >
            {expanded ? "Compact" : "Expand"}
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-5 text-[#d5e0f2]">{ASK_WYZ_DISCLOSURE_LIVE}</p>
      <ContextChips context={context} />

      <div className={`mt-4 space-y-2 overflow-y-auto pr-1 ${expanded ? "max-h-[28rem]" : "max-h-64"}`}>
        {conversation.length === 0 ? (
          <p className="text-sm text-[#9eb0d0]">
            Ask a question or pick a suggestion. Numbers always come from this session’s calculations.
          </p>
        ) : (
          conversation.map((turn) => <TurnCard key={turn.id} turn={turn} />)
        )}
        {loading ? (
          <p className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-[#d5e0f2]">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            Reviewing verified metrics…
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-[#5c1d1d]/80 px-3 py-2 text-xs text-[#ffd0d0]" role="alert">
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {followUps.length ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#fcb07a]">Follow up</p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {followUps.slice(0, 3).map((question) => (
              <button
                key={question}
                type="button"
                disabled={loading}
                onClick={() => submit(question)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-xs leading-5 text-white hover:bg-white/10 disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[#fcb07a]">
        Suggested for {section.label}
      </p>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {section.questions.slice(0, expanded ? 5 : 3).map((question) => (
          <button
            key={question}
            type="button"
            disabled={loading}
            onClick={() => submit(question)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs leading-5 text-white transition-colors hover:bg-white/10 disabled:opacity-50 sm:text-sm"
          >
            {question}
          </button>
        ))}
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <label className="sr-only" htmlFor="marketplace-ask-input">
          Ask WYZ
        </label>
        <textarea
          id="marketplace-ask-input"
          rows={2}
          value={draft}
          disabled={loading}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
          placeholder="Ask about sales, fees, products, or settlement…"
          className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-white/15 bg-[#0c1c3f] px-3 py-2 text-sm text-white placeholder:text-[#7f93b8] focus:border-[#fc7c23] focus:outline-none disabled:opacity-60"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fc7c23] text-white transition-opacity disabled:opacity-40"
          aria-label="Send question"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
        </button>
      </form>
    </aside>
  );
}
