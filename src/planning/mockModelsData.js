/** Demo-only model catalog for Planning > Models. */

const minsAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();

export const MODELS_SUMMARY = {
  activeCount: 4,
  lastGlobalRefreshMins: 5,
  outputsPowered: 9,
};

/** Workspace-level context for Models page header “Discuss with AI”. */
export const PLANNING_MODELS_AI_OVERVIEW = {
  name: "Your planning models",
  description:
    "These models connect assumptions, scenarios, and business data to the forecasts and dashboards your team already uses.",
  inputs: ["Workspace assumptions", "Linked business data", "Scenario selections"],
  assumptions: ["Revenue growth", "Hiring", "FX", "Collections cadence"],
  outputs: ["Forecast views", "Dashboard widgets", "Scenario comparisons", "Reports"],
};

export const MOCK_FINANCIAL_MODELS = [
  {
    id: "model-revenue",
    name: "Revenue model",
    description:
      "Projects recognized revenue over time using growth assumptions, seasonality, and pipeline conversion — feeding forecasts and board views.",
    inputs: ["Bookings pipeline", "Recognized revenue (actuals)", "Contract start dates"],
    assumptions: ["Revenue growth", "FX (reporting)"],
    outputs: ["Forecast dashboard", "Investor revenue bridge", "Scenario preview"],
    status: "Healthy",
    statusTone: "emerald",
    lastRefreshedAt: minsAgo(5),
    usedIn: ["Forecast dashboard", "Investor report", "Scenario comparison"],
    trustNote:
      "This model translates your growth and FX assumptions into forward revenue views your team already sees in dashboards and investor materials.",
  },
  {
    id: "model-burn",
    name: "Burn model",
    description:
      "Rolls up operating spend, payroll ramps, and discretionary categories to estimate monthly cash consumption.",
    inputs: ["Payroll schedule", "Vendor spend", "Marketing & G&A categories"],
    assumptions: ["Hiring plan", "Revenue growth (indirect via headcount)"],
    outputs: ["Monthly burn strip", "Budget vs actual", "CFO summary"],
    status: "Healthy",
    statusTone: "emerald",
    lastRefreshedAt: minsAgo(8),
    usedIn: ["Forecast dashboard", "Board pack — cost section"],
    trustNote:
      "Burn is summarized in business language; underlying detail stays with finance ops — not exposed as technical line items here.",
  },
  {
    id: "model-cashflow",
    name: "Cash flow model",
    description:
      "Connects inflows, outflows, and working-capital timing to show how cash evolves month to month.",
    inputs: ["Cash in bank", "Collections cadence", "Scheduled outflows"],
    assumptions: ["Revenue growth", "Hiring plan", "FX"],
    outputs: ["Cash position chart", "Liquidity outlook", "Scenario cash paths"],
    status: "Healthy",
    statusTone: "emerald",
    lastRefreshedAt: minsAgo(5),
    usedIn: ["Dashboard cash widget", "Scenario preview"],
    trustNote:
      "Cash outcomes depend on assumptions you control in Planning; refresh after major assumption or scenario changes.",
  },
  {
    id: "model-runway",
    name: "Runway projection",
    description:
      "Projects how long available cash lasts based on inflows, outflows, and hiring assumptions.",
    inputs: ["Cash in bank", "Revenue inflow", "Operating burn"],
    assumptions: ["Revenue growth", "Hiring plan"],
    outputs: ["Dashboard → Runway", "Scenario preview", "Investor report"],
    status: "Healthy",
    statusTone: "emerald",
    lastRefreshedAt: minsAgo(5),
    usedIn: ["Forecast dashboard", "Investor report", "Scenario comparison"],
    trustNote:
      "Runway is a planning lens — always reconcile with bank balances and near-term obligations before major decisions.",
  },
];
