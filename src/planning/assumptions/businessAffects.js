/**
 * Business-language “Affects” lines derived from where an assumption is used.
 * @param {{ id: string }[]} usedIn
 * @returns {string[]}
 */
export function businessAffectsFromOutputs(usedIn) {
  if (!usedIn?.length) return ["Planning baseline"];
  const out = [];
  const seen = new Set();
  for (const r of usedIn) {
    let line = null;
    switch (r.id) {
      case "forecast_dashboard":
        line = "Revenue and margin outlook";
        break;
      case "runway_dashboard":
        line = "Runway and liquidity timing";
        break;
      case "investor_report":
        line = "Investor storyline and metrics";
        break;
      case "runway_model":
        line = "Cash runway scenarios";
        break;
      case "headcount_plan":
        line = "People cost and capacity";
        break;
      case "board_pack":
        line = "Board reporting pack";
        break;
      default:
        line = null;
    }
    if (line && !seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out.length ? out : ["Planning baseline"];
}
