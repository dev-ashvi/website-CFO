/**
 * Deterministic marketplace metrics. See metricDefinitions.js for contracts.
 */
import { inDateRange, monthKey, weekKey } from "./dates.js";
import { buildChartInsights } from "./insights.js";
import { growthRate, medianOfSorted, ratio, roundMoney, sumMoney } from "./money.js";
import { presentLatestMomGrowth } from "./periodCoverage.js";
import { MISSING_PRODUCT_COST, MISSING_REFERRAL_SPLIT, MISSING_UNITS } from "./schema.js";

/** Absolute tolerance when comparing refund product charges to order gross. */
const FULL_REFUND_TOLERANCE = 0.05;

export function createEmptyFilters() {
  return {
    dateRange: { start: null, end: null },
    products: [],
    categories: [],
  };
}

function roleSum(transactions, role) {
  return sumMoney(
    transactions.flatMap((tx) => (tx.lines || []).filter((line) => line.role === role).map((line) => line.amount)),
  );
}

function matchesFilters(tx, filters = {}) {
  if (!inDateRange(tx.postedAt, filters.dateRange)) return false;
  if (filters.products?.length) {
    if (!tx.productName || !filters.products.includes(tx.productName)) return false;
  }
  if (filters.categories?.length) {
    const roles = new Set((tx.lines || []).map((line) => line.role));
    if (!filters.categories.some((category) => roles.has(category))) return false;
  }
  return true;
}

export function filterTransactions(transactions, filters) {
  return (transactions || []).filter((tx) => matchesFilters(tx, filters || {}));
}

/** Distinct valid Amazon order IDs; rows without an ID each count once. */
export function countDistinctOrders(orderTx) {
  const ids = new Set();
  let missingIdRows = 0;
  for (const tx of orderTx || []) {
    if (tx.orderId && tx.orderId !== "---") ids.add(tx.orderId);
    else missingIdRows += 1;
  }
  return {
    orderCount: ids.size + missingIdRows,
    distinctOrderIds: ids.size,
    paymentRows: (orderTx || []).length,
  };
}

/**
 * Aggregate Order Payment rows to unique order-level product-charge totals.
 * Payment-row amounts are never used directly for median / AOV / skew.
 */
export function buildOrderLevelTotals(orderTx) {
  const map = new Map();
  for (const tx of orderTx || []) {
    const hasId = Boolean(tx.orderId && tx.orderId !== "---");
    const key = hasId ? tx.orderId : `row:${tx.sourceRow}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        orderId: hasId ? tx.orderId : null,
        synthetic: !hasId,
        sales: 0,
        fees: 0,
        feeRowsReported: 0,
        paymentRows: 0,
        postedAt: tx.postedAt || null,
        productName: tx.productName || null,
      });
    }
    const row = map.get(key);
    row.sales = roundMoney(row.sales + (tx.productCharges || 0));
    row.paymentRows += 1;
    if (!tx.amazonFeesMissing) {
      row.feeRowsReported += 1;
      row.fees = roundMoney(row.fees + (tx.amazonFees || 0));
    }
    if (!row.postedAt && tx.postedAt) row.postedAt = tx.postedAt;
    if (!row.productName && tx.productName) row.productName = tx.productName;
  }
  return [...map.values()].sort((a, b) => b.sales - a.sales);
}

/**
 * Classify refunds against unique gross order totals.
 * Net orders are only returned when every refunded order in the gross set is a full refund
 * and no partial/ambiguous cases remain.
 */
export function analyzeRefundOrders(orderLevels, refundTx) {
  const grossById = new Map();
  for (const row of orderLevels || []) {
    if (row.orderId) grossById.set(row.orderId, row);
  }

  const refundMap = new Map();
  for (const tx of refundTx || []) {
    const hasId = Boolean(tx.orderId && tx.orderId !== "---");
    const key = hasId ? tx.orderId : `row:${tx.sourceRow}`;
    if (!refundMap.has(key)) {
      refundMap.set(key, {
        orderId: hasId ? tx.orderId : null,
        refundProductCharges: 0,
        refundRows: 0,
        inGrossPopulation: hasId ? grossById.has(tx.orderId) : false,
        grossSales: hasId ? grossById.get(tx.orderId)?.sales ?? null : null,
      });
    }
    const row = refundMap.get(key);
    row.refundProductCharges = roundMoney(row.refundProductCharges + (tx.productCharges || 0));
    row.refundRows += 1;
  }

  const details = [...refundMap.values()].map((row) => {
    const absRefund = roundMoney(Math.abs(row.refundProductCharges || 0));
    let classification = "ambiguous";
    if (!row.orderId) classification = "ambiguous";
    else if (!row.inGrossPopulation) classification = "outside_gross_window";
    else if (row.grossSales != null && Math.abs(absRefund - row.grossSales) <= FULL_REFUND_TOLERANCE) {
      classification = "full";
    } else if (row.grossSales != null && absRefund + FULL_REFUND_TOLERANCE < row.grossSales) {
      classification = "partial";
    } else if (row.grossSales != null && absRefund > row.grossSales + FULL_REFUND_TOLERANCE) {
      classification = "ambiguous";
    }
    return {
      ...row,
      absRefund,
      classification,
    };
  });

  const refundedOrderCount = details.length;
  const fullInGross = details.filter((row) => row.classification === "full");
  const partial = details.filter((row) => row.classification === "partial");
  const outside = details.filter((row) => row.classification === "outside_gross_window");
  const ambiguous = details.filter((row) => row.classification === "ambiguous");
  // Net orders only when every in-gross refund is a verified full-order reversal,
  // or when there are no refund rows at all (net = gross).
  const canSubtractFullRefunds =
    refundedOrderCount === 0 ||
    (partial.length === 0 &&
      ambiguous.length === 0 &&
      fullInGross.length === details.filter((row) => row.inGrossPopulation).length &&
      fullInGross.length > 0 &&
      outside.length + fullInGross.length === refundedOrderCount);

  return {
    refundedOrderCount,
    refundAmount: sumMoney(details.map((row) => row.refundProductCharges)),
    details,
    fullRefundOrderCount: fullInGross.length,
    partialRefundOrderCount: partial.length,
    outsideGrossWindowCount: outside.length,
    ambiguousRefundOrderCount: ambiguous.length,
    canSubtractFullRefunds,
    ordersAffectedByRefunds:
      refundedOrderCount === 0
        ? 0
        : details.filter((row) => row.inGrossPopulation || !row.orderId).length || refundedOrderCount,
    netOrdersBasis:
      refundedOrderCount === 0
        ? "no_refunds"
        : canSubtractFullRefunds
          ? "gross_minus_full_refunds"
          : "not_subtracted",
  };
}

/**
 * Gross AOV, median, and large-order skew from the same unique gross order population.
 * AOV = gross product sales / gross distinct orders. Median uses the same order totals.
 */
export function computeOrderValueStats(orderLevels, grossProductSales) {
  const amounts = (orderLevels || []).map((row) => row.sales).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const orderCount = amounts.length;
  const basis = {
    salesBasis: "gross_product_sales",
    orderBasis: "gross_distinct_orders",
    aovFormula: "gross_product_sales / gross_order_count",
    medianPopulation: "gross_unique_order_product_charges",
  };
  if (!orderCount) {
    return {
      orderCount: 0,
      aov: null,
      medianOrderValue: null,
      ordersAbove2xMedian: 0,
      salesAbove2xMedian: 0,
      salesShareAbove2xMedian: null,
      skewMaterial: false,
      ...basis,
    };
  }
  const salesTotal = grossProductSales != null ? grossProductSales : sumMoney(amounts);
  const aov = ratio(salesTotal, orderCount);
  const medianOrderValue = medianOfSorted(amounts);
  const threshold = medianOrderValue != null ? medianOrderValue * 2 : null;
  let ordersAbove2xMedian = 0;
  let salesAbove2xMedian = 0;
  if (threshold != null) {
    for (const amount of amounts) {
      if (amount > threshold) {
        ordersAbove2xMedian += 1;
        salesAbove2xMedian = roundMoney(salesAbove2xMedian + amount);
      }
    }
  }
  const salesShareAbove2xMedian = ratio(salesAbove2xMedian, salesTotal);
  return {
    orderCount,
    aov,
    medianOrderValue,
    ordersAbove2xMedian,
    salesAbove2xMedian,
    salesShareAbove2xMedian,
    skewMaterial: Boolean(ordersAbove2xMedian && salesShareAbove2xMedian != null && salesShareAbove2xMedian >= 0.25),
    ...basis,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function buildMonthly(orderTx) {
  const map = new Map();
  for (const tx of orderTx) {
    const key = monthKey(tx.postedAt);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { month: key, sales: 0, orderIds: new Set(), missingIdRows: 0, fees: 0 });
    const row = map.get(key);
    row.sales = roundMoney(row.sales + (tx.productCharges || 0));
    if (tx.orderId && tx.orderId !== "---") row.orderIds.add(tx.orderId);
    else row.missingIdRows += 1;
    row.fees = roundMoney(row.fees + (tx.amazonFees || 0));
  }
  const rows = [...map.values()]
    .map((row) => ({
      month: row.month,
      sales: row.sales,
      orders: row.orderIds.size + row.missingIdRows,
      fees: row.fees,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  for (let i = 0; i < rows.length; i += 1) {
    const prev = i > 0 ? rows[i - 1] : null;
    rows[i].aov = ratio(rows[i].sales, rows[i].orders);
    rows[i].growth = prev ? growthRate(rows[i].sales, prev.sales) : null;
  }
  return rows;
}

function buildWeekly(orderTx) {
  const map = new Map();
  for (const tx of orderTx) {
    const key = weekKey(tx.postedAt);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { weekStart: key, sales: 0, orderIds: new Set(), missingIdRows: 0 });
    const row = map.get(key);
    row.sales = roundMoney(row.sales + (tx.productCharges || 0));
    if (tx.orderId && tx.orderId !== "---") row.orderIds.add(tx.orderId);
    else row.missingIdRows += 1;
  }
  return [...map.values()]
    .map((row) => ({
      weekStart: row.weekStart,
      sales: row.sales,
      orders: row.orderIds.size + row.missingIdRows,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function buildProducts(orderTx, refundTx) {
  const map = new Map();
  const touch = (name) => {
    const key = name || "Unspecified product";
    if (!map.has(key)) {
      map.set(key, {
        productName: key,
        sales: 0,
        refunds: 0,
        orderIds: new Set(),
        missingIdRows: 0,
        fees: 0,
        feeRowsReported: 0,
        feeRowsMissing: 0,
        promo: 0,
        other: 0,
        sourceRows: [],
      });
    }
    return map.get(key);
  };

  for (const tx of orderTx) {
    const row = touch(tx.productName);
    row.sales = roundMoney(row.sales + (tx.productCharges || 0));
    if (tx.orderId && tx.orderId !== "---") row.orderIds.add(tx.orderId);
    else row.missingIdRows += 1;
    if (tx.amazonFeesMissing) row.feeRowsMissing += 1;
    else {
      row.feeRowsReported += 1;
      row.fees = roundMoney(row.fees + (tx.amazonFees || 0));
    }
    row.promo = roundMoney(row.promo + (tx.promotionalRebates || 0));
    row.other = roundMoney(row.other + (tx.otherAmount || 0));
    row.sourceRows.push(tx.sourceRow);
  }
  for (const tx of refundTx) {
    const row = touch(tx.productName);
    row.refunds = roundMoney(row.refunds + (tx.productCharges || 0));
    if (tx.amazonFeesMissing) row.feeRowsMissing += 1;
    else {
      row.feeRowsReported += 1;
      row.fees = roundMoney(row.fees + (tx.amazonFees || 0));
    }
    row.sourceRows.push(tx.sourceRow);
  }

  const totalSales = sumMoney([...map.values()].map((row) => row.sales));
  const rows = [...map.values()]
    .map((row) => {
      const orders = row.orderIds.size + row.missingIdRows;
      const feesAvailable = row.feeRowsReported > 0;
      return {
        productName: row.productName,
        sales: row.sales,
        refunds: row.refunds,
        orders,
        fees: feesAvailable ? row.fees : null,
        feesAvailable,
        feeDataStatus: feesAvailable ? (row.feeRowsMissing ? "partial" : "reported") : "missing",
        promo: row.promo,
        other: row.other,
        sourceRows: row.sourceRows,
        aov: ratio(row.sales, orders),
        feeBurden: feesAvailable ? ratio(Math.abs(row.fees), row.sales) : null,
        revenueShare: ratio(row.sales, totalSales),
        netProductSales: roundMoney(row.sales + row.refunds),
      };
    })
    .sort((a, b) => b.sales - a.sales);

  let cumulative = 0;
  for (const row of rows) {
    cumulative = roundMoney(cumulative + row.sales);
    row.cumulativeRevenueShare = ratio(cumulative, totalSales);
  }
  return rows;
}

/**
 * Order-size buckets and bulk candidates from unique order-level totals.
 * Fee burden by bucket uses fees already aggregated onto each order level.
 */
function orderSizeBuckets(orderLevels) {
  const levels = orderLevels || [];
  const sizes = levels.map((row) => row.sales).sort((a, b) => a - b);
  if (!sizes.length) return { buckets: [], median: null, p90: null, bulkOrders: [] };
  const median = medianOfSorted(sizes);
  const p90 = percentile(sizes, 0.9);
  const bulkThreshold = Math.max((median || 0) * 3, p90 || 0);
  const buckets = [
    { id: "0_250", label: "₹0–250", min: 0, max: 250, orders: 0, sales: 0, fees: 0, feeRowsReported: 0 },
    { id: "250_500", label: "₹250–500", min: 250, max: 500, orders: 0, sales: 0, fees: 0, feeRowsReported: 0 },
    { id: "500_1000", label: "₹500–1,000", min: 500, max: 1000, orders: 0, sales: 0, fees: 0, feeRowsReported: 0 },
    { id: "1000_plus", label: "₹1,000+", min: 1000, max: Infinity, orders: 0, sales: 0, fees: 0, feeRowsReported: 0 },
  ];

  const bulkOrders = [];
  for (const level of levels) {
    const amount = level.sales || 0;
    const bucket = buckets.find((b) => amount >= b.min && amount < b.max) || buckets[buckets.length - 1];
    bucket.orders += 1;
    bucket.sales = roundMoney(bucket.sales + amount);
    if (level.feeRowsReported) {
      bucket.feeRowsReported += level.feeRowsReported;
      bucket.fees = roundMoney(bucket.fees + (level.fees || 0));
    }
    if (amount >= bulkThreshold && bulkThreshold > 0) {
      bulkOrders.push({
        orderId: level.orderId,
        productName: level.productName,
        amount,
        postedAt: level.postedAt,
        sourceRow: level.key,
      });
    }
  }

  return {
    buckets: buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      orders: bucket.orders,
      sales: bucket.sales,
      fees: bucket.feeRowsReported ? bucket.fees : null,
      feesAvailable: bucket.feeRowsReported > 0,
      feeBurden: bucket.feeRowsReported ? ratio(Math.abs(bucket.fees), bucket.sales) : null,
    })),
    median,
    p90,
    bulkThreshold: roundMoney(bulkThreshold),
    bulkOrders: bulkOrders.sort((a, b) => b.amount - a.amount),
  };
}

/** Top products × recent months — aggregated only (no order rows). */
export function buildProductMonthly(orderTx, { topN = 5, monthCount = 4 } = {}) {
  const productTotals = new Map();
  const cell = new Map();
  const months = new Set();
  for (const tx of orderTx || []) {
    const month = monthKey(tx.postedAt);
    const productName = tx.productName || "Unspecified product";
    if (!month) continue;
    months.add(month);
    productTotals.set(productName, roundMoney((productTotals.get(productName) || 0) + (tx.productCharges || 0)));
    const key = `${productName}::${month}`;
    if (!cell.has(key)) cell.set(key, { productName, month, sales: 0, orderIds: new Set() });
    const row = cell.get(key);
    row.sales = roundMoney(row.sales + (tx.productCharges || 0));
    if (tx.orderId && tx.orderId !== "---") row.orderIds.add(tx.orderId);
  }
  const recentMonths = [...months].sort().slice(-monthCount);
  const topProducts = [...productTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name]) => name);

  return topProducts.map((productName) => {
    const series = recentMonths.map((month) => {
      const row = cell.get(`${productName}::${month}`);
      return {
        month,
        sales: row ? row.sales : 0,
        orders: row ? row.orderIds.size : 0,
      };
    });
    for (let i = 0; i < series.length; i += 1) {
      const prev = i > 0 ? series[i - 1] : null;
      series[i].growth = prev && prev.sales ? growthRate(series[i].sales, prev.sales) : null;
    }
    return { productName, months: series };
  });
}

/** How bulk candidates affect product ranks (aggregated). */
export function buildBulkImpact(products, bulkOrders, grossProductSales) {
  const byProduct = new Map();
  for (const row of bulkOrders || []) {
    const name = row.productName || "Unspecified product";
    if (!byProduct.has(name)) byProduct.set(name, { productName: name, bulkOrders: 0, bulkSales: 0 });
    const item = byProduct.get(name);
    item.bulkOrders += 1;
    item.bulkSales = roundMoney(item.bulkSales + (row.amount || 0));
  }
  const rank = new Map((products || []).map((row, index) => [row.productName, index + 1]));
  const productsLifted = [...byProduct.values()]
    .map((row) => ({
      ...row,
      rank: rank.get(row.productName) || null,
      bulkShareOfProduct: ratio(row.bulkSales, products.find((p) => p.productName === row.productName)?.sales || 0),
    }))
    .sort((a, b) => b.bulkSales - a.bulkSales)
    .slice(0, 5);
  const bulkSales = sumMoney(productsLifted.map((row) => row.bulkSales));
  return {
    bulkOrderCount: (bulkOrders || []).length,
    bulkSales,
    bulkShareOfGross: ratio(bulkSales, grossProductSales),
    productsLifted,
  };
}

/**
 * Amazon Economics presentation.
 * - Marketplace fee drains: selling fees, advertising, inbound, subscription, removal, cancellation.
 * - Promotional rebates: CSV rebate column — settlement adjustment, NOT auto-classified as marketplace fees.
 * - Customer product refunds: excluded here (Topline / waterfall only). Refund-row Amazon fees stay in selling_fee.
 */
function whereAmazonTakesMoney(scoped) {
  const sellingFees = roleSum(scoped, "selling_fee");
  const advertising = roleSum(scoped, "advertising");
  const inbound = roleSum(scoped, "inbound_transportation");
  const promo = roleSum(scoped, "promotional_rebate");
  const refunds = roleSum(scoped, "refund_product");
  const subscription = roleSum(scoped, "subscription_fee");
  const removal = roleSum(scoped, "fulfillment_removal");
  const cancellation = roleSum(scoped, "cancellation_charge");
  const unknown = roleSum(scoped, "unknown");

  void refunds;
  const marketplaceFeeRows = [
    {
      id: "selling_fee",
      label: "Amazon selling fees",
      amount: sellingFees,
      category: "marketplace_fee",
      note: "CSV Amazon fees aggregate — not referral-only. Includes fees on refund rows when present.",
    },
    { id: "advertising", label: "Advertising", amount: advertising, category: "marketplace_fee", note: null },
    {
      id: "inbound_transportation",
      label: "Inbound transportation",
      amount: inbound,
      category: "marketplace_fee",
      note: null,
    },
    {
      id: "subscription_fee",
      label: "Subscription / service fees",
      amount: subscription,
      category: "marketplace_fee",
      note: null,
    },
    {
      id: "fulfillment_removal",
      label: "FBA removal / fulfilment services",
      amount: removal,
      category: "marketplace_fee",
      note: null,
    },
    {
      id: "cancellation_charge",
      label: "Cancellation charges",
      amount: cancellation,
      category: "marketplace_fee",
      note: null,
    },
  ];
  const adjustmentRows = [
    {
      id: "promotional_rebate",
      label: "Promotional rebates",
      amount: promo,
      category: "settlement_adjustment",
      note: "CSV Total promotional rebates. Shown as a settlement adjustment — not classified as an Amazon marketplace fee.",
    },
    {
      id: "unknown",
      label: "Unclassified amounts",
      amount: unknown,
      category: "unclassified",
      note: "Preserved for investigation.",
    },
  ];

  const rows = [...marketplaceFeeRows, ...adjustmentRows]
    .map((row) => ({
      ...row,
      amount: roundMoney(row.amount),
      outflow: roundMoney(Math.min(0, row.amount)),
      isMarketplaceFee: row.category === "marketplace_fee",
    }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => a.amount - b.amount);

  // Marketplace fee % excludes product refunds, promotional rebates, and unexplained Other credits.
  const feeOutflows = sumMoney(
    [sellingFees, advertising, inbound, subscription, removal, cancellation].map((v) => Math.min(0, v || 0)),
  );
  return {
    rows,
    feeOutflows,
    marketplaceFeeRows: rows.filter((row) => row.isMarketplaceFee),
    promotionalRebates: roundMoney(promo),
  };
}

/**
 * Sequential waterfall from gross product sales to CSV settlement movement.
 * Bank transfers are informational only — never subtracted into the running balance.
 */
function buildSettlementWaterfall({
  grossProductSales,
  refundProductCharges,
  promotionalRebates,
  sellingFees,
  advertising,
  inbound,
  otherSettlement,
  debtAdjustment,
  unknownAmount,
  netSettlementMovement,
  bankTransfers,
}) {
  const steps = [];
  let balance = 0;
  const push = (id, label, amount, kind, note = null) => {
    if (amount == null) return;
    if (kind !== "start" && kind !== "result" && kind !== "info" && amount === 0) return;
    if (kind === "start") balance = amount;
    else if (kind === "add" || kind === "deduct") balance = roundMoney(balance + amount);
    else if (kind === "result") balance = amount;
    steps.push({
      id,
      label,
      amount: roundMoney(amount),
      runningBalance: kind === "info" ? null : roundMoney(balance),
      kind,
      note,
    });
  };

  push("gross_product_sales", "Gross product sales", grossProductSales, "start");
  push("refunds", "Refunded product charges", refundProductCharges, "deduct");
  push("promotional_rebates", "Promotional rebates", promotionalRebates, "deduct");
  push("selling_fees", "Amazon selling fees", sellingFees, "deduct");
  push("advertising", "Advertising", advertising, "deduct");
  push("inbound", "Inbound transportation", inbound, "deduct");
  push(
    "other_settlement",
    "Unexplained CSV Other",
    otherSettlement,
    otherSettlement >= 0 ? "add" : "deduct",
    "CSV Other column — not classified as tax, fee, or product revenue.",
  );
  push("debt_adjustment", "Debt adjustments (net)", debtAdjustment, debtAdjustment >= 0 ? "add" : "deduct");
  push("unknown", "Unclassified amounts", unknownAmount, unknownAmount >= 0 ? "add" : "deduct");
  push(
    "amazon_proceeds",
    "Amazon account settlement movement",
    netSettlementMovement,
    "result",
    "Sum of Total (INR). Not net profit. Not bank deposits.",
  );
  push(
    "bank_transfers",
    "Bank transfers (Unified Summary)",
    bankTransfers,
    "info",
    "PDF ledger only. Not subtracted from CSV settlement movement.",
  );

  const residual = roundMoney(netSettlementMovement - (steps.find((s) => s.id === "amazon_proceeds") ? 
    // residual vs reconstructing from components before result
    sumMoney([
      grossProductSales,
      refundProductCharges,
      promotionalRebates,
      sellingFees,
      advertising,
      inbound,
      otherSettlement,
      debtAdjustment,
      unknownAmount,
    ]) : 0));

  return {
    steps,
    residualFromComponents: residual,
    complete: Math.abs(residual) <= 0.05,
    missingInformation: [
      bankTransfers == null
        ? "Bank transfers require the Unified Summary PDF."
        : null,
      "Opening/closing Amazon account balance is not in these exports.",
      "CSV Other credits are unexplained and are not assigned to tax or fees.",
    ].filter(Boolean),
  };
}

/**
 * @param {{ transactions: object[], summary?: object|null }} normalized
 * @param {object} filters
 */
export function calculateMarketplace(normalized, filters = createEmptyFilters()) {
  const all = normalized?.transactions || [];
  if (!all.length) {
    return {
      layer: "calculations",
      status: "not_calculated",
      period: null,
      currency: null,
      filters,
      sections: {
        topline: null,
        amazon_economics: null,
        product_performance: null,
        profitability: null,
      },
      missingInputs: [MISSING_PRODUCT_COST, MISSING_UNITS, MISSING_REFERRAL_SPLIT],
      warnings: [
        {
          code: "no_normalized_transactions",
          message: "Metrics stay empty until ingestion produces canonical transactions.",
        },
      ],
      transactions: [],
    };
  }

  const scoped = filterTransactions(all, filters);
  const orders = scoped.filter((tx) => tx.classification?.kind === "order_payment");
  const refunds = scoped.filter((tx) => tx.classification?.kind === "refund");
  const dates = scoped.map((tx) => tx.postedAt).filter(Boolean).sort();
  const orderStats = countDistinctOrders(orders);

  const grossProductSales = sumMoney(orders.map((tx) => tx.productCharges));
  const refundProductCharges = sumMoney(refunds.map((tx) => tx.productCharges));
  const refundAmountAbs = roundMoney(Math.abs(refundProductCharges || 0));
  const netProductSales = roundMoney(grossProductSales + refundProductCharges);
  const orderLevels = buildOrderLevelTotals(orders);
  const refundAnalysis = analyzeRefundOrders(orderLevels, refunds);
  const grossOrderCount = orderStats.orderCount;
  const netOrderCount = refundAnalysis.canSubtractFullRefunds
    ? Math.max(0, grossOrderCount - (refundAnalysis.fullRefundOrderCount || 0))
    : null;
  const orderValues = computeOrderValueStats(orderLevels, grossProductSales);
  const aov = orderValues.aov;
  const sellingFees = roleSum(scoped, "selling_fee");
  const advertising = roleSum(scoped, "advertising");
  const inbound = roleSum(scoped, "inbound_transportation");
  const promotionalRebates = roleSum(scoped, "promotional_rebate");
  const otherSettlement = roleSum(scoped, "other_settlement");
  const debtAdjustment = roleSum(scoped, "debt_adjustment");
  const unknownAmount = roleSum(scoped, "unknown");
  const netSettlementMovement = sumMoney(scoped.map((tx) => tx.totalInr));
  const monthly = buildMonthly(orders);
  const period = dates.length ? { start: dates[0], end: dates[dates.length - 1] } : normalized.period;
  const momPresentation = presentLatestMomGrowth(monthly, period, filters?.dateRange || null);
  const weekly = buildWeekly(orders);
  const products = buildProducts(orders, refunds);
  const orderSizes = orderSizeBuckets(orderLevels);
  const productMonthly = buildProductMonthly(orders, { topN: 5, monthCount: 4 });
  const bulkImpact = buildBulkImpact(products, orderSizes.bulkOrders, grossProductSales);
  const top8 = products.slice(0, 8);
  const top8Sales = sumMoney(top8.map((row) => row.sales));
  const top8Concentration = ratio(top8Sales, grossProductSales);
  const moneyTaken = whereAmazonTakesMoney(scoped);
  const bankTransfers = normalized?.summary?.transfersToBank ?? normalized?.summary?.transfers ?? null;

  // Marketplace fee rate: fee outflows / gross product sales.
  // Excludes customer product refunds, promotional rebates, and unexplained Other credits.
  const deductionsForRate = moneyTaken.feeOutflows;

  const warnings = [];
  if (orderValues.orderCount !== grossOrderCount && grossOrderCount > 0) {
    warnings.push({
      code: "order_population_mismatch",
      message: "Gross AOV/median order population does not match gross distinct order count.",
    });
  }
  if (unknownAmount) {
    warnings.push({
      code: "unknown_amounts_present",
      message: `Unclassified amounts total ${unknownAmount}. They are excluded from sales and listed for investigation.`,
    });
  }
  if (otherSettlement) {
    warnings.push({
      code: "unexplained_other",
      message:
        "CSV Other contains unexplained settlement amounts. They are not treated as tax, selling fees, or product revenue.",
    });
  }

  const waterfall = buildSettlementWaterfall({
    grossProductSales,
    refundProductCharges,
    promotionalRebates,
    sellingFees,
    advertising,
    inbound,
    otherSettlement,
    debtAdjustment,
    unknownAmount,
    netSettlementMovement,
    bankTransfers,
  });

  const result = {
    layer: "calculations",
    status: "calculated",
    period,
    currency: "INR",
    filters,
    kpis: {
      grossProductSales,
      refundProductCharges,
      refundAmountAbs,
      netProductSales,
      orderCount: grossOrderCount,
      grossOrderCount,
      refundedOrderCount: refundAnalysis.refundedOrderCount,
      fullRefundOrderCount: refundAnalysis.fullRefundOrderCount,
      ordersAffectedByRefunds: refundAnalysis.ordersAffectedByRefunds,
      netOrderCount,
      netOrdersBasis: refundAnalysis.netOrdersBasis,
      canSubtractFullRefunds: refundAnalysis.canSubtractFullRefunds,
      paymentRows: orderStats.paymentRows,
      aov,
      aovBasis: orderValues.aovFormula,
      medianOrderValue: orderValues.medianOrderValue,
      medianBasis: orderValues.medianPopulation,
      ordersAbove2xMedian: orderValues.ordersAbove2xMedian,
      salesAbove2xMedian: orderValues.salesAbove2xMedian,
      salesShareAbove2xMedian: orderValues.salesShareAbove2xMedian,
      unitsSold: null,
      netSettlementMovement,
      amazonProceeds: netSettlementMovement,
      sellingFees,
      advertising,
      inboundTransportation: inbound,
      promotionalRebates,
      promotionalRebatesAreMarketplaceFees: false,
      otherSettlement,
      effectiveSellingFeeRate: ratio(Math.abs(sellingFees || 0), grossProductSales),
      effectiveMarketplaceDeductionRate: ratio(Math.abs(deductionsForRate || 0), grossProductSales),
      feeRateDenominator: "gross_product_sales",
      top8Concentration,
      productProfit: null,
      orderValues,
    },
    sections: {
      topline: {
        kpis: {
          grossProductSales,
          refundProductCharges,
          refundAmountAbs,
          netProductSales,
          orderCount: grossOrderCount,
          grossOrderCount,
          refundedOrderCount: refundAnalysis.refundedOrderCount,
          fullRefundOrderCount: refundAnalysis.fullRefundOrderCount,
          ordersAffectedByRefunds: refundAnalysis.ordersAffectedByRefunds,
          netOrderCount,
          netOrdersBasis: refundAnalysis.netOrdersBasis,
          canSubtractFullRefunds: refundAnalysis.canSubtractFullRefunds,
          aov,
          aovBasis: orderValues.aovFormula,
          medianOrderValue: orderValues.medianOrderValue,
          medianBasis: orderValues.medianPopulation,
          ordersAbove2xMedian: orderValues.ordersAbove2xMedian,
          salesAbove2xMedian: orderValues.salesAbove2xMedian,
          salesShareAbove2xMedian: orderValues.salesShareAbove2xMedian,
          unitsSold: null,
          // Raw observed growth retained; UI uses momGrowthComparable / momGrowthDisplay.
          momGrowthLatest: momPresentation.value,
          momGrowthComparable: momPresentation.comparable,
          momGrowthStatus: momPresentation.status,
          momGrowthDisplay: momPresentation.display,
          momGrowthHint: momPresentation.hint,
        },
        monthly,
        weekly,
        productMix: products.slice(0, 12).map((row) => ({
          productName: row.productName,
          sales: row.sales,
          revenueShare: row.revenueShare,
          orders: row.orders,
        })),
        orderSizes,
        orderValues,
        refundAnalysis,
        bulkOrders: orderSizes.bulkOrders.slice(0, 20),
        bulkImpact,
      },
      amazon_economics: {
        sellingFees,
        advertising,
        inboundTransportation: inbound,
        promotionalRebates,
        promotionalRebatesAreMarketplaceFees: false,
        refundProductCharges,
        refundsShownInTopline: true,
        otherSettlement,
        unknownAmount,
        referralFees: null,
        referralFeesAvailable: false,
        feeRateDenominator: "gross_product_sales",
        effectiveSellingFeeRate: ratio(Math.abs(sellingFees || 0), grossProductSales),
        effectiveMarketplaceDeductionRate: ratio(Math.abs(deductionsForRate || 0), grossProductSales),
        whereMoneyGoes: moneyTaken.rows,
        marketplaceFeeDrains: moneyTaken.marketplaceFeeRows || moneyTaken.rows.filter((row) => row.isMarketplaceFee),
        unexplainedOtherCredits: otherSettlement > 0 ? otherSettlement : 0,
        drilldownByCategory: Object.fromEntries(
          moneyTaken.rows.map((row) => [
            row.id,
            scoped
              .filter((tx) => (tx.lines || []).some((line) => line.role === row.id))
              .map((tx) => ({
                sourceRow: tx.sourceRow,
                postedAt: tx.postedAt,
                orderId: tx.orderId,
                productName: tx.productName,
                transactionType: tx.transactionType,
                amount: sumMoney((tx.lines || []).filter((line) => line.role === row.id).map((line) => line.amount)),
                totalInr: tx.totalInr,
                details: tx.productDetails,
              })),
          ]),
        ),
      },
      product_performance: {
        products,
        top8,
        top8Concentration,
        top8Sales,
        orderSizes,
        trends: monthly,
        productMonthly,
        bulkImpact,
      },
      profitability: {
        grossProductSales,
        refundProductCharges,
        promotionalRebates,
        sellingFees,
        advertising,
        inboundTransportation: inbound,
        otherSettlement,
        netSettlementMovement,
        amazonProceeds: netSettlementMovement,
        bankTransfers,
        gstCollected: normalized?.summary?.gstCollected ?? null,
        netGstCollected: normalized?.summary?.netGstCollected ?? null,
        productProfitAvailable: false,
        waterfall,
      },
    },
    missingInputs: [MISSING_PRODUCT_COST, MISSING_UNITS, MISSING_REFERRAL_SPLIT],
    warnings,
    transactions: scoped,
  };
  result.chartInsights = buildChartInsights(result, null);
  return result;
}
