/** @typedef {{ type: 'dashboard' | 'report' | 'model', id: string, label: string }} OutputRef */

/** @type {Record<string, OutputRef>} */
export const OUTPUT_REFS = {
  forecast_dashboard: { type: "dashboard", id: "forecast_dashboard", label: "Forecast dashboard" },
  runway_dashboard: { type: "dashboard", id: "runway_dashboard", label: "Runway projection" },
  investor_report: { type: "report", id: "investor_report", label: "Investor report" },
  runway_model: { type: "model", id: "runway_model", label: "Runway model" },
  headcount_plan: { type: "report", id: "headcount_plan", label: "Headcount plan" },
  board_pack: { type: "report", id: "board_pack", label: "Board pack" },
};

/** @param {OutputRef[]} base @param {OutputRef[]} extra */
export function mergeOutputRefs(base, extra) {
  const map = new Map();
  for (const ref of [...base, ...extra]) {
    map.set(ref.id, ref);
  }
  return Array.from(map.values());
}
