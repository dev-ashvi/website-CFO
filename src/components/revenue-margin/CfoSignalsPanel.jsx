import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatMetricValue } from "../../lib/revenue-margin/format.js";
import { fetchCfoSignals } from "../../api/revenueMargin.js";
import { filtersToQueryFilters } from "../../lib/revenue-margin/filters.js";
import { buildAnalyticalContext } from "../../lib/revenue-margin/analyticalContext.js";
import {
  prioritizeSignals,
  signalCategory,
  signalToneClasses,
} from "../../lib/revenue-margin/signalPresentation.js";

const DEFAULT_VISIBLE = 4;

function SignalIcon({ category }) {
  if (category === "pressure") return <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />;
  if (category === "positive") return <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />;
  return <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />;
}

function canInvestigateSignal(signal) {
  const dimension = String(signal?.entity_type || "");
  return Boolean(signal?.entity) && ["channel", "category", "sku"].includes(dimension);
}

function canAskWyzSignal(signal) {
  return canInvestigateSignal(signal);
}

function SignalRow({ signal, onInvestigate, onAskWyz }) {
  const category = signalCategory(signal);
  const tone = signalToneClasses(category);
  const metrics = [];
  const seen = new Set();
  const pushMetric = (key, value) => {
    if (value == null || seen.has(key)) return;
    seen.add(key);
    metrics.push({ key, ...formatMetricValue(key, value) });
  };
  pushMetric("cm2", signal.evidence?.cm2);
  pushMetric("cm2_pct", signal.evidence?.cm2_pct);
  pushMetric("cm1_pct", signal.evidence?.cm1_pct);
  pushMetric("marketing_pct", signal.evidence?.marketing_pct);
  const primary = metrics[0] || null;
  const investigate = canInvestigateSignal(signal);
  const askWyz = canAskWyzSignal(signal);

  return (
    <li className={`rounded-lg border p-3 ${tone.row}`}>
      <div className="flex items-start gap-2">
        <SignalIcon category={category} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#1a3673]">
            <span className="mr-1 text-slate-500">{tone.arrow}</span>
            {signal.entity}
          </p>
          <p className="text-[12px] text-slate-700">{signal.label}</p>
          {primary && (
            <p className="mt-1 text-[11px] font-medium text-slate-600">
              {primary.label}: {primary.formatted}
            </p>
          )}
          {metrics.length > 1 && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600 sm:grid-cols-3">
              {metrics.slice(1).map((metric) => (
                <span key={metric.key}>
                  {metric.label}: {metric.formatted}
                </span>
              ))}
            </div>
          )}
          {(investigate || askWyz) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {investigate && onInvestigate && (
                <button
                  type="button"
                  onClick={() => onInvestigate(signal)}
                  className="rounded-md border border-[rgba(26,54,115,0.18)] bg-white px-2 py-1 text-[11px] font-semibold text-[#1a3673] hover:bg-[#1a3673]/5"
                >
                  Investigate
                </button>
              )}
              {askWyz && onAskWyz && (
                <button
                  type="button"
                  onClick={() => onAskWyz(signal)}
                  className="rounded-md bg-[#1a3673] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#142a5c]"
                >
                  Ask WYZ about this
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function CfoSignalsPanel({
  datasetId,
  result,
  filters,
  surface,
  dimension,
  dynamicEnabled,
  onSignalsChange,
  onInvestigate,
  onAskWyz,
  onSignalsScopeChange,
  title = "What Needs Your Attention",
  renderPanel = true,
}) {
  const [state, setState] = useState({ loading: false, signals: [], error: null, scopeHash: null });
  const [expanded, setExpanded] = useState(false);
  const requestRef = useRef(0);

  const payload = useMemo(
    () => ({
      workspace_id: result?.workspace_id,
      analysis_job_id: result?.job_id,
      analytical: buildAnalyticalContext({
        result,
        filters: filtersToQueryFilters(filters),
        surface,
        dimension,
      }),
    }),
    [result, filters, surface, dimension],
  );

  useEffect(() => {
    if (!dynamicEnabled || !datasetId) {
      setState({ loading: false, signals: [], error: null, scopeHash: null });
      onSignalsChange?.([]);
      onSignalsScopeChange?.(null);
      return undefined;
    }
    const requestId = ++requestRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchCfoSignals(datasetId, payload)
      .then((response) => {
        if (requestId !== requestRef.current) return;
        const signals = response.signals || response.highlighted || [];
        const scopeHash =
          response.scope?.scope_hash || response.metadata?.scope_hash || null;
        setState({ loading: false, signals, error: null, scopeHash });
        onSignalsChange?.(signals);
        onSignalsScopeChange?.(scopeHash);
      })
      .catch((err) => {
        if (requestId !== requestRef.current) return;
        setState({ loading: false, signals: [], error: err?.message || "Unable to load CFO signals.", scopeHash: null });
        onSignalsChange?.([]);
        onSignalsScopeChange?.(null);
      });
    return () => {
      requestRef.current += 1;
    };
  }, [dynamicEnabled, datasetId, payload]);

  const ranked = useMemo(
    () => prioritizeSignals(state.signals, { limit: DEFAULT_VISIBLE }),
    [state.signals],
  );
  const shown = expanded ? ranked.all : ranked.visible;

  if (!dynamicEnabled) return null;

  // Keep mounted (hooks above still fetch) so AI CFO retains signal context off Overview.
  if (!renderPanel) return null;

  if (state.loading) return <p className="text-[12px] text-slate-500">Loading financial signals…</p>;
  if (state.error) return <p className="text-[12px] text-amber-800">{state.error}</p>;
  if (!state.signals.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </h3>
      <ul className="mt-3 space-y-2.5">
        {shown.map((signal) => (
          <SignalRow
            key={`${signal.signal_type}-${signal.entity}`}
            signal={signal}
            onInvestigate={onInvestigate}
            onAskWyz={onAskWyz}
          />
        ))}
      </ul>
      {ranked.rest.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 text-[11px] font-semibold text-[#1a3673] hover:underline"
        >
          {expanded ? "Show less" : `View all (${ranked.all.length})`}
        </button>
      )}
    </div>
  );
}
