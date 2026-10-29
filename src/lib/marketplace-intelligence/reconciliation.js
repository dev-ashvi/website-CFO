/**
 * Compare transaction-derived totals with Unified Summary PDF totals.
 * Incomparable measures are labelled — never presented as reconciliation failures.
 */
import { roundMoney } from "./money.js";

function entry({
  id,
  label,
  txValue,
  pdfValue,
  comparable,
  status,
  explanation = null,
  unresolved = false,
}) {
  const difference =
    comparable && txValue != null && pdfValue != null ? roundMoney(txValue - pdfValue) : null;
  let resolvedStatus = status;
  if (!resolvedStatus) {
    if (!comparable) resolvedStatus = "not_comparable";
    else if (txValue == null || pdfValue == null) resolvedStatus = "missing_information";
    else if (Math.abs(difference) <= 0.05) resolvedStatus = "matched";
    else resolvedStatus = "difference";
  }
  return {
    id,
    label,
    txValue: txValue ?? null,
    pdfValue: pdfValue ?? null,
    difference,
    comparable,
    status: resolvedStatus,
    explanation,
    unresolved: unresolved || resolvedStatus === "difference",
  };
}

export function reconcileSettlement(normalized, metrics = null) {
  const summary = normalized?.summary || null;
  const hasRows = Array.isArray(normalized?.transactions) && normalized.transactions.length > 0;

  if (!hasRows) {
    return {
      layer: "reconciliation",
      status: "not_run",
      statusLabel: "Not run",
      matched: [],
      differences: [],
      notComparable: [],
      missingInformation: [],
      comparisons: [],
      issues: [
        {
          code: "reconciliation_sources_incomplete",
          message: "Reconciliation needs normalized transactions.",
        },
      ],
    };
  }

  if (!summary) {
    return {
      layer: "reconciliation",
      status: "pdf_missing",
      statusLabel: "PDF not provided",
      matched: [],
      differences: [],
      notComparable: [],
      missingInformation: [],
      comparisons: [],
      issues: [
        {
          code: "missing_unified_summary",
          message:
            "Unified Summary PDF was not provided or could not be parsed. Transaction analytics remain available.",
        },
      ],
      note: "Dashboard metrics are transaction-derived and are not blocked by a missing PDF.",
    };
  }

  const kpis = metrics?.kpis || {};
  const comparisons = [
    entry({
      id: "product_sales",
      label: "Seller-fulfilled product sales",
      txValue: kpis.grossProductSales,
      pdfValue: summary.sellerFulfilledProductSales,
      comparable: true,
      explanation:
        kpis.grossProductSales != null &&
        summary.sellerFulfilledProductSales != null &&
        Math.abs(kpis.grossProductSales - summary.sellerFulfilledProductSales) > 0.05
          ? "Both measure seller product sales for the period, but the amounts differ. Cause not verified from these exports."
          : "CSV Order Payment product charges vs PDF Seller fulfilled product sales.",
      unresolved:
        kpis.grossProductSales != null &&
        summary.sellerFulfilledProductSales != null &&
        Math.abs(kpis.grossProductSales - summary.sellerFulfilledProductSales) > 0.05,
    }),
    entry({
      id: "refunds",
      label: "Product sale refunds",
      txValue: kpis.refundProductCharges,
      pdfValue: summary.sellerFulfilledProductSaleRefunds,
      comparable: true,
      explanation: "CSV Refund product charges vs PDF seller-fulfilled product sale refunds.",
    }),
    entry({
      id: "advertising",
      label: "Cost of Advertising",
      txValue: kpis.advertising,
      pdfValue: summary.costOfAdvertising,
      comparable: true,
      explanation: "CSV Cost of Advertising service fees vs PDF Cost of Advertising.",
    }),
    entry({
      id: "inbound",
      label: "Inbound / FBA inventory services",
      txValue: kpis.inboundTransportation,
      pdfValue: summary.inboundServicesFees,
      comparable: true,
      explanation: "CSV Inbound Transportation Fee vs PDF FBA inventory and inbound services fees.",
    }),
    entry({
      id: "promotional_rebates",
      label: "Promotional rebates",
      txValue: kpis.promotionalRebates,
      pdfValue: summary.promotionalRebates,
      comparable: true,
      explanation:
        kpis.promotionalRebates != null &&
        summary.promotionalRebates != null &&
        Math.abs(kpis.promotionalRebates - summary.promotionalRebates) > 0.05
          ? "Comparable rebate lines differ. PDF may net rebate refunds differently; not verified further."
          : "CSV promotional rebates vs PDF promotional rebates.",
      unresolved:
        kpis.promotionalRebates != null &&
        summary.promotionalRebates != null &&
        Math.abs(kpis.promotionalRebates - summary.promotionalRebates) > 0.05,
    }),
    entry({
      id: "income",
      label: "PDF Income vs CSV net product sales",
      txValue: kpis.netProductSales,
      pdfValue: summary.income,
      comparable: false,
      status: "not_comparable",
      explanation:
        "Not comparable. PDF Income is net sales, credits, and refunds in Amazon’s summary taxonomy. CSV net product sales is only product charges on orders and refunds.",
    }),
    entry({
      id: "expenses",
      label: "PDF Expenses vs CSV fee outflows",
      txValue: roundMoney(
        Math.min(0, kpis.sellingFees || 0) +
          Math.min(0, kpis.advertising || 0) +
          Math.min(0, kpis.inboundTransportation || 0) +
          Math.min(0, kpis.promotionalRebates || 0),
      ),
      pdfValue: summary.expenses,
      comparable: false,
      status: "not_comparable",
      explanation:
        "Not comparable as a control total. PDF Expenses include Amazon’s full fee taxonomy. CSV fee outflows are only the classified lines available in this transaction export.",
    }),
    entry({
      id: "net_gst",
      label: "Net GST collected",
      txValue: null,
      pdfValue: summary.netGstCollected,
      comparable: false,
      status: "missing_information",
      explanation: "Missing in CSV. GST is not a labelled column in this transaction export; PDF value is shown for reference only.",
    }),
    entry({
      id: "bank_transfers",
      label: "Bank transfers",
      txValue: null,
      pdfValue: summary.transfersToBank ?? summary.transfers,
      comparable: false,
      status: "missing_information",
      explanation: "Missing in CSV. Bank transfers appear only on the Unified Summary.",
    }),
    entry({
      id: "settlement_vs_transfers",
      label: "CSV settlement movement vs PDF bank transfers",
      txValue: kpis.netSettlementMovement,
      pdfValue: summary.transfersToBank ?? summary.transfers,
      comparable: false,
      status: "not_comparable",
      explanation:
        "Not comparable and not subtracted against each other. CSV settlement movement is the sum of transaction Total (INR). PDF bank transfers are a separate ledger outflow. Opening/closing Amazon balances are not in these exports.",
    }),
  ];

  const matched = comparisons.filter((row) => row.status === "matched");
  const differences = comparisons.filter((row) => row.status === "difference");
  const notComparable = comparisons.filter((row) => row.status === "not_comparable");
  const missingInformation = comparisons.filter((row) => row.status === "missing_information");

  let status = "reviewed";
  let statusLabel = "Reviewed";
  if (differences.length) {
    status = "differences_found";
    statusLabel = `${differences.length} confirmed difference${differences.length === 1 ? "" : "s"}`;
  } else if (matched.length) {
    status = "matched";
    statusLabel = "Comparable lines matched";
  }

  return {
    layer: "reconciliation",
    status,
    statusLabel,
    summaryTotals: {
      income: summary.income,
      expenses: summary.expenses,
      netGstCollected: summary.netGstCollected,
      transfers: summary.transfersToBank ?? summary.transfers,
      periodRaw: summary.periodRaw,
    },
    comparisons,
    matched,
    differences,
    notComparable,
    missingInformation,
    issues: differences.map((row) => ({
      code: `recon_diff_${row.id}`,
      message: `${row.label}: CSV ${row.txValue} vs PDF ${row.pdfValue} (Δ ${row.difference}).`,
    })),
    unresolved: differences
      .filter((row) => row.unresolved)
      .map((row) => ({
        id: row.id,
        label: row.label,
        difference: row.difference,
        explanation: row.explanation,
      })),
  };
}
