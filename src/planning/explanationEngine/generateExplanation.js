/**
 * Deterministic CFO-style explanation from scenario simulation outputs (no LLM).
 */

/**
 * @typedef {{
 *   revenueDeltaPercent: number,
 *   runwayDelta: number,
 *   burnDelta: number,
 *   cashDelta: number,
 * }} ScenarioSummary
 */

/**
 * @typedef {{
 *   label?: string,
 *   from: string,
 *   to: string,
 *   assumptionKey?: string,
 * }} BreakdownRow
 */

/**
 * @typedef {{
 *   runwayMonths: number,
 *   avgMonthlyBurn: number,
 *   finalCash: number,
 *   revenueSeries?: number[],
 * }} ScenarioPathSlice
 */

/**
 * @param {string} s
 * @returns {number | null}
 */
function parsePercentLike(s) {
  const m = String(s).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} s
 * @returns {number | null}
 */
function parseCountLike(s) {
  const m = String(s).match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} label
 * @param {string | undefined} key
 * @returns {'revenue_growth' | 'hiring' | 'fx' | 'unknown'}
 */
function resolveAssumptionKey(label, key) {
  if (key === "revenue_growth" || key === "hiring" || key === "fx") return key;
  const l = String(label || "").toLowerCase();
  if (/revenue|growth/.test(l)) return "revenue_growth";
  if (/hiring|headcount|roles?|fte/.test(l)) return "hiring";
  if (/fx|usd|inr|exchange/.test(l)) return "fx";
  return "unknown";
}

/**
 * @param {BreakdownRow} row
 * @returns {string}
 */
function keyDriverLine(row) {
  const key = resolveAssumptionKey(row.label ?? "", row.assumptionKey);
  const from = String(row.from ?? "—").trim();
  const to = String(row.to ?? "—").trim();

  switch (key) {
    case "revenue_growth": {
      const pf = parsePercentLike(from);
      const pt = parsePercentLike(to);
      if (pf != null && pt != null) {
        const dir = pt > pf ? "increased" : pt < pf ? "decreased" : "held";
        return `Revenue growth ${dir} from ${from} to ${to}.`;
      }
      return `Revenue growth assumption moved from ${from} to ${to}.`;
    }
    case "hiring":
      return `Hiring plan changed from ${from} to ${to}, impacting payroll-driven burn.`;
    case "fx":
      return `FX movement (${from} → ${to}) affects how revenue and cash are reported in this model.`;
    default:
      return `${row.label ?? "Assumption"}: ${from} → ${to}.`;
  }
}

/**
 * @param {BreakdownRow[]} breakdown
 * @returns {boolean}
 */
function hiringIncreased(breakdown) {
  for (const row of breakdown) {
    if (resolveAssumptionKey(row.label ?? "", row.assumptionKey) !== "hiring") continue;
    const a = parseCountLike(row.from);
    const b = parseCountLike(row.to);
    if (a != null && b != null && b > a) return true;
  }
  return false;
}

/**
 * Revenue trajectory “up” in summary terms.
 * @param {ScenarioSummary} summary
 */
function revenueIncreased(summary) {
  return Number(summary.revenueDeltaPercent) > 0.05;
}

/**
 * @param {ScenarioSummary} summary
 * @returns {'revenue' | 'burn'}
 */
function mainDriver(summary) {
  const r = Math.abs(Number(summary.revenueDeltaPercent) || 0);
  const b = Math.abs(Number(summary.burnDelta) || 0);
  if (r > b) return "revenue";
  if (b > r) return "burn";
  return "revenue";
}

/**
 * @param {ScenarioSummary} summary
 * @returns {string}
 */
function buildHeadline(summary) {
  const rd = Number(summary.runwayDelta);
  const driver = mainDriver(summary);

  if (rd > 0) {
    return driver === "revenue"
      ? "Runway improves — revenue trajectory is the dominant lever in this preview."
      : "Runway improves — burn trajectory is the dominant lever in this preview.";
  }
  if (rd < 0) {
    return driver === "revenue"
      ? "Runway compresses — revenue path is the dominant pressure in this preview."
      : "Runway compresses — burn is the dominant pressure on runway in this preview.";
  }
  return "Runway is unchanged in the model — revenue and burn effects largely offset over the horizon.";
}

/**
 * @param {ScenarioSummary} summary
 * @param {ScenarioPathSlice} baseline
 * @param {ScenarioPathSlice} scenario
 * @param {BreakdownRow[]} breakdown
 * @returns {string[]}
 */
function buildNarrativeParts(summary, baseline, scenario, breakdown) {
  const rev = Number(summary.revenueDeltaPercent);
  const rd = Number(summary.runwayDelta);
  const burn = Number(summary.burnDelta);
  const cash = Number(summary.cashDelta);

  const driverSummary =
    breakdown.length > 0
      ? `This preview reflects ${breakdown.length} lever change${breakdown.length === 1 ? "" : "s"} versus your workspace baseline.`
      : "This preview reflects alternate assumptions versus your workspace baseline.";

  const br = baseline.runwayMonths ?? 0;
  const sr = scenario.runwayMonths ?? 0;
  const cashPhrase = (() => {
    const abs = Math.abs(cash);
    if (abs >= 1e7) return `${cash >= 0 ? "+" : ""}${(cash / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${cash >= 0 ? "+" : ""}${(cash / 1e5).toFixed(1)} L`;
    return `${cash >= 0 ? "+" : ""}₹${Math.round(cash)}`;
  })();
  const effect = `Under the simplified model, horizon revenue shifts by ${rev >= 0 ? "+" : ""}${rev.toFixed(1)}%, runway moves from ${br} to ${sr} months, average monthly burn changes by ${burn >= 0 ? "+" : ""}${burn.toFixed(1)}%, and ending cash differs by roughly ${cashPhrase} in scale.`;

  let implication =
    "Use this as a directional read for planning conversations — validate against live cash and pipeline before decisions.";
  if (rd < 0 && burn > 1) {
    implication = "Tighter runway with higher burn warrants a near-term cash and hiring review, even if revenue holds.";
  } else if (rd > 0 && rev > 1) {
    implication = "Extended runway on stronger revenue still depends on collections and cost discipline holding.";
  } else if (rd > 0 && burn < -1) {
    implication = "Runway benefits from leaner burn; ensure the team and delivery capacity still match growth goals.";
  }

  return [driverSummary, effect, implication];
}

/**
 * @param {ScenarioSummary} summary
 * @param {BreakdownRow[]} breakdown
 * @returns {string[]}
 */
function buildRisks(summary, breakdown) {
  const risks = [];
  if (revenueIncreased(summary)) {
    risks.push("Assumes sustained demand and conversion at the modeled revenue path.");
  }
  if (hiringIncreased(breakdown)) {
    risks.push("Higher fixed cost risk if revenue or funding lags the hiring plan.");
  }
  if (risks.length === 0) {
    risks.push("Model risk: simplified cash and revenue linkage may not capture working-capital swings.");
  }
  return risks;
}

const RECOMMENDATIONS_FIXED = [
  "Validate the key assumptions in this preview against your latest actuals, pipeline, and board commitments.",
  "Compare to a downside scenario (e.g. slower revenue or steady burn) alongside baseline before locking plans.",
];

/**
 * @param {{
 *   summary: ScenarioSummary,
 *   breakdown: BreakdownRow[],
 *   baseline: ScenarioPathSlice,
 *   scenario: ScenarioPathSlice,
 * }} input
 * @returns {{
 *   headline: string,
 *   keyDrivers: string[],
 *   narrative: string,
 *   risks: string[],
 *   recommendations: string[],
 * }}
 */
export function generateExplanation({ summary, breakdown, baseline, scenario }) {
  const s = summary && typeof summary === "object" ? summary : {};
  const safeSummary = {
    revenueDeltaPercent: Number(s.revenueDeltaPercent) || 0,
    runwayDelta: Number(s.runwayDelta) || 0,
    burnDelta: Number(s.burnDelta) || 0,
    cashDelta: Number(s.cashDelta) || 0,
  };

  const rows = Array.isArray(breakdown) ? breakdown : [];
  const base = baseline && typeof baseline === "object" ? baseline : {};
  const scen = scenario && typeof scenario === "object" ? scenario : {};

  const baselineSlice = {
    runwayMonths: Number(base.runwayMonths) || 0,
    avgMonthlyBurn: Number(base.avgMonthlyBurn) || 0,
    finalCash: Number(base.finalCash) || 0,
    revenueSeries: base.revenueSeries,
  };
  const scenarioSlice = {
    runwayMonths: Number(scen.runwayMonths) || 0,
    avgMonthlyBurn: Number(scen.avgMonthlyBurn) || 0,
    finalCash: Number(scen.finalCash) || 0,
    revenueSeries: scen.revenueSeries,
  };

  const keyDrivers = rows.length > 0 ? rows.map((r) => keyDriverLine(r)) : ["No explicit lever list — compare scenario path to baseline in charts."];

  const headline = buildHeadline(safeSummary);
  const narrative = buildNarrativeParts(safeSummary, baselineSlice, scenarioSlice, rows).join(" ");
  const risks = buildRisks(safeSummary, rows);
  const recommendations = [...RECOMMENDATIONS_FIXED];

  return {
    headline,
    keyDrivers,
    narrative,
    risks,
    recommendations,
  };
}
