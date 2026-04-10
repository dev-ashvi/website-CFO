/**
 * Client-side intent detection → structured, proposal-ready matches (MVP heuristics).
 */

import { mergeOutputRefs, OUTPUT_REFS } from "./assumptions/outputRefs.js";

/**
 * @param {string} pctFragment e.g. "12%"
 * @returns {number|null} canonical 0.12
 */
function percentStringToCanonical(pctFragment) {
  const m = pctFragment.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1]) / 100;
}

/**
 * @param {import('./assumptions/assumptionRecord.js').AssumptionRecord[]} assumptions
 * @returns {import('./assumptions/buildProposal.js').AssumptionIntentMatch | null}
 */
export function detectAssumptionIntent(text, assumptions) {
  const raw = text.trim();
  if (!raw) return null;

  const find = (key) => assumptions.find((a) => a.key === key) || null;

  const pctStr = () => {
    const m = raw.match(/(\d+(?:\.\d+)?)\s*%/);
    return m ? `${m[1]}%` : null;
  };

  const pctAfterTo = () => {
    const m = raw.match(/(?:to|=)\s*(\d+(?:\.\d+)?)\s*%?/i);
    return m ? `${m[1]}%` : null;
  };

  const pctGrowVerb = () => {
    const m = raw.match(/grows?\s+(\d+(?:\.\d+)?)\s*%?/i);
    return m ? `${m[1]}%` : null;
  };

  const hiringNum = () => {
    const m = raw.match(/\b(\d+)\s*(?:people|person|roles?|headcount|hires?)?\b/i);
    return m ? parseInt(m[1], 10) : null;
  };

  const fxNum = () => {
    const m =
      raw.match(/=\s*(\d+(?:\.\d+)?)/) ||
      raw.match(/USD\s*(\d+(?:\.\d+)?)/i) ||
      raw.match(/₹\/?\s*USD\s*(\d+(?:\.\d+)?)/i) ||
      raw.match(/(?:assume|set|use)\s+(\d+(?:\.\d+)?)\s*$/im);
    return m ? parseFloat(m[1]) : NaN;
  };

  const isWhatIf = /\bwhat\s+if\b/i.test(raw);

  const revenueExtra = [OUTPUT_REFS.runway_dashboard];

  // —— Scenario (preview) ——
  if (isWhatIf) {
    if (/revenue|growth/i.test(raw)) {
      const p = pctStr() || pctAfterTo() || pctGrowVerb();
      if (p && find("revenue_growth")) {
        const v = percentStringToCanonical(p);
        if (v == null) return null;
        return {
          mode: "scenario",
          assumptionKey: "revenue_growth",
          proposedValue: v,
          extraImpact: revenueExtra,
        };
      }
    }
    if (/hiring|headcount|roles?|people/i.test(raw)) {
      const n = hiringNum();
      if (n != null && find("hiring")) {
        return { mode: "scenario", assumptionKey: "hiring", proposedValue: n };
      }
    }
    if (/usd|fx|inr|₹/i.test(raw)) {
      let num = fxNum();
      if (Number.isNaN(num)) {
        const m = raw.match(/\b(\d{2}(?:\.\d+)?)\b/);
        num = m ? parseFloat(m[1]) : NaN;
      }
      if (!Number.isNaN(num) && find("fx")) {
        return { mode: "scenario", assumptionKey: "fx", proposedValue: num };
      }
    }
    return null;
  }

  // —— Apply (proposal) ——
  if (/(revenue\s+growth|growth.*revenue|revenue.*growth)/i.test(raw) && /(increase|set|change|update|move|to|=)/i.test(raw)) {
    const p = pctStr() || pctAfterTo() || pctGrowVerb();
    if (p && find("revenue_growth")) {
      const v = percentStringToCanonical(p);
      if (v == null) return null;
      return {
        mode: "apply",
        assumptionKey: "revenue_growth",
        proposedValue: v,
        extraImpact: revenueExtra,
      };
    }
  }

  if (/(hiring|headcount|roles?|people)/i.test(raw) && /(reduce|cut|lower|set|change|update|to|=)/i.test(raw)) {
    const n = hiringNum();
    if (n != null && find("hiring")) {
      return { mode: "apply", assumptionKey: "hiring", proposedValue: n };
    }
  }

  if (
    /assume\s+usd|usd\s*=|₹\/?usd|set\s+fx|change\s+fx|assume\s+(\d)/i.test(raw) ||
    (/fx|exchange\s+rate/i.test(raw) && /\d/.test(raw))
  ) {
    let num = fxNum();
    if (Number.isNaN(num)) {
      const m = raw.match(/\b(8[0-9](?:\.\d+)?)\b/);
      num = m ? parseFloat(m[1]) : NaN;
    }
    if (!Number.isNaN(num) && find("fx")) {
      return { mode: "apply", assumptionKey: "fx", proposedValue: num };
    }
  }

  return null;
}
