import { createContext, useCallback, useContext, useMemo, useReducer } from "react";

function nextId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createInitialDashboardState() {
  return {
    dashboards: [{ id: "d-default", name: "My dashboard" }],
    activeDashboardId: "d-default",
    blocks: [],
    filters: { timeRange: "12m" },
  };
}

function blocksForDashboard(state, dashboardId) {
  return state.blocks.filter((b) => b.dashboardId === dashboardId);
}

function applyDashboardAction(state, action) {
  switch (action.type) {
    case "ADD_BLOCK": {
      const b = action.payload;
      const block = {
        ...b,
        id: b.id || nextId("b"),
        dashboardId: b.dashboardId || state.activeDashboardId,
      };
      return { ...state, blocks: [...state.blocks, block] };
    }
    case "UPDATE_BLOCK": {
      const { id, patch } = action.payload;
      return {
        ...state,
        blocks: state.blocks.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      };
    }
    case "REMOVE_BLOCK": {
      return {
        ...state,
        blocks: state.blocks.filter((x) => x.id !== action.payload.id),
      };
    }
    case "SET_FILTERS": {
      return {
        ...state,
        filters: { ...state.filters, ...action.payload },
      };
    }
    case "SET_ACTIVE_DASHBOARD": {
      if (!state.dashboards.some((d) => d.id === action.payload.id)) return state;
      return { ...state, activeDashboardId: action.payload.id };
    }
    case "ADD_DASHBOARD": {
      const id = action.payload.id || nextId("d");
      const name = action.payload.name || "New dashboard";
      return {
        ...state,
        dashboards: [...state.dashboards, { id, name }],
        activeDashboardId: id,
      };
    }
    case "BATCH":
      return action.actions.reduce((s, a) => applyDashboardAction(s, a), state);
    default:
      return state;
  }
}

function dashboardReducer(state, action) {
  return applyDashboardAction(state, action);
}

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(dashboardReducer, undefined, createInitialDashboardState);

  const applyChatActions = useCallback((actions) => {
    if (!actions?.length) return;
    dispatch({ type: "BATCH", actions });
  }, []);

  const addBlock = useCallback((payload) => {
    dispatch({ type: "ADD_BLOCK", payload });
  }, []);

  const updateBlock = useCallback((id, patch) => {
    dispatch({ type: "UPDATE_BLOCK", payload: { id, patch } });
  }, []);

  const removeBlock = useCallback((id) => {
    dispatch({ type: "REMOVE_BLOCK", payload: { id } });
  }, []);

  const setFilters = useCallback((patch) => {
    dispatch({ type: "SET_FILTERS", payload: patch });
  }, []);

  const snapshotForChat = useCallback(
    () => ({
      blocks: blocksForDashboard(state, state.activeDashboardId),
      filters: state.filters,
      activeDashboardId: state.activeDashboardId,
      dashboards: state.dashboards,
    }),
    [state],
  );

  const value = useMemo(
    () => ({
      ...state,
      dispatch,
      applyChatActions,
      addBlock,
      updateBlock,
      removeBlock,
      setFilters,
      snapshotForChat,
      /** Blocks visible on canvas */
      canvasBlocks: blocksForDashboard(state, state.activeDashboardId),
    }),
    [state, applyChatActions, addBlock, updateBlock, removeBlock, setFilters, snapshotForChat],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return ctx;
}
