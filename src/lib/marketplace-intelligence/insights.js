/**
 * Deterministic chart insights for Marketplace Intelligence.
 * Numbers come only from calculated metrics — never invented.
 * Insights always reflect the currently filtered metric payload.
 */
import { formatMonthLabel } from "./askPresentation.js";
import { formatInr, formatPct } from "./money.js";
import {
  compareMonthCoverage,
  coverageLeadHeadline,
  founderComparisonNote,
  isPartialMonth,
} from "./periodCoverage.js";

function monthLabel(ym) {
  return formatMonthLabel(ym) || ym;
}

function pair(keyInsight, worthInvestigating) {
  return {
    keyInsight: keyInsight || "Insufficient data",
    worthInvestigating: worthInvestigating || "Insufficient data",
  };
}

/**
 * Insert zero-sales months between first and last observed months so gap months are visible.
 */
export function densifyMonthly(monthly) {
  if (!monthly?.length) return [];
  const byMonth = new Map(monthly.map((row) => [row.month, row]));
  const start = monthly[0].month;
  const end = monthly[monthly.length - 1].month;
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const rows = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const existing = byMonth.get(key);
    if (existing) rows.push({ ...existing, zeroFilled: false });
    else rows.push({ month: key, sales: 0, orders: 0, aov: null, growth: null, zeroFilled: true });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  for (let i = 0; i < rows.length; i += 1) {
    const prev = i > 0 ? rows[i - 1] : null;
    if (prev) {
      if (prev.sales === 0 && rows[i].sales === 0) rows[i].growth = null;
      else if (prev.sales === 0 && rows[i].sales > 0) rows[i].growth = null;
      else rows[i].growth = prev.sales === 0 ? null : (rows[i].sales - prev.sales) / Math.abs(prev.sales);
    } else {
      rows[i].growth = null;
    }
  }
  return rows;
}

function monthlySalesInsights(monthly, period, dateRange) {
  if (!monthly?.length) return pair(null, null);
  if (monthly.length < 2) {
    const only = monthly[0];
    const partial = isPartialMonth(only.month, period, dateRange);
    return pair(
      `Only one month in scope (${monthLabel(only.month)} at ${formatInr(only.sales)}${partial ? ", partial month" : ""}).`,
      "Insufficient history for month-over-month growth.",
    );
  }

  const dense = densifyMonthly(monthly);
  const withSales = dense.filter((row) => row.sales > 0);
  const peak = [...withSales].sort((a, b) => b.sales - a.sales)[0] || dense[0];
  const partialNote = isPartialMonth(peak.month, period, dateRange) ? " (partial month in current filter)" : "";
  const key = peak
    ? `Highest Gross Product Sales month is ${monthLabel(peak.month)} at ${formatInr(peak.sales)}${partialNote}.`
    : null;

  const zeroMonths = dense.filter((row) => row.zeroFilled || row.sales === 0);
  if (zeroMonths.length) {
    // Prefer reporting zero gaps when present; still check consecutive declines below.
    let declines = 0;
    let declineEnd = null;
    for (let i = 1; i < dense.length; i += 1) {
      if (dense[i].growth != null && dense[i].growth < 0) {
        declines += 1;
        declineEnd = dense[i];
      } else {
        declines = 0;
        declineEnd = null;
      }
      if (declines >= 2) break;
    }
    if (declines >= 2 && declineEnd) {
      const endPartial = isPartialMonth(declineEnd.month, period, dateRange);
      return pair(
        key,
        endPartial
          ? `Observed Gross Product Sales were lower for ${declines} consecutive months ending ${monthLabel(
              declineEnd.month,
            )} (incomplete coverage). Zero-sales month(s) in span: ${zeroMonths
              .slice(0, 2)
              .map((row) => monthLabel(row.month))
              .join(", ")}.`
          : `Gross Product Sales declined for ${declines} consecutive months ending ${monthLabel(
              declineEnd.month,
            )} (latest MoM ${formatPct(declineEnd.growth)}). Zero-sales month(s) in span: ${zeroMonths
              .slice(0, 2)
              .map((row) => monthLabel(row.month))
              .join(", ")}.`,
      );
    }
    return pair(
      key,
      `Zero-sales or gap month(s) in the filtered span (${zeroMonths
        .slice(0, 2)
        .map((row) => monthLabel(row.month))
        .join(", ")}). MoM comparisons skip undefined prior-month bases.`,
    );
  }

  let declines = 0;
  for (let i = 1; i < dense.length; i += 1) {
    if (dense[i].growth != null && dense[i].growth < 0) declines += 1;
    else declines = 0;
    if (declines >= 2) {
      const endPartial = isPartialMonth(dense[i].month, period, dateRange);
      return pair(
        key,
        endPartial
          ? `Observed Gross Product Sales were lower for ${declines} consecutive months ending ${monthLabel(
              dense[i].month,
            )} (incomplete coverage — not a verified full-month MoM streak).`
          : `Gross Product Sales declined for ${declines} consecutive months ending ${monthLabel(
              dense[i].month,
            )} (latest MoM ${formatPct(dense[i].growth)}).`,
      );
    }
  }
  const latest = dense[dense.length - 1];
  const prior = dense.length >= 2 ? dense[dense.length - 2] : null;
  if (prior?.month && latest?.month) {
    const cmp = compareMonthCoverage(prior.month, latest.month, period, dateRange);
    if (cmp.provisional) {
      const lead =
        coverageLeadHeadline(cmp, prior.month, latest.month, monthLabel) ||
        founderComparisonNote(cmp);
      return pair(
        key,
        `${lead}. Observed Gross Product Sales ${formatInr(prior.sales)} → ${formatInr(
          latest.sales,
        )} in available records — not a verified full-month MoM decline.`,
      );
    }
  }
  const partialLatest = isPartialMonth(latest.month, period, dateRange);
  return pair(
    key,
    latest?.growth != null
      ? `Latest month ${monthLabel(latest.month)}${partialLatest ? " (partial)" : ""} MoM growth is ${formatPct(latest.growth)}.`
      : "Need at least two comparable months to assess growth.",
  );
}

function monthlyOrdersInsights(monthly, period, dateRange) {
  if (!monthly?.length) return pair(null, null);
  if (monthly.length < 2) {
    const only = monthly[0];
    return pair(
      only
        ? `Only month ${monthLabel(only.month)} has ${only.orders} distinct Orders and Gross AOV ${formatInr(only.aov)}.`
        : null,
      "Insufficient data for order vs basket comparison.",
    );
  }
  const latest = monthly[monthly.length - 1];
  const prior = monthly[monthly.length - 2];
  const key = latest
    ? `Latest month ${monthLabel(latest.month)} has ${latest.orders} distinct Orders and Gross AOV ${formatInr(latest.aov)}.`
    : null;
  if (!prior || !latest || !prior.orders) return pair(key, "Insufficient data for order vs basket comparison.");
  const orderChange = (latest.orders - prior.orders) / prior.orders;
  const aovChange =
    prior.aov && latest.aov != null ? (latest.aov - prior.aov) / prior.aov : null;
  if (aovChange == null) return pair(key, "Insufficient data for order vs basket comparison.");
  const cmp = compareMonthCoverage(prior.month, latest.month, period, dateRange);
  if (cmp.provisional) {
    return pair(
      key,
      `Observed-record difference from ${monthLabel(prior.month)} to ${monthLabel(latest.month)}: Orders ${formatPct(
        orderChange,
      )}, Gross AOV ${formatPct(aovChange)}. Not a verified full-month Orders vs AOV MoM.`,
    );
  }
  const driver =
    Math.abs(orderChange) >= Math.abs(aovChange)
      ? `Orders moved ${formatPct(orderChange)} vs Gross AOV ${formatPct(aovChange)} from ${monthLabel(prior.month)} to ${monthLabel(latest.month)}.`
      : `Gross AOV moved ${formatPct(aovChange)} vs Orders ${formatPct(orderChange)} from ${monthLabel(prior.month)} to ${monthLabel(latest.month)}.`;
  return pair(key, driver);
}

function weeklyInsights(weekly, bulkOrders) {
  if (!weekly?.length) return pair(null, null);
  const peak = [...weekly].sort((a, b) => b.sales - a.sales)[0];
  const key = peak ? `Peak week is ${peak.weekStart} at ${formatInr(peak.sales)}.` : null;
  const bulk = bulkOrders?.length || 0;
  return pair(
    key,
    bulk
      ? `${bulk} bulk-order candidate(s) may lift weekly totals without a sustained run-rate change.`
      : "No bulk-order candidates under the current threshold.",
  );
}

function productMixInsights(products, concentration) {
  if (!products?.length) return pair(null, null);
  const top = products[0];
  const key = top
    ? `${top.productName} leads with ${formatInr(top.sales)} (${formatPct(top.revenueShare)} revenue share).`
    : null;
  const worth =
    concentration != null && concentration >= 0.8
      ? `Top-eight products account for ${formatPct(concentration)} of gross product sales — high concentration.`
      : concentration != null
        ? `Top-eight revenue share is ${formatPct(concentration)}.`
        : null;
  return pair(key, worth);
}

function feeInsights(whereMoneyGoes, marketplaceFeeDrains) {
  const source = marketplaceFeeDrains?.length
    ? marketplaceFeeDrains
    : (whereMoneyGoes || []).filter(
        (row) =>
          row.amount < 0 &&
          row.id !== "refund_product" &&
          row.id !== "promotional_rebate" &&
          row.id !== "unknown",
      );
  const list = source.filter((row) => row.amount < 0);
  if (!list.length) return pair(null, null);
  const ranked = [...list].sort((a, b) => a.amount - b.amount);
  const top = ranked[0];
  return pair(
    top ? `Largest Amazon marketplace fee drain is ${top.label} at ${formatInr(top.amount)}.` : null,
    ranked.length > 1
      ? `Next largest marketplace fee drains include ${ranked
          .slice(1, 3)
          .map((row) => `${row.label} ${formatInr(row.amount)}`)
          .join("; ")}.`
      : "Only one classified marketplace fee drain is present in this scope.",
  );
}

function concentrationInsights(concentration, products) {
  if (concentration == null) return pair(null, null);
  const key = `Top-eight products contribute ${formatPct(concentration)} of gross product sales (revenue share, not profit).`;
  const second = products?.[1];
  return pair(
    key,
    second
      ? `Second product ${second.productName} holds ${formatPct(second.revenueShare)} — watch whether concentration is rising.`
      : "Insufficient data for a second-product comparison.",
  );
}

function waterfallInsights(waterfall, reconciliation) {
  const steps = waterfall?.steps || [];
  const proceeds = steps.find((step) => step.id === "amazon_proceeds");
  const key = proceeds
    ? `Settlement movement ends at ${formatInr(proceeds.amount)} after refunds, fees, and other classified lines.`
    : null;
  const diffs = (reconciliation?.comparisons || []).filter((row) => row.status === "difference");
  return pair(
    key,
    diffs.length
      ? `${diffs.length} confirmed reconciliation difference(s) retained unresolved; largest labelled ${diffs[0].id} (Δ ${formatInr(diffs[0].difference)}).`
      : "No confirmed comparable reconciliation differences in the current PDF checks.",
  );
}

function orderSkewInsights(orderValues) {
  if (!orderValues || orderValues.orderCount === 0) return pair(null, null);
  const key = `Median order value is ${formatInr(orderValues.medianOrderValue)} vs gross AOV ${formatInr(orderValues.aov)} (same gross order population).`;
  if (!orderValues.ordersAbove2xMedian) {
    return pair(key, "No orders exceed 2× the median in this scope.");
  }
  return pair(
    key,
    `${orderValues.ordersAbove2xMedian} order(s) above 2× median contribute ${formatInr(
      orderValues.salesAbove2xMedian,
    )} (${formatPct(orderValues.salesShareAbove2xMedian)} of gross product sales).`,
  );
}

/**
 * Build chart-level insights for the active calculated metrics (already filter-scoped).
 */
export function buildChartInsights(metrics, reconciliation = null) {
  if (!metrics || metrics.status !== "calculated") return {};
  const topline = metrics.sections?.topline || {};
  const economics = metrics.sections?.amazon_economics || {};
  const products = metrics.sections?.product_performance || {};
  const profitability = metrics.sections?.profitability || {};
  const dateRange = metrics.filters?.dateRange || null;
  const period = metrics.period || null;

  return {
    "monthly-sales": monthlySalesInsights(topline.monthly, period, dateRange),
    "monthly-orders": monthlyOrdersInsights(topline.monthly, period, dateRange),
    weekly: weeklyInsights(topline.weekly, topline.bulkOrders),
    "product-mix": productMixInsights(topline.productMix || products.products, metrics.kpis?.top8Concentration),
    "fee-breakdown": feeInsights(economics.whereMoneyGoes, economics.marketplaceFeeDrains),
    concentration: concentrationInsights(products.top8Concentration, products.products),
    "product-rank": productMixInsights(products.products, products.top8Concentration),
    waterfall: waterfallInsights(profitability.waterfall, reconciliation),
    "order-skew": orderSkewInsights(topline.orderValues || metrics.kpis?.orderValues),
  };
}
