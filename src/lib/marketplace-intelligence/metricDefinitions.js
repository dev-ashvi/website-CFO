/**
 * Exact metric definitions for Marketplace Intelligence V1 / Stage 4.1.
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
  refund_amount: {
    label: "Refund amount",
    numerator: "Sum of Total product charges on Refund rows (signed negative in engine; absolute shown in Topline)",
    notes: "Customer product refunds. Presentation lives in Topline — not Amazon Economics fee drains.",
  },
  net_product_sales: {
    label: "Net product sales",
    numerator: "gross_product_sales + refund product charges (refunds are negative)",
    denominator: null,
    includes: ["Order Payment.productCharges", "Refund.productCharges"],
    excludes: ["Service fee lines", "Debt adjustments"],
    notes: "Equivalent to Gross Product Sales minus Refund Amount when refunds are expressed as a positive reduction.",
  },
  gross_order_count: {
    label: "Gross orders",
    numerator: "Count of distinct valid Order IDs on Order Payment rows; rows without an Order ID each count once",
    notes: "Multi-line payments for the same Order ID are not double-counted. Refund rows are not orders.",
  },
  refunded_order_count: {
    label: "Refunded orders / orders affected by refunds",
    numerator: "Count of distinct Order IDs appearing on Refund rows (aggregated across multiple refund lines)",
    notes:
      "When every refunded order that exists in the gross set is a full refund (abs refund product charges ≈ order gross within ₹0.05) and no partial/ambiguous cases remain, these may be subtracted from gross orders. Otherwise the UI labels them as Orders affected by refunds and does not auto-subtract.",
  },
  net_order_count: {
    label: "Net orders",
    numerator: "gross_order_count − full refunded orders in the gross population",
    availableWhen: "canSubtractFullRefunds === true",
    notes: "Not claimed when partial refunds, ambiguous amounts, or only outside-window refunds prevent a clean definition.",
  },
  order_count: {
    label: "Order count (legacy alias)",
    numerator: "gross_order_count",
    notes: "Kept for compatibility. Prefer gross_order_count / net_order_count.",
  },
  aov: {
    label: "Gross AOV",
    numerator: "gross_product_sales",
    denominator: "gross_order_count (unique gross order-level totals)",
    formula: "gross_product_sales / gross_order_count",
    notes:
      "Gross average order value only. Uses the same unique gross order population as median. Not net AOV. Not settlement total / payment-row counts.",
  },
  median_order_value: {
    label: "Median order value",
    numerator: "Median of unique gross order-level product-charge totals (classic median; averages two middle values when even)",
    notes:
      "Same gross order population and product-charge basis as Gross AOV. Never calculated from raw payment transaction rows when an Order ID groups multiple lines.",
  },
  orders_above_2x_median: {
    label: "Orders above 2× median",
    numerator: "Count of unique orders whose product-charge total exceeds 2 × median_order_value",
  },
  sales_above_2x_median: {
    label: "Sales from orders above 2× median",
    numerator: "Sum of unique order-level product charges for orders above 2 × median",
    denominator: "gross_product_sales (for share)",
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
    notes: "CSV does not split referral vs closing fees. Product refund charges themselves are excluded from fee-drain charts.",
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
    notes:
      "CSV promotional rebate column. Treated as a settlement adjustment — not automatically classified as an Amazon marketplace fee, and excluded from marketplace deduction rate.",
  },
  refund_product_charges: {
    label: "Refunded product charges",
    numerator: "Sum of Total product charges on Refund rows",
    notes: "Shown in Topline as sales reductions; excluded from Amazon Economics fee-drain charts.",
  },
  net_settlement_movement: {
    label: "Net settlement movement",
    numerator: "Sum of Total (INR) for all recognised transaction rows in scope",
    notes: "This is account settlement movement, not bank transfers and not profit. Presentation of refunds in Topline does not change this settlement total.",
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
      "abs(negative amounts of selling_fees + advertising + inbound + subscription + fulfillment_removal + cancellation)",
    denominator: "gross_product_sales",
    notes:
      "Marketplace fees only. Excludes customer product refunds, promotional rebates, and unexplained CSV Other credits. Each included role is summed once.",
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
