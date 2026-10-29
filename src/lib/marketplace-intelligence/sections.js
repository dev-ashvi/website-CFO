/** Four analytical sections. Questions are prompts only — they are not answers. */

export const SECTIONS = [
  {
    id: "topline",
    label: "Topline & Growth",
    summary: "Sales, orders, average order value, mix, and weekly movement.",
    measures: [
      "Monthly sales and growth rates",
      "Order volume and average order value",
      "Units sold when quantity is present",
      "Product mix and seasonality",
      "Weekly trends and bulk-order effects",
    ],
    questions: [
      "How did monthly sales and growth move in this period?",
      "What are order volume and average order value?",
      "Which weeks look like bulk orders rather than a run-rate change?",
    ],
  },
  {
    id: "amazon_economics",
    label: "Amazon Economics",
    summary: "Fee lines kept separate, including a view of where settlement value leaves the account.",
    measures: [
      "Referral fees, separate from total marketplace deductions",
      "Fulfilment, advertising, and inbound transportation",
      "Refunds, promotional rebates, and other adjustments",
      "Effective marketplace fee percentages",
      "Where Amazon is taking the money",
    ],
    questions: [
      "Where is Amazon taking the money?",
      "How do referral fees compare with total marketplace deductions?",
      "How large are advertising, refunds, and promotional rebates?",
    ],
  },
  {
    id: "product_performance",
    label: "Product & SKU Performance",
    summary: "Products ranked by revenue, with concentration and fee burden.",
    measures: [
      "Products ranked by descending revenue",
      "Order count and revenue share",
      "Top-eight-product revenue share",
      "Fee burden by product when fees are reported",
      "Product trends and order-size analysis",
    ],
    questions: [
      "Which products contribute the most revenue?",
      "How concentrated is revenue in the top eight products?",
      "Which products carry the highest fee burden?",
    ],
  },
  {
    id: "profitability",
    label: "Profitability & Cash Realisation",
    summary: "Proceeds, deductions, and settlement. Profit only when product cost exists.",
    measures: [
      "Amazon proceeds and marketplace deductions",
      "Advertising-adjusted contribution when advertising is identified",
      "Settlement reconciliation against the Unified Summary",
      "Separation of revenue, taxes, fees, cash, and profit",
      "Product profit only when actual product costs are supplied",
    ],
    questions: [
      "What cash did Amazon settle in this period?",
      "Which deductions sit between revenue and proceeds?",
      "Is product profitability available for this file?",
    ],
  },
];

export function getSection(sectionId) {
  return SECTIONS.find((section) => section.id === sectionId) || SECTIONS[0];
}
