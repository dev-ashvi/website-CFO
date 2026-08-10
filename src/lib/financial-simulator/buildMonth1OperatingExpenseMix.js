/** @typedef {'productAndTechnology' | 'salesAndMarketing' | 'payroll' | 'otherFixedCosts'} OperatingExpenseCategoryKey */

/** Canonical display labels keyed by Month 1 projection field (not array order). */
export const OPERATING_EXPENSE_CATEGORY_LABELS = {
  productAndTechnology: "Fulfilment / other variable operating costs",
  salesAndMarketing: "Sales & marketing",
  payroll: "Payroll",
  otherFixedCosts: "Other fixed costs",
};

/** @deprecated Use OPERATING_EXPENSE_CATEGORY_LABELS.productAndTechnology */
export const FULFILMENT_OPERATING_LABEL = OPERATING_EXPENSE_CATEGORY_LABELS.productAndTechnology;

/** @type {OperatingExpenseCategoryKey[]} */
const OPERATING_EXPENSE_CATEGORY_KEYS = [
  "productAndTechnology",
  "salesAndMarketing",
  "payroll",
  "otherFixedCosts",
];

/**
 * @param {import('./types.js').MonthlyProjection | undefined} month1
 * @returns {Record<OperatingExpenseCategoryKey, number>}
 */
export function getMonth1OperatingExpenseAmounts(month1) {
  return {
    productAndTechnology: Number(month1?.productAndTechnology || 0),
    salesAndMarketing: Number(month1?.salesAndMarketing || 0),
    payroll: Number(month1?.payroll || 0),
    otherFixedCosts: Number(month1?.otherFixedCosts || 0),
  };
}

/**
 * Month 1 operating expense mix for Expense Breakdown (excludes COGS, other direct, CapEx, funding).
 * @param {import('./types.js').MonthlyProjection | undefined} month1
 */
export function buildMonth1OperatingExpenseMix(month1) {
  if (!month1) {
    return emptyMix();
  }

  const amounts = getMonth1OperatingExpenseAmounts(month1);
  const month1VariableOperatingExpenses =
    amounts.productAndTechnology + amounts.salesAndMarketing;
  const month1FixedOperatingExpenses = amounts.payroll + amounts.otherFixedCosts;
  const month1OperatingExpenses = month1VariableOperatingExpenses + month1FixedOperatingExpenses;

  const variableSharePercent =
    month1OperatingExpenses > 0 ? month1VariableOperatingExpenses / month1OperatingExpenses : 0;
  const fixedSharePercent =
    month1OperatingExpenses > 0 ? month1FixedOperatingExpenses / month1OperatingExpenses : 0;

  let largestKey = /** @type {OperatingExpenseCategoryKey} */ ("productAndTechnology");
  let largestAmount = amounts.productAndTechnology;
  for (const key of OPERATING_EXPENSE_CATEGORY_KEYS) {
    if (amounts[key] > largestAmount) {
      largestKey = key;
      largestAmount = amounts[key];
    }
  }

  const largestSharePercent =
    month1OperatingExpenses > 0 ? largestAmount / month1OperatingExpenses : 0;
  const largestLabel = OPERATING_EXPENSE_CATEGORY_LABELS[largestKey];

  return {
    period: "month1",
    scope: "operating",
    categoryAmounts: amounts,
    categoryLabels: { ...OPERATING_EXPENSE_CATEGORY_LABELS },
    variableExpenses: month1VariableOperatingExpenses,
    fixedExpenses: month1FixedOperatingExpenses,
    month1OperatingExpenses,
    variableSharePercent,
    fixedSharePercent,
    largestExpenseCategoryKey: largestKey,
    largestExpenseCategoryLabel: largestLabel,
    largestExpenseCategoryAmount: largestAmount,
    largestExpenseCategorySharePercent: largestSharePercent,
    // Backward-compatible aliases
    largestExpenseCategory: largestLabel,
    largestExpenseCategoryPercent: largestSharePercent,
    variableExpensePercent: variableSharePercent,
    fixedExpensePercent: fixedSharePercent,
  };
}

function emptyMix() {
  return {
    period: "month1",
    scope: "operating",
    categoryAmounts: {
      productAndTechnology: 0,
      salesAndMarketing: 0,
      payroll: 0,
      otherFixedCosts: 0,
    },
    categoryLabels: { ...OPERATING_EXPENSE_CATEGORY_LABELS },
    variableExpenses: 0,
    fixedExpenses: 0,
    month1OperatingExpenses: 0,
    variableSharePercent: 0,
    fixedSharePercent: 0,
    largestExpenseCategoryKey: "",
    largestExpenseCategoryLabel: "",
    largestExpenseCategoryAmount: 0,
    largestExpenseCategorySharePercent: 0,
    largestExpenseCategory: "",
    largestExpenseCategoryPercent: 0,
    variableExpensePercent: 0,
    fixedExpensePercent: 0,
  };
}
