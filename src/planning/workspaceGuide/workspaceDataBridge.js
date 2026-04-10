/**
 * Bridges Planning Workspace “detected metrics” with the Data section.
 * Data routes live outside PlanningWorkspaceProvider, so we persist to sessionStorage
 * and broadcast for the workspace to refresh.
 */

import { WORKSPACE_DETECTED_METRICS } from "../../workspace/workspaceFlowConfig.js";

export const PLANNING_WORKSPACE_METRICS_STORAGE_KEY = "cfo.planningWorkspace.detectedMetrics.v1";

export const PLANNING_WORKSPACE_METRICS_EVENT = "planning-workspace-metrics-updated";

/** @returns {{ id: string, label: string }[]} */
export function loadPlanningWorkspaceDetectedMetrics() {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(PLANNING_WORKSPACE_METRICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === "string" && typeof x.label === "string")
      .map((x) => ({ id: x.id, label: x.label }));
  } catch {
    return [];
  }
}

/**
 * @param {{ id: string, label: string }[]} metrics
 */
export function savePlanningWorkspaceDetectedMetrics(metrics) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PLANNING_WORKSPACE_METRICS_STORAGE_KEY, JSON.stringify(metrics));
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new CustomEvent(PLANNING_WORKSPACE_METRICS_EVENT));
}

/** Demo: mark workspace as having the standard detected metrics after an action in Data. */
export function seedDefaultDetectedMetricsForWorkspace() {
  savePlanningWorkspaceDetectedMetrics([...WORKSPACE_DETECTED_METRICS]);
}
