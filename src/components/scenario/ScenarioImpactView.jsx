import { MessageSquare } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisInr, formatInrCompact, MONTH_12_INDEX } from "../../planning/scenarioDisplayFormat.js";
import CFOExplanationPanel from "./CFOExplanationPanel.jsx";

const LEGEND_STYLE = {
  fontSize: 12,
  paddingTop: 10,
  fontWeight: 500,
  color: "#334155",
};

/**
 * @param {'runway' | 'cash12' | 'rev12' | 'burn'} metric
 * @param {number} delta — signed value used for good/bad coloring
 */
function deltaClass(metric, delta) {
  if (!Number.isFinite(delta)) return "text-slate-700";
  if (metric === "burn") return delta <= 0 ? "text-emerald-600" : "text-rose-600";
  return delta >= 0 ? "text-emerald-600" : "text-rose-600";
}

function ImpactSummaryCard({ title, caption, left, right, deltaLabel, metric, deltaForTone }) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-slate-900 tabular-nums sm:text-base">
        <span>{left}</span>
        <span className="mx-1 font-normal text-slate-300">→</span>
        <span>{right}</span>
        <span className={`ml-1.5 text-[13px] font-semibold sm:text-sm ${deltaClass(metric, deltaForTone)}`}>
          ({deltaLabel})
        </span>
      </p>
      {caption ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{caption}</p> : null}
    </div>
  );
}

export default function ScenarioImpactView({
  series,
  summary,
  breakdown,
  loading,
  loadingMessage,
  onDiscuss,
  originLabel,
  originChatSnippet,
  explanation,
}) {
  if (!series || !summary) return null;

  const { horizonMonths, baseline, scenario } = series;
  const month12 = Math.min(MONTH_12_INDEX, horizonMonths - 1);

  const chartData = [];
  for (let m = 0; m < horizonMonths; m++) {
    chartData.push({
      month: m + 1,
      baselineRevenue: baseline.revenueSeries[m],
      scenarioRevenue: scenario.revenueSeries[m],
      baselineCash: baseline.cashSeries[m],
      scenarioCash: scenario.cashSeries[m],
    });
  }

  const br = baseline.revenueSeries[month12] ?? 0;
  const sr = scenario.revenueSeries[month12] ?? 0;
  const revPct12 = br > 0 ? ((sr / br) - 1) * 100 : 0;

  const bc12 = baseline.cashSeries[month12] ?? 0;
  const sc12 = scenario.cashSeries[month12] ?? 0;
  const cashDelta12 = sc12 - bc12;

  const rb = baseline.runwayMonths;
  const rs = scenario.runwayMonths;
  const runwayDelta = rs - rb;

  const bb = baseline.avgMonthlyBurn;
  const sb = scenario.avgMonthlyBurn;
  const burnPct = summary.burnDelta;

  const cashDeltaLabel =
    cashDelta12 >= 0 ? `+${formatInrCompact(cashDelta12)}` : formatInrCompact(cashDelta12);
  const revDeltaLabel = `${revPct12 >= 0 ? "+" : ""}${revPct12.toFixed(0)}%`;
  const runwayDeltaLabel = `${runwayDelta >= 0 ? "+" : ""}${runwayDelta} mo`;
  const burnDeltaLabel = `${burnPct >= 0 ? "+" : ""}${burnPct.toFixed(0)}%`;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#1a3673]/12 bg-gradient-to-br from-[#1a3673]/[0.04] to-white p-5 shadow-sm">
      {loading ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/85 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-[#1a3673]/20 border-t-[#1a3673]" />
          <p className="text-[12px] font-medium text-[#1a3673]">{loadingMessage || "Analyzing scenario…"}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Scenario impact</p>
          <h2 className="mt-1 text-[17px] font-semibold text-[#1a3673]">Projected outcomes</h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-slate-600">
            Preview based on your current planning model — directional only, not a forecast guarantee.
          </p>
          {originChatSnippet ? (
            <p className="mt-2 text-[11px] leading-snug text-slate-700">
              <span className="font-semibold text-slate-500">Created from chat:</span>{" "}
              <q className="font-medium text-slate-900">{originChatSnippet}</q>
            </p>
          ) : originLabel ? (
            <p className="mt-2 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-500">Preview source:</span>{" "}
              <span className="font-medium text-slate-800">{originLabel}</span>
            </p>
          ) : null}
        </div>
        {typeof onDiscuss === "function" ? (
          <button
            type="button"
            onClick={onDiscuss}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#1a3673]/20 bg-white px-3 py-2 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:bg-[#1a3673]/[0.04]"
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
            Discuss with AI
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ImpactSummaryCard
          title="Runway"
          caption="Months until cash ≤ 0 in this simplified model"
          left={`${rb} mo`}
          right={`${rs} mo`}
          deltaLabel={runwayDeltaLabel}
          metric="runway"
          deltaForTone={runwayDelta}
        />
        <ImpactSummaryCard
          title="Cash at month 12"
          caption="Modeled cash balance after twelve months"
          left={formatInrCompact(bc12)}
          right={formatInrCompact(sc12)}
          deltaLabel={cashDeltaLabel}
          metric="cash12"
          deltaForTone={cashDelta12}
        />
        <ImpactSummaryCard
          title="Revenue at month 12"
          caption="Monthly revenue (INR) at end of month 12"
          left={formatInrCompact(br)}
          right={formatInrCompact(sr)}
          deltaLabel={revDeltaLabel}
          metric="rev12"
          deltaForTone={revPct12}
        />
        <ImpactSummaryCard
          title="Average monthly burn"
          caption="Mean cash outflow per month over the horizon"
          left={formatInrCompact(bb)}
          right={formatInrCompact(sb)}
          deltaLabel={burnDeltaLabel}
          metric="burn"
          deltaForTone={burnPct}
        />
      </div>

      {breakdown?.length ? (
        <div className="mt-5 rounded-xl border border-[#1a3673]/12 bg-[#1a3673]/[0.03] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a3673]/90">Preview changes</p>
          <p className="mt-0.5 text-[11px] text-slate-600">Assumptions driving this simulation (workspace baseline → preview)</p>
          <ul className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
            {breakdown.map((row) => (
              <li key={row.label} className="text-[12px] leading-snug text-slate-800">
                <span className="font-semibold text-slate-700">{row.label}:</span>{" "}
                <span className="tabular-nums text-slate-500">{row.from}</span>
                <span className="mx-1.5 text-slate-300">→</span>
                <span className="font-semibold tabular-nums text-[#1a3673]">{row.to}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Directional estimate using current assumptions — useful for comparing baseline vs preview, not for statutory reporting.
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-800">Revenue projection</p>
          <p className="text-[10px] text-slate-500">Monthly revenue (INR) — Baseline vs Preview scenario</p>
          <div className="mt-3 h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  stroke="#cbd5e1"
                  tickLine={false}
                  label={{ value: "Month", position: "insideBottom", offset: -2, fontSize: 10, fill: "#64748b" }}
                />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={formatAxisInr} width={48} tickLine={false} />
                <Tooltip
                  formatter={(v) => formatInrCompact(v)}
                  labelFormatter={(l) => `Month ${l}`}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={LEGEND_STYLE} />
                <Line
                  type="monotone"
                  dataKey="baselineRevenue"
                  name="Baseline"
                  stroke="#94a3b8"
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="scenarioRevenue"
                  name="Preview scenario"
                  stroke="#1a3673"
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-800">Cash balance</p>
          <p className="text-[10px] text-slate-500">Modeled cash path — Baseline vs Preview scenario</p>
          <div className="mt-3 h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#cbd5e1" tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={formatAxisInr} width={48} tickLine={false} />
                <Tooltip
                  formatter={(v) => formatInrCompact(v)}
                  labelFormatter={(l) => `Month ${l}`}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={LEGEND_STYLE} />
                <Line
                  type="monotone"
                  dataKey="baselineCash"
                  name="Baseline"
                  stroke="#94a3b8"
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="scenarioCash"
                  name="Preview scenario"
                  stroke="#1a3673"
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <CFOExplanationPanel explanation={explanation} />
      </div>

      {breakdown?.length ? (
        <div className="mt-6 rounded-xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Changed inputs</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Workspace baseline → values in this preview</p>
          <ul className="mt-2.5 space-y-2.5">
            {breakdown.map((row) => (
              <li
                key={row.label}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200/60 pb-2 last:border-0 last:pb-0"
              >
                <span className="text-[12px] font-semibold text-slate-800">{row.label}</span>
                <span className="text-right text-[12px] tabular-nums text-slate-700">
                  <span className="text-slate-500">{row.from}</span>
                  <span className="mx-2 text-slate-300">→</span>
                  <span className="font-semibold text-[#1a3673]">{row.to}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
