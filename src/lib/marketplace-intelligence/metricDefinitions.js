/**
 * Exact metric definitions for Marketplace Intelligence V1.
 * Numerators, denominators, and inclusion rules are the contract for tests and Ask WYZ.
 */

export const METRIC_DEFINITIONS = {
  gross_product_sales: {
    label: "Gross product sales",
    numerator: "Sum of Total product charges on Transaction type = Order Payment",
    denominator: null,
    includes: ["Order Payment.productCharges"],
    excludes: ["Refunds", "Service Fees", "Debt Adjustment", "Cancellation"],
  },
  net_product_sales: {
    label: "Net product sales",
    numerator:
      "Sum of Total product charges on Order Payment + Sum of Total product charges on Refund (refunds are negative)",
    denominator: null,
    includes: ["Order Payment.productCharges", "Refund.productCharges"],
    excludes: ["Service fee lines", "Debt adjustments"],
  },
  order_count: {
    label: "Order count",
    numerator: "Count of distinct valid Order IDs on Order Payment rows; rows without an Order ID each count once",
    denominator: null,
    notes: "Multi-line payments for the same Order ID are not double-counted. Refund rows are not orders.",
  },
  aov: {
    label: "Average order value",
    numerator: "gross_product_sales",
    denominator: "order_count (distinct order IDs)",
    notes: "Uses product charges, not settlement total.",
  },
  units_sold: {
    label: "Units sold",
    available: false,
    reason: "Quantity is not present in amazon_transaction_csv_v1.",
  },
  mom_sales_growth: {
    label: "Month-over-month sales growth",
    numerator: "gross_product_sales(month) - gross_product_sales(prior month)",
    denominator: "abs(gross_product_sales(prior month))",
  },
  amazon_selling_fees: {
    label: "Amazon selling fees",
    numerator: "Sum of Amazon fees on Order Payment and Refund rows",
    notes: "CSV does not split referral vs closing fees.",
  },
  advertising_spend: {
    label: "Advertising spend",
    numerator: "Signed settlement amounts classified as advertising (Cost of Advertising)",
    notes: "Reported as the signed Amazon amount; magnitude is abs(sum).",
  },
  inbound_transportation: {
    label: "Inbound transportation",
    numerator: "Amounts classified as inbound transportation",
  },
  promotional_rebates: {
    label: "Promotional rebates",
    numerator: "Sum of Total promotional rebates across classified rows",
  },
  refund_product_charges: {
    label: "Refunded product charges",
    numerator: "Sum of Total product charges on Refund rows",
  },
  net_settlement_movement: {
    label: "Net settlement movement",
    numerator: "Sum of Total (INR) for all recognised transaction rows in scope",
    notes: "This is account settlement movement, not bank transfers and not profit.",
  },
  amazon_proceeds: {
    label: "Amazon account proceeds",
    numerator: "net_settlement_movement",
    notes: "Alias used on the cash bridge. Not net profit. Not bank deposits.",
  },
  effective_selling_fee_rate: {
    label: "Effective selling fee rate",
    numerator: "abs(amazon_selling_fees)",
    denominator: "gross_product_sales",
  },
  effective_marketplace_deduction_rate: {
    label: "Effective marketplace deduction rate",
    numerator:
      "abs(negative amounts of selling_fees + advertising + inbound + subscription + fulfillment_removal + cancellation + promotional_rebates)",
    denominator: "gross_product_sales",
    notes:
      "Refund product charges and unexplained CSV Other credits are excluded from this fee rate. Each included role is summed once.",
  },
  top_n_revenue_concentration: {
    label: "Top-N product revenue share",
    numerator: "Sum of gross product sales for the top N products by revenue",
    denominator: "gross_product_sales",
    notes: "N defaults to 8. Calculated, not hardcoded. Labelled revenue share — not profitability.",
  },
  product_fee_burden: {
    label: "Product fee burden",
    numerator: "abs(sum reported Amazon fees on Order Payment and Refund for the product)",
    denominator: "gross product sales for the product",
    notes: "Null when Amazon fees are missing for the product — never inferred as zero-fee.",
  },
  product_revenue_share: {
    label: "Revenue share (%)",
    numerator: "product gross product sales",
    denominator: "total gross product sales",
    notes: "Not contribution margin or profitability.",
  },
  bank_transfers: {
    label: "Bank transfers",
    source: "Unified Summary PDF field Transfers to bank account / Transfers total",
    notes: "Not present in the transaction CSV used for V1.",
  },
  product_profit: {
    label: "Product profit",
    available: false,
    reason: "Requires actual product COGS. Never inferred.",
  },
};
