/** Default seed assumptions for Planning Workspace (demo). */

export const ASSUMPTION_TYPES = /** @type {const} */ (["percentage", "currency", "number"]);

/** @typedef {{ id: string, name: string, type: typeof ASSUMPTION_TYPES[number], value: number, description: string, usedIn: string[] }} WorkspaceAssumption */

/** @returns {WorkspaceAssumption[]} */
export function createDefaultWorkspaceAssumptions() {
  return [
    {
      id: "a-revenue-growth",
      name: "Revenue growth",
      type: "percentage",
      value: 12,
      description: "YoY recognized revenue growth baseline.",
      usedIn: ["Revenue model", "Scenarios", "Dashboard KPIs"],
    },
    {
      id: "a-hiring-plan",
      name: "Hiring plan",
      type: "number",
      value: 8,
      description: "Net new roles per quarter.",
      usedIn: ["Burn model", "Runway projection"],
    },
    {
      id: "a-fx-drift",
      name: "FX drift",
      type: "percentage",
      value: 1.5,
      description: "Reporting currency translational drift.",
      usedIn: ["Revenue model", "Investor reporting"],
    },
  ];
}

export function formatAssumptionValue(type, value) {
  if (type === "percentage") return `${value}%`;
  if (type === "currency") return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return String(value);
}

export function nextAssumptionId() {
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
