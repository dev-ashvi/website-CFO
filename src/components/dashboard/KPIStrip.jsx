import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { usePlanningView } from "../../planning/PlanningViewContext.jsx";
import { useScenarioSimulation } from "../../hooks/useScenarioSimulation.js";
import { formatInrCompact, MONTH_12_INDEX } from "../../planning/scenarioDisplayFormat.js";

const BASELINE_KPIS = [
  { label: "Cash in bank", value: "₹2.42 Cr", delta: "+₹18L", trend: "up", hint: "vs last month" },
  { label: "Monthly burn", value: "₹14.5L", delta: "+7%", trend: "down", hint: "vs budget" },
  { label: "Runway", value: "8.4 mo", delta: "−0.7 mo", trend: "down", hint: "from 9.1" },
  { label: "Revenue MTD", value: "₹26.8L", delta: "+11%", trend: "up", hint: "vs prior MTD" },
  { label: "EBITDA", value: "₹4.1L", delta: "+₹2L", trend: "up", hint: "margin stable" },
  { label: "Gross margin", value: "62%", delta: "+1.2pp", trend: "up", hint: "rolling 3M" },
  { label: "Receivables", value: "₹1.08 Cr", delta: "+12%", trend: "down", hint: "DSO rising" },
  { label: "Payables due", value: "₹42L", delta: "3 vendors", trend: "neutral", hint: "this week" },
];

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp className="h-3 w-3 text-emerald-600" strokeWidth={2} aria-hidden />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-rose-600" strokeWidth={2} aria-hidden />;
  return <Minus className="h-3 w-3 text-slate-400" strokeWidth={2} aria-hidden />;
}

/** @param {'runway' | 'cash' | 'rev' | 'burn'} kind */
function previewGoodTrend(kind, delta) {
  if (!Number.isFinite(delta)) return "neutral";
  if (delta === 0) return "neutral";
  if (kind === "burn") return delta <= 0 ? "up" : "down";
  return delta >= 0 ? "up" : "down";
}

function PreviewMetricCard({ label, previewValue, deltaLabel, kind, rawDelta }) {
  const trend = previewGoodTrend(kind, rawDelta);
  return (
    <div className="rounded-xl border border-[#1a3673]/15 bg-gradient-to-b from-[#1a3673]/[0.04] to-white px-4 py-3.5 shadow-sm ring-1 ring-[#1a3673]/10">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-[#1a3673]">{previewValue}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-600">vs baseline {deltaLabel}</span>
        <TrendIcon trend={trend} />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">From scenario model · preview only</p>
    </div>
  );
}

export default function KPIStrip() {
  const { isPreviewMode } = usePlanningView();
  const { series, summary } = useScenarioSimulation();

  if (isPreviewMode && series && summary) {
    const month12 = Math.min(MONTH_12_INDEX, series.horizonMonths - 1);
    const rb = series.baseline.runwayMonths;
    const rs = series.scenario.runwayMonths;
    const runwayDelta = rs - rb;

    const bc12 = series.baseline.cashSeries[month12] ?? 0;
    const sc12 = series.scenario.cashSeries[month12] ?? 0;
    const cashDelta12 = sc12 - bc12;

    const brv = series.baseline.revenueSeries[month12] ?? 0;
    const srv = series.scenario.revenueSeries[month12] ?? 0;
    const revPct = brv > 0 ? ((srv / brv) - 1) * 100 : 0;

    const burnPct = summary.burnDelta;

    const runwayDeltaStr = `${runwayDelta >= 0 ? "+" : ""}${runwayDelta} mo`;
    const cashDeltaStr =
      cashDelta12 >= 0 ? `+${formatInrCompact(cashDelta12)}` : formatInrCompact(cashDelta12);
    const revDeltaStr = `${revPct >= 0 ? "+" : ""}${revPct.toFixed(0)}%`;
    const burnDeltaStr = `${burnPct >= 0 ? "+" : ""}${burnPct.toFixed(0)}%`;

    return (
      <div className="space-y-5">
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#1a3673]/80">
            Preview vs baseline (model)
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PreviewMetricCard
              label="Runway"
              previewValue={`${rs} mo`}
              deltaLabel={`(${runwayDeltaStr})`}
              kind="runway"
              rawDelta={runwayDelta}
            />
            <PreviewMetricCard
              label="Cash at month 12"
              previewValue={formatInrCompact(sc12)}
              deltaLabel={`(${cashDeltaStr})`}
              kind="cash"
              rawDelta={cashDelta12}
            />
            <PreviewMetricCard
              label="Revenue (M12)"
              previewValue={formatInrCompact(srv)}
              deltaLabel={`(${revDeltaStr})`}
              kind="rev"
              rawDelta={revPct}
            />
            <PreviewMetricCard
              label="Avg monthly burn"
              previewValue={formatInrCompact(series.scenario.avgMonthlyBurn)}
              deltaLabel={`(${burnDeltaStr})`}
              kind="burn"
              rawDelta={burnPct}
            />
          </div>
        </div>

        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Other metrics (baseline workspace snapshot)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
            {BASELINE_KPIS.map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-gray-100/90 bg-white px-4 py-3.5 shadow-sm transition hover:border-slate-200/90 hover:shadow-md"
              >
                <p className="text-[11px] font-medium text-slate-500">{k.label}</p>
                <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-slate-600">{k.value}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">{k.delta}</span>
                  <TrendIcon trend={k.trend} />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{k.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
      {BASELINE_KPIS.map((k) => (
        <div
          key={k.label}
          className="rounded-xl border border-gray-100/90 bg-white px-4 py-3.5 shadow-sm transition hover:border-slate-200/90 hover:shadow-md"
        >
          <p className="text-[11px] font-medium text-slate-500">{k.label}</p>
          <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-[#1a3673]">{k.value}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-600">{k.delta}</span>
            <TrendIcon trend={k.trend} />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">{k.hint}</p>
        </div>
      ))}
    </div>
  );
}
