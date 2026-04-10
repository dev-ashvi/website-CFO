import { GitCompare, LayoutDashboard, X } from "lucide-react";
import { useScenarioDraft } from "../../planning/ScenarioDraftContext.jsx";
import { usePlanningView } from "../../planning/PlanningViewContext.jsx";

/**
 * Dashboard scenario lens: preview mode (full) or legacy activeDashboardScenario indicator.
 * Rendering-only — does not mutate baseline assumptions or stored dashboard data.
 */
export default function ScenarioDashboardBanner() {
  const { activeDashboardScenario, clearActiveDashboardScenario } = useScenarioDraft();
  const {
    isPreviewMode,
    scenarioLabel,
    exitPreview,
    compareToBaselineCharts,
  } = usePlanningView();

  if (isPreviewMode) {
    return (
      <div
        className="mb-6 rounded-xl border border-[#1a3673]/25 bg-gradient-to-r from-[#1a3673]/[0.08] to-white px-4 py-4 text-[13px] shadow-sm ring-1 ring-[#1a3673]/10"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <LayoutDashboard className="mt-0.5 h-5 w-5 shrink-0 text-[#fc7d25]" strokeWidth={2} />
            <div className="min-w-0">
              <p className="font-bold text-[#1a3673]">Preview scenario active</p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-slate-800">
                Viewing dashboard under:{" "}
                <span className="text-[#1a3673]">{scenarioLabel || "Current preview"}</span>
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
                Baseline remains unchanged — workspace assumptions and core records are not overwritten.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={compareToBaselineCharts}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1a3673]/25 bg-white px-3 py-2 text-[11px] font-semibold text-[#1a3673] shadow-sm transition hover:bg-[#1a3673]/[0.04]"
            >
              <GitCompare className="h-3.5 w-3.5" strokeWidth={2} />
              Compare to baseline
            </button>
            <button
              type="button"
              onClick={exitPreview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              Exit preview
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeDashboardScenario) return null;

  const subtitle =
    activeDashboardScenario.kind === "preview"
      ? "Figures below still reflect your baseline data. This label prepares scenario-aware views."
      : "Saved scenario reference only — baseline assumptions are unchanged.";

  return (
    <div
      className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#1a3673]/20 bg-[#1a3673]/[0.06] px-4 py-3.5 text-[13px] text-[#1a3673] shadow-sm"
      role="status"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <LayoutDashboard className="mt-0.5 h-5 w-5 shrink-0 text-[#fc7d25]" strokeWidth={2} />
        <div className="min-w-0">
          <p className="font-semibold text-[#1a3673]">
            Viewing scenario: <span className="text-slate-900">{activeDashboardScenario.label}</span>
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={clearActiveDashboardScenario}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#1a3673]/25 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#1a3673] transition hover:bg-white/90"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
        Return to standard view
      </button>
    </div>
  );
}
