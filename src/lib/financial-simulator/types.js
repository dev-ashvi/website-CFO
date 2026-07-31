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
 * @property {number} salesAndMarketing
 * @property {number} productAndTechnology
 * @property {number} payroll
 * @property {number} otherFixedCosts
 * @property {number} totalVariableExpenses
 * @property {number} totalFixedExpenses
 * @property {number} totalOperatingExpenses
 * @property {number} ebitda
 * @property {number} ebitdaMargin
 * @property {number} capex
 * @property {number} cumulativeCapex
 * @property {number} equityFunding
 * @property {number} debtOrOtherFunding
 * @property {number} totalCashBurn
 * @property {number} netCashFlow
 * @property {number} netCashFlowExcludingCapex
 * @property {number} grossBurn
 * @property {number} netBurn
 * @property {number} openingCash
 * @property {number|null} closingCash
 * @property {number|null} closingCashIncludingCapex
 * @property {number} openingCashExcludingCapex
 * @property {number|null} closingCashExcludingCapex
 * @property {boolean} cashOut
 * @property {boolean} cashOutExcludingCapex
 */

/**
 * @typedef {Object} CapexComparison
 * @property {number|null} cashOutMonthIncludingCapex
 * @property {number|null} cashOutMonthExcludingCapex
 * @property {string} cashOutMonthLabelIncludingCapex
 * @property {string} cashOutMonthLabelExcludingCapex
 * @property {number|null} runwayMonthsIncludingCapex
 * @property {number|null} runwayMonthsExcludingCapex
 * @property {number|null} month24CashIncludingCapex
 * @property {number|null} month24CashExcludingCapex
 * @property {number|null} capexRunwayImpactMonths
 * @property {number} cumulativeCapex
 */

/**
 * @typedef {Object} ExpenseMix
 * @property {number} averageMonthlyVariableExpenses
 * @property {number} averageMonthlyFixedExpenses
 * @property {number} variableExpensePercent
 * @property {number} fixedExpensePercent
 * @property {string} largestExpenseCategory
 */

/**
 * @typedef {Object} SimulatorKpis
 * @property {number|null} runwayMonths
 * @property {string} cashOutMonthLabel
 * @property {number|null} cashOutMonthIndex
 * @property {number} avgMonthlyGrossBurn
 * @property {number} avgMonthlyNetBurn
 * @property {number} month1GrossMargin
 * @property {number} avgGrossMargin
 * @property {number} month1Ebitda
 * @property {number} avgEbitda
 * @property {number|null} sixMonthClosingCash
 * @property {number|null} twelveMonthClosingCash
 * @property {string} healthStatus
 * @property {Object} costMix
 * @property {ExpenseMix} expenseMix
 * @property {CapexComparison} capexComparison
 */

export {};
