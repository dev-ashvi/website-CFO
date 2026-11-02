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

function monthLabel(ym) {
  return formatMonthLabel(ym) || ym || "";
}

/** "September 2026" → "September" for short headlines. */
function monthNameOnly(ym) {
  return String(monthLabel(ym) || "").replace(/\s+20\d{2}$/, "") || monthLabel(ym) || "";
}

/** Founder-facing absolute percent, e.g. 0.17 → "17%", 0.527 → "52.7%". */
function formatFounderPct(ratioValue) {
  if (ratioValue == null || !Number.isFinite(ratioValue)) return null;
  const pct = Math.abs(ratioValue) * 100;
  const rounded = Math.round(pct);
  if (Math.abs(pct - rounded) < 0.05) return `${rounded}%`;
  return `${pct.toFixed(1)}%`;
}

/** Whole-rupee founder display; evidence keeps full precision via formatInr. */
function formatFounderInr(value) {
  return formatInr(value, { digits: 0 });
}

function pluralize(count, singular, plural = `${singular}s`) {
  return Math.abs(Number(count) || 0) === 1 ? singular : plural;
}

function countNoun(count, singular, plural = `${singular}s`) {
  const n = Number(count) || 0;
  return `${n} ${pluralize(n, singular, plural)}`;
}

/** Soft share phrasing when a simple fraction reads better than a percent. */
function founderSharePhrase(share) {
  if (share == null || !Number.isFinite(share)) return null;
  const pct = Math.abs(share) * 100;
  if (pct >= 30 && pct < 36) return "nearly a third";
  if (pct >= 45 && pct < 55) return "about half";
  if (pct >= 23 && pct < 28) return "about a quarter";
  return formatFounderPct(share);
}

/** ISO date → "29 August" for founder cards; keep ISO in limitations. */
function formatHumanDayMonth(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return null;
  const day = Number(String(iso).slice(8, 10));
  const month = monthNameOnly(String(iso).slice(0, 7));
  if (!day || !month) return null;
  return `${day} ${month}`;
}

/**
 * Founder-facing incomplete-period body — human dates, no ISO tokens.
 * Technical coverage strings remain in limitations via founderComparisonNote.
 */
function founderProvisionalSalesSummary(coverageCompare, latestYm) {
  const month = monthNameOnly(latestYm);
  const endHuman = formatHumanDayMonth(coverageCompare?.current?.coveredEnd);
  if (coverageCompare?.status === COMPARISON_STATUS.TRAILING_PARTIAL && endHuman) {
    return `Your ${month} data is available only through ${endHuman}. Compare complete months before drawing conclusions about sales growth or decline.`;
  }
  if (coverageCompare?.status === COMPARISON_STATUS.MATCHED_PARTIAL) {
    const days = coverageCompare.prior?.coveredDays;
    return days
      ? `Both months use a matching ${days}-day window, not full months. Compare complete months before drawing conclusions about sales growth or decline.`
      : `These months use matching partial windows, not full months. Compare complete months before drawing conclusions about sales growth or decline.`;
  }
  if (coverageCompare?.status === COMPARISON_STATUS.INCOMPATIBLE) {
    return `These months don't cover the same date ranges. Compare complete months before drawing conclusions about sales growth or decline.`;
  }
  return `Your ${month} data isn't a complete month yet. Compare complete months before drawing conclusions about sales growth or decline.`;
}

function founderLargeOrderExplanation(ov, share) {
  const n = ov.ordersAbove2xMedian || 0;
  const sales = formatFounderInr(ov.salesAbove2xMedian);
  const typical = formatFounderInr(ov.medianOrderValue);
  const aov = formatFounderInr(ov.aov);
  const sharePhrase = founderSharePhrase(share);
  const sharePct = formatFounderPct(share);
  const typicalLine = `Your typical order was ${typical}, compared with an average of ${aov}.`;

  if (n === 1) {
    const impact =
      sharePhrase && !String(sharePhrase).includes("%")
        ? `generated ${sharePhrase} of your sales`
        : `generated ${sharePct || "a material share"} of your sales`;
    return `Just one order worth ${sales} ${impact}. ${typicalLine}`;
  }

  const salesClause =
    sharePct != null
      ? `${countNoun(n, "large order")} contributed ${sales} to your sales (${sharePct} of sales before refunds).`
      : `${countNoun(n, "large order")} contributed ${sales} to your sales.`;
  return `${salesClause} ${typicalLine}`;
}

function countWord(n) {
  const words = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight" };
  return words[n] || String(n);
}

function contributionLead(id, amount) {
  if (id === "orders") {
    if (amount < 0) return "Fewer orders";
    if (amount > 0) return "More orders";
    return "Orders";
  }
  if (amount < 0) return "Lower average order value";
  if (amount > 0) return "Higher average order value";
  return "Average order value";
}

/**
 * Founder-facing Orders/AOV split from verified symmetric decomposition.
 * Labels mathematical contributions only — never business causes.
 */
function founderDriverSummary(decomp, primaryDriver, { provisional = false } = {}) {
  if (!decomp?.comparable || decomp.orderContribution == null || decomp.aovContribution == null) {
    return "";
  }
  const orderShare = ratio(decomp.orderContribution, decomp.deltaSales);
  const aovShare = ratio(decomp.aovContribution, decomp.deltaSales);
  if (orderShare == null || aovShare == null) return "";
  const orderPct = formatFounderPct(orderShare);
  const aovPct = formatFounderPct(aovShare);
  const orderLead = contributionLead("orders", decomp.orderContribution);
  const aovLead = contributionLead("gross_aov", decomp.aovContribution);
  const fell = decomp.deltaSales != null && decomp.deltaSales < 0;
  const rose = decomp.deltaSales != null && decomp.deltaSales > 0;
  const outcome = fell ? "decline" : rose ? "increase" : "change";
  const aovLed = Math.abs(aovShare) >= Math.abs(orderShare);

  if (provisional) {
    return aovLed
      ? `${aovLead} accounted for ${aovPct} of the difference in available records, while ${orderLead.toLowerCase()} accounted for ${orderPct}. Not a verified full-month comparison.`
      : `${orderLead} accounted for ${orderPct} of the difference in available records, while ${aovLead.toLowerCase()} accounted for ${aovPct}. Not a verified full-month comparison.`;
  }

  return aovLed
    ? `${aovLead} accounted for ${aovPct} of the ${outcome}, while ${orderLead.toLowerCase()} accounted for ${orderPct}.`
    : `${orderLead} accounted for ${orderPct} of the ${outcome}, while ${aovLead.toLowerCase()} accounted for ${aovPct}.`;
}

function founderDriverInvestigation(decomp, primaryDriver, latestYm) {
  const month = monthNameOnly(latestYm);
  if (!decomp?.comparable || !primaryDriver) {
    return `What changed in your ${month} sales?`;
  }
  const fell = decomp.deltaSales != null && decomp.deltaSales < 0;
  if (primaryDriver.id === "gross_aov") {
    return fell
      ? `Why did customers place smaller-value orders in ${month}?`
      : `Why did average order value rise in ${month}?`;
  }
  return fell
    ? `Why were there fewer orders in ${month}?`
    : `Why were there more orders in ${month}?`;
}

const SALES_BEFORE_REFUNDS = "Sales before refunds";

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
          headline: `${monthNameOnly(only.month)} sales were ${formatInr(only.sales)}`,
          summary: `${SALES_BEFORE_REFUNDS}${partial ? " · partial month in the current filter" : ""}. Month-over-month comparison needs a second month.`,
          what: `Sales were ${formatInr(only.sales)} in ${monthLabel(only.month)}${
            partial ? " (partial month in the current filter)" : ""
          }. A second complete month is needed before comparing growth.`,
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
  const shortWhy = founderDriverSummary(decomp, primary, { provisional });
  const absDelta = decomp.deltaSales == null ? null : Math.abs(decomp.deltaSales);
  const rose = decomp.deltaSales != null && decomp.deltaSales > 0;
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

  const founderGrowthPct = growth == null ? null : formatFounderPct(growth);
  const technicalCoverageHeadline = coverageLeadHeadline(
    coverageCompare,
    prior.month,
    latest.month,
    monthLabel,
  );
  const headline = provisional
    ? `${monthNameOnly(latest.month)} sales aren't fully comparable yet`
    : fell && founderGrowthPct
      ? `${monthNameOnly(latest.month)} sales fell by ${founderGrowthPct}`
      : rose && founderGrowthPct
        ? `${monthNameOnly(latest.month)} sales rose by ${founderGrowthPct}`
        : `${monthNameOnly(prior.month)} to ${monthNameOnly(latest.month)} sales changed`;

  const provisionalSummary = founderProvisionalSalesSummary(coverageCompare, latest.month);
  const summary = provisional
    ? provisionalSummary
    : fell
      ? `Sales decreased from ${formatInr(prior.sales)} in ${monthNameOnly(prior.month)} to ${formatInr(latest.sales)} in ${monthNameOnly(latest.month)} — a drop of ${formatInr(absDelta)}. ${SALES_BEFORE_REFUNDS}.`
      : rose
        ? `Sales increased from ${formatInr(prior.sales)} in ${monthNameOnly(prior.month)} to ${formatInr(latest.sales)} in ${monthNameOnly(latest.month)} — an increase of ${formatInr(absDelta)}. ${SALES_BEFORE_REFUNDS}.`
        : `Sales moved from ${formatInr(prior.sales)} in ${monthNameOnly(prior.month)} to ${formatInr(latest.sales)} in ${monthNameOnly(latest.month)}. ${SALES_BEFORE_REFUNDS}.`;

  const what = provisional
    ? provisionalSummary
    : summary;

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
      whatNext: provisional
        ? [
            {
              action: "Compare complete months",
              question: "Check sales trends using complete months.",
              sectionId: "topline",
              chartId: "monthly-sales",
            },
          ]
        : [
            {
              action: "Inspect orders vs average order value",
              question: founderDriverInvestigation(decomp, primary, latest.month),
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
        ...(technicalCoverageHeadline ? [technicalCoverageHeadline] : []),
        ...(coverageNote ? [coverageNote] : []),
        ...(priorSpan || currentSpan
          ? [
              `Coverage windows (ISO): ${monthLabel(prior.month)} ${priorSpan || "—"} vs ${monthLabel(latest.month)} ${currentSpan || "—"}.`,
            ]
          : []),
        ...(coverageCompare.label && provisional ? [coverageCompare.label] : []),
        ...(decomp.incomparableReason ? [`Decomposition limited: ${decomp.incomparableReason}.`] : []),
        "Symmetric contributions split the Orders×AOV interaction equally for presentation; three-term audit fields remain on evidence.",
        "Driver percentages are mathematical contributions — not verified business causes.",
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
          ? `Observed records point to ${primary.id === "orders" ? "order count" : "average order value"}`
          : primary.id === "orders"
            ? `Order count drove most of the ${fell ? "sales decline" : rose ? "sales increase" : "sales change"}`
            : `Average order value drove most of the ${fell ? "sales decline" : rose ? "sales increase" : "sales change"}`,
        summary: shortWhy || (provisional
          ? `In available records, orders moved ${formatPct(orderChange)}; average order value moved ${formatPct(aovChange)}. Not a verified full-month comparison.`
          : `Orders moved ${formatPct(orderChange)}; average order value moved ${formatPct(aovChange)}.`),
        shortWhy,
        what: shortWhy
          ? `${shortWhy} Exact amounts stay in evidence.`
          : provisional
            ? `Across available records from ${monthLabel(prior.month)} to ${monthLabel(latest.month)}, orders moved ${formatPct(
                orderChange,
              )} (${prior.orders} → ${latest.orders}) and average order value moved ${formatPct(aovChange)} (${formatInr(
                prior.aov,
              )} → ${formatInr(latest.aov)}). This describes observed records only.`
            : `From ${monthLabel(prior.month)} to ${monthLabel(latest.month)}, orders moved ${formatPct(
                orderChange,
              )} (${prior.orders} → ${latest.orders}) and average order value moved ${formatPct(
                aovChange,
              )} (${formatInr(prior.aov)} → ${formatInr(latest.aov)}).`,
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
            question: founderDriverInvestigation(decomp, primary, latest.month),
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
          ? `Sales look lower for ${countWord(bestStreak)} months ending ${monthNameOnly(bestEnd.month)} — not fully comparable`
          : `Sales have fallen for ${countWord(bestStreak)} consecutive months`,
        summary: streakPartial
          ? `The streak ends in ${monthLabel(bestEnd.month)} with incomplete coverage — not a verified full-month decline streak.`
          : `The streak ends in ${monthLabel(bestEnd.month)} (latest change ${formatPct(bestEnd.growth)}). ${SALES_BEFORE_REFUNDS}.`,
        what: streakPartial
          ? `Observed sales were lower for ${bestStreak} consecutive months ending ${monthLabel(
              bestEnd.month,
            )} (incomplete coverage). Do not treat this as a verified full-month decline streak.`
          : `Sales fell for ${bestStreak} consecutive months ending ${monthLabel(
              bestEnd.month,
            )} (latest change ${formatPct(bestEnd.growth)}). ${SALES_BEFORE_REFUNDS}.`,
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
        headline: "Large orders are not skewing your average",
        summary: `Your typical order was ${formatFounderInr(ov.medianOrderValue)}, compared with an average of ${formatFounderInr(ov.aov)}.`,
        what: `Your typical order was ${formatFounderInr(ov.medianOrderValue)}, compared with an average of ${formatFounderInr(
          ov.aov,
        )}. No orders sit above twice the typical order in this scope.`,
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
        ? `Large orders account for ${formatFounderPct(share)} of your sales`
        : "A few larger orders sit above your typical order size",
      summary: founderLargeOrderExplanation(ov, share),
      what: founderLargeOrderExplanation(ov, share),
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
          question: "How much do large orders influence your sales?",
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
      limitations: [
        "Large orders are defined as orders above twice the typical (median) order value.",
        "Skew uses Gross Product Sales order totals — not Net Product Sales.",
        "This describes overall order mix in the current filter — not a verified cause of any single month's sales change.",
      ],
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
            ? `Eight products generate ${formatFounderPct(concentration)} of your sales`
            : `${top.productName} accounts for ${formatFounderPct(top1Share)} of your sales`,
        summary: `${top.productName} leads at ${formatInr(top.sales)}. Your top eight products make up ${formatFounderPct(concentration)} of sales before refunds.`,
        shortWhy: "",
        what: `${top.productName} leads with ${formatInr(top.sales)} (${formatFounderPct(
          top1Share,
        )} of sales). Eight products generate ${formatFounderPct(
          concentration,
        )} of sales before refunds — a share of sales, not a month-over-month change or profit.`,
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
        headline: `${top.productName} accounts for ${formatFounderPct(top1Share)} of your sales`,
        summary: `You have ${eligibleCount} products in scope. Top three generate ${formatFounderPct(top3Share)} of sales before refunds.`,
        shortWhy: "",
        what: `With only ${eligibleCount} products in scope, concentration is best read from your leaders: ${top.productName} holds ${formatFounderPct(
          top1Share,
        )} of sales; the top three hold ${formatFounderPct(
          top3Share,
        )}. ${SALES_BEFORE_REFUNDS}.`,
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
    const productPct = pctVsPriorProduct == null ? null : formatFounderPct(pctVsPriorProduct);
    const productFell = bestMove.delta < 0;
    const productRose = bestMove.delta > 0;
    const headline = zeroRecorded
      ? `${bestMove.productName} shows no recorded sales in ${monthNameOnly(bestMove.currentMonth)}`
      : bestMove.incomplete
        ? `${bestMove.productName} sales changed in available ${monthNameOnly(bestMove.currentMonth)} records`
        : productFell && productPct
          ? `${bestMove.productName} sales dropped by ${productPct} in ${monthNameOnly(bestMove.currentMonth)}`
          : productRose && productPct
            ? `${bestMove.productName} sales rose by ${productPct} in ${monthNameOnly(bestMove.currentMonth)}`
            : `${bestMove.productName} sales changed in ${monthNameOnly(bestMove.currentMonth)}`;
    const what = zeroRecorded
      ? `${bestMove.productName} moved from ${formatInr(
          bestMove.prior,
        )} in ${monthNameOnly(bestMove.priorMonth)} to ${formatInr(
          bestMove.current,
        )} in ${monthNameOnly(bestMove.currentMonth)}. Zero recorded sales is not the same as a confirmed demand decline — coverage may be incomplete or the product may have no rows in this window.`
      : bestMove.incomplete
        ? `${bestMove.productName} moved from ${formatInr(bestMove.prior)} to ${formatInr(bestMove.current)} in available records (${formatInr(bestMove.delta)}). Periods are not fully comparable.`
        : `${bestMove.productName} moved from ${formatInr(bestMove.prior)} in ${monthNameOnly(bestMove.priorMonth)} to ${formatInr(bestMove.current)} in ${monthNameOnly(bestMove.currentMonth)} — a ${productFell ? "drop" : productRose ? "rise" : "change"} of ${formatInr(Math.abs(bestMove.delta))}. ${SALES_BEFORE_REFUNDS}.`;

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
        summary: what,
        shortWhy: "",
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
  const topLabel = top?.label || "Amazon fees";
  const topAbs = Math.abs(top?.amount || 0);
  const feeHeadline = top
    ? `${topLabel} is your biggest identified Amazon charge`
    : rate != null
      ? `Identified Amazon charges take ${formatFounderPct(rate)} of your sales`
      : "Amazon marketplace charges need a closer look";
  const feeSummary =
    top && rate != null && feeAbs != null
      ? `Amazon charged ${formatFounderInr(topAbs)} for ${topLabel.toLowerCase()}. Across the identified marketplace charges, deductions total ${formatFounderInr(feeAbs)}, equivalent to ${formatFounderPct(rate)} of sales before refunds.`
      : top
        ? `Amazon charged ${formatFounderInr(topAbs)} for ${topLabel.toLowerCase()}. Identified marketplace charges are shown in supporting details.`
        : rate != null
          ? `Across the identified marketplace charges, deductions are equivalent to ${formatFounderPct(rate)} of sales before refunds.`
          : "Identified marketplace charges are available in supporting details.";

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
      headline: feeHeadline,
      summary: feeSummary,
      what: feeSummary,
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
        "Figures cover identified marketplace charges only — not every possible Amazon cost.",
        "Amazon selling fees in the CSV are an aggregate — not proven referral-only.",
        "Promotional rebates and customer refunds are excluded from marketplace fee totals.",
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
        headline: `Refunds reduced your sales by ${formatFounderInr(kpis.refundAmountAbs)}`,
        summary: `Sales before refunds ${formatFounderInr(kpis.grossProductSales)}; after refunds ${formatFounderInr(kpis.netProductSales)}.`,
        what: `Customer refunds of ${formatFounderInr(
          kpis.refundAmountAbs,
        )} bring sales from ${formatFounderInr(kpis.grossProductSales)} down to ${formatFounderInr(
          kpis.netProductSales,
        )}. ${
          kpis.canSubtractFullRefunds
            ? `Net orders ${kpis.netOrderCount} after ${countNoun(kpis.fullRefundOrderCount, "verified full-order refund")}.`
            : `${countNoun(kpis.ordersAffectedByRefunds ?? kpis.refundedOrderCount, "order")} affected by refunds; net orders are not reduced because refunds are not all verified full-order reversals.`
        } Refunds cut sales — they are not Amazon fee drains.`,
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
        headline:
          diffs.length === 1
            ? "Your Amazon settlement report doesn't fully match these sales figures"
            : `${diffs.length} settlement figures don't match your sales export`,
        summary: `Largest gap: ${formatInr(largest.difference)} on ${largest.label || largest.id}. Details stay in evidence.`,
        what: `${diffs.length} confirmed comparable settlement difference(s) remain unresolved. The largest gap is ${formatInr(
          largest.difference,
        )} on ${largest.label || largest.id}. Differences are disclosed — not auto-forced to match.`,
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
        headline: "Some settlement checks can't be completed from these files",
        summary: `${missing.length} PDF/CSV check(s) are missing or not comparable — for example GST or bank transfers.`,
        what: `${missing.length} settlement check(s) are disclosed as missing information or not comparable (for example GST, bank transfers, or PDF income vs sales after refunds). Product profit remains unavailable without product costs.`,
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
          headline: "Product profit can't be calculated from these Amazon files",
          summary: "Settlement movement is not profit — product costs are missing.",
          what: "Product profit cannot be calculated from the Amazon transaction CSV / Unified Summary alone because actual product costs are missing.",
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
