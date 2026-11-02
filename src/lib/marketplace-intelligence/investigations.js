/**
 * Ask WYZ investigations grounded in calculated metrics.
 * Deterministic answers remain the numerical source of truth.
 * Live narration is optional via /api/marketplace-ask (NVIDIA NIM).
 */
import { formatMonthLabel, humanizePeriodLabels, REPORT_CURRENCY } from "./askPresentation.js";
import { formatInr, formatPct } from "./money.js";
import { getSection } from "./sections.js";

function monthLabel(ym) {
  return formatMonthLabel(ym) || ym;
}

export const ASK_WYZ_MODE = "deterministic_guided";
export const ASK_WYZ_MODE_LIVE = "live_nvidia_nim";

export const ASK_WYZ_DISCLOSURE =
  "Guided investigation. Answers cite metrics calculated from this session only.";

export const ASK_WYZ_DISCLOSURE_LIVE =
  "Ask WYZ explains verified metrics from this browser session. Calculated numbers are produced locally. When live AI is available, those metrics (not your CSV/PDF files) are sent to WYZ’s AI service to narrate the answer. Files stay in this tab and are not uploaded to shared storage.";

export function buildInvestigationContext({
  sessionId = null,
  sectionId = "topline",
  dateRange = null,
  product = null,
  filters = null,
  chartId = null,
} = {}) {
  const section = getSection(sectionId);
  return {
    mode: ASK_WYZ_MODE,
    liveModel: false,
    sessionId,
    sectionId: section.id,
    dateRange,
    product,
    filters: filters && typeof filters === "object" ? { ...filters } : {},
    chartId,
    suggestedQuestions: section.questions,
  };
}

function evidence(metricId, label, value, source) {
  return { metricId, label, value, source };
}

function monthSeries(metrics) {
  return metrics?.sections?.topline?.monthly || [];
}

function answerFor(question, metrics, context) {
  const q = String(question || "").toLowerCase();
  const kpis = metrics?.kpis || {};
  const section = metrics?.sections?.[context.sectionId] || {};
  const items = [];
  const productFilter = context.product;

  if (/august|sep(tember)?|aug.*sep|decline after july|after july|sales decline|why did sales/.test(q)) {
    const months = monthSeries(metrics);
    const aug = months.find((row) => /2026-08|-08$|aug/i.test(row.month));
    const sep = months.find((row) => /2026-09|-09$|sep/i.test(row.month));
    const july = months.find((row) => /2026-07|-07$|jul/i.test(row.month));
    items.push(evidence("gross_product_sales", "Gross Product Sales", kpis.grossProductSales, "Order Payment product charges"));
    if (aug) {
      items.push(evidence("aug_sales", `${monthLabel(aug.month)} Gross Product Sales`, aug.sales, "Monthly aggregation"));
      items.push(evidence("aug_orders", `${monthLabel(aug.month)} Orders`, aug.orders, "Monthly distinct orders"));
      items.push(evidence("aug_aov", `${monthLabel(aug.month)} Gross AOV`, aug.aov, "Month sales / orders"));
    }
    if (sep) {
      items.push(evidence("sep_sales", `${monthLabel(sep.month)} Gross Product Sales`, sep.sales, "Monthly aggregation"));
      items.push(evidence("sep_orders", `${monthLabel(sep.month)} Orders`, sep.orders, "Monthly distinct orders"));
      items.push(evidence("sep_aov", `${monthLabel(sep.month)} Gross AOV`, sep.aov, "Month sales / orders"));
      if (sep.growth != null) {
        items.push(evidence("sep_growth", `${monthLabel(sep.month)} MoM`, sep.growth, "MoM vs prior month"));
      }
    }
    if (aug && sep) {
      const orderChange = aug.orders ? (sep.orders - aug.orders) / aug.orders : null;
      const aovChange = aug.aov ? (sep.aov - aug.aov) / aug.aov : null;
      return {
        text: `Gross Product Sales fell from ${formatInr(aug.sales)} in ${monthLabel(aug.month)} to ${formatInr(
          sep.sales,
        )} in ${monthLabel(sep.month)} (${formatPct(sep.growth)} MoM). Orders moved ${formatPct(
          orderChange,
        )} and Gross AOV moved ${formatPct(
          aovChange,
        )}. These are Gross Product Sales — not Net Product Sales after Refunds. All amounts are Indian rupees (₹).`,
        evidence: items,
        followUps: [
          "Is the decline caused by fewer orders or smaller baskets?",
          "Which products contributed most to the change?",
        ],
      };
    }
    const later = months.filter((row) => row.month > (july?.month || "2026-07"));
    if (july) items.push(evidence("july_sales", `${monthLabel(july.month)} Gross Product Sales`, july.sales, "Monthly aggregation"));
    for (const row of later.slice(0, 3)) {
      items.push(evidence(`month:${row.month}`, `${monthLabel(row.month)} Gross Product Sales`, row.sales, "Monthly aggregation"));
      items.push(evidence(`growth:${row.month}`, `${monthLabel(row.month)} MoM`, row.growth, "MoM vs prior month"));
    }
    const drop = later.find((row) => row.growth != null && row.growth < 0);
    return {
      text: july
        ? `${monthLabel(july.month)} Gross Product Sales were ${formatInr(july.sales)}. ${
            drop
              ? `The clearest subsequent decline is ${monthLabel(drop.month)} at ${formatInr(drop.sales)} (${formatPct(drop.growth)} MoM). Compare Orders and Gross AOV in that month to separate volume from basket size.`
              : later.length
                ? `Later months in scope: ${later.map((row) => `${monthLabel(row.month)} ${formatInr(row.sales)}`).join("; ")}.`
                : "No later months are in the current filter scope."
          }`
        : `Gross Product Sales are ${formatInr(kpis.grossProductSales)}. The requested months are not present in the current monthly series — widen or clear the date filter if needed.`,
      evidence: items,
      followUps: [
        "Is the decline caused by fewer orders or smaller baskets?",
        "Which products contributed most to the change?",
      ],
    };
  }

  if (/fewer orders|smaller baskets|orders or|basket/.test(q)) {
    const months = monthSeries(metrics);
    const latest = months[months.length - 1];
    const prior = months[months.length - 2];
    items.push(evidence("order_count", "Orders", kpis.orderCount, "Distinct Order IDs"));
    items.push(evidence("aov", "Gross AOV", kpis.aov, "gross product sales / gross orders"));
    if (latest && prior) {
    items.push(evidence("latest_orders", `${monthLabel(latest.month)} Orders`, latest.orders, "Monthly distinct orders"));
    items.push(evidence("prior_orders", `${monthLabel(prior.month)} Orders`, prior.orders, "Monthly distinct orders"));
    }
    let driver = "Need at least two months to separate order volume from basket size.";
    if (latest && prior && prior.orders) {
      const orderChange = (latest.orders - prior.orders) / prior.orders;
      const aovLatest = latest.orders ? latest.sales / latest.orders : null;
      const aovPrior = prior.orders ? prior.sales / prior.orders : null;
      const aovChange = aovPrior ? (aovLatest - aovPrior) / aovPrior : null;
      if (Math.abs(orderChange) >= Math.abs(aovChange || 0)) {
        driver = `Orders moved ${formatPct(orderChange)} from ${monthLabel(prior.month)} to ${monthLabel(latest.month)}, more than basket-size change ${formatPct(aovChange)}.`;
      } else {
        driver = `Gross AOV moved ${formatPct(aovChange)} from ${monthLabel(prior.month)} to ${monthLabel(latest.month)}, more than order-volume change ${formatPct(orderChange)}.`;
      }
    }
    return { text: driver, evidence: items, followUps: ["Which weeks look like bulk orders rather than a run-rate change?"] };
  }

  if (/monthly sales|growth|move in this period/.test(q)) {
    const months = monthSeries(metrics);
    const latest = months[months.length - 1];
    items.push(evidence("gross_product_sales", "Gross Product Sales", kpis.grossProductSales, "Order Payment product charges"));
    if (latest) {
      items.push(evidence("month_sales", `${monthLabel(latest.month)} Gross Product Sales`, latest.sales, "Monthly aggregation"));
      items.push(evidence("mom_growth", `${monthLabel(latest.month)} MoM growth`, latest.growth, "MoM vs prior month"));
    }
    return {
      text: `Gross Product Sales are ${formatInr(kpis.grossProductSales)} across ${kpis.orderCount} distinct Orders. ${
        latest
          ? `Latest month ${monthLabel(latest.month)} is ${formatInr(latest.sales)} with MoM growth ${formatPct(latest.growth)}.`
          : "Monthly growth needs at least two months in scope."
      } All amounts are Indian rupees (₹).`,
      evidence: items,
      followUps: ["Is the decline caused by fewer orders or smaller baskets?"],
    };
  }

  if (/gross versus net|net product sales|gross product sales after refund|refund amount/.test(q)) {
    items.push(evidence("gross_product_sales", "Gross Product Sales", kpis.grossProductSales, "Order Payment product charges"));
    items.push(evidence("refund_amount", "Refunds", kpis.refundAmountAbs, "Abs. Refund product charges"));
    items.push(evidence("net_product_sales", "Net Product Sales", kpis.netProductSales, "Gross + signed refund charges"));
    return {
      text: `Gross Product Sales are ${formatInr(kpis.grossProductSales)}. Refunds are ${formatInr(
        kpis.refundAmountAbs,
      )}. Net Product Sales are ${formatInr(
        kpis.netProductSales,
      )} (gross minus customer product refunds). Do not conflate Gross Product Sales with refund-adjusted Net Product Sales. Amounts are Indian rupees (₹).`,
      evidence: items,
      followUps: ["How many orders were refunded, and can we report net orders?"],
    };
  }

  if (/refunded|net orders|orders affected by refund/.test(q)) {
    items.push(evidence("gross_order_count", "Gross orders", kpis.grossOrderCount ?? kpis.orderCount, "Distinct Order IDs"));
    items.push(evidence("refunded_order_count", "Refunded order IDs", kpis.refundedOrderCount, "Distinct refund Order IDs"));
    items.push(evidence("full_refund_order_count", "Full refunds in gross", kpis.fullRefundOrderCount, "Abs refund ≈ order gross"));
    items.push(evidence("net_order_count", "Net orders", kpis.netOrderCount, kpis.netOrdersBasis || "not_subtracted"));
    const text = kpis.canSubtractFullRefunds
      ? `Gross orders are ${kpis.grossOrderCount ?? kpis.orderCount}. ${kpis.fullRefundOrderCount} distinct order(s) are full refunds present in the gross set, so net orders are ${kpis.netOrderCount}. Refund amount remains ${formatInr(kpis.refundAmountAbs)}.`
      : `Gross orders are ${kpis.grossOrderCount ?? kpis.orderCount}. ${
          kpis.ordersAffectedByRefunds ?? kpis.refundedOrderCount
        } order(s) are affected by refunds, but full vs partial cannot be subtracted cleanly for every case — net orders are not claimed. Do not treat all refunds as full-order cancellations.`;
    return {
      text,
      evidence: items,
      followUps: ["What is the median order value, and do large orders skew the average?"],
    };
  }

  if (/median order|skew the average|2× median|2x median|large order/.test(q)) {
    items.push(evidence("aov", "Gross AOV", kpis.aov, "gross product sales / gross orders"));
    items.push(
      evidence(
        "median_order_value",
        "Median order value",
        kpis.medianOrderValue,
        "Same gross order population as Gross AOV",
      ),
    );
    items.push(evidence("orders_above_2x_median", "Orders above 2× median", kpis.ordersAbove2xMedian, "Order-level filter"));
    items.push(evidence("sales_above_2x_median", "Sales above 2× median", kpis.salesAbove2xMedian, "Order-level sum"));
    items.push(
      evidence("sales_share_above_2x_median", "Share above 2× median", kpis.salesShareAbove2xMedian, "Sales / gross"),
    );
    const skew = kpis.orderValues?.skewMaterial || (kpis.salesShareAbove2xMedian != null && kpis.salesShareAbove2xMedian >= 0.25);
    return {
      text: `Median order value is ${formatInr(kpis.medianOrderValue)} vs gross AOV ${formatInr(
        kpis.aov,
      )} (same gross order population; unique order-level product charges). ${
        kpis.ordersAbove2xMedian
          ? `${kpis.ordersAbove2xMedian} order(s) above 2× median contribute ${formatInr(
              kpis.salesAbove2xMedian,
            )} (${formatPct(kpis.salesShareAbove2xMedian)} of gross).${
              skew ? " Large orders are materially skewing the average." : ""
            }`
          : "No orders exceed 2× the median in this scope."
      }`,
      evidence: items,
    };
  }

  if (/order volume|average order value|aov|gross aov/.test(q)) {
    items.push(evidence("order_count", "Gross orders", kpis.grossOrderCount ?? kpis.orderCount, "Distinct Order IDs"));
    items.push(evidence("aov", "Gross AOV", kpis.aov, "gross product sales / gross orders"));
    items.push(
      evidence(
        "median_order_value",
        "Median order value",
        kpis.medianOrderValue,
        "Same gross order population as Gross AOV",
      ),
    );
    return {
      text: `Gross order volume is ${kpis.grossOrderCount ?? kpis.orderCount} distinct Amazon order IDs. Gross AOV is ${formatInr(
        kpis.aov,
      )} (= gross product sales ÷ gross orders); median is ${formatInr(
        kpis.medianOrderValue,
      )} on the same gross order population. Neither uses net sales/orders nor raw payment rows.`,
      evidence: items,
    };
  }

  if (/bulk/.test(q)) {
    const bulk = metrics?.sections?.topline?.bulkOrders || [];
    items.push(evidence("bulk_orders", "Bulk-order candidates", bulk.length, ">= max(3× median, p90)"));
    return {
      text: bulk.length
        ? `Identified ${bulk.length} bulk-order candidate(s). Largest is ${formatInr(bulk[0].amount)} for ${bulk[0].productName || "an unspecified product"}. Bulk rows can lift a product’s rank without changing run-rate demand.`
        : "No bulk-order candidates under the current threshold.",
      evidence: items,
      followUps: ["How do bulk orders affect product rankings?"],
    };
  }

  if (/where is amazon taking|taking the money|taking my money|most money/.test(q)) {
    const rows = metrics?.sections?.amazon_economics?.whereMoneyGoes || [];
    const top = rows.slice(0, 4);
    for (const row of top) items.push(evidence(row.id, row.label, row.amount, "Classified settlement lines"));
    return {
      text: top.length
        ? `Largest settlement drains: ${top
            .map((row) => `${row.label} ${formatInr(row.amount)}`)
            .join("; ")}. Selling fees are CSV aggregates, not proven referral-only.`
        : "No classified fee outflows in the current scope.",
      evidence: items,
      followUps: ["What percentage of sales is going toward marketplace deductions?"],
    };
  }

  if (/percentage of sales|marketplace deduction|deduction rate|fee percent/.test(q)) {
    items.push(
      evidence(
        "effective_marketplace_deduction_rate",
        "Effective deduction rate",
        kpis.effectiveMarketplaceDeductionRate,
        "Fee outflows / gross product sales",
      ),
    );
    items.push(evidence("selling_fees", "Amazon selling fees", kpis.sellingFees, "Amazon fees on orders/refunds"));
    items.push(evidence("advertising", "Advertising", kpis.advertising, "Cost of Advertising"));
    return {
      text: `Effective marketplace deduction rate is ${formatPct(
        kpis.effectiveMarketplaceDeductionRate,
      )} of gross product sales (fee outflows ÷ gross product sales; excludes refunds and unexplained Other credits).`,
      evidence: items,
    };
  }

  if (/referral|total marketplace deduction/.test(q) && /compar|versus|vs|deduction|fee/.test(q)) {
    items.push(evidence("selling_fees", "Amazon selling fees", kpis.sellingFees, "Amazon fees on orders/refunds"));
    items.push(
      evidence(
        "effective_marketplace_deduction_rate",
        "Effective deduction rate",
        kpis.effectiveMarketplaceDeductionRate,
        "Fee outflows / gross product sales",
      ),
    );
    return {
      text: `Referral fee is not separately itemised in this export. Amazon selling fees total ${formatInr(
        kpis.sellingFees,
      )}. Effective marketplace deduction rate is ${formatPct(kpis.effectiveMarketplaceDeductionRate)}.`,
      evidence: items,
    };
  }

  if (/how much.*advertis|spent on advertising|advertising\b/.test(q) && !/refund|promo/.test(q)) {
    items.push(evidence("advertising", "Advertising", kpis.advertising, "Cost of Advertising"));
    return {
      text: `Advertising spend in this scope is ${formatInr(kpis.advertising)}. This is Cost of Advertising from the transaction export — not ROAS or attributed sales.`,
      evidence: items,
    };
  }

  if (/advertising|refund|promotional/.test(q)) {
    items.push(evidence("advertising", "Advertising", kpis.advertising, "Cost of Advertising"));
    items.push(evidence("refunds", "Refunded product charges", kpis.refundProductCharges, "Refund rows — Topline"));
    items.push(evidence("promo", "Promotional rebates", kpis.promotionalRebates, "Promotional rebate column"));
    return {
      text: `Advertising ${formatInr(kpis.advertising)}; promotional rebates ${formatInr(
        kpis.promotionalRebates,
      )}. Customer product refunds total ${formatInr(
        kpis.refundProductCharges,
      )} and are shown in Topline as sales reductions — not as Amazon fee drains. Refund reasons are not in these exports.`,
      evidence: items,
    };
  }

  if (/unknown fee|fee categor|unexplained|csv other/.test(q)) {
    items.push(evidence("other_settlement", "Unexplained CSV Other", kpis.otherSettlement, "Other column"));
    return {
      text: `Unexplained CSV Other totals ${formatInr(
        kpis.otherSettlement,
      )}. These amounts are shown on the settlement waterfall and are not assigned to tax, selling fees, or product revenue without evidence.`,
      evidence: items,
    };
  }

  if (/top eight|concentration|contribute the most|products contribute|revenue share|drive most|too concentrated/.test(q)) {
    const products = metrics?.sections?.product_performance?.products || [];
    const scoped = productFilter
      ? products.filter((row) => row.productName === productFilter)
      : products;
    const top = (scoped.length ? scoped : products).slice(0, 5);
    items.push(evidence("top8_concentration", "Top-8 revenue share", kpis.top8Concentration, "Top 8 sales / gross sales"));
    for (const row of top.slice(0, 3)) {
      items.push(evidence(`product:${row.productName}`, row.productName, row.sales, "Product gross sales"));
    }
    const concentrated = kpis.top8Concentration != null && kpis.top8Concentration >= 0.8;
    return {
      text: `Top-eight products account for ${formatPct(kpis.top8Concentration)} of gross product sales (revenue share, not profit). ${
        concentrated ? "That is high concentration — a small set of SKUs drives most revenue." : "Concentration is moderate relative to an 80% top-eight threshold."
      } Leading product: ${top[0] ? `${top[0].productName} at ${formatInr(top[0].sales)}` : "n/a"}.`,
      evidence: items,
      followUps: ["Which products are growing or declining?", "Which products carry the highest fee burden?"],
    };
  }

  if (/growing or declining|product.*grow|product.*declin|period-over-period product|product monthly/.test(q)) {
    const series = metrics?.sections?.product_performance?.productMonthly || [];
    items.push(evidence("gross_product_sales", "Gross product sales", kpis.grossProductSales, "Order Payment product charges"));
    if (series.length) {
      for (const row of series.slice(0, 3)) {
        const latest = row.months?.[row.months.length - 1];
        if (latest) {
          items.push(
            evidence(
              `product_month:${row.productName}:${latest.month}`,
              `${row.productName} ${latest.month}`,
              latest.sales,
              "Product monthly aggregation",
            ),
          );
          if (latest.growth != null) {
            items.push(
              evidence(
                `product_growth:${row.productName}:${latest.month}`,
                `${row.productName} MoM`,
                latest.growth,
                "Product MoM",
              ),
            );
          }
        }
      }
      const lead = series[0];
      const latest = lead?.months?.[lead.months.length - 1];
      return {
        text: latest
          ? `Among top products, ${lead.productName} latest month ${latest.month} is ${formatInr(latest.sales)}${
              latest.growth != null ? ` (${formatPct(latest.growth)} MoM)` : ""
            }. Product monthly series is aggregated for top SKUs only — not a full catalogue forecast.`
          : "Product monthly series is present but incomplete for the current scope.",
        evidence: items,
        followUps: ["How do bulk orders affect product rankings?"],
      };
    }
    const months = monthSeries(metrics);
    if (months.length >= 2) {
      const latest = months[months.length - 1];
      const prior = months[months.length - 2];
      items.push(evidence("latest_month", `${latest.month} sales`, latest.sales, "Monthly aggregation"));
      items.push(evidence("prior_month", `${prior.month} sales`, prior.sales, "Monthly aggregation"));
      return {
        text: `Product-level monthly comparisons are unavailable in this scope. Overall sales moved from ${formatInr(
          prior.sales,
        )} in ${prior.month} to ${formatInr(latest.sales)} in ${latest.month} (${formatPct(latest.growth)} MoM).`,
        evidence: items,
      };
    }
    return {
      text: "Not enough months in scope to describe product growth or decline.",
      evidence: items,
    };
  }

  if (/bulk orders affect product|product rankings|bulk-order impact|bulk impact/.test(q)) {
    const bulk = metrics?.sections?.topline?.bulkOrders || [];
    const impact = metrics?.sections?.product_performance?.bulkImpact || metrics?.sections?.topline?.bulkImpact;
    const products = metrics?.sections?.product_performance?.products || [];
    items.push(evidence("bulk_orders", "Bulk-order candidates", bulk.length, "Bulk threshold"));
    if (impact) {
      items.push(evidence("bulk_sales", "Bulk candidate sales", impact.bulkSales, "Bulk threshold sales"));
      items.push(evidence("bulk_share", "Bulk share of gross", impact.bulkShareOfGross, "Bulk sales / gross"));
      for (const row of (impact.productsLifted || []).slice(0, 2)) {
        items.push(evidence(`bulk_product:${row.productName}`, row.productName, row.bulkSales, "Bulk sales for product"));
      }
    }
    if (products[0]) items.push(evidence("top_product", products[0].productName, products[0].sales, "Product sales"));
    return {
      text: impact?.bulkOrderCount
        ? `Bulk candidates: ${impact.bulkOrderCount} order(s) totaling ${formatInr(
            impact.bulkSales,
          )} (${formatPct(impact.bulkShareOfGross)} of gross). Most affected ranked product: ${
            impact.productsLifted?.[0]
              ? `${impact.productsLifted[0].productName} (rank #${impact.productsLifted[0].rank}, bulk ${formatInr(
                  impact.productsLifted[0].bulkSales,
                )})`
              : "n/a"
          }. Rankings use gross product sales, so bulk rows can lift a SKU without changing run-rate demand.`
        : "No bulk-order candidates detected, so current product rankings are less likely to be distorted by single large orders.",
      evidence: items,
    };
  }

  if (/fee burden by order|order size.*fee|fee.*order size/.test(q)) {
    const buckets = metrics?.sections?.product_performance?.orderSizes?.buckets || [];
    const withFees = buckets.filter((row) => row.feesAvailable && row.feeBurden != null);
    for (const row of withFees.slice(0, 4)) {
      items.push(evidence(`fee_bucket:${row.id}`, row.label, row.feeBurden, "abs(fees)/sales in bucket"));
    }
    if (!withFees.length) {
      return {
        text: "Fee burden by order-size bucket is unavailable because Amazon fees were missing on those order rows. Missing fees are not treated as zero.",
        evidence: items,
      };
    }
    const top = [...withFees].sort((a, b) => (b.feeBurden || 0) - (a.feeBurden || 0))[0];
    return {
      text: `Highest fee burden by order size is ${top.label} at ${formatPct(top.feeBurden)} (${formatInr(
        top.fees,
      )} fees on ${formatInr(top.sales)} sales). This uses reported Amazon fee amounts on Order Payment rows only.`,
      evidence: items,
    };
  }

  if (/fee burden/.test(q)) {
    const products = [...(metrics?.sections?.product_performance?.products || [])]
      .filter((row) => row.sales > 0 && row.feesAvailable && row.feeBurden != null)
      .sort((a, b) => (b.feeBurden || 0) - (a.feeBurden || 0));
    const top = products[0];
    if (!top) {
      return {
        text: "No product fee burden is available from reported Amazon fees in the current scope. Missing fees are not treated as zero-fee products.",
        evidence: items,
      };
    }
    items.push(evidence("fee_burden", top.productName, top.feeBurden, "abs(reported fees)/sales"));
    return {
      text: `Highest fee burden among products with reported fees is ${top.productName} at ${formatPct(top.feeBurden)} (${formatInr(
        top.fees,
      )} fees on ${formatInr(top.sales)} sales). Missing fees are not treated as zero.`,
      evidence: items,
    };
  }

  if (/how much money did amazon transfer|bank transfer|amazon transfer/.test(q)) {
    items.push(
      evidence(
        "bank_transfers",
        "Bank transfers",
        metrics?.sections?.profitability?.bankTransfers,
        "Unified Summary PDF",
      ),
    );
    items.push(evidence("amazon_proceeds", "Amazon account settlement movement", kpis.amazonProceeds, "Sum of Total (INR)"));
    return {
      text: `Bank transfers on the Unified Summary are ${formatInr(
        metrics?.sections?.profitability?.bankTransfers,
      )}. CSV Amazon account settlement movement is ${formatInr(
        kpis.amazonProceeds,
      )}. These measures are not subtracted against each other; opening/closing balances are missing.`,
      evidence: items,
      followUps: ["Why are sales and settlement proceeds different?"],
    };
  }

  if (/sales and settlement|proceeds different|why are sales/.test(q)) {
    const steps = metrics?.sections?.profitability?.waterfall?.steps || [];
    for (const row of steps.filter((step) => step.kind !== "info").slice(0, 7)) {
      items.push(evidence(row.id, row.label, row.amount, "Settlement waterfall"));
    }
    return {
      text: `Gross product sales ${formatInr(kpis.grossProductSales)} differ from settlement movement ${formatInr(
        kpis.amazonProceeds,
      )} because refunds, fees, advertising, inbound transportation, promotional rebates, and unexplained Other credits intervene. See the sales-to-settlement waterfall. Bank transfers are a separate PDF ledger line.`,
      evidence: items,
    };
  }

  if (/reconcil|discrepan|difference/.test(q)) {
    const comparisons = metrics?._reconciliation?.comparisons || section.reconciliation?.comparisons || [];
    // reconciliation is passed via metrics.reconciliation sometimes — prefer context from engine in investigate
    return {
      text: "Open Profitability & Cash Realisation for confirmed differences versus not-comparable or missing-information lines. Only comparable metrics are treated as reconciliation failures.",
      evidence: items,
    };
  }

  if (/cash|settle|proceeds/.test(q)) {
    items.push(evidence("amazon_proceeds", "Amazon account proceeds", kpis.amazonProceeds, "Sum of Total (INR)"));
    items.push(
      evidence(
        "bank_transfers",
        "Bank transfers",
        metrics?.sections?.profitability?.bankTransfers,
        "Unified Summary PDF",
      ),
    );
    return {
      text: `Amazon account proceeds (settlement movement) are ${formatInr(
        kpis.amazonProceeds,
      )}. This is not net profit. Bank transfers from the Unified Summary are ${formatInr(
        metrics?.sections?.profitability?.bankTransfers,
      )}.`,
      evidence: items,
    };
  }

  if (/deduction|between revenue and proceeds|bridge|waterfall/.test(q)) {
    const steps = metrics?.sections?.profitability?.waterfall?.steps || [];
    for (const row of steps.filter((step) => step.kind !== "info").slice(0, 7)) {
      items.push(evidence(row.id, row.label, row.amount, "Settlement waterfall"));
    }
    return {
      text: `The settlement waterfall starts at gross product sales ${formatInr(
        kpis.grossProductSales,
      )} and ends at Amazon account settlement movement ${formatInr(
        kpis.amazonProceeds,
      )}. Bank transfers from the PDF are shown separately and are not subtracted into that result.`,
      evidence: items,
    };
  }

  if (/profitability|cogs|product profit|actual profit/.test(q)) {
    items.push(evidence("product_profit", "Product profit", null, "Requires COGS"));
    return {
      text: "Product profitability cannot be calculated — actual product costs (COGS) were not provided. Marketplace proceeds and settlement movement are not profit.",
      evidence: items,
      followUps: ["Which financial information is missing?"],
    };
  }

  if (/information is missing|what.*missing|missing financial/.test(q)) {
    items.push(evidence("product_profit", "Product profit", null, "Requires COGS"));
    items.push(evidence("bank_transfers", "Bank transfers", metrics?.sections?.profitability?.bankTransfers, "PDF only"));
    items.push(evidence("other_settlement", "Unexplained CSV Other", kpis.otherSettlement, "Other column"));
    return {
      text: "Missing or out of scope: product COGS, opening/closing Amazon balances, referral-fee split, unit quantities when absent from the export, GST as a labelled CSV column, and any explanation for CSV Other credits. PDF bank transfers and net GST are reference-only when present.",
      evidence: items,
    };
  }

  items.push(evidence("gross_product_sales", "Gross product sales", kpis.grossProductSales, "Order Payment product charges"));
  items.push(evidence("amazon_proceeds", "Amazon account proceeds", kpis.amazonProceeds, "Sum of Total (INR)"));
  return {
    text: `In the current scope, gross product sales are ${formatInr(
      kpis.grossProductSales,
    )} and Amazon account proceeds are ${formatInr(kpis.amazonProceeds)}. Ask a section-specific question for a tighter breakdown.`,
    evidence: items,
    followUps: getSection(context.sectionId).questions.slice(0, 2),
  };
}

export function investigate(question, context, metrics = null, reconciliation = null) {
  const safeContext = buildInvestigationContext(context || {});
  const hasMetrics = Boolean(metrics && metrics.status === "calculated");
  if (!hasMetrics) {
    return {
      mode: ASK_WYZ_MODE,
      liveModel: false,
      status: "awaiting_calculations",
      disclosure: ASK_WYZ_DISCLOSURE_LIVE,
      question: String(question || "").slice(0, 500),
      context: {
        sessionId: safeContext.sessionId,
        sectionId: safeContext.sectionId,
        dateRange: safeContext.dateRange,
        product: safeContext.product,
        filters: safeContext.filters,
        chartId: safeContext.chartId,
      },
      answer: null,
      evidence: [],
      followUps: [],
    };
  }

  // Attach reconciliation onto a shallow metrics view for recon-aware prompts.
  const metricsView =
    reconciliation && !metrics.reconciliation
      ? { ...metrics, reconciliation, _reconciliation: reconciliation }
      : metrics;

  const result = answerFor(question, metricsView, safeContext);

  // Prefer engine reconciliation comparisons when asking about discrepancies.
  let evidence = result.evidence;
  let answer = result.text;
  if (/reconcil|discrepan/.test(String(question || "").toLowerCase()) && reconciliation?.comparisons) {
    const diffs = reconciliation.comparisons.filter((row) => row.status === "difference");
    const notComparable = reconciliation.comparisons.filter((row) => row.status === "not_comparable");
    const missing = reconciliation.comparisons.filter((row) => row.status === "missing_information");
    evidence = diffs.slice(0, 4).map((row) =>
      evidenceItem(row.id, row.id, row.difference, row.explanation),
    );
    answer = `Confirmed differences: ${diffs.length || "none"}. Not comparable: ${notComparable.length}. Missing information: ${missing.length}. ${
      diffs[0]
        ? `Example — ${diffs[0].id}: transactions ${formatInr(diffs[0].txValue)} vs PDF ${formatInr(diffs[0].pdfValue)} (Δ ${formatInr(
            diffs[0].difference,
          )}). ${diffs[0].explanation || ""}`
        : "No confirmed comparable differences in scope."
    }`;
  }

  return {
    mode: ASK_WYZ_MODE,
    liveModel: false,
    status: "answered",
    disclosure: ASK_WYZ_DISCLOSURE_LIVE,
    question: String(question || "").slice(0, 500),
    context: {
      sessionId: safeContext.sessionId,
      sectionId: safeContext.sectionId,
      dateRange: safeContext.dateRange,
      product: safeContext.product,
      filters: safeContext.filters,
      chartId: safeContext.chartId,
    },
    answer: humanizePeriodLabels(answer),
    evidence,
    followUps: result.followUps || [],
    source: "guided",
    currency: REPORT_CURRENCY,
  };
}

function evidenceItem(metricId, label, value, source) {
  return evidence(metricId, label, value, source);
}
