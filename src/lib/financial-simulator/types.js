/** @typedef {'simple' | 'detailed'} RevenueMode */

/**
 * @typedef {Object} CashEvent
 * @property {number} monthIndex - 1..24
 * @property {number} amount - INR
 */

/**
 * @typedef {Object} VariableExpensesInput
 * @property {number} cogsPercent
 * @property {number} otherDirectCostsPercent
 * @property {number} salesAndMarketingPercent
 * @property {number} productAndTechnologyPercent
 */

/**
 * @typedef {Object} FixedExpensesInput
 * @property {number} monthlyPayroll
 * @property {number} payrollGrowthPercent
 * @property {number} otherFixedCosts
 * @property {number} otherFixedCostGrowthPercent
 */

/**
 * @typedef {Object} SimulatorInputs
 * @property {string} [companyName]
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} industry
 * @property {string} businessModel
 * @property {string} startupStage
 * @property {string} mainPriority
 * @property {string} currency
 * @property {number} currentCashBalance
 * @property {string} forecastStartMonth - YYYY-MM
 * @property {RevenueMode} revenueMode
 * @property {number} currentMonthlyRevenue
 * @property {number} monthlyRevenueGrowth - decimal e.g. 0.05
 * @property {number} currentVolume
 * @property {number} monthlyVolumeGrowth
 * @property {number} averageOrderValue
 * @property {number} monthlyAovGrowth
 * @property {number} cogsPercent
 * @property {number} otherDirectCostsPercent
 * @property {number} salesMarketingPercent
 * @property {number} productTechPercent
 * @property {number} [productTechPercentChangeFromMonth] - 1-based month when product/tech % changes
 * @property {number} [productTechPercentAfterChange] - new product/tech % from that month
 * @property {number} monthlyPayroll
 * @property {number} payrollGrowth
 * @property {number} otherFixedCosts
 * @property {number} otherFixedGrowth
 * @property {CashEvent[]} capexEvents
 * @property {CashEvent[]} equityEvents
 * @property {CashEvent[]} debtEvents
 * @property {VariableExpensesInput} [variableExpenses] - compatibility grouping (optional)
 * @property {FixedExpensesInput} [fixedExpenses] - compatibility grouping (optional)
 * @property {number} [opexReductionRate]
 * @property {number} [opexReductionFromMonth]
 * @property {'variable'|'fixed'} [opexReductionTarget]
 * @property {number} [payrollGrowthDelayMonths]
 */

/**
 * @typedef {Object} MonthlyProjection
 * @property {number} monthIndex
 * @property {string} monthLabel
 * @property {number} volume
 * @property {number} averageOrderValue
 * @property {number} revenue
 * @property {number} cogs
 * @property {number} otherDirectCosts
 * @property {number} grossProfit
 * @property {number} grossMargin
 * @property {number} [grossMarginPercent] Alias of grossMargin
 * @property {number} netProfitAfterDirectCosts Gross profit − other direct costs
 * @property {number} fulfillmentCosts Excel Fulfilment (same amount as productAndTechnology)
 * @property {number} productAndTechnology Fulfilment / other variable operating costs (legacy name)
 * @property {number} cm1 Net profit after direct − fulfilment (before S&M)
 * @property {number} cm1Margin
 * @property {number} [cm1MarginPercent] Alias of cm1Margin
 * @property {number} salesAndMarketing
 * @property {number} cm2 CM1 − sales & marketing
 * @property {number} cm2Margin
 * @property {number} [cm2MarginPercent] Alias of cm2Margin
 * @property {number} payroll
 * @property {number} otherFixedCosts
 * @property {number} totalFixedOpex Payroll + other fixed (= totalFixedExpenses)
 * @property {number} totalVariableExpenses
 * @property {number} totalFixedExpenses
 * @property {number} totalOperatingExpenses
 * @property {number} ebitda
 * @property {number} ebitdaMargin
 * @property {number} [ebitdaMarginPercent] Alias of ebitdaMargin
 * @property {number} capex
 * @property {number} cumulativeCapex
 * @property {number} equityFunding
 * @property {number} debtOrOtherFunding
 * @property {number} totalCashBurn
 * @property {number} netCashFlow
 * @property {number} netCashFlowExcludingCapex
 * @property {number} grossBurn
 * @property {number} netBurn
 * @property {number} netBurnIncludingCapex
 * @property {number} openingCash
 * @property {number|null} closingCash
 * @property {number|null} closingCashIncludingCapex
 * @property {number} openingCashExcludingCapex
 * @property {number|null} closingCashExcludingCapex
 * @property {boolean} cashOut
 * @property {boolean} cashOutExcludingCapex
 */

/**
 * @typedef {Object} FinancialPerformanceKpis
 * @property {number} revenue
 * @property {number} grossProfit
 * @property {number} grossMarginPercent
 * @property {number} cm1
 * @property {number} cm1MarginPercent
 * @property {number} ebitda
 * @property {number} ebitdaMarginPercent
 */

/**
 * @typedef {Object} BurnMetricsKpis
 * @property {number} monthlyNetBurnExcludingCapex
 * @property {number} monthlyNetBurnIncludingCapex
 * @property {number} monthlyGrossBurn
 * @property {number} [avgNetBurnExcludingCapex] Forecast average (internal / backward compat)
 * @property {number} [avgNetBurnIncludingCapex] Forecast average (internal / backward compat)
 * @property {number} [avgGrossBurn] Forecast average (internal / backward compat)
 */

/**
 * @typedef {Object} CapexComparison
 * @property {number|null} cashOutMonthIncludingCapex
 * @property {number|null} cashOutMonthExcludingCapex
 * @property {string} cashOutMonthLabelIncludingCapex
 * @property {number|null} [excludingCashAtIncludingCashOutMonth]
 * @property {number} [capexInIncludingCashOutMonth]
 * @property {number|null} runwayMonthsIncludingCapex
 * @property {number|null} runwayMonthsExcludingCapex
 * @property {number|null} month24CashIncludingCapex
 * @property {number|null} month24CashExcludingCapex
 * @property {number|null} capexRunwayImpactMonths
 * @property {number} cumulativeCapex
 */

/**
 * @typedef {Object} ExpenseMix
 * @property {"month1"} [period]
 * @property {"operating"} [scope] Operating expense burn only (excludes COGS / other direct)
 * @property {number} variableExpenses Month 1 fulfilment + S&M operating costs
 * @property {number} fixedExpenses Month 1 payroll + other fixed operating costs
 * @property {number} [month1OperatingExpenses] Variable + fixed operating (= gross burn)
 * @property {number} variableSharePercent Month 1 variable ÷ operating (0–1)
 * @property {number} fixedSharePercent Month 1 fixed ÷ operating (0–1)
 * @property {Record<string, number>} [categoryAmounts] Month 1 amounts by engine field key
 * @property {Record<string, string>} [categoryLabels] Canonical labels by engine field key
 * @property {string} [largestExpenseCategoryKey] Engine field key for largest operating category
 * @property {string} [largestExpenseCategoryLabel] Resolved display label for largest category
 * @property {string} largestExpenseCategory Alias of largestExpenseCategoryLabel
 * @property {number} [largestExpenseCategoryAmount]
 * @property {number} [largestExpenseCategorySharePercent] Largest ÷ operating total (0–1)
 * @property {number} [largestExpenseCategoryPercent] Alias of largestExpenseCategorySharePercent
 * @property {number} [variableExpensePercent] Alias of variableSharePercent
 * @property {number} [fixedExpensePercent] Alias of fixedSharePercent
 * @property {number} [averageMonthlyVariableExpenses] Forecast average (internal / backward compat)
 * @property {number} [averageMonthlyFixedExpenses] Forecast average (internal / backward compat)
 */

/**
 * @typedef {Object} SimulatorKpis
 * @property {number|null} runwayMonths Primary CFO projected runway (no funding) or after-funding CFO runway
 * @property {number|null} [projectedRunwayMonths] Alias of runwayMonths for hero / plan runway
 * @property {number|null} [headlineRunwayMonths] Excel dashboard: M1 ending cash ÷ 3-mo avg net burn
 * @property {number|null} [cashSeriesRunwayMonths] Deterministic cash zero-crossing (charts / analysis only)
 * @property {number|null} [runwayBeforePlannedFundingMonths] CFO runway with equity/debt removed
 * @property {number|null} [runwayAfterPlannedFundingMonths] CFO runway at first funding month post-inflow
 * @property {object} [plannedFunding]
 * @property {object} [cfoFundingRunway] Structured before/after funding CFO runway detail
 * @property {number|null} [fundingRunwayImpactMonths] after − before (display, 1 decimal)
 * @property {string} cashOutMonthLabel
 * @property {number|null} cashOutMonthIndex
 * @property {number} avgMonthlyGrossBurn
 * @property {number} avgMonthlyNetBurn
 * @property {number} avgMonthlyNetBurnIncludingCapex
 * @property {number} month1GrossBurn
 * @property {number} month1NetBurnExcludingCapex
 * @property {number} month1NetBurnIncludingCapex
 * @property {number} month1Revenue
 * @property {number} month1GrossProfit
 * @property {number} month1GrossMargin
 * @property {number} month1Cm1
 * @property {number} month1Cm1Margin
 * @property {number} avgGrossMargin
 * @property {number} month1Ebitda
 * @property {number} month1EbitdaMargin
 * @property {number} avgEbitda
 * @property {number|null} sixMonthClosingCash
 * @property {number|null} twelveMonthClosingCash
 * @property {string} healthStatus
 * @property {FinancialPerformanceKpis} financialPerformance
 * @property {BurnMetricsKpis} burnMetrics
 * @property {Object} costMix
 * @property {ExpenseMix} expenseMix
 * @property {CapexComparison} capexComparison
 */

export {};
