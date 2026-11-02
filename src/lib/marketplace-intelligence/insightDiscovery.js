/**
 * Deterministic insight discovery — six families.
 * Reuses calculated metrics only; does not invent causal business explanations.
 */
import { formatMonthLabel } from "./askPresentation.js";
import { densifyMonthly } from "./insights.js";
import { decomposeSalesOrdersAov, primaryDriverLabel } from "./decomposition.js";
import {
  COMPARISON_STATUS,
  CONFIDENCE,
  INSIGHT_TYPES,
  METRIC_BASIS,
  createInsight,
  metricRef,
} from "./insightSchema.js";
import { formatInr, formatPct, roundMoney, ratio } from "./money.js";
import {
  compareMonthCoverage,
  coverageLeadHeadline,
  founderComparisonNote,
  formatCoverageSpan,
  isPartialMonth,
  monthParts,
} from "./periodCoverage.js";

function founderDriverSummary(decomp, primaryDriver, { provisional = false } = {}) {
  if (!decomp?.comparable || !primaryDriver) {
    return "Comparable Orders × Gross AOV split unavailable for this period pair.";
  }
  const orderLed = primaryDriver.id === "orders";
  if (provisional) {
    return orderLed
      ? "Fewer recorded Orders explain most of the difference between the available records."
      : "Lower recorded Gross AOV explains most of the difference between the available records.";
  }
  const fell = decomp.deltaSales != null && decomp.deltaSales < 0;
  const outcome = fell ? "sales decline" : "sales change";
  return orderLed
    ? `Fewer Orders explain most of the ${outcome}.`
    : `Lower Gross AOV explains most of the ${outcome}.`;
}

function monthLabel(ym) {
  return formatMonthLabel(ym) || ym || "";
}

function filterContext(metrics) {
  return {
    dateRange: metrics?.filters?.dateRange || null,
    products: metrics?.filters?.products || [],
  };
}

function periodFromMonths(a, b, metrics) {
  return {
    start: a?.month ? `${a.month}-01` : metrics?.period?.start || null,
    end: b?.month ? monthParts(b.month)?.end || null : metrics?.period?.end || null,
    label:
      a?.month && b?.month
        ? `${monthLabel(a.month)} → ${monthLabel(b.month)}`
        : "Current filter scope",
  };
}

function materialityFromChange(absChange, relativeChange, gross, { comparisonBase = null } = {}) {
  const abs = absChange == null ? 0 : Math.abs(absChange);
  const rel = relativeChange == null ? 0 : Math.abs(relativeChange);
  // Prefer period comparison base (e.g. prior-month sales) so MoM moves are not diluted by full-span gross.
  const denom = comparisonBase > 0 ? comparisonBase : gross > 0 ? gross : null;
  const vsBase = denom > 0 ? abs / denom : rel;
  const score = Math.min(1, vsBase * 3.2 + rel * 0.85);
  return {
    score,
    absoluteChange: absChange,
    relativeChange,
    notes:
      denom > 0
        ? `|Δ| / ${comparisonBase > 0 ? "comparison base" : "Gross Product Sales"} = ${formatPct(vsBase)}`
        : "Relative change only",
  };
}

function unverified(...texts) {
  return texts.filter(Boolean).map((text) => ({ text, status: "unverified" }));
}

/** Family 1 + 2: revenue movement, consecutive declines, orders vs AOV. */
function discoverRevenueAndOrders(metrics) {
  const topline = metrics?.sections?.topline || {};
  const monthly = topline.monthly || [];
  const period = metrics.period;
  const dateRange = metrics.filters?.dateRange;
  const gross = metrics.kpis?.grossProductSales || 0;
  const out = [];

  if (monthly.length < 2) {
    if (monthly.length === 1) {
      const only = monthly[0];
      const partial = isPartialMonth(only.month, period, dateRange);
      out.push(
        createInsight({
          id: `revenue_single_${only.month}`,
          type: INSIGHT_TYPES.REVENUE_MOVEMENT,
          groupKey: `revenue_${only.month}`,
          metricBasis: METRIC_BASIS.GROSS_PRODUCT_SALES,
          filters: filterContext(metrics),
          period: {
            start: `${only.month}-01`,
            end: monthParts(only.month)?.end || null,
            label: monthLabel(only.month),
          },
          headline: `Only one month in scope: ${monthLabel(only.month)}`,
          summary: `Gross Product Sales ${formatInr(only.sales)}${partial ? " (partial month)" : ""}.`,
          what: `Gross Product Sales are ${formatInr(only.sales)} in ${monthLabel(only.month)}${
            partial ? " (partial month in the current filter)" : ""
          }. Month-over-month comparison is unavailable.`,
          why: {
            method: "insufficient_history",
            drivers: [],
            reconciles: true,
            residual: 0,
          },
          hypotheses: unverified("Additional months may change the growth picture once included."),
          whatNext: [
            {
              action: "Widen the date filter if more history exists",
              question: "How did monthly sales and growth move in this period?",
              sectionId: "topline",
              chartId: "monthly-sales",
            },
          ],
          metrics: [
            metricRef("gross_product_sales", "Gross Product Sales", only.sales, "Monthly aggregation"),
            metricRef("orders", "Orders", only.orders, "Monthly distinct orders"),
            metricRef("gross_aov", "Gross AOV", only.aov, "Month sales / orders"),
          ],
          materiality: materialityFromChange(only.sales, null, gross),
          confidence: partial ? CONFIDENCE.LOW : CONFIDENCE.MEDIUM,
          evidenceQuality: partial ? "partial_month" : "single_month",
          limitations: ["Need at least two months for MoM movement insights."],
          links: {
            sectionIds: ["topline"],
            chartIds: ["monthly-sales"],
            investigationHints: ["monthly_sales"],
          },
          _persistenceScore: 0,
        }),
      );
    }
    return out;
  }

  const dense = densifyMonthly(monthly);
  // Consecutive declines on densified series
  let streak = 0;
  let streakEnd = null;
  let bestStreak = 0;
  let bestEnd = null;
  for (let i = 1; i < dense.length; i += 1) {
    if (dense[i].growth != null && dense[i].growth < 0) {
      streak += 1;
      streakEnd = dense[i];
      if (streak > bestStreak) {
        bestStreak = streak;
        bestEnd = streakEnd;
      }
    } else {
      streak = 0;
      streakEnd = null;
    }
  }

  const latest = monthly[monthly.length - 1];
  const prior = monthly[monthly.length - 2];
  const decomp = decomposeSalesOrdersAov(prior, latest);
  const primary = primaryDriverLabel(decomp);
  const coverageCompare = compareMonthCoverage(prior.month, latest.month, period, dateRange);
  const partialLatest = coverageCompare.current?.partial;
  const partialPrior = coverageCompare.prior?.partial;
  const provisional = Boolean(coverageCompare.provisional);
  const groupKey = `revenue_${prior.month}_${latest.month}`;

  // Founder-facing drivers: symmetric two-factor (interaction split equally). Three-term kept on metrics.
  const drivers = [];
  if (decomp.comparable && decomp.orderContribution != null && decomp.aovContribution != null) {
    drivers.push({
      id: "orders",
      label: "Orders contribution",
      amount: decomp.orderContribution,
      shareOfChange: ratio(decomp.orderContribution, decomp.deltaSales),
      detail: `Symmetric share of Δ Gross Product Sales (ΔOrders × average Gross AOV). Share of Δ sales = contribution ÷ Δ Gross Product Sales.`,
    });
    drivers.push({
      id: "gross_aov",
      label: "Gross AOV contribution",
      amount: decomp.aovContribution,
      shareOfChange: ratio(decomp.aovContribution, decomp.deltaSales),
      detail: `Symmetric share of Δ Gross Product Sales (ΔGross AOV × average Orders). Share of Δ sales = contribution ÷ Δ Gross Product Sales.`,
    });
  }

  const growth = latest.growth;
  const fell = decomp.deltaSales != null && decomp.deltaSales < 0;
  const priorSpan = formatCoverageSpan(coverageCompare.prior);
  const currentSpan = formatCoverageSpan(coverageCompare.current);
  const coverageNote = founderComparisonNote(coverageCompare);
  const growthLabel = provisional
    ? "observed-record difference (not a verified full-month MoM)"
    : growth == null
      ? "MoM unavailable"
      : `${formatPct(growth)} MoM vs prior-month Gross Product Sales`;
  const shortWhy = founderDriverSummary(decomp, primary, { provisional });
  const calcConfidence = !decomp.comparable
    ? CONFIDENCE.MEDIUM
    : coverageCompare.status === COMPARISON_STATUS.INCOMPATIBLE ||
        coverageCompare.status === COMPARISON_STATUS.NOT_COMPARABLE
      ? CONFIDENCE.LOW
      : coverageCompare.status === COMPARISON_STATUS.MATCHED_PARTIAL ||
          coverageCompare.status === COMPARISON_STATUS.TRAILING_PARTIAL
        ? CONFIDENCE.MEDIUM
        : CONFIDENCE.HIGH;
  const coverageConfidence =
    coverageCompare.status === COMPARISON_STATUS.COMPLETE_COMPARABLE
      ? CONFIDENCE.HIGH
      : "incomplete";

  const headline = provisional
    ? coverageLeadHeadline(coverageCompare, prior.month, latest.month, monthLabel) ||
      `Incomplete period coverage: ${monthLabel(prior.month)} vs ${monthLabel(latest.month)}`
    : fell
      ? `Gross Product Sales declined ${formatPct(growth)} into ${monthLabel(latest.month)}`
      : `Gross Product Sales changed from ${monthLabel(prior.month)} to ${monthLabel(latest.month)}`;

  const summary = provisional
    ? `${coverageNote || "Incomplete coverage."} Observed Gross Product Sales ${formatInr(prior.sales)} → ${formatInr(latest.sales)} in available records.`
    : `${formatInr(prior.sales)} → ${formatInr(latest.sales)} (${growthLabel}).`;

  const what = provisional
    ? `${coverageNote || "Reporting periods are not equivalent."} Observed Gross Product Sales in available records: ${formatInr(
        prior.sales,
      )} (${monthLabel(prior.month)}${priorSpan ? `, ${priorSpan}` : ""}) vs ${formatInr(latest.sales)} (${monthLabel(
        latest.month,
      )}${currentSpan ? `, ${currentSpan}` : ""}). Orders/AOV figures below describe this observed-record difference only — not verified full-month deterioration. Basis: Gross Product Sales — not Net Product Sales after Refunds.`
    : `Gross Product Sales moved from ${formatInr(prior.sales)} in ${monthLabel(prior.month)}${
        partialPrior ? " (partial period)" : ""
      } to ${formatInr(latest.sales)} in ${monthLabel(latest.month)}${
        partialLatest ? " (partial period)" : ""
      } (${growthLabel}). Basis: Gross Product Sales — not Net Product Sales after Refunds.`;

  out.push(
    createInsight({
      id: `revenue_mom_${prior.month}_${latest.month}`,
      type: INSIGHT_TYPES.REVENUE_MOVEMENT,
      groupKey,
      metricBasis: METRIC_BASIS.GROSS_PRODUCT_SALES,
      filters: filterContext(metrics),
      period: periodFromMonths(prior, latest, metrics),
      comparisonPeriod: {
        start: `${prior.month}-01`,
        end: monthParts(prior.month)?.end || null,
        label: monthLabel(prior.month),
      },
      headline,
      summary,
      shortWhy,
      what,
      why: {
        method: decomp.presentationMethod || decomp.method,
        drivers,
        reconciles: Boolean(decomp.presentationReconciles ?? decomp.reconciles),
        residual: decomp.presentationResidual ?? decomp.residual,
        audit: {
          method: decomp.method,
          orderEffect: decomp.orderEffect,
          aovEffect: decomp.aovEffect,
          interactionEffect: decomp.interactionEffect,
          residual: decomp.residual,
        },
      },
      hypotheses: unverified(
        "Demand, listing visibility, or stock availability may have changed — not verified in these exports.",
        "Pricing or promotion mix may have shifted baskets — not verified without offer-level data.",
      ),
      whatNext: [
        {
          action: "Inspect Orders vs Gross AOV on the monthly orders chart",
          question: "Is the decline caused by fewer orders or smaller baskets?",
          sectionId: "topline",
          chartId: "monthly-orders",
        },
        {
          action: "Check which products moved with the period",
          question: "Which products contributed most to the change?",
          sectionId: "product_performance",
          chartId: "product-mix",
        },
      ],
      metrics: [
        metricRef(`sales_${prior.month}`, `${monthLabel(prior.month)} Gross Product Sales`, prior.sales, "Monthly aggregation"),
        metricRef(`sales_${latest.month}`, `${monthLabel(latest.month)} Gross Product Sales`, latest.sales, "Monthly aggregation"),
        metricRef("delta_sales", "Δ Gross Product Sales", decomp.deltaSales, "Current − prior"),
        metricRef(`orders_${prior.month}`, `${monthLabel(prior.month)} Orders`, prior.orders, "Monthly distinct orders"),
        metricRef(`orders_${latest.month}`, `${monthLabel(latest.month)} Orders`, latest.orders, "Monthly distinct orders"),
        metricRef(`aov_${prior.month}`, `${monthLabel(prior.month)} Gross AOV`, prior.aov, "Month sales / orders"),
        metricRef(`aov_${latest.month}`, `${monthLabel(latest.month)} Gross AOV`, latest.aov, "Month sales / orders"),
        metricRef("order_contribution", "Orders contribution (symmetric)", decomp.orderContribution, decomp.presentationMethod),
        metricRef("aov_contribution", "Gross AOV contribution (symmetric)", decomp.aovContribution, decomp.presentationMethod),
        metricRef("order_effect_audit", "Orders effect (audit three-term)", decomp.orderEffect, decomp.method),
        metricRef("aov_effect_audit", "Gross AOV effect (audit three-term)", decomp.aovEffect, decomp.method),
        metricRef("interaction_effect_audit", "Interaction (audit three-term)", decomp.interactionEffect, decomp.method),
      ],
      materiality: materialityFromChange(
        decomp.deltaSales,
        provisional ? null : growth,
        gross,
        { comparisonBase: prior.sales },
      ),
      confidence: calcConfidence,
      confidenceFacets: {
        calculation: calcConfidence,
        coverage: coverageConfidence,
        reconciliation: "not_applicable",
        businessCause: "unverified_only",
      },
      evidenceQuality: decomp.comparable
        ? coverageCompare.status === COMPARISON_STATUS.COMPLETE_COMPARABLE
          ? "full_month_mom"
          : coverageCompare.status === COMPARISON_STATUS.MATCHED_PARTIAL
            ? "matched_partial_comparison"
            : "provisional_observed_record_difference"
        : decomp.incomparableReason || "incomparable",
      comparisonStatus: coverageCompare.status,
      provisional,
      isRecentChange: !provisional,
      isStableObservation: false,
      limitations: [
        ...(coverageNote ? [coverageNote] : []),
        ...(coverageCompare.label && provisional ? [coverageCompare.label] : []),
        ...(decomp.incomparableReason ? [`Decomposition limited: ${decomp.incomparableReason}.`] : []),
        "Symmetric contributions split the Orders×AOV interaction equally for presentation; three-term audit fields remain on evidence.",
        "Customer product refunds are separate Topline reductions — not included in this Gross Product Sales movement.",
      ],
      links: {
        sectionIds: ["topline"],
        chartIds: ["monthly-sales", "monthly-orders"],
        investigationHints: ["august_september", "orders_vs_aov"],
      },
      _persistenceScore: bestStreak >= 2 ? Math.min(1, bestStreak / 3) : Math.abs(growth || 0) >= 0.1 ? 0.35 : 0,
    }),
  );

  // Dedicated orders vs AOV card (same groupKey — ranking will merge)
  if (decomp.comparable && primary) {
    const orderChange = prior.orders ? (latest.orders - prior.orders) / prior.orders : null;
    const aovChange = prior.aov ? (latest.aov - prior.aov) / prior.aov : null;
    out.push(
      createInsight({
        id: `orders_aov_${prior.month}_${latest.month}`,
        type: INSIGHT_TYPES.ORDERS_VS_AOV,
        groupKey,
        metricBasis: METRIC_BASIS.GROSS_AOV,
        filters: filterContext(metrics),
        period: periodFromMonths(prior, latest, metrics),
        comparisonPeriod: {
          start: `${prior.month}-01`,
          end: monthParts(prior.month)?.end || null,
          label: monthLabel(prior.month),
        },
        headline: provisional
          ? `Observed-record driver: ${primary.label}`
          : `Largest mathematical driver: ${primary.label}`,
        summary: provisional
          ? `In available records, Orders moved ${formatPct(orderChange)}; Gross AOV moved ${formatPct(aovChange)} (not a verified full-month MoM).`
          : `Orders ${formatPct(orderChange)} vs prior-month Orders; Gross AOV ${formatPct(aovChange)} vs prior-month Gross AOV.`,
        shortWhy,
        what: provisional
          ? `Across available records from ${monthLabel(prior.month)} to ${monthLabel(latest.month)}, Orders moved ${formatPct(
              orderChange,
            )} (${prior.orders} → ${latest.orders}) and Gross AOV moved ${formatPct(aovChange)} (${formatInr(
              prior.aov,
            )} → ${formatInr(latest.aov)}). This describes observed records only.`
          : `From ${monthLabel(prior.month)} to ${monthLabel(latest.month)}, Orders moved ${formatPct(
              orderChange,
            )} vs prior-month Orders (${prior.orders} → ${latest.orders}) and Gross AOV moved ${formatPct(
              aovChange,
            )} vs prior-month Gross AOV (${formatInr(prior.aov)} → ${formatInr(latest.aov)}).`,
        why: {
          method: decomp.presentationMethod || decomp.method,
          drivers,
          reconciles: Boolean(decomp.presentationReconciles ?? decomp.reconciles),
          residual: decomp.presentationResidual ?? decomp.residual,
        },
        hypotheses: unverified(
          "Fewer paid orders may reflect traffic or conversion changes — not verified here.",
          "Basket-size change may reflect mix or pricing — not verified without SKU costs/prices.",
        ),
        whatNext: [
          {
            action: "Open monthly orders chart",
            question: "Is the decline caused by fewer orders or smaller baskets?",
            sectionId: "topline",
            chartId: "monthly-orders",
          },
        ],
        metrics: [
          metricRef("order_contribution", "Orders contribution (symmetric)", decomp.orderContribution, decomp.presentationMethod),
          metricRef("aov_contribution", "Gross AOV contribution (symmetric)", decomp.aovContribution, decomp.presentationMethod),
          metricRef("interaction_effect_audit", "Interaction (audit)", decomp.interactionEffect, decomp.method),
        ],
        materiality: materialityFromChange(
          decomp.deltaSales,
          provisional ? null : growth,
          gross,
          { comparisonBase: prior.sales },
        ),
        confidence: calcConfidence,
        confidenceFacets: {
          calculation: calcConfidence,
          coverage: coverageConfidence,
          reconciliation: "not_applicable",
          businessCause: "unverified_only",
        },
        evidenceQuality: provisional ? "provisional_symmetric_decomposition" : "symmetric_decomposition",
        comparisonStatus: coverageCompare.status,
        provisional,
        isRecentChange: !provisional,
        limitations: [
          "Founder view uses symmetric Orders/AOV contributions; three-term interaction is retained for audit only.",
          ...(coverageNote ? [coverageNote] : []),
        ],
        links: {
          sectionIds: ["topline"],
          chartIds: ["monthly-orders"],
          investigationHints: ["orders_vs_aov"],
        },
        _persistenceScore: bestStreak >= 2 ? Math.min(1, bestStreak / 3) : Math.abs(growth || 0) >= 0.1 ? 0.35 : 0,
      }),
    );
  }

  if (bestStreak >= 2 && bestEnd) {
    const absLatest = Math.abs(bestEnd.growth || 0);
    const streakPartial = isPartialMonth(bestEnd.month, period, dateRange);
    out.push(
      createInsight({
        id: `revenue_streak_${bestEnd.month}_${bestStreak}`,
        type: INSIGHT_TYPES.REVENUE_MOVEMENT,
        groupKey: `revenue_streak_${bestEnd.month}`,
        metricBasis: METRIC_BASIS.GROSS_PRODUCT_SALES,
        filters: filterContext(metrics),
        period: {
          start: metrics.period?.start || null,
          end: monthParts(bestEnd.month)?.end || null,
          label: `${bestStreak} consecutive months ending ${monthLabel(bestEnd.month)}`,
        },
        headline: streakPartial
          ? `${bestStreak} consecutive lower observed months ending ${monthLabel(bestEnd.month)} (incomplete)`
          : `${bestStreak} consecutive Gross Product Sales declines`,
        summary: streakPartial
          ? `Streak ends ${monthLabel(bestEnd.month)} with incomplete coverage — not a verified full-month MoM streak.`
          : `Streak ends ${monthLabel(bestEnd.month)} (latest MoM ${formatPct(bestEnd.growth)}).`,
        what: streakPartial
          ? `Observed Gross Product Sales were lower for ${bestStreak} consecutive months ending ${monthLabel(
              bestEnd.month,
            )} (incomplete coverage). Do not treat this as a verified full-month decline streak.`
          : `Gross Product Sales declined for ${bestStreak} consecutive months ending ${monthLabel(
              bestEnd.month,
            )} (latest MoM ${formatPct(bestEnd.growth)}). Zero-filled gap months are included when present in the densified series.`,
        why: {
          method: "consecutive_negative_mom",
          drivers: [
            {
              id: "persistence",
              label: streakPartial ? "Consecutive lower observed months" : "Consecutive negative MoM growth",
              amount: bestEnd.sales,
              shareOfChange: null,
              detail: `${bestStreak} months`,
            },
          ],
          reconciles: true,
          residual: 0,
        },
        hypotheses: unverified("A multi-month soft patch may reflect seasonality or supply — not verified."),
        whatNext: [
          {
            action: "Review monthly sales chart across the streak",
            question: "How did monthly sales and growth move in this period?",
            sectionId: "topline",
            chartId: "monthly-sales",
          },
        ],
        metrics: [
          metricRef("latest_mom", "Latest MoM", bestEnd.growth, "Densified monthly series"),
          metricRef("latest_sales", `${monthLabel(bestEnd.month)} Gross Product Sales`, bestEnd.sales, "Monthly aggregation"),
        ],
        materiality: materialityFromChange(null, streakPartial ? null : absLatest, gross),
        confidence: streakPartial ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH,
        evidenceQuality: "densified_monthly_series",
        provisional: streakPartial,
        comparisonStatus: streakPartial
          ? COMPARISON_STATUS.TRAILING_PARTIAL
          : COMPARISON_STATUS.COMPLETE_COMPARABLE,
        isRecentChange: !streakPartial,
        limitations: [
          "Zero-sales densified months interrupt growth maths differently from observed sparse months.",
          ...(streakPartial
            ? ["Ending month has incomplete coverage — streak is not a verified full-month MoM finding."]
            : []),
        ],
        links: {
          sectionIds: ["topline"],
          chartIds: ["monthly-sales"],
          investigationHints: ["consecutive_declines"],
        },
        _persistenceScore: Math.min(1, bestStreak / 3),
      }),
    );
  }

  return out;
}

/** Family 3: order-value skew */
function discoverOrderSkew(metrics) {
  const ov = metrics.kpis?.orderValues || metrics.sections?.topline?.orderValues;
  if (!ov || !ov.orderCount) return [];
  const gross = metrics.kpis?.grossProductSales || 0;
  const share = ov.salesShareAbove2xMedian;
  const material = Boolean(ov.skewMaterial) || (share != null && share >= 0.25);
  if (!material && !(ov.ordersAbove2xMedian > 0)) {
    return [
      createInsight({
        id: "order_skew_none",
        type: INSIGHT_TYPES.ORDER_VALUE_SKEW,
        groupKey: "order_skew",
        metricBasis: METRIC_BASIS.GROSS_AOV,
        filters: filterContext(metrics),
        period: {
          start: metrics.period?.start || null,
          end: metrics.period?.end || null,
          label: "Current filter scope",
        },
        headline: "No material large-order skew above 2× median",
        summary: `Median ${formatInr(ov.medianOrderValue)}; Gross AOV ${formatInr(ov.aov)}.`,
        what: `Median order value is ${formatInr(ov.medianOrderValue)} vs Gross AOV ${formatInr(
          ov.aov,
        )} on the same gross unique-order population. No orders exceed 2× the median in this scope.`,
        why: {
          method: "order_level_2x_median",
          drivers: [],
          reconciles: true,
          residual: 0,
        },
        hypotheses: [],
        whatNext: [
          {
            action: "Confirm median vs Gross AOV cards",
            question: "What is the median order value, and do large orders skew the average?",
            sectionId: "topline",
            chartId: "order-skew",
          },
        ],
        metrics: [
          metricRef("median", "Median Order Value", ov.medianOrderValue, "Gross unique order totals"),
          metricRef("gross_aov", "Gross AOV", ov.aov, "Gross product sales / gross orders"),
        ],
        materiality: { score: 0.05, absoluteChange: 0, relativeChange: 0, notes: "No 2× median orders" },
        confidence: CONFIDENCE.HIGH,
        evidenceQuality: "order_level_stats",
        limitations: [],
        links: { sectionIds: ["topline"], chartIds: ["order-skew"], investigationHints: ["median_skew"] },
        _persistenceScore: 0,
      }),
    ];
  }

  return [
    createInsight({
      id: "order_skew_2x",
      type: INSIGHT_TYPES.ORDER_VALUE_SKEW,
      groupKey: "order_skew",
      metricBasis: METRIC_BASIS.GROSS_AOV,
      filters: filterContext(metrics),
      period: {
        start: metrics.period?.start || null,
        end: metrics.period?.end || null,
        label: "Current filter scope",
      },
      headline: material
        ? "Large orders materially skew Gross AOV"
        : "Some orders sit above 2× median",
      summary: `${ov.ordersAbove2xMedian} order(s) above 2× median = ${formatPct(share)} of Gross Product Sales.`,
      what: `Median order value is ${formatInr(ov.medianOrderValue)} vs Gross AOV ${formatInr(
        ov.aov,
      )}. ${ov.ordersAbove2xMedian} order(s) above 2× median contribute ${formatInr(
        ov.salesAbove2xMedian,
      )} (${formatPct(share)} of Gross Product Sales).`,
      why: {
        method: "order_level_2x_median",
        drivers: [
          {
            id: "sales_above_2x",
            label: "Sales in orders above 2× median",
            amount: ov.salesAbove2xMedian,
            shareOfChange: share,
            detail: `${ov.ordersAbove2xMedian} orders`,
          },
        ],
        reconciles: true,
        residual: 0,
      },
      hypotheses: unverified(
        "Large tickets may be bulk or B2B-like purchases — classification not verified in the Amazon export.",
      ),
      whatNext: [
        {
          action: "Review bulk-order candidates",
          question: "What is the median order value, and do large orders skew the average?",
          sectionId: "topline",
          chartId: "order-skew",
        },
      ],
      metrics: [
        metricRef("median", "Median Order Value", ov.medianOrderValue, "Gross unique order totals"),
        metricRef("gross_aov", "Gross AOV", ov.aov, "Gross product sales / gross orders"),
        metricRef("orders_above_2x", "Orders above 2× median", ov.ordersAbove2xMedian, "Order-level stats"),
        metricRef("sales_above_2x", "Sales above 2× median", ov.salesAbove2xMedian, "Order-level stats"),
        metricRef("share_above_2x", "Sales share above 2× median", share, "Order-level stats"),
      ],
      materiality: materialityFromChange(ov.salesAbove2xMedian, share, gross),
      confidence: CONFIDENCE.HIGH,
      evidenceQuality: "order_level_stats",
      limitations: ["Skew uses Gross Product Sales order totals — not Net Product Sales."],
      links: { sectionIds: ["topline"], chartIds: ["order-skew"], investigationHints: ["median_skew"] },
      _persistenceScore: 0,
    }),
  ];
}

/** Family 4: product concentration + product-level movement */
function discoverProduct(metrics) {
  const products = metrics.sections?.product_performance?.products || [];
  const productMonthly = metrics.sections?.product_performance?.productMonthly || [];
  const gross = metrics.kpis?.grossProductSales || 0;
  const period = metrics.period;
  const dateRange = metrics.filters?.dateRange;
  const out = [];
  if (!products.length) return out;

  const eligibleCount = products.length;
  const top = products[0];
  const top1Share = top.revenueShare;
  const top3Sales = products.slice(0, 3).reduce((sum, row) => sum + (row.sales || 0), 0);
  const top3Share = ratio(top3Sales, gross);

  // Suppress top-eight concentration when assortment has ≤8 eligible products.
  if (eligibleCount > 8) {
    const concentration = metrics.kpis?.top8Concentration;
    out.push(
      createInsight({
        id: "product_concentration_top8",
        type: INSIGHT_TYPES.PRODUCT_CONCENTRATION,
        groupKey: "product_concentration",
        metricBasis: METRIC_BASIS.GROSS_PRODUCT_SALES,
        filters: filterContext(metrics),
        period: {
          start: metrics.period?.start || null,
          end: metrics.period?.end || null,
          label: "Current filter scope",
        },
        headline:
          concentration != null && concentration >= 0.8
            ? `High product concentration — top eight hold ${formatPct(concentration)} of Gross Product Sales`
            : `Top product ${top.productName} holds ${formatPct(top1Share)} of Gross Product Sales`,
        summary: `${top.productName} leads at ${formatInr(top.sales)}; top-eight share ${formatPct(concentration)} of Gross Product Sales.`,
        shortWhy: `Top-eight revenue share ${formatPct(concentration)} of Gross Product Sales (not a MoM change).`,
        what: `${top.productName} leads with ${formatInr(top.sales)} (${formatPct(
          top1Share,
        )} of Gross Product Sales). Top-eight products account for ${formatPct(
          concentration,
        )} of Gross Product Sales (revenue share of total Gross Product Sales — not a period change %, not profit).`,
        why: {
          method: "product_revenue_share",
          drivers: [
            {
              id: "top_product",
              label: top.productName,
              amount: top.sales,
              shareOfChange: top1Share,
              detail: "Share of Gross Product Sales (level, not Δ)",
            },
          ],
          reconciles: true,
          residual: 0,
        },
        hypotheses: unverified(
          "Concentration may reflect assortment strategy or stockouts of other SKUs — not verified.",
        ),
        whatNext: [
          {
            action: "Open product mix",
            question: "Is my revenue too concentrated?",
            sectionId: "product_performance",
            chartId: "concentration",
          },
        ],
        metrics: [
          metricRef("top8_share", "Top-eight share of Gross Product Sales", concentration, "Product ranking"),
          metricRef("top_product_sales", top.productName, top.sales, "Product Gross Product Sales"),
          metricRef("top_product_share", `${top.productName} share of Gross Product Sales`, top1Share, "Product ranking"),
          metricRef("eligible_sku_count", "Eligible products in scope", eligibleCount, "Product ranking"),
        ],
        materiality: materialityFromChange(top.sales, concentration, gross),
        confidence: CONFIDENCE.HIGH,
        confidenceFacets: {
          calculation: CONFIDENCE.HIGH,
          coverage: CONFIDENCE.HIGH,
          reconciliation: "not_applicable",
          businessCause: "unverified_only",
        },
        evidenceQuality: "product_aggregation",
        isStableObservation: true,
        isRecentChange: false,
        limitations: ["Shares are Gross Product Sales levels — not contribution after fees or COGS."],
        links: {
          sectionIds: ["product_performance", "topline"],
          chartIds: ["product-mix", "concentration"],
          investigationHints: ["concentration"],
        },
        _persistenceScore: 0.15,
      }),
    );
  } else {
    // Small assortment: top-one / top-three alternatives only.
    out.push(
      createInsight({
        id: "product_concentration_small_assortment",
        type: INSIGHT_TYPES.PRODUCT_CONCENTRATION,
        groupKey: "product_concentration",
        metricBasis: METRIC_BASIS.GROSS_PRODUCT_SALES,
        filters: filterContext(metrics),
        period: {
          start: metrics.period?.start || null,
          end: metrics.period?.end || null,
          label: "Current filter scope",
        },
        headline: `Small assortment (${eligibleCount} products) — leader holds ${formatPct(top1Share)} of Gross Product Sales`,
        summary: `Top product ${top.productName} ${formatInr(top.sales)}; top-three ${formatPct(top3Share)} of Gross Product Sales. Top-eight concentration suppressed.`,
        shortWhy: `Top-1 share ${formatPct(top1Share)} / top-3 share ${formatPct(top3Share)} of Gross Product Sales (≤8 SKUs — top-eight metric not used).`,
        what: `Assortment has ${eligibleCount} eligible product(s) in the current filter, so top-eight concentration is not meaningful. ${top.productName} holds ${formatPct(
          top1Share,
        )} of Gross Product Sales; top-three products hold ${formatPct(
          top3Share,
        )} of Gross Product Sales (revenue share of total Gross Product Sales — not a MoM change).`,
        why: {
          method: "small_assortment_top1_top3_share",
          drivers: [
            {
              id: "top1",
              label: top.productName,
              amount: top.sales,
              shareOfChange: top1Share,
              detail: "Top-1 share of Gross Product Sales",
            },
            {
              id: "top3",
              label: "Top-three products",
              amount: roundMoney(top3Sales),
              shareOfChange: top3Share,
              detail: "Top-3 share of Gross Product Sales",
            },
          ],
          reconciles: true,
          residual: 0,
        },
        hypotheses: unverified("Whether concentration is intentional cannot be verified from this export."),
        whatNext: [
          {
            action: "Review product mix for the small assortment",
            question: "Which products drive most of my revenue?",
            sectionId: "product_performance",
            chartId: "product-mix",
          },
        ],
        metrics: [
          metricRef("eligible_sku_count", "Eligible products in scope", eligibleCount, "Product ranking"),
          metricRef("top1_share", "Top-1 share of Gross Product Sales", top1Share, "Product ranking"),
          metricRef("top3_share", "Top-3 share of Gross Product Sales", top3Share, "Product ranking"),
        ],
        materiality: materialityFromChange(top.sales, top1Share, gross),
        confidence: CONFIDENCE.HIGH,
        confidenceFacets: {
          calculation: CONFIDENCE.HIGH,
          coverage: CONFIDENCE.HIGH,
          reconciliation: "not_applicable",
          businessCause: "unverified_only",
        },
        evidenceQuality: "small_assortment_shares",
        isStableObservation: true,
        isRecentChange: false,
        limitations: ["Top-eight concentration suppressed because eligible SKUs ≤ 8."],
        links: {
          sectionIds: ["product_performance"],
          chartIds: ["product-mix"],
          investigationHints: ["concentration"],
        },
        _persistenceScore: 0.1,
      }),
    );
  }

  // Largest absolute product MoM move among productMonthly series
  let bestMove = null;
  for (const series of productMonthly) {
    const months = series.months || series.monthly || [];
    if (months.length < 2) continue;
    const a = months[months.length - 2];
    const b = months[months.length - 1];
    const aSales = a.sales ?? a.grossProductSales;
    const bSales = b.sales ?? b.grossProductSales;
    if (aSales == null || bSales == null) continue;
    const delta = roundMoney(bSales - aSales);
    const priorYm = String(a.month || a.period || "").slice(0, 7);
    const currentYm = String(b.month || b.period || "").slice(0, 7);
    const coverageCompare = compareMonthCoverage(priorYm, currentYm, period, dateRange);
    const incomplete = Boolean(coverageCompare.provisional);
    if (!bestMove || Math.abs(delta) > Math.abs(bestMove.delta)) {
      bestMove = {
        productName: series.productName || series.name,
        prior: aSales,
        current: bSales,
        delta,
        priorMonth: priorYm,
        currentMonth: currentYm,
        incomplete,
        coverageCompare,
        monthPoints: months.length,
      };
    }
  }
  if (bestMove && Math.abs(bestMove.delta) >= 1) {
    const pctVsPriorProduct =
      bestMove.prior > 0 ? ratio(bestMove.delta, bestMove.prior) : null;
    const pctVsGross = ratio(bestMove.delta, gross);
    const zeroRecorded = bestMove.current === 0 && bestMove.prior > 0;
    const headline = zeroRecorded
      ? `${bestMove.productName}: zero recorded sales in ${monthLabel(bestMove.currentMonth)} (not confirmed demand loss)`
      : `${bestMove.productName}: largest tracked product sales move`;
    const what = zeroRecorded
      ? `Among top products with a monthly series, ${bestMove.productName} moved from ${formatInr(
          bestMove.prior,
        )} in ${monthLabel(bestMove.priorMonth)} to ${formatInr(
          bestMove.current,
        )} in ${monthLabel(bestMove.currentMonth)} (Δ ${formatInr(
          bestMove.delta,
        )}). Zero recorded Gross Product Sales in the later month is not the same as a confirmed product demand decline — coverage may be incomplete or the SKU may simply have no rows in this export window.`
      : `Among top products with a monthly series, ${bestMove.productName} shows the largest absolute Gross Product Sales move: ${formatInr(
          bestMove.prior,
        )} to ${formatInr(bestMove.current)} (Δ ${formatInr(bestMove.delta)}).`;

    out.push(
      createInsight({
        id: `product_move_${String(bestMove.productName).slice(0, 40)}`,
        type: INSIGHT_TYPES.PRODUCT_CONCENTRATION,
        groupKey: `product_move_${bestMove.productName}`,
        metricBasis: METRIC_BASIS.GROSS_PRODUCT_SALES,
        filters: filterContext(metrics),
        period: {
          start: bestMove.priorMonth ? `${bestMove.priorMonth}-01` : null,
          end: bestMove.currentMonth ? monthParts(bestMove.currentMonth)?.end : null,
          label: `${monthLabel(bestMove.priorMonth)} → ${monthLabel(bestMove.currentMonth)}`,
        },
        headline,
        summary: `${formatInr(bestMove.prior)} → ${formatInr(bestMove.current)} (Δ ${formatInr(bestMove.delta)}). ${
          pctVsPriorProduct != null
            ? `${formatPct(pctVsPriorProduct)} vs this product’s prior-month Gross Product Sales`
            : "MoM % vs prior product sales unavailable (prior was zero)."
        }.`,
        shortWhy: zeroRecorded
          ? `Zero recorded sales in ${monthLabel(bestMove.currentMonth)}; Δ ${formatInr(bestMove.delta)} vs prior product month — not labelled as confirmed demand decline.`
          : `Δ ${formatInr(bestMove.delta)} (${formatPct(pctVsPriorProduct)} vs this product’s prior-month Gross Product Sales; ${formatPct(pctVsGross)} of total Gross Product Sales).`,
        what,
        why: {
          method: "product_monthly_delta",
          drivers: [
            {
              id: "product_delta",
              label: bestMove.productName,
              amount: bestMove.delta,
              shareOfChange: pctVsPriorProduct,
              detail:
                pctVsPriorProduct != null
                  ? `Δ ÷ this product’s prior-month Gross Product Sales = ${formatPct(pctVsPriorProduct)}; Δ ÷ total Gross Product Sales = ${formatPct(pctVsGross)}`
                  : `Prior-month product sales were zero — MoM % undefined; Δ ÷ total Gross Product Sales = ${formatPct(pctVsGross)}`,
            },
          ],
          reconciles: true,
          residual: 0,
        },
        hypotheses: unverified(
          zeroRecorded
            ? "Zero recorded rows may reflect stockouts, delisting, or incomplete monthly coverage — not verified as demand decline."
            : "SKU-level demand or availability may explain the move — not verified.",
        ),
        whatNext: [
          {
            action: "Filter dashboard to this product",
            question: "Which products are growing or declining?",
            sectionId: "product_performance",
            chartId: "product-mix",
          },
        ],
        metrics: [
          metricRef("product_prior", "Prior-month product Gross Product Sales", bestMove.prior, "Product monthly"),
          metricRef("product_current", "Later-month product Gross Product Sales", bestMove.current, "Product monthly"),
          metricRef("product_delta", "Δ product Gross Product Sales", bestMove.delta, "Product monthly"),
          metricRef(
            "pct_vs_prior_product",
            "% change vs this product’s prior-month Gross Product Sales",
            pctVsPriorProduct,
            "Δ / prior product month",
          ),
          metricRef(
            "pct_vs_total_gross",
            "Δ as share of total Gross Product Sales",
            pctVsGross,
            "Δ / total Gross Product Sales",
          ),
        ],
        materiality: materialityFromChange(bestMove.delta, pctVsPriorProduct, gross, {
          comparisonBase: bestMove.prior > 0 ? bestMove.prior : gross,
        }),
        confidence: bestMove.incomplete ? CONFIDENCE.LOW : CONFIDENCE.MEDIUM,
        confidenceFacets: {
          calculation: CONFIDENCE.HIGH,
          coverage: bestMove.incomplete ? "incomplete" : CONFIDENCE.MEDIUM,
          reconciliation: "not_applicable",
          businessCause: "unverified_only",
        },
        evidenceQuality: bestMove.incomplete ? "incomplete_monthly_coverage" : "top_product_monthly_only",
        comparisonStatus: bestMove.coverageCompare?.status || COMPARISON_STATUS.NOT_APPLICABLE,
        provisional: Boolean(bestMove.incomplete),
        isRecentChange: true,
        isStableObservation: false,
        limitations: [
          "Product monthly series covers top products only — other SKUs may have moved more.",
          ...(founderComparisonNote(bestMove.coverageCompare)
            ? [founderComparisonNote(bestMove.coverageCompare)]
            : []),
          ...(bestMove.incomplete
            ? ["One or both compared months are partial under the current date filter — movement is qualified."]
            : []),
          ...(zeroRecorded
            ? ["Zero recorded sales ≠ confirmed demand decline."]
            : []),
        ],
        links: {
          sectionIds: ["product_performance"],
          chartIds: ["product-mix"],
          investigationHints: ["product_movement"],
        },
        _persistenceScore: 0,
      }),
    );
  }

  return out;
}

/** Family 5: marketplace fee burden */
function discoverFees(metrics) {
  const economics = metrics.sections?.amazon_economics || {};
  const drains = economics.marketplaceFeeDrains || [];
  const rate = metrics.kpis?.effectiveMarketplaceDeductionRate;
  const gross = metrics.kpis?.grossProductSales || 0;
  const promo = metrics.kpis?.promotionalRebates;
  if (!drains.length && rate == null) return [];

  const ranked = [...drains].filter((row) => row.amount < 0).sort((a, b) => a.amount - b.amount);
  const top = ranked[0];
  const feeAbs = roundMoney(ranked.reduce((sum, row) => sum + Math.abs(row.amount || 0), 0));

  return [
    createInsight({
      id: "fee_burden_marketplace",
      type: INSIGHT_TYPES.FEE_BURDEN,
      groupKey: "fee_burden",
      metricBasis: METRIC_BASIS.MARKETPLACE_FEES,
      filters: filterContext(metrics),
      period: {
        start: metrics.period?.start || null,
        end: metrics.period?.end || null,
        label: "Current filter scope",
      },
      headline: top
        ? `Marketplace fees led by ${top.label} (${formatInr(top.amount)})`
        : `Marketplace deduction rate ${formatPct(rate)}`,
      summary: `Effective marketplace deduction rate ${formatPct(rate)} of Gross Product Sales.`,
      what: `Classified Amazon marketplace fee drains total ${formatInr(
        feeAbs != null ? -feeAbs : null,
      )} against Gross Product Sales ${formatInr(gross)} (rate ${formatPct(
        rate,
      )}). Denominator is Gross Product Sales; customer product refunds and promotional rebates are excluded from this rate.${
        top ? ` Largest drain: ${top.label} at ${formatInr(top.amount)}.` : ""
      }`,
      why: {
        method: "marketplace_fee_drains_over_gross_sales",
        drivers: ranked.slice(0, 4).map((row) => ({
          id: row.id,
          label: row.label,
          amount: row.amount,
          shareOfChange: ratio(Math.abs(row.amount || 0), feeAbs || 0),
          detail: "Classified marketplace fee drain",
        })),
        reconciles: true,
        residual: 0,
      },
      hypotheses: unverified(
        "Fee pressure may reflect category mix or fulfilment choices — not verified beyond labelled CSV lines.",
      ),
      whatNext: [
        {
          action: "Open Amazon Economics fee chart",
          question: "Where is Amazon taking the money?",
          sectionId: "amazon_economics",
          chartId: "fee-breakdown",
        },
        {
          action: "Confirm advertising spend",
          question: "How much is being spent on advertising?",
          sectionId: "amazon_economics",
          chartId: "fee-breakdown",
        },
      ],
      metrics: [
        metricRef("fee_rate", "Effective marketplace deduction rate", rate, "Fees ÷ Gross Product Sales"),
        metricRef("promo", "Promotional rebates (not in fee rate)", promo, "Settlement adjustment"),
        ...ranked.slice(0, 4).map((row) => metricRef(row.id, row.label, row.amount, "Marketplace fee drain")),
      ],
      materiality: materialityFromChange(feeAbs, rate, gross),
      confidence: CONFIDENCE.HIGH,
      evidenceQuality: "classified_fee_lines",
      limitations: [
        "Amazon selling fees in the CSV are an aggregate — not proven referral-only.",
        "Promotional rebates are settlement adjustments, not marketplace fees.",
      ],
      links: {
        sectionIds: ["amazon_economics"],
        chartIds: ["fee-breakdown"],
        investigationHints: ["fee_burden"],
      },
      _persistenceScore: rate != null && rate >= 0.2 ? 0.3 : 0,
    }),
  ];
}

/** Family 6: refunds, reconciliation exceptions, missing information */
function discoverRefundsAndRecon(metrics, reconciliation) {
  const kpis = metrics.kpis || {};
  const gross = kpis.grossProductSales || 0;
  const out = [];

  if (kpis.refundAmountAbs > 0) {
    out.push(
      createInsight({
        id: "refunds_topline",
        type: INSIGHT_TYPES.REFUNDS_RECON_GAPS,
        groupKey: "refunds",
        metricBasis: METRIC_BASIS.REFUNDS,
        filters: filterContext(metrics),
        period: {
          start: metrics.period?.start || null,
          end: metrics.period?.end || null,
          label: "Current filter scope",
        },
        headline: `Customer product refunds ${formatInr(kpis.refundAmountAbs)} reduce Net Product Sales`,
        summary: `Gross ${formatInr(kpis.grossProductSales)} → Net ${formatInr(kpis.netProductSales)}.`,
        what: `Refund amount ${formatInr(
          kpis.refundAmountAbs,
        )} is absolute product charges on Refund rows. Net Product Sales ${formatInr(
          kpis.netProductSales,
        )} = Gross Product Sales − refund amount. ${
          kpis.canSubtractFullRefunds
            ? `Net orders ${kpis.netOrderCount} after ${kpis.fullRefundOrderCount} verified full-order refund(s).`
            : `Orders affected by refunds: ${kpis.ordersAffectedByRefunds ?? kpis.refundedOrderCount}; net orders not subtracted because refunds are not all verified full-order reversals.`
        } Refunds are Topline sales reductions — not Amazon Economics fee drains.`,
        why: {
          method: "refund_product_charges",
          drivers: [
            {
              id: "refund_amount",
              label: "Refund amount",
              amount: -(kpis.refundAmountAbs || 0),
              shareOfChange: ratio(kpis.refundAmountAbs, kpis.grossProductSales),
              detail: "Abs. product charges on Refund rows",
            },
          ],
          reconciles: true,
          residual: 0,
        },
        hypotheses: unverified("Return reasons are not present in this Amazon transaction export."),
        whatNext: [
          {
            action: "Review Topline refund metrics",
            question: "What are gross versus net product sales after refunds?",
            sectionId: "topline",
            chartId: null,
          },
        ],
        metrics: [
          metricRef("gross", "Gross Product Sales", kpis.grossProductSales, "Order Payment product charges"),
          metricRef("refunds", "Refund amount", kpis.refundAmountAbs, "Abs. Refund product charges"),
          metricRef("net", "Net Product Sales", kpis.netProductSales, "Gross − refund amount"),
          metricRef("refunded_orders", "Refunded / affected orders", kpis.ordersAffectedByRefunds ?? kpis.refundedOrderCount, "Refund analysis"),
        ],
        materiality: materialityFromChange(kpis.refundAmountAbs, ratio(kpis.refundAmountAbs, gross), gross),
        confidence: CONFIDENCE.HIGH,
        evidenceQuality: "refund_row_classification",
        limitations: [],
        links: {
          sectionIds: ["topline", "amazon_economics"],
          chartIds: [],
          investigationHints: ["refunds"],
        },
        _persistenceScore: 0,
      }),
    );
  }

  const comparisons = reconciliation?.comparisons || [];
  const diffs = comparisons.filter((row) => row.status === "difference");
  const missing = comparisons.filter(
    (row) => row.status === "missing_information" || row.status === "not_comparable",
  );

  if (diffs.length) {
    const largest = [...diffs].sort(
      (a, b) => Math.abs(b.difference || 0) - Math.abs(a.difference || 0),
    )[0];
    out.push(
      createInsight({
        id: `recon_diff_${largest.id}`,
        type: INSIGHT_TYPES.REFUNDS_RECON_GAPS,
        groupKey: "recon_exceptions",
        metricBasis: METRIC_BASIS.RECONCILIATION,
        filters: filterContext(metrics),
        period: {
          start: metrics.period?.start || null,
          end: metrics.period?.end || null,
          label: "Current filter scope",
        },
        headline: `${diffs.length} unresolved reconciliation difference(s)`,
        summary: `Largest: ${largest.id} (Δ ${formatInr(largest.difference)}).`,
        what: `${diffs.length} confirmed comparable reconciliation difference(s) remain unresolved. Largest labelled ${
          largest.id
        } with Δ ${formatInr(largest.difference)}. Differences are disclosed — not auto-forced to match.`,
        why: {
          method: "pdf_csv_comparable_difference",
          drivers: diffs.slice(0, 4).map((row) => ({
            id: row.id,
            label: row.id,
            amount: row.difference,
            shareOfChange: null,
            detail: row.explanation || "Comparable line difference",
          })),
          reconciles: false,
          residual: largest.difference,
        },
        hypotheses: unverified(
          "PDF taxonomy may group lines differently from CSV classifications — investigate before adjusting books.",
        ),
        whatNext: [
          {
            action: "Open Profitability PDF reconciliation",
            question: "Why are sales and settlement proceeds different?",
            sectionId: "profitability",
            chartId: "waterfall",
          },
        ],
        metrics: diffs.slice(0, 6).map((row) =>
          metricRef(`recon_${row.id}`, row.id, row.difference, "Settlement reconciliation"),
        ),
        materiality: materialityFromChange(largest.difference, ratio(Math.abs(largest.difference || 0), gross), gross),
        confidence: CONFIDENCE.HIGH,
        evidenceQuality: "comparable_recon_lines",
        limitations: ["Unresolved differences are retained intentionally."],
        links: {
          sectionIds: ["profitability"],
          chartIds: ["waterfall"],
          investigationHints: ["reconciliation"],
        },
        _persistenceScore: 0.2,
      }),
    );
  }

  if (missing.length && !diffs.length) {
    out.push(
      createInsight({
        id: "recon_missing_info",
        type: INSIGHT_TYPES.REFUNDS_RECON_GAPS,
        groupKey: "recon_missing",
        metricBasis: METRIC_BASIS.RECONCILIATION,
        filters: filterContext(metrics),
        period: {
          start: metrics.period?.start || null,
          end: metrics.period?.end || null,
          label: "Current filter scope",
        },
        headline: "Settlement checks include missing or non-comparable lines",
        summary: `${missing.length} PDF/CSV check(s) are missing_information or not_comparable.`,
        what: `${missing.length} reconciliation check(s) are disclosed as missing information or not comparable (for example GST, bank transfers, or PDF Income vs CSV Net Product Sales). Product profit remains unavailable without COGS.`,
        why: {
          method: "recon_status_disclosure",
          drivers: [],
          reconciles: true,
          residual: 0,
        },
        hypotheses: [],
        whatNext: [
          {
            action: "Review missing-information rows",
            question: "Which financial information is missing?",
            sectionId: "profitability",
            chartId: "waterfall",
          },
        ],
        metrics: missing.slice(0, 5).map((row) =>
          metricRef(`recon_${row.id}`, row.id, row.pdfValue ?? row.txValue ?? null, row.status),
        ),
        materiality: { score: 0.25, absoluteChange: null, relativeChange: null, notes: "Disclosure quality" },
        confidence: CONFIDENCE.MEDIUM,
        evidenceQuality: "recon_status_flags",
        limitations: ["Missing information is not treated as zero."],
        links: {
          sectionIds: ["profitability"],
          chartIds: ["waterfall"],
          investigationHints: ["missing_information"],
        },
        _persistenceScore: 0,
      }),
    );
  }

  if (kpis.productProfit == null) {
    // Always surface COGS gap lightly when no other recon card; attach as limitation-heavy low materiality if alone
    if (!out.some((i) => i.groupKey.startsWith("recon"))) {
      out.push(
        createInsight({
          id: "missing_cogs",
          type: INSIGHT_TYPES.REFUNDS_RECON_GAPS,
          groupKey: "missing_cogs",
          metricBasis: METRIC_BASIS.RECONCILIATION,
          filters: filterContext(metrics),
          period: {
            start: metrics.period?.start || null,
            end: metrics.period?.end || null,
            label: "Current filter scope",
          },
          headline: "Product profit unavailable — COGS not in these exports",
          summary: "Settlement movement is not profit.",
          what: "Product profit cannot be calculated from the Amazon transaction CSV / Unified Summary alone because actual product costs (COGS) are missing.",
          why: {
            method: "missing_cogs",
            drivers: [],
            reconciles: true,
            residual: 0,
          },
          hypotheses: [],
          whatNext: [
            {
              action: "Confirm profitability limitations",
              question: "Can we calculate actual profitability?",
              sectionId: "profitability",
              chartId: null,
            },
          ],
          metrics: [
            metricRef("product_profit", "Product profit", null, "Requires COGS"),
            metricRef("settlement", "Amazon settlement movement", kpis.netSettlementMovement, "CSV Total (INR)"),
          ],
          materiality: { score: 0.2, absoluteChange: null, relativeChange: null, notes: "Missing information" },
          confidence: CONFIDENCE.HIGH,
          evidenceQuality: "schema_limitation",
          limitations: ["Do not treat settlement movement as profit."],
          links: {
            sectionIds: ["profitability"],
            chartIds: [],
            investigationHints: ["cogs"],
          },
          _persistenceScore: 0,
        }),
      );
    }
  }

  return out;
}

/**
 * Run all discovery families against calculated metrics (+ optional reconciliation).
 */
export function discoverInsights(metrics, reconciliation = null) {
  if (!metrics || metrics.status !== "calculated") return [];
  return [
    ...discoverRevenueAndOrders(metrics),
    ...discoverOrderSkew(metrics),
    ...discoverProduct(metrics),
    ...discoverFees(metrics),
    ...discoverRefundsAndRecon(metrics, reconciliation),
  ];
}
