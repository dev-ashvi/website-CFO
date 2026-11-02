import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Maximize2, MessageSquare, Minimize2, SendHorizontal, Sparkles, X } from "lucide-react";
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
  if (turn.liveRejected) return "Calculated answer · live narration rejected";
  if (turn.liveModel || turn.source === "ai") return "Live AI explanation";
  if (turn.status === "rate_limited") return "Calculated answer · live temporarily limited";
  if (turn.status === "provider_error" || turn.status === "network_error") {
    return "Calculated answer · live unavailable";
  }
  return "Calculated answer · live unavailable";
}

function TurnCard({ turn, spacious = false }) {
  const isUser = turn.role === "user";
  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-sm leading-6 ${
        isUser ? "ml-6 bg-white/10 text-white" : "mr-2 bg-white text-[#1a3673]"
      } ${spacious ? "px-4 py-3" : ""}`}
    >
      {!isUser ? (
        <p
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            turn.liveModel ? "text-[#0f7a4a]" : "text-[#c55a12]"
          }`}
        >
          {modeLabel(turn)}
        </p>
      ) : (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9eb0d0]">You</p>
      )}
      <p className={`mt-1 whitespace-pre-wrap ${isUser ? "text-white" : "text-slate-700"}`}>{turn.content}</p>
      {!isUser && turn.evidence?.length ? (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Verified session metrics (INR)
          </p>
          <ul className="space-y-1 text-xs text-slate-600">
            {turn.evidence.slice(0, spacious ? 10 : 6).map((item) => (
              <li key={`${item.metricId}-${item.label}`} className="flex justify-between gap-3">
                <span>{item.label}</span>
                <span className="font-semibold tabular-nums text-[#1a3673]">{formatEvidenceValue(item.value)}</span>
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

function LoadingState({ phase }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-[#d5e0f2]" aria-live="polite">
      <p className="inline-flex items-center gap-2 font-medium">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        {phase || "Reviewing verified metrics…"}
      </p>
      <p className="mt-1 text-[11px] text-[#9eb0d0]">Using session calculations — not a live progress percentage.</p>
    </div>
  );
}

function AskComposer({ draft, setDraft, loading, onSubmit, inputId, spacious = false }) {
  return (
    <form
      className="mt-4 flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        Ask WYZ
      </label>
      <textarea
        id={inputId}
        rows={spacious ? 3 : 2}
        value={draft}
        disabled={loading}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit(draft);
          }
        }}
        placeholder="Ask about Gross Product Sales, Orders, fees, or settlement…"
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
  );
}

function PanelBody({
  section,
  context,
  conversation,
  loading,
  loadingPhase,
  error,
  followUps,
  draft,
  setDraft,
  submit,
  inputId,
  spacious = false,
  bottomRef,
}) {
  return (
    <>
      <p className={`${spacious ? "text-sm" : "text-xs"} leading-5 text-[#d5e0f2]`}>{ASK_WYZ_DISCLOSURE_LIVE}</p>
      <ContextChips context={context} />

      <div
        className={`mt-4 space-y-2 overflow-y-auto pr-1 ${
          spacious ? "min-h-[14rem] flex-1 max-h-none" : "max-h-64"
        }`}
        role="log"
        aria-relevant="additions"
      >
        {conversation.length === 0 ? (
          <p className="text-sm text-[#9eb0d0]">
            Ask a question or pick a suggestion. Numbers always come from this session’s calculations in Indian rupees
            (₹).
          </p>
        ) : (
          conversation.map((turn) => <TurnCard key={turn.id} turn={turn} spacious={spacious} />)
        )}
        {loading ? <LoadingState phase={loadingPhase} /> : null}
        {error ? (
          <p className="rounded-lg bg-[#5c1d1d]/80 px-3 py-2 text-xs text-[#ffd0d0]" role="alert">
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {followUps.length ? (
        <div className="mt-3 shrink-0">
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

      <p className="mt-4 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#fcb07a]">
        Suggested for {section.label}
      </p>
      <div className="mt-1.5 flex shrink-0 flex-col gap-1.5">
        {section.questions.slice(0, spacious ? 6 : 3).map((question) => (
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

      <div className="shrink-0">
        <AskComposer
          draft={draft}
          setDraft={setDraft}
          loading={loading}
          onSubmit={submit}
          inputId={inputId}
          spacious={spacious}
        />
      </div>
    </>
  );
}

export default function AskWyzPanel({
  sectionId,
  context,
  conversation = [],
  loading = false,
  loadingPhase = null,
  error = null,
  onAsk,
  expanded = false,
  onToggleExpand,
}) {
  const section = getSection(sectionId);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);
  const submittingRef = useRef(false);
  const closeRef = useRef(null);
  const titleId = useId();
  const compactInputId = useId();
  const drawerInputId = useId();
  const latest = conversation[conversation.length - 1];
  const followUps = latest?.followUps || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [conversation.length, loading, expanded]);

  useEffect(() => {
    if (!expanded) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus?.();
    const onKey = (event) => {
      if (event.key === "Escape") onToggleExpand?.();
    };
    document.addEventListener("keydown", onKey);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow;
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [expanded, onToggleExpand]);

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
    <>
      <aside className="rounded-[1.35rem] border border-[rgba(26,54,115,0.12)] bg-[#10244f] p-5 text-white shadow-[0_18px_40px_rgba(16,36,79,0.18)]">
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
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-[11px] font-semibold text-[#d5e0f2] hover:bg-white/5"
              aria-expanded={expanded}
            >
              <Maximize2 size={12} aria-hidden />
              Expand
            </button>
          ) : null}
        </div>

        <PanelBody
          section={section}
          context={context}
          conversation={conversation}
          loading={loading}
          loadingPhase={loadingPhase}
          error={error}
          followUps={followUps}
          draft={draft}
          setDraft={setDraft}
          submit={submit}
          inputId={compactInputId}
          bottomRef={bottomRef}
        />
      </aside>

      {expanded ? (
        <div className="fixed inset-0 z-[80] flex justify-end" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-[#0b1733]/55 backdrop-blur-[1px]"
            aria-label="Close investigation workspace"
            onClick={onToggleExpand}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex h-full w-full max-w-3xl flex-col bg-[#10244f] text-white shadow-[-18px_0_50px_rgba(8,18,40,0.45)] sm:max-w-2xl lg:max-w-3xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <MessageSquare size={18} aria-hidden />
                  <h2 id={titleId} className="text-lg font-semibold">
                    Ask WYZ investigation
                  </h2>
                </div>
                <p className="mt-1 text-xs text-[#9eb0d0]">
                  Wider reading view · verified metrics stay separate from AI explanation · INR only
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-[#d5e0f2] hover:bg-white/5"
                >
                  <Minimize2 size={12} aria-hidden />
                  Compact
                </button>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onToggleExpand}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-white hover:bg-white/5"
                  aria-label="Close Ask WYZ workspace"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
              <PanelBody
                section={section}
                context={context}
                conversation={conversation}
                loading={loading}
                loadingPhase={loadingPhase}
                error={error}
                followUps={followUps}
                draft={draft}
                setDraft={setDraft}
                submit={submit}
                inputId={drawerInputId}
                spacious
                bottomRef={bottomRef}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
