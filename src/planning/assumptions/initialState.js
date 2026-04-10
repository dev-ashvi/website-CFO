import { OUTPUT_REFS } from "./outputRefs.js";
import {
  ASSUMPTION_STATUS,
  ASSUMPTION_TYPE,
  ASSUMPTION_UNIT,
} from "./types.js";
import { businessAffectsFromOutputs } from "./businessAffects.js";
import { formatAssumptionValue } from "./format.js";

/**
 * @returns {import('./assumptionRecord.js').AssumptionRecord[]}
 */
export function createInitialAssumptions() {
  /** @type {import('./assumptionRecord.js').AssumptionRecord[]} */
  const rows = [
    {
      id: "a1",
      key: "revenue_growth",
      label: "Revenue growth",
      type: ASSUMPTION_TYPE.PERCENTAGE,
      value: 0.08,
      unit: ASSUMPTION_UNIT.PERCENT,
      status: ASSUMPTION_STATUS.CONFIRMED,
      source: null,
      usedIn: [OUTPUT_REFS.forecast_dashboard, OUTPUT_REFS.investor_report],
      affects: ["Revenue projection", "Growth outlook", "Runway sensitivity"],
      note: null,
      lastUpdatedAt: null,
      lastUpdatedBy: null,
      chatSessionId: null,
      relatedUserMessage: null,
      changeReason: null,
    },
    {
      id: "a2",
      key: "hiring",
      label: "Hiring",
      type: ASSUMPTION_TYPE.COUNT,
      value: 3,
      unit: ASSUMPTION_UNIT.COUNT,
      status: ASSUMPTION_STATUS.CONFIRMED,
      source: null,
      usedIn: [OUTPUT_REFS.runway_model, OUTPUT_REFS.headcount_plan],
      affects: ["Headcount planning", "Runway outlook", "Cost trajectory"],
      note: null,
      lastUpdatedAt: null,
      lastUpdatedBy: null,
      chatSessionId: null,
      relatedUserMessage: null,
      changeReason: null,
    },
    {
      id: "a3",
      key: "fx",
      label: "FX",
      type: ASSUMPTION_TYPE.FX_RATE,
      value: 83.2,
      unit: ASSUMPTION_UNIT.INR_PER_USD,
      status: ASSUMPTION_STATUS.CONFIRMED,
      source: null,
      usedIn: [OUTPUT_REFS.forecast_dashboard, OUTPUT_REFS.board_pack],
      affects: ["INR reporting", "Cross-border exposure", "Board figures"],
      note: null,
      lastUpdatedAt: null,
      lastUpdatedBy: null,
      chatSessionId: null,
      relatedUserMessage: null,
      changeReason: null,
    },
  ];

  return rows.map((r) => {
    const base = { ...r };
    if (!base.affects?.length) {
      base.affects = businessAffectsFromOutputs(base.usedIn);
    }
    return {
      ...base,
      valueDisplay: formatAssumptionValue(base),
    };
  });
}
