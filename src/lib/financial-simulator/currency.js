/** Supported display currencies for the runway simulator (no FX conversion). */

export const DEFAULT_CURRENCY = "INR";

/**
 * @typedef {{
 *   code: string,
 *   label: string,
 *   symbol: string,
 *   locale: string,
 *   compactStyle: 'indian' | 'western',
 * }} CurrencyOption
 */

/** @type {CurrencyOption[]} */
export const CURRENCY_OPTIONS = [
  { code: "INR", label: "INR – Indian Rupee", symbol: "₹", locale: "en-IN", compactStyle: "indian" },
  { code: "USD", label: "USD – US Dollar", symbol: "$", locale: "en-US", compactStyle: "western" },
  { code: "EUR", label: "EUR – Euro", symbol: "€", locale: "en-US", compactStyle: "western" },
  { code: "GBP", label: "GBP – British Pound", symbol: "£", locale: "en-GB", compactStyle: "western" },
  { code: "SGD", label: "SGD – Singapore Dollar", symbol: "S$", locale: "en-US", compactStyle: "western" },
  { code: "AED", label: "AED – UAE Dirham", symbol: "AED ", locale: "en-US", compactStyle: "western" },
  { code: "CAD", label: "CAD – Canadian Dollar", symbol: "C$", locale: "en-CA", compactStyle: "western" },
  { code: "AUD", label: "AUD – Australian Dollar", symbol: "A$", locale: "en-AU", compactStyle: "western" },
];

/**
 * @param {string|null|undefined} code
 * @returns {CurrencyOption}
 */
export function getCurrencyOption(code) {
  const found = CURRENCY_OPTIONS.find((c) => c.code === String(code || "").toUpperCase());
  return found || CURRENCY_OPTIONS[0];
}

/**
 * @param {string|null|undefined} code
 */
export function currencySymbol(code) {
  return getCurrencyOption(code).symbol;
}
