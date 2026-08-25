/**
 * CFO signal display categorization and prioritization (does not change calculations).
 */

const PRESSURE_TYPES = new Set([
  "PRODUCT_COGS_PRESSURE",
  "CHANNEL_COST_PRESSURE",
  "MARKETING_PRESSURE",
  "NEGATIVE_CM2_CONTRIBUTOR",
  "HIGH_REVENUE_NEGATIVE_CM2",
  "HIGH_REVENUE_LOW_CM2",
  "positive_cm1_negative_cm2",
  "positive_gm_negative_cm1",
  "negative_gross_margin",
]);

const POSITIVE_TYPES = new Set([
  "TOP_CM2_CONTRIBUTOR",
  "TOP_CM1_CONTRIBUTOR",
  "TOP_GM_CONTRIBUTOR",
]);

const WATCH_TYPES = new Set([
  "GROWTH_WITH_MARGIN_COMPRESSION",
  "REVENUE_GROWTH",
  "REVENUE_DECLINE",
]);

/** @param {object} signal */
export function signalCategory(signal) {
  const type = String(signal?.signal_type || "");
  if (PRESSURE_TYPES.has(type) || /PRESSURE|NEGATIVE|LOW_CM2/i.test(type)) return "pressure";
  if (WATCH_TYPES.has(type) || /COMPRESSION|DETERIOR|ANOMAL/i.test(type)) return "watch";
  if (POSITIVE_TYPES.has(type) || /^TOP_/i.test(type)) return "positive";
  return "neutral";
}

const CATEGORY_PRIORITY = { pressure: 0, watch: 1, positive: 2, neutral: 3 };

/**
 * Prioritize decision-useful signals: pressure → material changes → anomalies → positive.
 * @param {object[]} signals
 * @param {{ limit?: number }} [options]
 */
export function prioritizeSignals(signals, options = {}) {
  const list = Array.isArray(signals) ? [...signals] : [];
  list.sort((a, b) => {
    const ca = CATEGORY_PRIORITY[signalCategory(a)] ?? 9;
    const cb = CATEGORY_PRIORITY[signalCategory(b)] ?? 9;
    if (ca !== cb) return ca - cb;
    return Number(b?.materiality || 0) - Number(a?.materiality || 0);
  });
  const limit = options.limit ?? 4;
  return {
    visible: list.slice(0, limit),
    rest: list.slice(limit),
    all: list,
  };
}

export function signalToneClasses(category) {
  switch (category) {
    case "pressure":
      return {
        row: "border-rose-100 bg-rose-50/40",
        icon: "text-rose-600",
        arrow: "↓",
      };
    case "positive":
      return {
        row: "border-emerald-100 bg-emerald-50/40",
        icon: "text-emerald-600",
        arrow: "↑",
      };
    case "watch":
      return {
        row: "border-amber-100 bg-amber-50/40",
        icon: "text-amber-700",
        arrow: "•",
      };
    default:
      return {
        row: "border-slate-100 bg-slate-50/60",
        icon: "text-slate-500",
        arrow: "•",
      };
  }
}
