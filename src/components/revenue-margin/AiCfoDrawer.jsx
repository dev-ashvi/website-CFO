import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Info, MessageSquare, X } from "lucide-react";
import { askAiCfo, trackStrategicDecision } from "../../api/revenueMargin.js";
import { filtersToQueryFilters, formatScopeViewLabel } from "../../lib/revenue-margin/filters.js";
import { buildAnalyticalContext, suggestedAiQuestions } from "../../lib/revenue-margin/analyticalContext.js";
import { activeFilterChips } from "../../lib/revenue-margin/filters.js";
import { presentEvidenceList } from "../../lib/revenue-margin/evidencePresenter.js";
import {
  isTemporalEvidenceItem,
  presentComparison,
  presentTemporalEvidenceList,
} from "../../lib/revenue-margin/temporalEvidencePresenter.js";
import {
  isScenarioAnswer,
  presentScenarioEvidenceList,
} from "../../lib/revenue-margin/scenarioEvidencePresenter.js";

function TemporalEvidenceBlock({ answer, evidence }) {
  const rows = presentTemporalEvidenceList(evidence);
  const comparison = presentComparison(answer);
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      {comparison && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Compared: <span className="font-medium normal-case tracking-normal text-slate-700">{comparison}</span>
        </p>
      )}
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.evidenceId || row.metric} className="text-[12px] text-slate-700">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 shrink font-medium text-slate-800">{row.label}</span>
              <span className="max-w-[58%] shrink-0 text-right tabular-nums text-slate-900">
                {row.formattedRange}
              </span>
            </div>
            {row.formattedDelta && (
              <p
                className={`mt-0.5 text-right text-[11px] tabular-nums ${
                  String(row.formattedDelta).startsWith("-") ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {row.formattedDelta}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioEvidenceBlock({ answer, evidence }) {
  const rows = presentScenarioEvidenceList(evidence);
  if (!rows.length) return null;
  const leverLabel =
    answer?.scenario_result?.spec?.changes
      ?.map((change) => {
        const lever = String(change.lever || "").replace(/_/g, " ");
        if (change.operation === "PERCENT_CHANGE" && change.value != null) {
          const n = Number(change.value);
          const sign = n > 0 ? "+" : "";
          return `${lever} ${sign}${n}%`;
        }
        return lever;
      })
      .join(" · ") || "What-if sensitivity";
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{leverLabel}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Compared with current view
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.evidenceId || row.metric} className="text-[12px] text-slate-700">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 shrink font-medium text-slate-800">{row.label}</span>
              <span className="max-w-[58%] shrink-0 text-right tabular-nums text-slate-900">
                {row.formattedRange}
              </span>
            </div>
            {row.formattedDelta && (
              <p
                className={`mt-0.5 text-right text-[11px] tabular-nums ${
                  String(row.formattedDelta).startsWith("-") ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {row.formattedDelta}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceRows({ evidence, debug }) {
  const rows = presentEvidenceList(evidence, { debug });
  if (!rows.length) return null;
  return (
    <div className="space-y-1">
      {rows.slice(0, 6).map((row, index) => (
        <div
          key={row.evidenceId || index}
          className="flex items-baseline justify-between gap-3 text-[12px] text-slate-700"
        >
          <span className="min-w-0 truncate text-slate-600">
            {row.context ? `${row.context} · ${row.label}` : row.label}
          </span>
          <span className="shrink-0 font-medium tabular-nums text-slate-900">{row.formattedValue}</span>
        </div>
      ))}
    </div>
  );
}

function Expandable({ label, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!children) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
      >
        <Info className="h-3 w-3" />
        {label}
        <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{children}</div>}
    </div>
  );
}

function AssistantTurn({ turn, debug, onTrackDecision, trackPending, trackedDecisionId }) {
  const answer = turn.structured;
  if (!answer) {
    return turn.text.split("\n").map((line, lineIndex) => (
      <p key={lineIndex} className={lineIndex > 0 ? "mt-1" : ""}>{line}</p>
    ));
  }
  const trackAction = Array.isArray(answer.cfo_actions)
    ? answer.cfo_actions.find((a) => a?.type === "TRACK_STRATEGIC_DECISION")
    : null;
  const canTrack =
    Boolean(trackAction || turn.conversation?.strategic_thread) &&
    typeof onTrackDecision === "function" &&
    !trackedDecisionId;
  const evidence = Array.isArray(answer.evidence) ? answer.evidence : [];
  const scenario = isScenarioAnswer(answer);
  const showScenarioEvidence =
    scenario ||
    (answer.strategic?.response_type === "RECONSIDERATION" &&
      Array.isArray(answer.scenario_comparisons) &&
      answer.scenario_comparisons.length > 0) ||
    evidence.some((item) => item?.provenance === "CALCULATED_SCENARIO" || item?.unit === "scenario_change");
  const temporal = !showScenarioEvidence && evidence.some((item) => isTemporalEvidenceItem(item));
  const assumptions = Array.isArray(answer.assumptions) ? answer.assumptions.filter(Boolean) : [];
  const assumptionText = assumptions.join(" ").trim();
  const methodologyRaw = answer.methodology || (!scenario ? answer.caveat : null);
  const methodologyDistinct =
    methodologyRaw && String(methodologyRaw).trim() && String(methodologyRaw).trim() !== assumptionText
      ? methodologyRaw
      : null;
  return (
    <div className="space-y-2">
      {turn.viewing && (
        <p className="text-[10px] uppercase tracking-wide text-slate-400">Viewing: {turn.viewing}</p>
      )}
      {scenario && (
        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          What-if
        </span>
      )}
      {answer.headline && <p className="font-semibold leading-snug text-[#1a3673]">{answer.headline}</p>}
      {showScenarioEvidence ? (
        <ScenarioEvidenceBlock answer={answer} evidence={evidence} />
      ) : temporal ? (
        <TemporalEvidenceBlock answer={answer} evidence={evidence} />
      ) : (
        evidence.length > 0 && <EvidenceRows evidence={evidence} debug={debug} />
      )}
      {answer.strategic ? (
        <div className="space-y-2 text-[12px] leading-relaxed text-slate-700">
          {answer.strategic.what_this_changes && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What this changes</p>
              <p>{answer.strategic.what_this_changes}</p>
            </div>
          )}
          {answer.strategic.what_it_doesnt_tell_us && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What it doesn&apos;t tell us</p>
              <p>{answer.strategic.what_it_doesnt_tell_us}</p>
            </div>
          )}
          {answer.strategic.therefore && answer.strategic.response_type === "RECONSIDERATION" && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Therefore</p>
              <p>{answer.strategic.therefore}</p>
            </div>
          )}
          {answer.strategic.why && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Why</p>
              <p>{answer.strategic.why}</p>
            </div>
          )}
          {answer.strategic.uncertainty && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What could make this wrong</p>
              {Array.isArray(answer.strategic.uncertainty) ? (
                <ul className="list-disc pl-4">
                  {answer.strategic.uncertainty.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>{answer.strategic.uncertainty}</p>
              )}
            </div>
          )}
          {answer.strategic.next_step && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What I&apos;d do next</p>
              <p>{answer.strategic.next_step}</p>
            </div>
          )}
          {answer.strategic.monitoring && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What I&apos;d monitor</p>
              {Array.isArray(answer.strategic.monitoring) ? (
                <p>{answer.strategic.monitoring.join(" · ")}</p>
              ) : (
                <p>{answer.strategic.monitoring}</p>
              )}
            </div>
          )}
          {Array.isArray(answer.strategic.what_would_change_my_view) &&
            answer.strategic.what_would_change_my_view.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What would change my view</p>
              <ul className="list-disc pl-4">
                {answer.strategic.what_would_change_my_view.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {canTrack && (
            <button
              type="button"
              disabled={trackPending}
              onClick={() => onTrackDecision(turn)}
              className="mt-1 text-[11px] font-semibold text-[#1a3673] hover:underline disabled:opacity-50"
            >
              {trackPending ? "Tracking…" : "Track this decision"}
            </button>
          )}
          {trackedDecisionId && (
            <p className="text-[11px] text-emerald-700">Decision tracked.</p>
          )}
        </div>
      ) : (
        answer.interpretation && (
          <p className="text-[12px] leading-relaxed text-slate-700">{answer.interpretation}</p>
        )
      )}
      {scenario && assumptions.length > 0 && (
        <Expandable label="Assumptions" defaultOpen>
          {assumptions.map((item, index) => (
            <p key={index} className={index > 0 ? "mt-1" : ""}>
              {item}
            </p>
          ))}
        </Expandable>
      )}
      {methodologyDistinct && <Expandable label="Methodology">{methodologyDistinct}</Expandable>}
      {debug && (
        <Expandable label="View evidence">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">
            {JSON.stringify(evidence, null, 2)}
          </pre>
        </Expandable>
      )}
    </div>
  );
}

export default function AiCfoDrawer({
  datasetId,
  result,
  filters,
  periodRange,
  surface,
  dimension,
  metric,
  dynamicEnabled,
  signals,
  debugEvidence = false,
  signalsScopeHash = null,
  askWyzRequest = null,
  onAskWyzConsumed,
  onDecisionTracked,
}) {
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [trackPending, setTrackPending] = useState(false);
  const [trackedIds, setTrackedIds] = useState({});
  const [error, setError] = useState(null);
  const [turns, setTurns] = useState([]);
  const [signalTopic, setSignalTopic] = useState(null);
  const contextVersionRef = useRef(null);
  const requestContextRef = useRef(null);
  const conversationIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cfo-${Date.now()}`,
  );
  const askHandledRef = useRef(null);

  const queryFilters = useMemo(() => filtersToQueryFilters(filters), [filters]);

  const analytical = useMemo(
    () => buildAnalyticalContext({
      result,
      filters: queryFilters,
      surface,
      dimension,
      metric,
    }),
    [result, queryFilters, surface, dimension, metric],
  );

  const suggestions = useMemo(
    () => suggestedAiQuestions({ surface, signals, filters }),
    [surface, signals, filters],
  );

  const scopeChips = activeFilterChips(filters, periodRange);
  const viewingLabel = formatScopeViewLabel(filters, periodRange);
  const signalTopicLive =
    signalTopic && signalsScopeHash && signalTopic.scope_hash === signalsScopeHash;

  useEffect(() => {
    contextVersionRef.current = null;
  }, [analytical]);

  useEffect(() => {
    if (!signalTopic || signalTopic._stale) return undefined;
    if (signalsScopeHash && signalTopic.scope_hash !== signalsScopeHash) {
      setSignalTopic((prev) => (prev ? { ...prev, _stale: true } : null));
    }
    return undefined;
  }, [signalsScopeHash]);

  async function submit(question, options = {}) {
    if (!dynamicEnabled || !datasetId || !question.trim()) return;
    const signalContext = options.signalContext !== undefined ? options.signalContext : signalTopicLive ? signalTopic : null;
    setPending(true);
    setError(null);
    requestContextRef.current = JSON.stringify(analytical);
    const previousTurns = turns
      .filter((turn) => turn.role === "assistant" && turn.conversation)
      .slice(-4)
      .map((turn) => ({
        question: turn.question,
        scope_hash: turn.conversation.scope_hash || turn.scopeHash,
        intent: turn.conversation.intent,
        insight_type: turn.conversation.insight_type,
        driver_stage: turn.conversation.driver_stage,
        dimension: turn.conversation.dimension,
        rank_direction: turn.conversation.rank_direction,
        rank_metric: turn.conversation.rank_metric,
        selected_entities: turn.conversation.selected_entities || [],
        selected_evidence_ids: turn.conversation.selected_evidence_ids || [],
        scenario_spec: turn.conversation.scenario_spec || null,
        signal_context: turn.conversation.signal_context || null,
        strategic: turn.conversation.strategic || null,
        strategic_thread: turn.conversation.strategic_thread || null,
      }));
    try {
      const body = {
        workspace_id: result?.workspace_id,
        analysis_job_id: result?.job_id,
        analytical,
        message: question.trim(),
        context_version: contextVersionRef.current,
        conversation_id: conversationIdRef.current,
        previous_turns: previousTurns,
      };
      if (signalContext) {
        body.signal_context = signalContext;
      }
      const response = await askAiCfo(datasetId, body);
      const currentContext = JSON.stringify(analytical);
      if (requestContextRef.current !== currentContext) {
        setError("Filters changed while the answer was generating. Ask again for the updated view.");
        return;
      }
      contextVersionRef.current = response.context?.meta?.context_version || null;
      if (response.conversation?.signal_context) {
        setSignalTopic(response.conversation.signal_context);
      }
      setTurns((prev) => [
        ...prev,
        {
          role: "user",
          text: question.trim(),
          viewing: viewingLabel,
          fromSignal: signalContext
            ? `${signalContext.entity}${signalContext.label ? ` · ${signalContext.label}` : ""}`
            : null,
        },
        {
          role: "assistant",
          question: question.trim(),
          structured: response.answer,
          scope: response.scope,
          scopeHash: response.scope_hash,
          conversation: response.conversation,
          viewing: formatScopeViewLabel(
            { ...filters, ...(response.scope?.filters || {}) },
            periodRange,
          ),
        },
      ]);
      setMessage("");
    } catch (err) {
      setError(err?.message || "AI CFO request failed.");
    } finally {
      setPending(false);
    }
  }

  async function trackDecision(turn) {
    if (!datasetId || !turn?.conversation?.strategic_thread) {
      setError("Nothing to track yet — ask a strategic question first.");
      return;
    }
    setTrackPending(true);
    setError(null);
    try {
      const response = await trackStrategicDecision(datasetId, {
        workspace_id: result?.workspace_id,
        analysis_job_id: result?.job_id,
        analytical,
        strategic_thread: turn.conversation.strategic_thread,
        seed: {
          original_question: turn.question,
          decision_theme: turn.conversation.strategic_thread.decision_theme,
        },
      });
      const decisionId = response?.decision?.decision_id;
      if (decisionId) {
        setTrackedIds((prev) => ({ ...prev, [turn.question || decisionId]: decisionId }));
        onDecisionTracked?.(response);
      }
    } catch (err) {
      setError(err?.message || "Could not track decision.");
    } finally {
      setTrackPending(false);
    }
  }

  useEffect(() => {
    if (!askWyzRequest?.id || !askWyzRequest.signalContext) return;
    if (askHandledRef.current === askWyzRequest.id) return;
    askHandledRef.current = askWyzRequest.id;
    setOpen(true);
    setSignalTopic(askWyzRequest.signalContext);
    void submit(askWyzRequest.question || "Explain this signal.", {
      signalContext: askWyzRequest.signalContext,
    });
    onAskWyzConsumed?.();
  }, [askWyzRequest?.id]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-[#1a3673] px-4 py-2 text-[12px] font-semibold text-white shadow-lg"
      >
        <MessageSquare className="h-4 w-4" />
        WYZ AI CFO
      </button>
    );
  }

  const topicBanner = signalTopic && !signalTopic._stale && signalTopicLive
    ? `${signalTopic.entity}${signalTopic.label ? ` · ${signalTopic.label}` : ""}`
    : null;

  return (
    <aside className="flex h-full min-h-[520px] w-full flex-col rounded-2xl border border-gray-100 bg-white shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:w-[320px] lg:shrink-0">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1a3673]">WYZ AI CFO</h3>
          <p className="text-[11px] text-slate-500">Read-only interpretation of the active view</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current view</p>
        <p className="mt-1 text-[12px] text-slate-700">{viewingLabel}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {scopeChips.filter((chip) => chip.kind === "dimension").map((chip) => (
            <span key={chip.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{chip.label}</span>
          ))}
        </div>
        {topicBanner && (
          <p className="mt-2 text-[11px] text-slate-500">
            From signal: <span className="font-medium text-slate-700">{topicBanner}</span>
          </p>
        )}
        {signalTopic?._stale && (
          <p className="mt-2 text-[11px] text-slate-400">Prior signal topic is historical (view changed).</p>
        )}
        {!dynamicEnabled && (
          <p className="mt-2 text-[11px] text-slate-500">Re-run analysis to enable AI CFO on dynamic facts.</p>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.map((turn, index) => (
          <div key={`${turn.role}-${index}`} className={`rounded-lg px-3 py-2 text-[12px] ${turn.role === "user" ? "bg-slate-100 text-slate-700" : "bg-[#f8fafc] text-slate-800"}`}>
            {turn.role === "assistant" ? (
              <AssistantTurn
                turn={turn}
                debug={debugEvidence}
                onTrackDecision={trackDecision}
                trackPending={trackPending}
                trackedDecisionId={trackedIds[turn.question]}
              />
            ) : (
              <>
                {turn.viewing && <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Viewing: {turn.viewing}</p>}
                {turn.fromSignal && (
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">From signal: {turn.fromSignal}</p>
                )}
                <p>{turn.text}</p>
              </>
            )}
          </div>
        ))}
        {error && <p className="text-[12px] text-amber-800">{error}</p>}
      </div>
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Suggested</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              disabled={!dynamicEnabled || pending}
              onClick={() => submit(item)}
              className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              {item}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit(message);
          }}
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about this view…"
            disabled={!dynamicEnabled || pending}
            className="flex-1 rounded-lg border px-2 py-1.5 text-[12px]"
          />
          <button
            type="submit"
            disabled={!dynamicEnabled || pending || !message.trim()}
            className="rounded-lg bg-[#1a3673] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </div>
    </aside>
  );
}
