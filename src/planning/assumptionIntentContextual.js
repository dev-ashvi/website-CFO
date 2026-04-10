/**
 * Resolve assumption-change intent when the user is focused on one assumption row
 * (e.g. contextual panel). Augments short prompts like "What if this becomes 12%?"
 */

import { detectAssumptionIntent } from "./assumptionIntent.js";
import { OUTPUT_REFS } from "./assumptions/outputRefs.js";
import { ASSUMPTION_TYPE } from "./assumptions/types.js";

function percentStringToCanonical(pctFragment) {
  const m = String(pctFragment).match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1]) / 100;
}

/**
 * @param {string} text
 * @param {import('./assumptions/assumptionRecord.js').AssumptionRecord[]} assumptions
 * @param {import('./assumptions/assumptionRecord.js').AssumptionRecord} focusRow
 * @returns {import('./assumptions/buildProposal.js').AssumptionIntentMatch | null}
 */
export function resolveIntentForFocusedAssumption(text, assumptions, focusRow) {
  const raw = text.trim();
  if (!raw || !focusRow) return null;

  const hinted = /\b(this|that|it|this one|this assumption)\b/i.test(raw)
    ? `${focusRow.label} — ${raw}`
    : raw;

  const global = detectAssumptionIntent(hinted, assumptions);
  if (global && global.assumptionKey === focusRow.key) return global;

  const isWhatIf = /\bwhat\s+if\b/i.test(raw);
  const wantsApply =
    /(apply|change|update|set|to\s*=|move\s+to|becomes?)/i.test(raw) && !isWhatIf;
  const stressCompare = /\bcompare\b|downside|optimistic|stress|scenario\b/i.test(raw);

  if (focusRow.type === ASSUMPTION_TYPE.PERCENTAGE) {
    const m = raw.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) {
      const v = percentStringToCanonical(`${m[1]}%`);
      if (v == null) return null;
      const extraImpact =
        focusRow.key === "revenue_growth" ? [OUTPUT_REFS.runway_dashboard] : undefined;
      const mode =
        isWhatIf || stressCompare ? "scenario" : wantsApply ? "apply" : "scenario";
      return { mode, assumptionKey: focusRow.key, proposedValue: v, extraImpact };
    }
  }

  if (focusRow.type === ASSUMPTION_TYPE.COUNT) {
    const m = raw.match(/\b(\d+)\b/);
    if (
      m &&
      (isWhatIf ||
        wantsApply ||
        /hiring|headcount|people|roles?|reduce|cut|lower/i.test(raw) ||
        /\b(this|that|it)\b/i.test(raw))
    ) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) {
        return {
          mode: isWhatIf || stressCompare || !wantsApply ? "scenario" : "apply",
          assumptionKey: focusRow.key,
          proposedValue: n,
        };
      }
    }
  }

  if (focusRow.type === ASSUMPTION_TYPE.FX_RATE) {
    const m = raw.match(/(\d+(?:\.\d+)?)/);
    if (m && (isWhatIf || wantsApply || /fx|usd|inr|rate/i.test(raw))) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n) && n > 1) {
        return {
          mode: isWhatIf || stressCompare || !wantsApply ? "scenario" : "apply",
          assumptionKey: focusRow.key,
          proposedValue: n,
        };
      }
    }
  }

  return null;
}
