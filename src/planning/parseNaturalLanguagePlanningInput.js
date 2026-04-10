import {
  ASSUMPTION_TYPE_LABELS,
  defaultUnitForType,
  parseValueForNewAssumption,
} from "./assumptions/format.js";
import { OUTPUT_REFS } from "./assumptions/outputRefs.js";
import { ASSUMPTION_TYPE, ASSUMPTION_UNIT } from "./assumptions/types.js";

/**
 * Guess output ref keys from free text.
 * @param {string} text
 * @returns {string[]}
 */
export function inferOutputKeysFromText(text) {
  const keys = new Set();
  const t = text.toLowerCase();
  if (/investor/.test(t)) keys.add("investor_report");
  if (/forecast/.test(t)) keys.add("forecast_dashboard");
  if (/board/.test(t)) keys.add("board_pack");
  if (/runway model/.test(t)) keys.add("runway_model");
  else if (/runway/.test(t)) keys.add("runway_dashboard");
  if (/headcount|people plan/.test(t)) keys.add("headcount_plan");
  if (keys.size === 0) {
    keys.add("forecast_dashboard");
    keys.add("investor_report");
  }
  return [...keys].filter((k) => OUTPUT_REFS[k]);
}

/**
 * Heuristic parse for “Add planning input” AI flow (no network).
 * @param {string} raw
 * @returns {object | null} fields compatible with addAssumption (+ outputKeys, typeLabel, unitLabel)
 */
export function parseNaturalLanguagePlanningInput(raw) {
  const text = raw.trim();
  if (!text) return null;

  const outputKeys = inferOutputKeysFromText(text);

  const build = (partial) => ({
    ...partial,
    outputKeys,
    typeLabel: ASSUMPTION_TYPE_LABELS[partial.type],
    unitLabel:
      partial.unit === ASSUMPTION_UNIT.PERCENT
        ? "Percent (%)"
        : partial.unit === ASSUMPTION_UNIT.INR
          ? "INR"
          : partial.unit === ASSUMPTION_UNIT.COUNT
            ? "Count (whole number)"
            : partial.unit === ASSUMPTION_UNIT.INR_PER_USD
              ? "INR per 1 USD"
              : "Text",
  });

  // VAT / GST / tax / generic percent
  if (/\b(vat|gst|tax\s+rate|withholding)\b/i.test(text) || /\d+(?:\.\d+)?\s*%/.test(text)) {
    const pm = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!pm) return null;
    const type = ASSUMPTION_TYPE.PERCENTAGE;
    const unit = defaultUnitForType(type);
    const parsed = parseValueForNewAssumption(`${pm[1]}%`, type, unit);
    if (!parsed) return null;
    let label = "Planning rate";
    if (/\bvat\b/i.test(text)) label = "VAT rate";
    else if (/\bgst\b/i.test(text)) label = "GST rate";
    else if (/\btax\b/i.test(text)) label = "Tax rate";
    else {
      const name = text.match(
        /(?:add|create|new)\s+(?:an?\s+)?(.+?)\s+(?:of|at|=\s*)/i,
      );
      if (name) label = name[1].replace(/\b(assumption|rate)\b/gi, "").trim() || "Custom rate";
      else label = "Custom rate";
    }
    return build({
      label: label.replace(/\s+/g, " ").trim(),
      type,
      unit,
      value: parsed.value,
      valueDisplay: parsed.valueDisplay,
      note: null,
    });
  }

  // FX / USD–INR
  if (/\b(fx|usd|inr|₹\s*\/?\s*usd|exchange\s+rate)\b/i.test(text)) {
    const nm = text.match(/\b(\d{2}(?:\.\d+)?)\b/);
    if (!nm) return null;
    const type = ASSUMPTION_TYPE.FX_RATE;
    const unit = defaultUnitForType(type);
    const parsed = parseValueForNewAssumption(nm[1], type, unit);
    if (!parsed) return null;
    return build({
      label: /\bfx\b/i.test(text) ? "FX (USD/INR)" : "USD/INR rate",
      type,
      unit,
      value: parsed.value,
      valueDisplay: parsed.valueDisplay,
      note: null,
    });
  }

  // Hiring / headcount (count)
  if (/\b(hiring|headcount|roles?|fte|people|positions?)\b/i.test(text)) {
    const dm = text.match(/\b(\d+)\s*(?:people|roles?|hires?|fte|positions?)?\b/i);
    const type = ASSUMPTION_TYPE.COUNT;
    const unit = defaultUnitForType(type);
    if (dm) {
      const parsed = parseValueForNewAssumption(dm[1], type, unit);
      if (!parsed) return null;
      const qm = text.match(/\bq[1-4]\b/i);
      return build({
        label: /\bhiring\b/i.test(text) ? "Hiring" : "Headcount",
        type,
        unit,
        value: parsed.value,
        valueDisplay: parsed.valueDisplay,
        note: qm ? qm[0].toUpperCase() : null,
      });
    }
    const typeText = ASSUMPTION_TYPE.TEXT;
    const unitText = defaultUnitForType(typeText);
    return build({
      label: "Hiring plan note",
      type: typeText,
      unit: unitText,
      value: text.slice(0, 200),
      valueDisplay: text.slice(0, 120) + (text.length > 120 ? "…" : ""),
      note: null,
    });
  }

  // Currency INR
  if (/[₹]|\binr\b|\brupees?\b|\bcrore|\blakhs?\b/i.test(text)) {
    const nm = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
    if (!nm) return null;
    const type = ASSUMPTION_TYPE.CURRENCY;
    const unit = defaultUnitForType(type);
    const rawNum = nm[1].replace(/,/g, "");
    let mult = 1;
    if (/\bcrore/i.test(text)) mult = 1e7;
    else if (/\blakh/i.test(text)) mult = 1e5;
    const n = parseFloat(rawNum) * mult;
    if (Number.isNaN(n)) return null;
    const parsed = parseValueForNewAssumption(String(n), type, unit);
    if (!parsed) return null;
    const lab = text.match(/(?:for|called)\s+([^,.]+?)(?:\s+of|\s*$)/i);
    return build({
      label: lab ? lab[1].trim() : "Cash / expense line",
      type,
      unit,
      value: parsed.value,
      valueDisplay: parsed.valueDisplay,
      note: null,
    });
  }

  return null;
}
