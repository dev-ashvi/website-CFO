/**
 * Indian / Amazon numeric parsing. Amounts stay as finite numbers (INR).
 */

export function parseIndianNumber(raw) {
  if (raw == null) return { value: null, empty: true, error: null };
  const text = String(raw).trim();
  if (!text || text === "—" || text === "-" || text === "NA" || text === "N/A") {
    return { value: null, empty: true, error: null };
  }
  const negativeParens = /^\(.*\)$/.test(text);
  let cleaned = text.replace(/₹/g, "").replace(/\s/g, "");
  if (negativeParens) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { value: null, empty: false, error: `unparseable_number:${text}` };
  }
  let value = Number(cleaned);
  if (negativeParens) value = -value;
  if (!Number.isFinite(value)) {
    return { value: null, empty: false, error: `non_finite:${text}` };
  }
  return { value, empty: false, error: null };
}

export function roundMoney(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumMoney(values) {
  let total = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
  }
  return roundMoney(total);
}

export function ratio(numerator, denominator) {
  if (numerator == null || denominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

export function growthRate(current, previous) {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function formatInr(value, { digits = 2, empty = "—" } = {}) {
  if (value == null || !Number.isFinite(value)) return empty;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPct(ratioValue, { digits = 1, empty = "—" } = {}) {
  if (ratioValue == null || !Number.isFinite(ratioValue)) return empty;
  return `${(ratioValue * 100).toFixed(digits)}%`;
}

export function formatCount(value, empty = "—") {
  if (value == null || !Number.isFinite(value)) return empty;
  return new Intl.NumberFormat("en-IN").format(value);
}
