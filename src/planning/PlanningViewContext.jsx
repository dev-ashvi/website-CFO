import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useScenarioDraft } from "./ScenarioDraftContext.jsx";

const PlanningViewContext = createContext(null);

/**
 * @typedef {'baseline' | 'preview'} PlanningViewMode
 * @typedef {'scenario' | null} PlanningViewOrigin
 * @typedef {'scenarios' | 'dashboard' | null} PlanningEnteredFrom
 */

export function PlanningViewProvider({ children }) {
  const { hasScenarioDraft, clearActiveDashboardScenario } = useScenarioDraft();

  const [mode, setMode] = useState(/** @type {PlanningViewMode} */ ("baseline"));
  const [origin, setOrigin] = useState(/** @type {PlanningViewOrigin} */ (null));
  const [scenarioLabel, setScenarioLabel] = useState("");
  const [enteredFrom, setEnteredFrom] = useState(/** @type {PlanningEnteredFrom} */ (null));

  const enterPreviewFromScenarios = useCallback(({ scenarioLabel: label }) => {
    setMode("preview");
    setOrigin("scenario");
    setScenarioLabel(typeof label === "string" && label.trim() ? label.trim() : "Scenario preview");
    setEnteredFrom("scenarios");
  }, []);

  const exitPreview = useCallback(() => {
    setMode("baseline");
    setOrigin(null);
    setScenarioLabel("");
    setEnteredFrom(null);
    clearActiveDashboardScenario();
  }, [clearActiveDashboardScenario]);

  const compareToBaselineCharts = useCallback(() => {
    document.getElementById("dashboard-scenario-charts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (mode === "preview" && !hasScenarioDraft) {
      setMode("baseline");
      setOrigin(null);
      setScenarioLabel("");
      setEnteredFrom(null);
      clearActiveDashboardScenario();
    }
  }, [mode, hasScenarioDraft, clearActiveDashboardScenario]);

  const value = useMemo(
    () => ({
      mode,
      origin,
      scenarioLabel,
      enteredFrom,
      isPreviewMode: mode === "preview",
      enterPreviewFromScenarios,
      exitPreview,
      compareToBaselineCharts,
    }),
    [mode, origin, scenarioLabel, enteredFrom, enterPreviewFromScenarios, exitPreview, compareToBaselineCharts],
  );

  return <PlanningViewContext.Provider value={value}>{children}</PlanningViewContext.Provider>;
}

export function usePlanningView() {
  const ctx = useContext(PlanningViewContext);
  if (!ctx) {
    throw new Error("usePlanningView must be used within PlanningViewProvider");
  }
  return ctx;
}
