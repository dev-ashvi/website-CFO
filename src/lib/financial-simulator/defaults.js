/** Excel workbook defaults (Input sheet yellow cells). */

export const CURRENCY = "INR";

export const HEALTH_THRESHOLDS = {
  criticalBelow: 6,
  attentionBelow: 12,
  stableBelow: 18,
};

/** Reasonable growth bounds for public tool validation. */
export const GROWTH_BOUNDS = {
  min: -0.5,
  max: 1.0,
};

export const FORECAST_MONTHS = 24;

export const INDUSTRY_OPTIONS = [
  "SaaS",
  "D2C",
  "E-commerce",
  "Marketplace",
  "Services",
  "Fintech",
  "Consumer",
  "Healthcare",
  "Other",
];

export const STAGE_OPTIONS = [
  "Pre-revenue",
  "Bootstrapped",
  "Pre-seed",
  "Seed",
  "Series A",
  "Growth stage",
];

export const PRIORITY_OPTIONS = [
  "Extend runway",
  "Reduce burn",
  "Grow revenue",
  "Reach profitability",
  "Prepare for fundraising",
  "Improve cash flow",
];

/**
 * @returns {import('./types.js').SimulatorInputs}
 */
export function getDefaultInputs() {
  return {
    companyName: "",
    industry: "SaaS",
    businessModel: "Subscription",
    startupStage: "Seed",
    mainPriority: "Prepare for fundraising",
    currency: CURRENCY,
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
    salesMarketingPercent: 0.4,
    productTechPercent: 0.2,
    monthlyPayroll: 150_000,
    payrollGrowth: 0.002,
    otherFixedCosts: 75_000,
    otherFixedGrowth: 0.002,
    capexEvents: [
      { monthIndex: 6, amount: 500_000 },
      { monthIndex: 10, amount: 500_000 },
      { monthIndex: 13, amount: 500_000 },
    ],
    equityEvents: [
      { monthIndex: 4, amount: 2_000_000 },
      { monthIndex: 9, amount: 5_000_000 },
    ],
    debtEvents: [],
  };
}
