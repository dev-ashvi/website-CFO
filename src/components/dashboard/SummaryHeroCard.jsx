import { Link } from "react-router-dom";
import { AlertTriangle, FileText, Sparkles } from "lucide-react";
import { usePlanningView } from "../../planning/PlanningViewContext.jsx";
import { useScenarioSimulation } from "../../hooks/useScenarioSimulation.js";
import { MONTH_12_INDEX } from "../../planning/scenarioDisplayFormat.js";

function firstNameFromUser(user) {
  if (!user) return "there";
  if (user.first_name) return user.first_name;
  if (user.name) return user.name.split(/\s+/)[0];
  if (user.email) {
    const local = user.email.split("@")[0] || "";
    const part = local.split(/[._-]/)[0] || local;
    if (!part) return "there";
    return part.charAt(0).toUpperCase() + part.slice(1);
  }
  return "there";
}

function buildPreviewInsight(series, summary) {
  if (!series || !summary) return null;
  const month12 = Math.min(MONTH_12_INDEX, series.horizonMonths - 1);
  const br = series.baseline.revenueSeries[month12] ?? 0;
  const sr = series.scenario.revenueSeries[month12] ?? 0;
  const revPct = br > 0 ? ((sr / br) - 1) * 100 : 0;
  const rd = summary.runwayDelta;

  const runwayPart =
    rd === 0
      ? "runway is unchanged in this model"
      : rd > 0
        ? `runway extends by ${rd} month${rd === 1 ? "" : "s"}`
        : `runway shortens by ${Math.abs(rd)} month${Math.abs(rd) === 1 ? "" : "s"}`;

  const revPart =
    revPct === 0
      ? "12‑month revenue is in line with baseline"
      : revPct > 0
        ? `12‑month revenue increases by ${revPct.toFixed(0)}%`
        : `12‑month revenue decreases by ${Math.abs(revPct).toFixed(0)}%`;

  return `Under this preview, ${runwayPart} and ${revPart}.`;
}

export default function SummaryHeroCard({ user }) {
  const name = firstNameFromUser(user);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const { isPreviewMode, scenarioLabel } = usePlanningView();
  const { series, summary } = useScenarioSimulation();
  const previewInsight = isPreviewMode ? buildPreviewInsight(series, summary) : null;

  if (isPreviewMode && !previewInsight) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-[#1a3673]/20 bg-gradient-to-br from-white via-[#1a3673]/[0.04] to-white px-6 py-7 shadow-[0_2px_24px_rgba(15,23,42,0.06)] sm:px-8 sm:py-8">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a3673]/80">Preview scenario</p>
        <p className="mt-2 text-[13px] font-medium text-slate-500">
          {greet}, <span className="font-semibold text-[#1a3673]">{name}</span>
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#1a3673] sm:text-3xl">
          {scenarioLabel || "Scenario preview"}
        </h2>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-slate-600">
          Open a scenario preview from Planning to populate model-based insights here, or return to Scenarios to adjust
          levers.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            to="/app/data/planning/scenarios"
            className="inline-flex items-center gap-2 rounded-full bg-[#1a3673] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
          >
            Back to Scenarios
          </Link>
        </div>
      </div>
    );
  }

  if (isPreviewMode && previewInsight) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-[#1a3673]/20 bg-gradient-to-br from-white via-[#1a3673]/[0.04] to-white px-6 py-7 shadow-[0_2px_24px_rgba(15,23,42,0.06)] sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#1a3673]/10 blur-3xl" aria-hidden />
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a3673]/80">Preview scenario</p>
        <p className="mt-2 text-[13px] font-medium text-slate-500">
          {greet}, <span className="font-semibold text-[#1a3673]">{name}</span>
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#1a3673] sm:text-3xl sm:leading-tight">
          {scenarioLabel || "Scenario preview"}
        </h2>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-slate-700">{previewInsight}</p>
        <div className="mt-5 flex flex-wrap items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-[12px] leading-snug text-slate-700">
          <span className="font-semibold text-slate-600">Note · </span>
          Directional read from your planning preview. Baseline workspace data is unchanged; charts below show baseline vs preview curves.
        </div>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            to="/app/data/planning/scenarios"
            className="inline-flex items-center gap-2 rounded-full bg-[#1a3673] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#142a5c]"
          >
            Back to Scenarios
          </Link>
          <Link
            to="/app/chat"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-[#1a3673] shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2} />
            Ask AI CFO
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[rgba(26,54,115,0.1)] bg-gradient-to-br from-white via-white to-[rgba(252,125,37,0.06)] px-6 py-7 shadow-[0_2px_24px_rgba(15,23,42,0.06)] sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#fc7d25]/10 blur-3xl" aria-hidden />
      <p className="text-[13px] font-medium text-slate-500">
        {greet}, <span className="font-semibold text-[#1a3673]">{name}</span>
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#1a3673] sm:text-3xl sm:leading-tight">
        Your runway is 8.4 months
      </h2>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-slate-700">
        Revenue grew 11%, but burn increased 7%. Collections are lagging behind sales.
      </p>
      <div className="mt-5 flex flex-wrap items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-[13px] leading-snug text-amber-950">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
        <div>
          <span className="font-semibold text-amber-900">Risk · </span>
          Runway drops to 5.9 months in the downside scenario.
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2.5">
        <Link
          to="/app/chat"
          className="inline-flex items-center gap-2 rounded-full bg-[#fc7d25] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#e86f16]"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2} />
          Ask AI CFO
        </Link>
        <button
          type="button"
          className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-[#1a3673] shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          View full MIS
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-[#1a3673] shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <FileText className="h-4 w-4 text-slate-500" strokeWidth={2} />
          Review risks
        </button>
      </div>
    </div>
  );
}
