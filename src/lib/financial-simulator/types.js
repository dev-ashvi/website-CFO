/** @typedef {'simple' | 'detailed'} RevenueMode */

/**
 * @typedef {Object} CashEvent
 * @property {number} monthIndex - 1..24
 * @property {number} amount - INR
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
 * @property {number} monthlyPayroll
 * @property {number} payrollGrowth
 * @property {number} otherFixedCosts
 * @property {number} otherFixedGrowth
 * @property {CashEvent[]} capexEvents
 * @property {CashEvent[]} equityEvents
 * @property {CashEvent[]} debtEvents
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
 * @property {number} totalOperatingExpenses
 * @property {number} ebitda
 * @property {number} ebitdaMargin
 * @property {number} capex
 * @property {number} equityFunding
 * @property {number} debtOrOtherFunding
 * @property {number} totalCashBurn
 * @property {number} netCashFlow
 * @property {number} grossBurn
 * @property {number} netBurn
 * @property {number} openingCash
 * @property {number|null} closingCash
 * @property {boolean} cashOut
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
 */

export {};
