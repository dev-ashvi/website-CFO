/**
 * Map Amazon transaction rows into economic roles without inventing detail
 * the export does not provide.
 *
 * This CSV aggregates selling fees into "Amazon fees". Referral fee is not a
 * separate column, so selling_fee is the honest label unless the PDF supplies
 * Seller fulfilled selling fees.
 */

export const ECONOMIC_ROLES = [
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
  "unknown",
];

function detail(text) {
  return String(text || "").trim();
}

function lower(text) {
  return detail(text).toLowerCase();
}

/**
 * Normalize truncated Amazon product titles for grouping.
 * Strips export ellipsis and trailing comma/pipe artifacts from truncation.
 */
export function normalizeProductName(raw) {
  let text = detail(raw).replace(/\.\.\.$/, "").replace(/\s+/g, " ").trim();
  if (!text || text === "---") return null;
  if (
    /^(cost of advertising|inbound transportation fee|subscription:|cross-account debt adjustment|order cancellation charge|fba removal)/i.test(
      text,
    )
  ) {
    return null;
  }
  // Collapse truncation tails: "650ml," and "650ml |" → "650ml"
  text = text.replace(/\s*[,|]\s*$/g, "").trim();
  return text || null;
}

export function classifyServiceDetail(productDetails) {
  const d = lower(productDetails);
  if (d.includes("cost of advertising")) return "advertising";
  if (d.includes("inbound transportation")) return "inbound_transportation";
  if (d.startsWith("subscription")) return "subscription_fee";
  if (d.includes("fba removal")) return "fulfillment_removal";
  if (d.includes("cancellation")) return "cancellation_charge";
  return "unknown";
}

/**
 * Split one Amazon CSV row into economic amount lines.
 * Never assigns unknown service lines to product_sale.
 * CSV "Other" stays other_settlement — never silently tax/revenue/fee.
 */
export function classifyTransactionRow(row) {
  const type = detail(row.transactionType);
  const productDetails = detail(row.productDetails);
  const orderId = detail(row.orderId);
  const hasOrder = orderId && orderId !== "---";
  const lines = [];
  const notes = [];

  const push = (role, amount, field) => {
    if (amount == null || amount === 0) return;
    lines.push({ role, amount, field });
  };

  if (type === "Order Payment") {
    push("product_sale", row.productCharges, "Total product charges");
    push("promotional_rebate", row.promotionalRebates, "Total promotional rebates");
    push("selling_fee", row.amazonFees, "Amazon fees");
    push("other_settlement", row.otherAmount, "Other");
    if (row.otherAmount) {
      notes.push("CSV Other on order payments is unexplained — not classified as tax, fee, or revenue.");
    }
    return {
      kind: "order_payment",
      known: true,
      productName: normalizeProductName(productDetails),
      orderId: hasOrder ? orderId : null,
      lines,
      notes,
      amazonFeesMissing: row.amazonFeesMissing === true,
    };
  }

  if (type === "Refund") {
    push("refund_product", row.productCharges, "Total product charges");
    push("promotional_rebate", row.promotionalRebates, "Total promotional rebates");
    push("selling_fee", row.amazonFees, "Amazon fees");
    push("other_settlement", row.otherAmount, "Other");
    return {
      kind: "refund",
      known: true,
      productName: normalizeProductName(productDetails),
      orderId: hasOrder ? orderId : null,
      lines,
      notes,
      amazonFeesMissing: row.amazonFeesMissing === true,
    };
  }

  if (type === "Service Fees") {
    const role = classifyServiceDetail(productDetails);
    if (role === "unknown") {
      notes.push("Unknown service-fee detail preserved for investigation.");
    }
    const feeAmount = row.amazonFees || 0;
    const otherAmount = row.otherAmount || 0;
    const total = row.totalInr || 0;
    if (feeAmount) push(role, feeAmount, "Amazon fees");
    if (otherAmount) push(role === "unknown" ? "unknown" : role, otherAmount, "Other");
    if (!feeAmount && !otherAmount && total) push(role, total, "Total (INR)");
    if (row.productCharges) {
      notes.push("Unexpected product charges on a Service Fees row.");
      push("unknown", row.productCharges, "Total product charges");
    }
    return {
      kind: "service_fee",
      known: role !== "unknown",
      productName: null,
      orderId: null,
      serviceRole: role,
      lines,
      notes,
      amazonFeesMissing: row.amazonFeesMissing === true,
    };
  }

  if (type === "Debt Adjustment") {
    if (row.otherAmount != null && row.otherAmount !== 0) {
      push("debt_adjustment", row.otherAmount, "Other");
    } else {
      push("debt_adjustment", row.totalInr, "Total (INR)");
    }
    return {
      kind: "debt_adjustment",
      known: true,
      productName: null,
      orderId: hasOrder ? orderId : null,
      lines,
      notes,
      amazonFeesMissing: false,
    };
  }

  if (type === "Cancellation") {
    push("cancellation_charge", row.amazonFees, "Amazon fees");
    push("cancellation_charge", row.otherAmount, "Other");
    if (!row.amazonFees && !row.otherAmount && row.totalInr) {
      push("cancellation_charge", row.totalInr, "Total (INR)");
    }
    return {
      kind: "cancellation",
      known: true,
      productName: normalizeProductName(productDetails),
      orderId: hasOrder ? orderId : null,
      lines,
      notes,
      amazonFeesMissing: row.amazonFeesMissing === true,
    };
  }

  notes.push(`Unknown transaction type "${type}" was not treated as sales or fees.`);
  push("unknown", row.productCharges, "Total product charges");
  push("unknown", row.promotionalRebates, "Total promotional rebates");
  push("unknown", row.amazonFees, "Amazon fees");
  push("unknown", row.otherAmount, "Other");
  if (!lines.length && row.totalInr) push("unknown", row.totalInr, "Total (INR)");
  return {
    kind: "unknown",
    known: false,
    productName: normalizeProductName(productDetails),
    orderId: hasOrder ? orderId : null,
    lines,
    notes,
    amazonFeesMissing: row.amazonFeesMissing === true,
  };
}
