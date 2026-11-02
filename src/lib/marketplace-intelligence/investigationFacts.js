/**
 * Stable verified financial fact references for Stage 5B investigations.
 * Presentation should render amounts from this store — models cite factIds only.
 */
import { formatMonthLabel } from "./askPresentation.js";
import { roundMoney, ratio } from "./money.js";

export const FACT_SCHEMA_VERSION = 1;

/**
 * @typedef {object} InvestigationFact
 * @property {string} factId
 * @property {string} label
 * @property {number|null} value
 * @property {"inr"|"count"|"ratio"|"text"} kind
 * @property {string} source
 * @property {string} [period]
 */

function fact(factId, label, value, kind, source, period = null) {
  return {
    factId: String(factId).slice(0, 80),
    label: String(label).slice(0, 120),
    value: value == null || (kind !== "text" && !Number.isFinite(Number(value))) ? null : value,
    kind,
    source: String(source || "session_calculations").slice(0, 80),
    period: period || null,
  };
}

function monthKey(postedAt) {
  if (!postedAt) return null;
  const text = String(postedAt);
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  return null;
}

/**
 * Build a compact fact store from calculated metrics + optional insight metrics.
 * Session-scoped only — never merges across sessions.
 */
export function buildFactStore({
  metrics = null,
  reconciliation = null,
  insight = null,
  sessionId = null,
} = {}) {
  const facts = [];
  const byId = new Map();

  const push = (entry) => {
    if (!entry?.factId || byId.has(entry.factId)) return;
    byId.set(entry.factId, entry);
    facts.push(entry);
  };

  if (metrics?.status === "calculated") {
    const k = metrics.kpis || {};
    push(fact("kpi.gross_product_sales", "Gross Product Sales", roundMoney(k.grossProductSales), "inr", "kpis"));
    push(fact("kpi.net_product_sales", "Net Product Sales", roundMoney(k.netProductSales), "inr", "kpis"));
    push(fact("kpi.refund_amount", "Refund amount", roundMoney(k.refundAmountAbs), "inr", "kpis"));
    push(fact("kpi.gross_orders", "Gross Orders", k.grossOrderCount ?? k.orderCount, "count", "kpis"));
    push(fact("kpi.gross_aov", "Gross AOV", roundMoney(k.aov), "inr", "kpis"));
    push(fact("kpi.median_order_value", "Median Order Value", roundMoney(k.medianOrderValue), "inr", "kpis"));
    push(
      fact(
        "kpi.orders_above_2x_median",
        "Orders above 2× median",
        k.ordersAbove2xMedian,
        "count",
        "order_values",
      ),
    );
    push(
      fact(
        "kpi.sales_above_2x_median",
        "Sales above 2× median",
        roundMoney(k.salesAbove2xMedian),
        "inr",
        "order_values",
      ),
    );
    push(
      fact(
        "kpi.sales_share_above_2x_median",
        "Sales share above 2× median (of Gross Product Sales)",
        k.salesShareAbove2xMedian,
        "ratio",
        "order_values",
      ),
    );
    push(
      fact(
        "kpi.marketplace_fee_rate",
        "Effective marketplace deduction rate (fees ÷ Gross Product Sales)",
        k.effectiveMarketplaceDeductionRate,
        "ratio",
        "amazon_economics",
      ),
    );
    push(fact("kpi.product_profit", "Product profit", k.productProfit, "inr", "profitability"));
    push(
      fact(
        "kpi.net_settlement_movement",
        "Amazon settlement movement",
        roundMoney(k.netSettlementMovement ?? k.amazonProceeds),
        "inr",
        "profitability",
      ),
    );

    for (const row of metrics.sections?.topline?.monthly || []) {
      const label = formatMonthLabel(row.month) || row.month;
      push(fact(`month.${row.month}.sales`, `${label} Gross Product Sales`, roundMoney(row.sales), "inr", "monthly", row.month));
      push(fact(`month.${row.month}.orders`, `${label} Orders`, row.orders, "count", "monthly", row.month));
      push(fact(`month.${row.month}.aov`, `${label} Gross AOV`, roundMoney(row.aov), "inr", "monthly", row.month));
      if (row.growth != null) {
        push(fact(`month.${row.month}.mom`, `${label} MoM vs prior-month Gross Product Sales`, row.growth, "ratio", "monthly", row.month));
      }
    }
  }

  if (insight?.metrics?.length) {
    for (const m of insight.metrics.slice(0, 16)) {
      const kind =
        /share|rate|growth|mom|ratio|pct/i.test(`${m.metricId} ${m.label}`)
          ? "ratio"
          : /order|count/i.test(`${m.metricId} ${m.label}`) && Number.isInteger(m.value)
            ? "count"
            : "inr";
      push(
        fact(
          `insight.${insight.id}.${m.metricId}`,
          m.label,
          m.value,
          kind,
          m.source || "insight",
        ),
      );
    }
  }

  if (reconciliation?.comparisons?.length) {
    for (const row of reconciliation.comparisons.slice(0, 10)) {
      if (row.status === "difference") {
        push(
          fact(
            `recon.${row.id}.difference`,
            `Reconciliation Δ ${row.id}`,
            roundMoney(row.difference),
            "inr",
            "reconciliation",
          ),
        );
      }
    }
  }

  return {
    schemaVersion: FACT_SCHEMA_VERSION,
    sessionId: sessionId || null,
    currency: "INR",
    facts,
    byId: Object.fromEntries(byId),
  };
}

export function getFact(store, factId) {
  if (!store || !factId) return null;
  return store.byId?.[factId] || store.facts?.find((f) => f.factId === factId) || null;
}

/**
 * Period-specific bulk / large-ticket sales from calculated bulkOrders (postedAt).
 * Used only as measured support — never as proof of AOV causation.
 */
export function measureBulkOrdersByMonth(metrics, priorMonth, currentMonth) {
  const bulk = metrics?.sections?.topline?.bulkOrders || [];
  if (!priorMonth || !currentMonth || !bulk.length) {
    return {
      available: false,
      reason: "bulk_orders_unavailable",
      prior: null,
      current: null,
    };
  }

  const summarize = (ym) => {
    const rows = bulk.filter((row) => monthKey(row.postedAt) === ym);
    const sales = roundMoney(rows.reduce((sum, row) => sum + (row.amount || 0), 0));
    return {
      month: ym,
      label: formatMonthLabel(ym) || ym,
      orderCount: rows.length,
      sales,
    };
  };

  const prior = summarize(priorMonth);
  const current = summarize(currentMonth);
  const deltaSales = roundMoney((current.sales || 0) - (prior.sales || 0));
  const deltaOrders = current.orderCount - prior.orderCount;
  const priorMonthly = (metrics?.sections?.topline?.monthly || []).find((row) => row.month === priorMonth);
  const currentMonthly = (metrics?.sections?.topline?.monthly || []).find((row) => row.month === currentMonth);

  return {
    available: true,
    thresholdNote: "Bulk-order candidates from order-size threshold in calculated metrics — not identical to 2× median skew.",
    prior,
    current,
    deltaSales,
    deltaOrders,
    priorShareOfMonthSales: ratio(prior.sales, priorMonthly?.sales),
    currentShareOfMonthSales: ratio(current.sales, currentMonthly?.sales),
  };
}

/**
 * Compact wire form of facts for NVIDIA (ids + labels + values; no raw files).
 */
export function factsForWire(store, factIds = []) {
  const ids = factIds.length ? factIds : (store?.facts || []).slice(0, 24).map((f) => f.factId);
  return ids
    .map((id) => getFact(store, id))
    .filter(Boolean)
    .map((f) => ({
      factId: f.factId,
      label: f.label,
      value: f.value,
      kind: f.kind,
      period: f.period,
    }));
}
