/**
 * Canonical marketplace transaction contract.
 * Ingestion maps a seller report into these fields. Calculations read only this shape.
 */

export const PLATFORMS = ["amazon"];

/**
 * Economic roles used after classification.
 * selling_fee is the CSV "Amazon fees" aggregate — not proven referral-only.
 */
export const FEE_CATEGORIES = [
  "product_sale",
  "refund_product",
  "promotional_rebate",
  "selling_fee",
  "advertising",
  "inbound_transportation",
  "subscription_fee",
  "fulfillment_removal",
  "cancellation_charge",
  "debt_adjustment",
  "other_settlement",
  "tax_withholding",
  "bank_transfer",
  "unknown",
];

/** Amounts that reduce seller proceeds when negative (or are fee outflows). */
export const DEDUCTION_CATEGORIES = [
  "selling_fee",
  "advertising",
  "inbound_transportation",
  "subscription_fee",
  "fulfillment_removal",
  "cancellation_charge",
  "promotional_rebate",
  "refund_product",
  "other_settlement",
  "tax_withholding",
];

export const CANONICAL_TRANSACTION_FIELDS = [
  { key: "platform", required: true },
  { key: "postedAt", required: true },
  { key: "transactionType", required: true },
  { key: "totalInr", required: true },
  { key: "currency", required: true },
  { key: "sourceRow", required: true },
  { key: "classification", required: true },
  { key: "orderId", required: false },
  { key: "productName", required: false },
  { key: "quantity", required: false },
  { key: "productCharges", required: false },
  { key: "promotionalRebates", required: false },
  { key: "amazonFees", required: false },
  { key: "otherAmount", required: false },
  { key: "productCost", required: false },
];

export const MISSING_PRODUCT_COST = {
  code: "product_cost",
  message: "Product profitability is withheld until actual product costs are provided.",
};

export const MISSING_UNITS = {
  code: "units",
  message: "Units sold are unavailable in this Amazon transaction export.",
};

export const MISSING_REFERRAL_SPLIT = {
  code: "referral_fee_split",
  message:
    "This CSV aggregates selling fees into Amazon fees. Referral fee is not separately itemised; selling fees are shown instead.",
};

export function emptyAnalysis() {
  return {
    status: "not_calculated",
    period: null,
    currency: null,
    metrics: null,
    reconciliation: null,
    missingInputs: [MISSING_PRODUCT_COST, MISSING_UNITS],
    warnings: [],
  };
}

export function assertDistinctFeeRoles() {
  return {
    referralIsDeduction: false,
    sellingFeeIsDeduction: DEDUCTION_CATEGORIES.includes("selling_fee"),
    advertisingSeparateFromSelling:
      DEDUCTION_CATEGORIES.includes("advertising") && DEDUCTION_CATEGORIES.includes("selling_fee"),
    taxSeparateFromFees: !DEDUCTION_CATEGORIES.includes("product_sale"),
  };
}
