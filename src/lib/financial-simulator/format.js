import { getCurrencyOption, DEFAULT_CURRENCY } from "./currency.js";

/**
 * Format a money amount for the selected display currency.
 * No FX conversion — numeric values are unchanged; only symbol / locale / compact style.
 *
 * @param {number|null|undefined} amount
 * @param {{ currency?: string, compact?: boolean }} [opts]
 */
export function formatMoney(amount, opts = {}) {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  const n = Number(amount);
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const meta = getCurrencyOption(opts.currency || DEFAULT_CURRENCY);
  const symbol = meta.symbol;

  if (opts.compact) {
    if (meta.compactStyle === "indian") {
      if (abs >= 1e7) return `${sign}${symbol}${trimNum(abs / 1e7)} crore`;
      if (abs >= 1e5) return `${sign}${symbol}${trimNum(abs / 1e5)} lakh`;
    } else {
      if (abs >= 1e9) return `${sign}${symbol}${trimNum(abs / 1e9)}B`;
      if (abs >= 1e6) return `${sign}${symbol}${trimNum(abs / 1e6)}M`;
      if (abs >= 1e3) return `${sign}${symbol}${trimNum(abs / 1e3)}K`;
    }
  } else if (meta.compactStyle === "indian" && abs >= 1e7) {
    return `${sign}${symbol}${trimNum(abs / 1e7)} crore`;
  }

  return `${sign}${symbol}${abs.toLocaleString(meta.locale, { maximumFractionDigits: 0 })}`;
}

/**
 * @deprecated Prefer formatMoney with currency. Kept for INR call sites / tests.
 * @param {number|null|undefined} amount
 * @param {{ compact?: boolean, currency?: string }} [opts]
 */
export function formatInr(amount, opts = {}) {
  return formatMoney(amount, { ...opts, currency: opts.currency || "INR" });
}

/**
 * Strip currency symbols for axis ticks.
 * @param {string} formatted
 * @param {string} [currency]
 */
export function stripMoneySymbol(formatted, currency) {
  if (!formatted || formatted === "—") return formatted;
  if (currency) {
    const symbol = getCurrencyOption(currency).symbol;
    return String(formatted).split(symbol).join("").trim();
  }
  return String(formatted)
    .replace(/AED\s*/gi, "")
    .replace(/S\$|C\$|A\$/g, "")
    .replace(/[₹$€£]/g, "")
    .trim();
}

/**
 * Horizon cash KPI: never treat insolvency as missing data.
 * @param {number|null|undefined} closingCash
 * @param {number} horizonMonth - 6 or 12
 * @param {number|null|undefined} cashOutMonthIndex - 1-based first cash-out month
 * @param {{ currency?: string }} [opts]
 */
export function formatHorizonCash(closingCash, horizonMonth, cashOutMonthIndex, opts = {}) {
  if (closingCash == null || Number.isNaN(Number(closingCash))) {
    return `Cash exhausted before Month ${horizonMonth}`;
  }
  if (cashOutMonthIndex != null && cashOutMonthIndex < horizonMonth && Number(closingCash) < 0) {
    return formatMoney(closingCash, { currency: opts.currency });
  }
  return formatMoney(closingCash, { currency: opts.currency });
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

/** Strip grouping chars and parse a typed money amount. */
export function parseMoneyInput(raw) {
  if (raw == null || raw === "") return "";
  const cleaned = String(raw).replace(/,/g, "").replace(/[^\d.]/g, "");
  if (cleaned === "" || cleaned === ".") return "";
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : "";
}

/** @deprecated Alias — same as parseMoneyInput. */
export function parseInrInput(raw) {
  return parseMoneyInput(raw);
}

/**
 * Locale-aware grouping for money input blur display (no symbol).
 * @param {number|string|null|undefined} value
 * @param {string} [currency]
 */
export function formatMoneyInputDisplay(value, currency = DEFAULT_CURRENCY) {
  if (value === "" || value == null || Number.isNaN(Number(value))) return "";
  const meta = getCurrencyOption(currency);
  return Number(value).toLocaleString(meta.locale, { maximumFractionDigits: 0 });
}

function trimNum(n) {
  const fixed = n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return fixed.replace(/\.0$/, "").replace(/(\.\d)0$/, "$1");
}
