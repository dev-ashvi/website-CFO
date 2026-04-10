import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import {
  WORKSPACE_DETECTED_METRICS,
  WORKSPACE_INSIGHTS_PREVIEW,
  WORKSPACE_MODELS_PREVIEW,
  WORKSPACE_PLANS_PREVIEW,
  WORKSPACE_STEPS,
} from "../../workspace/workspaceFlowConfig.js";
import { createDefaultWorkspaceAssumptions, nextAssumptionId } from "./workspaceAssumptionsDefaults.js";
import { loadPlanningWorkspaceDetectedMetrics } from "./workspaceDataBridge.js";

export const WORKSPACE_STEP_IDS = WORKSPACE_STEPS.map((s) => s.id);

function cloneItems(arr) {
  return arr.map((item) => ({ ...item }));
}

export function createInitialWorkspaceState() {
  return {
    currentStepId: "connect",
    furthestStepIndex: 0,
    completedStepIds: [],
    data: {
      files: [
        { id: "f-revenue", name: "revenue.csv" },
        { id: "f-expenses", name: "expenses_q1.csv" },
        { id: "f-mis", name: "March_2026_MIS.pdf" },
      ],
      selectedFiles: [],
      metrics: loadPlanningWorkspaceDetectedMetrics(),
    },
    assumptions: {
      items: createDefaultWorkspaceAssumptions(),
    },
    models: {
      items: cloneItems(WORKSPACE_MODELS_PREVIEW),
    },
    scenarios: {
      preview: {
        active: false,
        label: "",
        revenueDelta: null,
        runwayDelta: null,
        burnDelta: null,
        applied: false,
      },
      levers: { revenue: false, hiring: false, fx: false },
    },
    insights: {
      items: cloneItems(WORKSPACE_INSIGHTS_PREVIEW),
    },
    dashboard: {
      headline: null,
      saved: false,
    },
    plans: {
      items: cloneItems(WORKSPACE_PLANS_PREVIEW),
    },
  };
}

function computeDeltasFromLevers(levers) {
  let revenueDelta = "→";
  let runwayDelta = "→";
  let burnDelta = "→";
  if (levers.revenue) {
    revenueDelta = "↑";
    runwayDelta = "↑";
  }
  if (levers.hiring) {
    burnDelta = "↓";
    runwayDelta = "↑";
  }
  if (levers.fx) {
    revenueDelta = levers.revenue ? "↑" : "~";
  }
  return { revenueDelta, runwayDelta, burnDelta };
}

function findAssumptionIndexByName(items, nameMatch) {
  const q = nameMatch.toLowerCase().trim();
  if (!q) return -1;
  return items.findIndex(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      q.includes(a.name.toLowerCase()) ||
      a.name.toLowerCase().replace(/\s+/g, " ") === q,
  );
}

function applyStructuredAction(state, action) {
  switch (action.type) {
    case "add_assumption": {
      const p = action.payload;
      const id = p.id || nextAssumptionId();
      const row = {
        id,
        name: String(p.name || "Untitled driver").trim(),
        type: p.type === "currency" || p.type === "number" || p.type === "percentage" ? p.type : "number",
        value: typeof p.value === "number" && Number.isFinite(p.value) ? p.value : 0,
        description: String(p.description ?? "").trim(),
        usedIn: Array.isArray(p.usedIn) && p.usedIn.length ? [...p.usedIn] : ["Workspace models (demo)"],
      };
      return {
        ...state,
        assumptions: { ...state.assumptions, items: [...state.assumptions.items, row] },
      };
    }
    case "patch_assumption": {
      const idx = state.assumptions.items.findIndex((a) => a.id === action.id);
      if (idx < 0) return state;
      const next = [...state.assumptions.items];
      const cur = next[idx];
      const patch = action.patch || {};
      next[idx] = {
        ...cur,
        ...patch,
        name: patch.name != null ? String(patch.name).trim() : cur.name,
        type:
          patch.type === "currency" || patch.type === "number" || patch.type === "percentage"
            ? patch.type
            : cur.type,
        value: patch.value != null && Number.isFinite(Number(patch.value)) ? Number(patch.value) : cur.value,
        description: patch.description != null ? String(patch.description) : cur.description,
        usedIn: patch.usedIn != null ? (Array.isArray(patch.usedIn) ? [...patch.usedIn] : cur.usedIn) : cur.usedIn,
      };
      return { ...state, assumptions: { ...state.assumptions, items: next } };
    }
    case "patch_assumption_by_name": {
      const idx = findAssumptionIndexByName(state.assumptions.items, action.nameMatch);
      if (idx < 0) return state;
      return applyStructuredAction(state, {
        type: "patch_assumption",
        id: state.assumptions.items[idx].id,
        patch: action.patch,
      });
    }
    case "remove_assumption": {
      return {
        ...state,
        assumptions: {
          ...state.assumptions,
          items: state.assumptions.items.filter((a) => a.id !== action.id),
        },
      };
    }
    case "set_detected_metrics": {
      const raw = action.metrics;
      const metrics = Array.isArray(raw)
        ? raw
            .filter((m) => m && typeof m.id === "string" && typeof m.label === "string")
            .map((m) => ({ id: m.id, label: m.label }))
        : [];
      return {
        ...state,
        data: { ...state.data, metrics },
      };
    }
    case "set_data_selected_files": {
      const ids = Array.isArray(action.ids) ? action.ids.filter((x) => typeof x === "string") : [];
      const nextMetrics =
        ids.length && !state.data.metrics.length ? [...WORKSPACE_DETECTED_METRICS] : state.data.metrics;
      return {
        ...state,
        data: {
          ...state.data,
          selectedFiles: [...new Set(ids)],
          metrics: nextMetrics,
        },
      };
    }
    case "select_data_file_by_pattern": {
      const raw = String(action.pattern || "").toLowerCase().trim();
      if (!raw) return state;
      const base = raw.replace(/\.(csv|xlsx|pdf|txt)$/i, "");
      const matched = state.data.files.filter((f) => {
        const n = f.name.toLowerCase();
        return n === raw || n.includes(base) || n.replace(/\.(csv|xlsx|pdf|txt)$/i, "") === base;
      });
      const ids = matched.map((f) => f.id);
      if (!ids.length) return state;
      const merged = [...new Set([...state.data.selectedFiles, ...ids])];
      const nextMetrics =
        merged.length && !state.data.metrics.length ? [...WORKSPACE_DETECTED_METRICS] : state.data.metrics;
      return {
        ...state,
        data: {
          ...state.data,
          selectedFiles: merged,
          metrics: nextMetrics,
        },
      };
    }
    case "set_scenario_preview":
      return {
        ...state,
        scenarios: {
          ...state.scenarios,
          preview: {
            ...state.scenarios.preview,
            ...action.payload,
            active: true,
            applied: false,
          },
          levers: action.levers
            ? {
                revenue: Boolean(action.levers.revenue),
                hiring: Boolean(action.levers.hiring),
                fx: Boolean(action.levers.fx),
              }
            : state.scenarios.levers,
        },
      };
    case "toggle_scenario_lever": {
      const key = action.key;
      const levers = state.scenarios.levers;
      const nextLevers = { ...levers, [key]: !levers[key] };
      const any = nextLevers.revenue || nextLevers.hiring || nextLevers.fx;
      if (!any) {
        return {
          ...state,
          scenarios: {
            ...state.scenarios,
            levers: nextLevers,
            preview: {
              active: false,
              label: "",
              revenueDelta: null,
              runwayDelta: null,
              burnDelta: null,
              applied: false,
            },
          },
        };
      }
      const d = computeDeltasFromLevers(nextLevers);
      return {
        ...state,
        scenarios: {
          ...state.scenarios,
          levers: nextLevers,
          preview: {
            ...state.scenarios.preview,
            active: true,
            applied: false,
            label: state.scenarios.preview.label || "Quick adjustments",
            revenueDelta: d.revenueDelta,
            runwayDelta: d.runwayDelta,
            burnDelta: d.burnDelta,
          },
        },
      };
    }
    case "apply_scenario_preview":
      return {
        ...state,
        scenarios: {
          ...state.scenarios,
          preview: { ...state.scenarios.preview, applied: true },
        },
        dashboard: {
          ...state.dashboard,
          headline: "Scenario preview is reflected on dashboard widgets in this demo workspace.",
        },
      };
    case "add_insight":
      return {
        ...state,
        insights: {
          ...state.insights,
          items: [{ id: `i-${Date.now()}`, ...action.payload }, ...state.insights.items].slice(0, 12),
        },
      };
    case "add_plan":
      return {
        ...state,
        plans: {
          ...state.plans,
          items: [...state.plans.items, { id: `p-${Date.now()}`, ...action.payload }],
        },
      };
    case "go_to_step": {
      const idx = WORKSPACE_STEP_IDS.indexOf(action.step);
      if (idx < 0 || idx > state.furthestStepIndex) return state;
      return { ...state, currentStepId: action.step };
    }
    case "mark_step_complete": {
      const idx = WORKSPACE_STEP_IDS.indexOf(action.step);
      if (idx < 0) return state;
      const done = new Set(state.completedStepIds);
      done.add(action.step);
      const nextIdx = Math.min(idx + 1, WORKSPACE_STEP_IDS.length - 1);
      return {
        ...state,
        completedStepIds: [...done],
        furthestStepIndex: Math.max(state.furthestStepIndex, nextIdx),
        currentStepId: WORKSPACE_STEP_IDS[nextIdx],
      };
    }
    case "continue_step": {
      const idx = WORKSPACE_STEP_IDS.indexOf(state.currentStepId);
      if (idx < 0) return state;
      const id = state.currentStepId;
      const done = new Set(state.completedStepIds);
      done.add(id);
      const nextIdx = Math.min(idx + 1, WORKSPACE_STEP_IDS.length - 1);
      return {
        ...state,
        completedStepIds: [...done],
        furthestStepIndex: Math.max(state.furthestStepIndex, nextIdx),
        currentStepId: WORKSPACE_STEP_IDS[nextIdx],
      };
    }
    case "select_step": {
      if (action.index > state.furthestStepIndex) return state;
      return { ...state, currentStepId: WORKSPACE_STEP_IDS[action.index] };
    }
    case "save_dashboard":
      return {
        ...state,
        dashboard: { ...state.dashboard, saved: true },
      };
    case "BATCH":
      return action.actions.reduce((s, a) => applyStructuredAction(s, a), state);
    default:
      return state;
  }
}

function workspaceReducer(state, action) {
  return applyStructuredAction(state, action);
}

const PlanningWorkspaceContext = createContext(null);

export function PlanningWorkspaceProvider({ children }) {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialWorkspaceState);

  const applyGuideActions = useCallback((actions) => {
    if (!actions?.length) return;
    dispatch({ type: "BATCH", actions });
  }, []);

  const refreshDetectedMetricsFromStorage = useCallback(() => {
    dispatch({ type: "set_detected_metrics", metrics: loadPlanningWorkspaceDetectedMetrics() });
  }, []);

  const addAssumption = useCallback((payload) => {
    dispatch({ type: "add_assumption", payload });
  }, []);

  const patchAssumption = useCallback((id, patch) => {
    dispatch({ type: "patch_assumption", id, patch });
  }, []);

  const removeAssumption = useCallback((id) => {
    dispatch({ type: "remove_assumption", id });
  }, []);

  const toggleScenarioLever = useCallback((key) => {
    dispatch({ type: "toggle_scenario_lever", key });
  }, []);

  const applyScenarioPreview = useCallback(() => {
    dispatch({ type: "apply_scenario_preview" });
  }, []);

  const continueStep = useCallback(() => {
    dispatch({ type: "continue_step" });
  }, []);

  const selectStep = useCallback((index) => {
    dispatch({ type: "select_step", index });
  }, []);

  const saveDashboard = useCallback(() => {
    dispatch({ type: "save_dashboard" });
  }, []);

  const snapshotForGuide = useCallback(
    () => ({
      currentStepId: state.currentStepId,
      furthestStepIndex: state.furthestStepIndex,
      data: state.data,
      assumptions: state.assumptions.items,
      scenarios: state.scenarios,
      insights: state.insights.items,
      plans: state.plans.items,
    }),
    [
      state.currentStepId,
      state.furthestStepIndex,
      state.data,
      state.assumptions.items,
      state.scenarios,
      state.insights.items,
      state.plans.items,
    ],
  );

  const value = useMemo(
    () => ({
      ...state,
      dispatch,
      applyGuideActions,
      refreshDetectedMetricsFromStorage,
      addAssumption,
      patchAssumption,
      removeAssumption,
      toggleScenarioLever,
      applyScenarioPreview,
      continueStep,
      selectStep,
      saveDashboard,
      snapshotForGuide,
    }),
    [
      state,
      applyGuideActions,
      refreshDetectedMetricsFromStorage,
      addAssumption,
      patchAssumption,
      removeAssumption,
      toggleScenarioLever,
      applyScenarioPreview,
      continueStep,
      selectStep,
      saveDashboard,
      snapshotForGuide,
    ],
  );

  return <PlanningWorkspaceContext.Provider value={value}>{children}</PlanningWorkspaceContext.Provider>;
}

export function usePlanningWorkspace() {
  const ctx = useContext(PlanningWorkspaceContext);
  if (!ctx) {
    throw new Error("usePlanningWorkspace must be used within PlanningWorkspaceProvider");
  }
  return ctx;
}
