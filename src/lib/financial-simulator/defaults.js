/** Excel workbook defaults (Input sheet yellow cells). */

export { DEFAULT_CURRENCY as CURRENCY, CURRENCY_OPTIONS, getCurrencyOption, currencySymbol } from "./currency.js";
export { DEFAULT_CURRENCY } from "./currency.js";

import { DEFAULT_CURRENCY } from "./currency.js";

/**
 * Bump when form field meanings change (e.g. S&M ↔ fulfilment mapping).
 * Incompatible stored drafts must be discarded — never silently restored.
 */
export const RUNWAY_FORM_SCHEMA_VERSION = 2;

export const HEALTH_THRESHOLDS = {
  criticalBelow: 9,
  cautionBelow: 18,
};

/** Reasonable growth bounds for public tool validation. */
export const GROWTH_BOUNDS = {
  min: -0.5,
  max: 1.0,
};

export const FORECAST_MONTHS = 24;

export const INDUSTRY_OPTIONS = [
  "Technology",
  "SaaS / Software",
  "Fintech",
  "Financial Services",
  "Healthcare",
  "Pharma & Life Sciences",
  "Manufacturing",
  "Automotive",
  "Retail & E-commerce",
  "Fashion & Apparel",
  "Beauty & Personal Care",
  "FMCG",
  "Food & Beverage",
  "Logistics & Supply Chain",
  "Real Estate / PropTech",
  "Education / EdTech",
  "Agriculture / AgriTech",
  "DeepTech",
  "Media & Entertainment",
  "Travel & Hospitality",
  "Energy & ClimateTech",
  "Others",
];

export const STAGE_OPTIONS = [
  "Pre-revenue",
  "Post-revenue",
  "Growth",
  "Scaling",
];

export const BUSINESS_MODEL_OPTIONS = ["B2B", "B2C", "D2C", "SaaS", "Others"];

const emptyEvent = () => ({ monthIndex: "", amount: "" });

/**
 * Public-tool starter defaults.
 *
 * Canonical variable-opex mapping (approved Excel Scenario 1):
 * - salesMarketingPercent = 20%  → Sales & Marketing
 * - productTechPercent = 40%     → Fulfilment / other variable operating costs
 *
 * Do NOT swap these. productTechPercent is the engine field for Fulfilment.
 * @returns {import('./types.js').SimulatorInputs}
 */
export function getDefaultInputs() {
  return {
    schemaVersion: RUNWAY_FORM_SCHEMA_VERSION,
    companyName: "",
    email: "",
    phone: "",
    industry: "SaaS / Software",
    businessModel: "B2B",
    startupStage: "Pre-revenue",
    mainPriority: "",
    currency: DEFAULT_CURRENCY,
    currentCashBalance: 1_000_000,
    forecastStartMonth: "2026-07",
    revenueMode: "simple",
    currentMonthlyRevenue: 750_000,
    monthlyRevenueGrowth: 0.05,
    currentVolume: 500,
    monthlyVolumeGrowth: 0.02,
    averageOrderValue: 1500,
    monthlyAovGrowth: 0,
    cogsPercent: 0.35,
    otherDirectCostsPercent: 0.05,
    /** Sales & marketing % of revenue (Excel = 20%). */
    salesMarketingPercent: 0.2,
    /** Fulfilment / other variable operating costs % of revenue (Excel = 40%). Engine field name is legacy. */
    productTechPercent: 0.4,
    monthlyPayroll: 150_000,
    payrollGrowth: 0.002,
    otherFixedCosts: 75_000,
    otherFixedGrowth: 0.002,
    capexEvents: [emptyEvent()],
    equityEvents: [emptyEvent()],
    debtEvents: [emptyEvent()],
  };
}
