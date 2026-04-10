import { ASSUMPTION_TYPE, ASSUMPTION_UNIT } from "./types.js";

/**
 * @param {number} n 0–100 for display
 */
function trimPctDisplay(n) {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Machine value → UI string for a full assumption row.
 * @param {{ type: string, value: number | string, unit: string, key?: string }} a
 */
export function formatAssumptionValue(a) {
  const { type, value, unit, key } = a;
  if (value === null || value === undefined) return "—";

  switch (type) {
    case ASSUMPTION_TYPE.PERCENTAGE:
      if (unit === ASSUMPTION_UNIT.PERCENT && typeof value === "number") {
        return `${trimPctDisplay(value * 100)}%`;
      }
      return String(value);
    case ASSUMPTION_TYPE.COUNT:
      if (key === "hiring" && typeof value === "number") {
        return `+${value} roles by Q3`;
      }
      return typeof value === "number" ? String(value) : String(value);
    case ASSUMPTION_TYPE.FX_RATE:
      if (unit === ASSUMPTION_UNIT.INR_PER_USD && typeof value === "number") {
        return `₹/USD ${value}`;
      }
      return String(value);
    case ASSUMPTION_TYPE.CURRENCY:
      return typeof value === "number" ? `₹${value}` : String(value);
    case ASSUMPTION_TYPE.TEXT:
    default:
      return String(value);
  }
}

/**
 * Format canonical value for display when you have type/unit/key but not full assumption.
 * @param {{ type: string, unit: string, key?: string, value: number | string }} partial
 */
export function formatCanonicalForType(partial) {
  return formatAssumptionValue(partial);
}

/**
 * Bullet labels for structured usedIn.
 * @param {{ label: string, id: string }[]} usedIn
 */
export function getUsedInDisplay(usedIn) {
  if (!usedIn?.length) return [];
  return usedIn.map((o) => o.label);
}

/**
 * Parse manual prompt input into { value, valueDisplay } for an existing assumption.
 * @returns {{ value: number | string, valueDisplay: string } | null}
 */
export function parseUserInputForAssumption(assumption, raw) {
  const s = raw.trim();
  if (!s) return null;

  switch (assumption.type) {
    case ASSUMPTION_TYPE.PERCENTAGE: {
      const n = parseFloat(s.replace(/%/g, "").replace(/,/g, "").trim());
      if (Number.isNaN(n)) return null;
      const value = n / 100;
      return {
        value,
        valueDisplay: `${trimPctDisplay(n)}%`,
      };
    }
    case ASSUMPTION_TYPE.COUNT: {
      const digits = s.match(/\d+/);
      if (!digits) return null;
      const n = parseInt(digits[0], 10);
      if (Number.isNaN(n) || n < 0) return null;
      const valueDisplay =
        assumption.key === "hiring"
          ? `+${n} roles by Q3`
          : String(n);
      return { value: n, valueDisplay };
    }
    case ASSUMPTION_TYPE.FX_RATE: {
      const n = parseFloat(s.replace(/₹|USD|\/|\s/gi, "").replace(/,/g, "").trim());
      if (Number.isNaN(n)) return null;
      return { value: n, valueDisplay: `₹/USD ${n}` };
    }
    case ASSUMPTION_TYPE.CURRENCY: {
      const n = parseFloat(s.replace(/[₹,]/g, "").trim());
      if (Number.isNaN(n)) return null;
      return { value: n, valueDisplay: `₹${n}` };
    }
    case ASSUMPTION_TYPE.TEXT:
    default:
      return { value: s, valueDisplay: s };
  }
}

/**
 * Parse a raw value when creating a new assumption (no stable key yet).
 */
export function parseValueForNewAssumption(raw, type, unit) {
  return parseUserInputForAssumption({ type, unit, key: "custom", valueDisplay: "" }, raw);
}

export function defaultUnitForType(type) {
  switch (type) {
    case ASSUMPTION_TYPE.PERCENTAGE:
      return ASSUMPTION_UNIT.PERCENT;
    case ASSUMPTION_TYPE.CURRENCY:
      return ASSUMPTION_UNIT.INR;
    case ASSUMPTION_TYPE.COUNT:
      return ASSUMPTION_UNIT.COUNT;
    case ASSUMPTION_TYPE.FX_RATE:
      return ASSUMPTION_UNIT.INR_PER_USD;
    default:
      return ASSUMPTION_UNIT.TEXT;
  }
}

export const ASSUMPTION_TYPE_LABELS = {
  [ASSUMPTION_TYPE.PERCENTAGE]: "Percentage",
  [ASSUMPTION_TYPE.CURRENCY]: "Currency (INR)",
  [ASSUMPTION_TYPE.COUNT]: "Count",
  [ASSUMPTION_TYPE.FX_RATE]: "FX rate (₹/USD)",
  [ASSUMPTION_TYPE.TEXT]: "Text / note",
};
