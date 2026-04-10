import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useAssumptions } from "../planning/AssumptionsContext.jsx";
import { usePlanningView } from "../planning/PlanningViewContext.jsx";
import { useScenarioSimulation } from "../hooks/useScenarioSimulation.js";
import { formatInrCompact, MONTH_12_INDEX } from "../planning/scenarioDisplayFormat.js";
import DashboardHeader from "../components/dashboard/DashboardHeader.jsx";
import SummaryHeroCard from "../components/dashboard/SummaryHeroCard.jsx";
import KPIStrip from "../components/dashboard/KPIStrip.jsx";
import AnalyticsRow from "../components/dashboard/AnalyticsRow.jsx";
import PrioritiesAndActions from "../components/dashboard/PrioritiesAndActions.jsx";
import ArtifactsAndCFO from "../components/dashboard/ArtifactsAndCFO.jsx";
import DashboardInsightsSidebar from "../components/dashboard/DashboardInsightsSidebar.jsx";
import PlanningRefreshNotice from "../components/dashboard/PlanningRefreshNotice.jsx";
import ScenarioDashboardBanner from "../components/dashboard/ScenarioDashboardBanner.jsx";

export default function DashboardPage() {
  const auth = useAuth();
  const { recomputeVersion } = useAssumptions();
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const { isPreviewMode } = usePlanningView();
  const { breakdown, summary, outputsAffected, series, explanation } = useScenarioSimulation();

  const previewSidebarContext = useMemo(() => {
    if (!isPreviewMode) return null;
    const impacts = [];
    if (summary && series) {
      const month12 = Math.min(MONTH_12_INDEX, series.horizonMonths - 1);
      if (summary.runwayDelta !== 0) {
        impacts.push(
          `Runway ${summary.runwayDelta >= 0 ? "+" : ""}${summary.runwayDelta} mo vs baseline (model)`,
        );
      }
      const br = series.baseline.revenueSeries[month12];
      const sr = series.scenario.revenueSeries[month12];
      if (br > 0 && sr != null) {
        const p = ((sr / br) - 1) * 100;
        impacts.push(`Revenue (month 12) ${p >= 0 ? "+" : ""}${p.toFixed(0)}% vs baseline`);
      }
      impacts.push(`Average burn ${summary.burnDelta >= 0 ? "+" : ""}${summary.burnDelta.toFixed(0)}% vs baseline`);
      const bc = series.baseline.cashSeries[month12];
      const sc = series.scenario.cashSeries[month12];
      if (bc != null && sc != null) {
        const d = sc - bc;
        impacts.push(`Cash at month 12 ${d >= 0 ? "+" : ""}${formatInrCompact(d)} vs baseline`);
      }
    }
    return { breakdown: breakdown ?? [], impacts, outputsAffected, explanation };
  }, [isPreviewMode, breakdown, summary, series, outputsAffected, explanation]);

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
          <div className="mx-auto max-w-6xl space-y-8 pb-8">
            <DashboardHeader />
            <PlanningRefreshNotice recomputeVersion={recomputeVersion} />
            <ScenarioDashboardBanner />
            <SummaryHeroCard user={auth.user} />
            <KPIStrip />
            <AnalyticsRow />
            {isPreviewMode ? (
              <p className="text-[11px] leading-relaxed text-slate-500">
                Priorities and artifacts below reflect your baseline workspace until they are linked to scenario preview.
              </p>
            ) : null}
            <PrioritiesAndActions />
            <ArtifactsAndCFO />
          </div>
        </div>
      </div>

      <div
        className={`hidden min-h-0 shrink-0 flex-col overflow-hidden border-l border-gray-200/80 bg-white/60 transition-[width] duration-300 ease-in-out lg:flex lg:py-3 lg:pl-2 lg:pr-4 ${
          insightsCollapsed ? "w-14 min-w-[3.5rem] max-w-[3.5rem]" : "w-[300px] min-w-[260px] max-w-[300px]"
        }`}
      >
        <DashboardInsightsSidebar
          collapsed={insightsCollapsed}
          onToggleCollapse={() => setInsightsCollapsed((c) => !c)}
          previewContext={previewSidebarContext}
        />
      </div>
    </div>
  );
}
