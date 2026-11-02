/**
 * Ask WYZ presentation helpers — currency safety, human dates, claim gates.
 * Does not invent financial figures. Never blindly replaces currency symbols on amounts.
 */

export const REPORT_CURRENCY = "INR";
export const REPORT_CURRENCY_SYMBOL = "₹";
export const REPORT_CURRENCY_NAME = "Indian rupee";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Foreign currency markers that must not appear in INR-session narration. */
const FOREIGN_CURRENCY_RE =
  /(?:\bUSD\b|\bUS\$\b|\bEUR\b|\bGBP\b|\bCAD\b|\bAUD\b|\bJPY\b|\bCNY\b|\$\s?\d|€\s?\d|£\s?\d|dollars?\b|euros?\b)/i;

const ISO_MONTH_RE = /\b(20\d{2})-(0[1-9]|1[0-2])\b/g;
const ISO_DATE_RE = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;

/**
 * Format YYYY-MM as "September 2026" (long) or "Sep 2026" (short).
 */
export function formatMonthLabel(ym, { style = "long" } = {}) {
  const text = String(ym || "").trim();
  const m = text.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (!m) return text || "";
  const year = m[1];
  const monthIndex = Number(m[2]) - 1;
  const name = style === "short" ? MONTH_SHORT[monthIndex] : MONTH_NAMES[monthIndex];
  return `${name} ${year}`;
}

/**
 * Replace internal ISO month/date tokens with human-readable labels.
 * Does not touch numeric amounts.
 */
export function humanizePeriodLabels(text, { style = "long" } = {}) {
  let out = String(text || "");
  out = out.replace(ISO_DATE_RE, (_, y, mo) => formatMonthLabel(`${y}-${mo}`, { style }));
  out = out.replace(ISO_MONTH_RE, (_, y, mo) => formatMonthLabel(`${y}-${mo}`, { style }));
  return out;
}

/**
 * Detect unsupported currency claims for an INR report.
 * Returns { ok, reason } — does not mutate the text.
 */
export function validateInrCurrencyPresentation(text, currency = REPORT_CURRENCY) {
  if (currency && String(currency).toUpperCase() !== "INR") {
    return { ok: false, reason: "unsupported_report_currency", detail: currency };
  }
  const body = String(text || "");
  if (!body.trim()) return { ok: true, reason: null, detail: null };
  if (FOREIGN_CURRENCY_RE.test(body)) {
    return { ok: false, reason: "foreign_currency_claim", detail: "non_inr_currency_detected" };
  }
  return { ok: true, reason: null, detail: null };
}

/**
 * Soft check: narration that treats refund-adjusted sales as if they were gross.
 * Used only as a gate to prefer deterministic guided text — never invents numbers.
 */
export function detectSalesBasisConfusion(text, question = "") {
  const body = `${question} ${text}`.toLowerCase();
  const asksGross =
    /gross product sales|gross sales|product sales before refund|before refund/.test(body) ||
    /how did monthly sales|august|september|decline|growth/.test(String(question || "").toLowerCase());
  const claimsNetAsGross =
    /net product sales (?:are|is|were|was) (?:the )?gross|gross (?:product )?sales (?:after|net of) refunds are the same as net/i.test(
      text || "",
    );
  const usesUsdSalesLanguage = /\$\s?[\d,]+\.?\d*\s*(?:in|of)?\s*(?:gross|net)?\s*sales/i.test(text || "");
  if (usesUsdSalesLanguage) return { confused: true, reason: "usd_sales_amount" };
  if (asksGross && claimsNetAsGross) return { confused: true, reason: "gross_net_conflation" };
  return { confused: false, reason: null };
}

/**
 * Decide whether to show the live AI explanation or the deterministic guided answer.
 * Never rewrites currency symbols onto amounts (avoids concealing wrong values).
 */
export function presentAskExplanation({
  aiExplanation,
  guidedAnswer,
  currency = REPORT_CURRENCY,
  question = "",
  source = "ai",
} = {}) {
  const guided = humanizePeriodLabels(String(guidedAnswer || "").trim());
  if (source !== "ai" || !aiExplanation) {
    return {
      explanation: guided,
      source: source === "ai" ? "guided" : source || "guided",
      fallbackReason: aiExplanation ? null : "missing_ai_explanation",
      liveRejected: false,
    };
  }

  const currencyCheck = validateInrCurrencyPresentation(aiExplanation, currency);
  if (!currencyCheck.ok) {
    return {
      explanation: guided,
      source: "guided",
      fallbackReason: currencyCheck.reason,
      liveRejected: true,
      limitationsExtra: [
        "Live narration used a non-INR currency for this Indian-rupee report, so the calculated answer is shown instead.",
      ],
    };
  }

  const basis = detectSalesBasisConfusion(aiExplanation, question);
  if (basis.confused) {
    return {
      explanation: guided,
      source: "guided",
      fallbackReason: basis.reason,
      liveRejected: true,
      limitationsExtra: [
        "Live narration mixed sales bases or used unsupported currency amounts; showing verified session figures instead.",
      ],
    };
  }

  return {
    explanation: humanizePeriodLabels(String(aiExplanation).trim()),
    source: "ai",
    fallbackReason: null,
    liveRejected: false,
  };
}

export function buildCurrencyEvidenceFields(metricsCurrency = REPORT_CURRENCY) {
  const code = String(metricsCurrency || REPORT_CURRENCY).toUpperCase() === "INR" ? "INR" : "INR";
  return {
    currency: code,
    currencySymbol: REPORT_CURRENCY_SYMBOL,
    currencyName: REPORT_CURRENCY_NAME,
    currencyFormat: "en-IN",
    amountPresentation: "Indian rupees (₹). Do not use USD, $, EUR, or other currencies.",
  };
}
