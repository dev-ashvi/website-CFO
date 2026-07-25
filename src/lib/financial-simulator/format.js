/**
 * Format INR amounts. Default uses Indian digit grouping; compact uses lakh/crore.
 * @param {number|null|undefined} amount
 * @param {{ compact?: boolean }} [opts]
 */
export function formatInr(amount, opts = {}) {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  const n = Number(amount);
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";

  if (opts.compact) {
    if (abs >= 1e7) {
      return `${sign}₹${trimNum(abs / 1e7)} crore`;
    }
    if (abs >= 1e5) {
      return `${sign}₹${trimNum(abs / 1e5)} lakh`;
    }
  } else if (abs >= 1e7) {
    return `${sign}₹${trimNum(abs / 1e7)} crore`;
  }

  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Horizon cash KPI: never treat insolvency as missing data.
 * @param {number|null|undefined} closingCash
 * @param {number} horizonMonth - 6 or 12
 * @param {number|null|undefined} cashOutMonthIndex - 1-based first cash-out month
 */
export function formatHorizonCash(closingCash, horizonMonth, cashOutMonthIndex) {
  if (closingCash == null || Number.isNaN(Number(closingCash))) {
    return `Cash exhausted before Month ${horizonMonth}`;
  }
  if (cashOutMonthIndex != null && cashOutMonthIndex < horizonMonth && Number(closingCash) < 0) {
    return formatInr(closingCash);
  }
  return formatInr(closingCash);
}

export function formatPercent(decimal, digits = 1) {
  if (decimal == null || Number.isNaN(Number(decimal))) return "—";
  const pct = Number(decimal) * 100;
  const fixed = pct.toFixed(digits);
  const tidy = fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return `${tidy}%`;
}

/** Display helper while editing percent fields (value stored as decimal). */
export function percentDisplayValue(decimal) {
  if (decimal === "" || decimal == null || Number.isNaN(Number(decimal))) return "";
  return String(Math.round(Number(decimal) * 10000) / 100);
}

export function formatMonths(months) {
  if (months == null || Number.isNaN(Number(months))) return "—";
  return `${Number(months).toFixed(1)} months`;
}

/** Strip grouping chars and parse a typed INR amount. */
export function parseInrInput(raw) {
  if (raw == null || raw === "") return "";
  const cleaned = String(raw).replace(/,/g, "").replace(/[^\d.]/g, "");
  if (cleaned === "" || cleaned === ".") return "";
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : "";
}

function trimNum(n) {
  const fixed = n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return fixed.replace(/\.0$/, "").replace(/(\.\d)0$/, "$1");
}
