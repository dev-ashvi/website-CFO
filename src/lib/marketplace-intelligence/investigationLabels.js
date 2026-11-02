/**
 * Founder-facing labels for investigation statuses and reconciliation gaps.
 * Keep raw ids out of the main UI.
 */

import { INVESTIGATION_ITEM_STATUS } from "./insightSchema.js";

const RECON_TOPIC = Object.freeze({
  product_sales: "Product sales versus settlement product charges",
  promotional_rebates: "Promotional rebates versus settlement promotions",
  amazon_fees: "Marketplace fees versus settlement fee lines",
  refunds: "Customer refunds versus settlement refund lines",
  other_credits: "Other credits versus settlement other amounts",
  income: "Settlement income lines versus CSV income",
  expenses: "Settlement expense lines versus CSV expenses",
  gst: "GST amounts on the settlement summary",
  net_gst: "Net GST on the settlement summary",
  bank_transfers: "Bank transfer amounts on the settlement summary",
  settlement_vs_transfers: "Settlement totals versus bank transfers",
  opening_balance: "Opening settlement balance",
  closing_balance: "Closing settlement balance",
});

const RECON_STATUS = Object.freeze({
  missing_information: "is not available in this report",
  not_comparable: "cannot be compared cleanly with the transaction file",
  difference: "shows a difference that still needs investigation",
  matched: "matches within tolerance",
});

export function humanReconGap(row) {
  const topic = RECON_TOPIC[row?.id] || "A settlement reconciliation check";
  const status = RECON_STATUS[row?.status] || "needs review";
  return `${topic} ${status}.`;
}

export function statusLabel(status) {
  switch (status) {
    case INVESTIGATION_ITEM_STATUS.MEASURED_RESULT:
      return "Measured";
    case INVESTIGATION_ITEM_STATUS.BACKGROUND_FACT:
      return "Background fact";
    case INVESTIGATION_ITEM_STATUS.CHECKED_HYPOTHESIS:
      return "Period check";
    case INVESTIGATION_ITEM_STATUS.SUGGESTED_INVESTIGATION:
      return "Suggested";
    case INVESTIGATION_ITEM_STATUS.MISSING_EVIDENCE:
      return "Missing evidence";
    case INVESTIGATION_ITEM_STATUS.INCONCLUSIVE:
      return "Inconclusive";
    default:
      return "Note";
  }
}

export function connectionToStatus(connection) {
  if (!connection) return INVESTIGATION_ITEM_STATUS.INCONCLUSIVE;
  const assertion = connection.assertion || "";
  const strength = connection.strength || "";

  if (strength === "related_observation" || assertion === "verified_related_insight") {
    return INVESTIGATION_ITEM_STATUS.BACKGROUND_FACT;
  }
  if (strength === "period_measured" || strength === "period_measured_no_change") {
    return INVESTIGATION_ITEM_STATUS.CHECKED_HYPOTHESIS;
  }
  if (strength === "mathematical_driver" || assertion === "verified_decomposition") {
    return INVESTIGATION_ITEM_STATUS.MEASURED_RESULT;
  }
  if (strength === "verified_exception" || assertion === "unresolved_difference") {
    return INVESTIGATION_ITEM_STATUS.MEASURED_RESULT;
  }
  if (assertion === "fee_denominator_gross") {
    return INVESTIGATION_ITEM_STATUS.BACKGROUND_FACT;
  }
  if (assertion === "verified_level" && strength !== "period_measured") {
    // Overall filter-level observation — not a period-specific large-order test.
    return INVESTIGATION_ITEM_STATUS.BACKGROUND_FACT;
  }
  if (
    assertion === "coverage_limitation" ||
    assertion === "question_only" ||
    assertion === "not_confirmed_demand_decline" ||
    strength === "insufficient_period_evidence" ||
    strength === "qualified"
  ) {
    if (assertion === "question_only" || strength === "insufficient_period_evidence") {
      return INVESTIGATION_ITEM_STATUS.INCONCLUSIVE;
    }
    if (assertion === "coverage_limitation") return INVESTIGATION_ITEM_STATUS.INCONCLUSIVE;
    return INVESTIGATION_ITEM_STATUS.INCONCLUSIVE;
  }
  return INVESTIGATION_ITEM_STATUS.INCONCLUSIVE;
}
