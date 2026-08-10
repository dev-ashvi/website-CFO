import { cloneInputs } from "./scenarios/types.js";
import { calculateProjection } from "./calculateProjection.js";
import { calculateKpis } from "./calculateKpis.js";
import { withFundingAwareRunway } from "./plannedFunding.js";

/**
 * Deterministic dashboard overlays — mutate a clone of base inputs, then re-run the engine.
 * No new financial formulas beyond existing projection / KPI pipeline.
 * Skips form validation (contact fields) — overlays run on already-accepted base inputs.
 */

function simulate(inputs) {
  const data = cloneInputs(inputs);
  const months = calculateProjection(data);
  const kpis = withFundingAwareRunway(data, months, calculateKpis(months));
  return { ok: true, inputs: data, months, kpis };
}

export const WHATIF_OVERLAYS = [
  {
    id: "revenue-up-5",
    label: "+5% Revenue",
    apply(inputs) {
      const next = cloneInputs(inputs);
      next.currentMonthlyRevenue = Number(next.currentMonthlyRevenue || 0) * 1.05;
      next.currentVolume = Number(next.currentVolume || 0) * 1.05;
      return next;
    },
  },
  {
    id: "fixed-down-10",
    label: "−10% Fixed Costs",
    apply(inputs) {
      const next = cloneInputs(inputs);
      next.opexReductionRate = 0.1;
      next.opexReductionFromMonth = 2;
      next.opexReductionTarget = "fixed";
      delete next.payrollGrowthDelayMonths;
      return next;
    },
  },
  {
    id: "gm-up-5",
    label: "+5% Gross Margin",
    apply(inputs) {
      const next = cloneInputs(inputs);
      next.cogsPercent = Math.max(0, Number(next.cogsPercent || 0) - 0.05);
      return next;
    },
  },
];

export const SCENARIO_MODES = [
  {
    id: "current",
    label: "Current",
    description: "Your submitted assumptions",
    apply: (inputs) => cloneInputs(inputs),
  },
  {
    id: "conservative",
    label: "Conservative",
    description: "Slower growth, leaner hiring",
    apply(inputs) {
      const next = cloneInputs(inputs);
      if (next.revenueMode === "detailed") {
        next.monthlyVolumeGrowth = Number(next.monthlyVolumeGrowth || 0) * 0.5;
      } else {
        next.monthlyRevenueGrowth = Number(next.monthlyRevenueGrowth || 0) * 0.5;
      }
      next.payrollGrowth = Math.max(0, Number(next.payrollGrowth || 0) * 0.5);
      next.otherFixedGrowth = Math.max(0, Number(next.otherFixedGrowth || 0) * 0.5);
      return next;
    },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    description: "Faster growth, tighter variable spend",
    apply(inputs) {
      const next = cloneInputs(inputs);
      if (next.revenueMode === "detailed") {
        next.monthlyVolumeGrowth = Number(next.monthlyVolumeGrowth || 0) + 0.05;
      } else {
        next.monthlyRevenueGrowth = Number(next.monthlyRevenueGrowth || 0) + 0.05;
      }
      next.opexReductionRate = 0.05;
      next.opexReductionFromMonth = 2;
      next.opexReductionTarget = "variable";
      delete next.payrollGrowthDelayMonths;
      return next;
    },
  },
  {
    id: "investor",
    label: "Investor Case",
    description: "15% faster growth, raise, hiring plan",
    apply(inputs) {
      const next = cloneInputs(inputs);
      if (next.revenueMode === "detailed") {
        next.monthlyVolumeGrowth = Number(next.monthlyVolumeGrowth || 0) + 0.15;
      } else {
        next.monthlyRevenueGrowth = Number(next.monthlyRevenueGrowth || 0) + 0.15;
      }
      next.monthlyPayroll = Number(next.monthlyPayroll || 0) * 1.1;
      next.payrollGrowth = Math.max(Number(next.payrollGrowth || 0), 0.01);
      const equity = [...(next.equityEvents || [])];
      const hasRaise = equity.some((e) => Number(e.amount) >= 2_500_000);
      if (!hasRaise) {
        equity.push({ monthIndex: 6, amount: 5_000_000 });
      }
      next.equityEvents = equity;
      return next;
    },
  },
];

export const OPPORTUNITY_OVERLAYS = {
  "delay-capex-3": {
    id: "delay-capex-3",
    label: "Delay CapEx by 3 months",
    apply(inputs) {
      const next = cloneInputs(inputs);
      next.capexEvents = (next.capexEvents || []).map((ev) => ({
        ...ev,
        monthIndex: Math.min(24, Math.max(1, Number(ev.monthIndex || 1) + 3)),
      }));
      return next;
    },
  },
  "fixed-down-10": WHATIF_OVERLAYS.find((o) => o.id === "fixed-down-10"),
  "gm-up-5": WHATIF_OVERLAYS.find((o) => o.id === "gm-up-5"),
  "variable-down-5": {
    id: "variable-down-5",
    label: "Tighten variable spend by 5%",
    apply(inputs) {
      const next = cloneInputs(inputs);
      next.opexReductionRate = 0.05;
      next.opexReductionFromMonth = 2;
      next.opexReductionTarget = "variable";
      delete next.payrollGrowthDelayMonths;
      return next;
    },
  },
};

/**
 * @param {object} baseInputs
 * @param {{ kind: 'scenario' | 'whatif' | 'opportunity', id: string }} overlay
 * @returns {{ ok: true, sim: object, label: string } | { ok: false, errors?: string[] }}
 */
export function runDashboardOverlay(baseInputs, overlay) {
  if (!baseInputs || !overlay) return { ok: false };
  let def = null;
  let label = overlay.id;
  if (overlay.kind === "scenario") {
    def = SCENARIO_MODES.find((s) => s.id === overlay.id);
    label = def?.label || label;
  } else if (overlay.kind === "whatif") {
    def = WHATIF_OVERLAYS.find((s) => s.id === overlay.id);
    label = def?.label || label;
  } else if (overlay.kind === "opportunity") {
    def = OPPORTUNITY_OVERLAYS[overlay.id];
    label = def?.label || label;
  }
  if (!def?.apply) return { ok: false };
  if (overlay.kind === "scenario" && overlay.id === "current") {
    const sim = simulate(cloneInputs(baseInputs));
    return sim.ok ? { ok: true, sim, label: "Current" } : { ok: false, errors: sim.errors };
  }
  const nextInputs = def.apply(baseInputs);
  const sim = simulate(nextInputs);
  if (!sim.ok) return { ok: false, errors: sim.errors };
  return { ok: true, sim, label };
}
