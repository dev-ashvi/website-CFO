/**
 * Deterministic marketplace metrics. See metricDefinitions.js for contracts.
 */
import { inDateRange, monthKey, weekKey } from "./dates.js";
import { growthRate, ratio, roundMoney, sumMoney } from "./money.js";
import { MISSING_PRODUCT_COST, MISSING_REFERRAL_SPLIT, MISSING_UNITS } from "./schema.js";

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

function orderSizeBuckets(orderTx) {
  const sizes = orderTx.map((tx) => tx.productCharges || 0).sort((a, b) => a - b);
  if (!sizes.length) return { buckets: [], median: null, p90: null, bulkOrders: [] };
  const median = percentile(sizes, 0.5);
  const p90 = percentile(sizes, 0.9);
  const bulkThreshold = Math.max(median * 3, p90 || 0);
  const buckets = [
    { id: "0_250", label: "₹0–250", min: 0, max: 250, orders: 0, sales: 0, fees: 0, feeRowsReported: 0 },
    { id: "250_500", label: "₹250–500", min: 250, max: 500, orders: 0, sales: 0, fees: 0, feeRowsReported: 0 },
    { id: "500_1000", label: "₹500–1,000", min: 500, max: 1000, orders: 0, sales: 0, fees: 0, feeRowsReported: 0 },
    { id: "1000_plus", label: "₹1,000+", min: 1000, max: Infinity, orders: 0, sales: 0, fees: 0, feeRowsReported: 0 },
  ];
  const bulkOrders = [];
  for (const tx of orderTx) {
    const amount = tx.productCharges || 0;
    const bucket = buckets.find((b) => amount >= b.min && amount < b.max) || buckets[buckets.length - 1];
    bucket.orders += 1;
    bucket.sales = roundMoney(bucket.sales + amount);
    if (!tx.amazonFeesMissing) {
      bucket.feeRowsReported += 1;
      bucket.fees = roundMoney(bucket.fees + (tx.amazonFees || 0));
    }
    if (amount >= bulkThreshold && bulkThreshold > 0) {
      bulkOrders.push({
        orderId: tx.orderId,
        productName: tx.productName,
        amount,
        postedAt: tx.postedAt,
        sourceRow: tx.sourceRow,
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
 * Settlement drains for investigation. Refunds are buyer returns, not fees.
 * Positive CSV Other credits are excluded here and shown on the bridge.
 * Each role is summed once — no double-counting with fee rates.
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

  const rows = [
    { id: "selling_fee", label: "Amazon selling fees", amount: sellingFees, note: "CSV Amazon fees aggregate — not referral-only." },
    { id: "advertising", label: "Advertising", amount: advertising, note: null },
    { id: "inbound_transportation", label: "Inbound transportation", amount: inbound, note: null },
    { id: "promotional_rebate", label: "Promotional rebates", amount: promo, note: "Counted once; not included again in refunds." },
    { id: "refund_product", label: "Refunded product charges", amount: refunds, note: "Returned to buyers — not a marketplace fee." },
    { id: "subscription_fee", label: "Subscription / service fees", amount: subscription, note: null },
    { id: "fulfillment_removal", label: "FBA removal / fulfilment services", amount: removal, note: null },
    { id: "cancellation_charge", label: "Cancellation charges", amount: cancellation, note: null },
    { id: "unknown", label: "Unclassified amounts", amount: unknown, note: "Preserved for investigation." },
  ]
    .map((row) => ({ ...row, amount: roundMoney(row.amount), outflow: roundMoney(Math.min(0, row.amount)) }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => a.amount - b.amount);

  // Fee % excludes refunds (buyer returns) and excludes unexplained Other credits.
  const feeOutflows = sumMoney(
    [sellingFees, advertising, inbound, subscription, removal, cancellation, promo].map((v) => Math.min(0, v || 0)),
  );
  return { rows, feeOutflows };
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
  const netProductSales = roundMoney(grossProductSales + refundProductCharges);
  const orderCount = orderStats.orderCount;
  const aov = ratio(grossProductSales, orderCount);
  const sellingFees = roleSum(scoped, "selling_fee");
  const advertising = roleSum(scoped, "advertising");
  const inbound = roleSum(scoped, "inbound_transportation");
  const promotionalRebates = roleSum(scoped, "promotional_rebate");
  const otherSettlement = roleSum(scoped, "other_settlement");
  const debtAdjustment = roleSum(scoped, "debt_adjustment");
  const unknownAmount = roleSum(scoped, "unknown");
  const netSettlementMovement = sumMoney(scoped.map((tx) => tx.totalInr));
  const monthly = buildMonthly(orders);
  const weekly = buildWeekly(orders);
  const products = buildProducts(orders, refunds);
  const orderSizes = orderSizeBuckets(orders);
  const productMonthly = buildProductMonthly(orders, { topN: 5, monthCount: 4 });
  const bulkImpact = buildBulkImpact(products, orderSizes.bulkOrders, grossProductSales);
  const top8 = products.slice(0, 8);
  const top8Sales = sumMoney(top8.map((row) => row.sales));
  const top8Concentration = ratio(top8Sales, grossProductSales);
  const moneyTaken = whereAmazonTakesMoney(scoped);
  const bankTransfers = normalized?.summary?.transfersToBank ?? normalized?.summary?.transfers ?? null;

  // Fee rate: documented marketplace fee outflows / gross product sales.
  // Excludes refunds (buyer returns) and unexplained Other credits.
  const deductionsForRate = moneyTaken.feeOutflows;

  const warnings = [];
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

  return {
    layer: "calculations",
    status: "calculated",
    period: dates.length ? { start: dates[0], end: dates[dates.length - 1] } : normalized.period,
    currency: "INR",
    filters,
    kpis: {
      grossProductSales,
      netProductSales,
      orderCount,
      paymentRows: orderStats.paymentRows,
      aov,
      unitsSold: null,
      netSettlementMovement,
      amazonProceeds: netSettlementMovement,
      sellingFees,
      advertising,
      inboundTransportation: inbound,
      promotionalRebates,
      refundProductCharges,
      otherSettlement,
      effectiveSellingFeeRate: ratio(Math.abs(sellingFees || 0), grossProductSales),
      effectiveMarketplaceDeductionRate: ratio(Math.abs(deductionsForRate || 0), grossProductSales),
      top8Concentration,
      productProfit: null,
    },
    sections: {
      topline: {
        kpis: {
          grossProductSales,
          netProductSales,
          orderCount,
          aov,
          unitsSold: null,
          momGrowthLatest: monthly.length > 1 ? monthly[monthly.length - 1].growth : null,
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
        bulkOrders: orderSizes.bulkOrders.slice(0, 20),
        bulkImpact,
      },
      amazon_economics: {
        sellingFees,
        advertising,
        inboundTransportation: inbound,
        promotionalRebates,
        refundProductCharges,
        otherSettlement,
        unknownAmount,
        referralFees: null,
        referralFeesAvailable: false,
        feeRateDenominator: "gross_product_sales",
        effectiveSellingFeeRate: ratio(Math.abs(sellingFees || 0), grossProductSales),
        effectiveMarketplaceDeductionRate: ratio(Math.abs(deductionsForRate || 0), grossProductSales),
        whereMoneyGoes: moneyTaken.rows,
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
}
