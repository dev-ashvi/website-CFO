import { useState } from "react";
import { usePlanningView } from "../../planning/PlanningViewContext.jsx";
import { useScenarioSimulation } from "../../hooks/useScenarioSimulation.js";
import DashboardScenarioCharts from "./DashboardScenarioCharts.jsx";

function BarPlaceholder({ bars, className = "" }) {
  return (
    <div className={`flex h-40 items-end justify-between gap-1.5 px-1 pt-4 sm:h-44 ${className}`}>
      {bars.map((h, i) => (
        <div
          key={i}
          className="min-w-0 flex-1 rounded-t-md bg-gradient-to-t from-[#1a3673]/85 to-[#1a3673]/35 transition-opacity"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

const CASH_BARS = [45, 52, 48, 61, 55, 70, 68, 75, 72, 80, 78, 88];
const REV_EXP = [
  { rev: 55, exp: 40 },
  { rev: 58, exp: 42 },
  { rev: 62, exp: 45 },
  { rev: 60, exp: 48 },
  { rev: 68, exp: 46 },
  { rev: 72, exp: 50 },
];

export default function AnalyticsRow() {
  const [cashGranularity, setCashGranularity] = useState("Weekly");
  const { isPreviewMode } = usePlanningView();
  const { series } = useScenarioSimulation();

  if (isPreviewMode && series) {
    return (
      <div className="space-y-4">
        <DashboardScenarioCharts series={series} />
        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          Additional dashboard widgets below still use your baseline snapshot until they are wired to planning previews.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-100/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1a3673]">Cash position</h3>
            <p className="mt-1 text-[12px] text-slate-500">Runway trend vs operating balance</p>
            <div className="mt-3 flex gap-4 text-[12px]">
              <div>
                <p className="text-slate-400">Ending cash</p>
                <p className="font-semibold tabular-nums text-[#1a3673]">₹2.42 Cr</p>
              </div>
              <div>
                <p className="text-slate-400">Net burn</p>
                <p className="font-semibold tabular-nums text-rose-700">−₹14.5L / mo</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 rounded-lg bg-slate-100/80 p-0.5">
            {["Daily", "Weekly", "Monthly"].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setCashGranularity(g)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  cashGranularity === g ? "bg-white text-[#1a3673] shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50/80 px-3 pb-2 pt-2 ring-1 ring-slate-100">
          <BarPlaceholder bars={CASH_BARS} />
          <p className="mt-2 text-center text-[10px] font-medium text-slate-400">Chart placeholder · {cashGranularity}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100/90 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-[#1a3673]">Revenue vs expenses</h3>
        <p className="mt-1 text-[12px] text-slate-500">Budget vs actual · vs previous 6 months</p>
        <div className="mt-4 flex flex-wrap gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#1a3673]" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#fc7d25]/80" />
            Expenses
          </span>
        </div>
        <div className="mt-4 flex h-44 items-end justify-between gap-1.5 rounded-xl bg-slate-50/80 px-3 pb-3 pt-4 ring-1 ring-slate-100 sm:h-48">
          {REV_EXP.map((row, i) => (
            <div key={i} className="flex min-w-0 flex-1 items-end justify-center gap-1">
              <div
                className="w-[42%] max-w-8 rounded-t-md bg-[#1a3673]/85"
                style={{ height: `${Math.max(row.rev, 12)}%` }}
              />
              <div
                className="w-[42%] max-w-8 rounded-t-md bg-[#fc7d25]/65"
                style={{ height: `${Math.max(row.exp, 12)}%` }}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] font-medium text-slate-400">Grouped bars · mock trend</p>
      </div>
    </div>
  );
}
