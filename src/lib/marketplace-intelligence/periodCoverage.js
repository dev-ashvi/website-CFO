/**
 * Partial-period comparison policy for Marketplace Intelligence.
 *
 * Classes:
 * - complete_comparable — both months full under the current filter
 * - matched_partial — both partial with matching elapsed-day windows (same covered days)
 * - incompatible — unequal coverage; MoM must be provisional (no period normalization)
 * - not_comparable — missing month metadata
 *
 * Period normalization (run-rate / day-scaling) is not supported — provisional labeling
 * and lower ranking are used instead. Full-month TUMMYMUMMY paths stay definitive.
 */

export const COMPARISON_STATUS = Object.freeze({
  COMPLETE_COMPARABLE: "complete_comparable",
  MATCHED_PARTIAL: "matched_partial",
  /** Export ends mid-month with no user date filter — provisional, softer than filter incompatibility. */
  TRAILING_PARTIAL: "trailing_partial",
  INCOMPATIBLE: "incompatible",
  NOT_COMPARABLE: "not_comparable",
});

export function monthParts(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return null;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    y,
    m,
    lastDay,
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, "0")}`,
  };
}

function parseIsoDay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return Number(iso.slice(8, 10));
}

function daysBetweenInclusive(startIso, endIso) {
  if (!startIso || !endIso || startIso > endIso) return 0;
  const a = Date.parse(`${startIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

/**
 * Coverage of a calendar month under period / date-filter bounds.
 */
export function monthCoverageMeta(ym, period = null, dateRange = null) {
  const parts = monthParts(ym);
  if (!parts) {
    return {
      ym,
      partial: false,
      coveredDays: 0,
      daysInMonth: 0,
      coverageRatio: 0,
      coveredStart: null,
      coveredEnd: null,
      available: false,
    };
  }

  const startBound = dateRange?.start || period?.start || null;
  const endBound = dateRange?.end || period?.end || null;

  let coveredStart = parts.start;
  let coveredEnd = parts.end;

  if (startBound) {
    if (startBound > parts.end) {
      return {
        ym,
        partial: true,
        coveredDays: 0,
        daysInMonth: parts.lastDay,
        coverageRatio: 0,
        coveredStart: null,
        coveredEnd: null,
        available: false,
      };
    }
    if (startBound > parts.start && startBound.slice(0, 7) === ym) coveredStart = startBound;
  }
  if (endBound) {
    if (endBound < parts.start) {
      return {
        ym,
        partial: true,
        coveredDays: 0,
        daysInMonth: parts.lastDay,
        coverageRatio: 0,
        coveredStart: null,
        coveredEnd: null,
        available: false,
      };
    }
    if (endBound < parts.end && endBound.slice(0, 7) === ym) coveredEnd = endBound;
  }

  const coveredDays = daysBetweenInclusive(coveredStart, coveredEnd);
  const partial = coveredDays < parts.lastDay;
  return {
    ym,
    partial,
    coveredDays,
    daysInMonth: parts.lastDay,
    coverageRatio: parts.lastDay > 0 ? coveredDays / parts.lastDay : 0,
    coveredStart,
    coveredEnd,
    available: coveredDays > 0,
    startDay: parseIsoDay(coveredStart),
    endDay: parseIsoDay(coveredEnd),
  };
}

export function isPartialMonth(ym, period, dateRange) {
  return Boolean(monthCoverageMeta(ym, period, dateRange).partial);
}

/**
 * Classify a two-month comparison under the current filter.
 */
export function compareMonthCoverage(priorYm, currentYm, period = null, dateRange = null) {
  const prior = monthCoverageMeta(priorYm, period, dateRange);
  const current = monthCoverageMeta(currentYm, period, dateRange);

  if (!prior.available || !current.available) {
    return {
      status: COMPARISON_STATUS.NOT_COMPARABLE,
      provisional: true,
      definitiveMom: false,
      prior,
      current,
      label: "Month coverage cannot be compared under the current filter.",
    };
  }

  if (!prior.partial && !current.partial) {
    return {
      status: COMPARISON_STATUS.COMPLETE_COMPARABLE,
      provisional: false,
      definitiveMom: true,
      prior,
      current,
      label: "Both months are complete under the current filter.",
    };
  }

  // Matching elapsed-day windows: same covered day count (period normalization not applied).
  const daysMatch = prior.coveredDays === current.coveredDays && prior.coveredDays > 0;

  if (prior.partial && current.partial && daysMatch) {
    return {
      status: COMPARISON_STATUS.MATCHED_PARTIAL,
      provisional: true,
      definitiveMom: false,
      prior,
      current,
      label: `Both months use matching ${prior.coveredDays}-day windows — comparable but provisional (not full months). Period normalization is not applied.`,
    };
  }

  const userFilter = Boolean(dateRange?.start || dateRange?.end);
  // Natural export ending mid-month (no user filter): provisional, but not the same as unequal filter windows.
  if (!userFilter && ((!prior.partial && current.partial) || (prior.partial && !current.partial))) {
    return {
      status: COMPARISON_STATUS.TRAILING_PARTIAL,
      provisional: true,
      definitiveMom: false,
      prior,
      current,
      label:
        "The export ends before a full later month — this movement is provisional until a complete month is available. Period normalization is not applied.",
    };
  }

  return {
    status: COMPARISON_STATUS.INCOMPATIBLE,
    provisional: true,
    definitiveMom: false,
    prior,
    current,
    label:
      "Period coverage differs between the two months — this movement is provisional until comparable windows are available. Period normalization is not applied.",
  };
}

export function formatCoverageSpan(meta) {
  if (!meta?.coveredStart || !meta?.coveredEnd) return null;
  if (meta.coveredStart === meta.coveredEnd) return meta.coveredStart;
  return `${meta.coveredStart} → ${meta.coveredEnd}`;
}

export function founderComparisonNote(comparison) {
  if (!comparison) return null;
  if (comparison.status === COMPARISON_STATUS.COMPLETE_COMPARABLE) return null;
  const priorSpan = formatCoverageSpan(comparison.prior);
  const currentSpan = formatCoverageSpan(comparison.current);
  if (comparison.status === COMPARISON_STATUS.MATCHED_PARTIAL) {
    const days = comparison.prior?.coveredDays;
    return `Matched ${days}-day comparison window${
      priorSpan && currentSpan ? ` (${priorSpan} vs ${currentSpan})` : ""
    }. Conclusion is scoped to that window only — not a full-month verdict.`;
  }
  if (comparison.status === COMPARISON_STATUS.TRAILING_PARTIAL) {
    return `Incomplete coverage${
      currentSpan ? ` (later month records: ${currentSpan})` : ""
    }. Obtain a complete later month or compare equivalent windows before treating this as a full-month sales change.`;
  }
  if (comparison.status === COMPARISON_STATUS.INCOMPATIBLE) {
    return `Incompatible coverage${
      priorSpan && currentSpan ? ` (${priorSpan} vs ${currentSpan})` : ""
    }. Do not treat the observed difference as a verified full-month decline. Obtain complete data or matching windows.`;
  }
  return "Month coverage cannot be compared cleanly — obtain complete or equivalent reporting windows.";
}

/**
 * Presentation for the Topline "Latest MoM growth" KPI.
 * Keeps the raw growth value available; UI must not show a definitive % when not comparable.
 */
export function presentLatestMomGrowth(monthly, period = null, dateRange = null) {
  const rows = Array.isArray(monthly) ? monthly : [];
  if (rows.length < 2) {
    return {
      value: null,
      comparable: false,
      status: COMPARISON_STATUS.NOT_COMPARABLE,
      display: "Need two months",
      hint: "Month-over-month growth needs at least two months in scope.",
    };
  }
  const prior = rows[rows.length - 2];
  const latest = rows[rows.length - 1];
  const raw = latest?.growth ?? null;
  const comparison = compareMonthCoverage(prior.month, latest.month, period, dateRange);
  if (!comparison.definitiveMom || comparison.provisional) {
    const priorSpan = formatCoverageSpan(comparison.prior);
    const currentSpan = formatCoverageSpan(comparison.current);
    return {
      value: raw,
      comparable: false,
      status: comparison.status,
      display: "Incomplete period — MoM not comparable",
      hint:
        comparison.status === COMPARISON_STATUS.MATCHED_PARTIAL
          ? `Matched ${comparison.prior?.coveredDays}-day window only${
              priorSpan && currentSpan ? ` (${priorSpan} vs ${currentSpan})` : ""
            }. Not a full-month MoM.`
          : founderComparisonNote(comparison) ||
            "Reporting periods are not equivalent — MoM % is withheld from the headline KPI.",
    };
  }
  return {
    value: raw,
    comparable: true,
    status: COMPARISON_STATUS.COMPLETE_COMPARABLE,
    display: null,
    hint: "MoM vs prior-month Gross Product Sales (complete comparable months).",
  };
}

/** Lead sentence for provisional findings — coverage first, not decline. */
export function coverageLeadHeadline(comparison, priorYm, currentYm, monthLabelFn) {
  const label = typeof monthLabelFn === "function" ? monthLabelFn : (ym) => ym;
  if (!comparison?.provisional) return null;
  if (comparison.status === COMPARISON_STATUS.MATCHED_PARTIAL) {
    const days = comparison.prior?.coveredDays;
    return `Matched ${days}-day window: ${label(priorYm)} vs ${label(currentYm)} (not full months)`;
  }
  if (comparison.status === COMPARISON_STATUS.TRAILING_PARTIAL) {
    const span = formatCoverageSpan(comparison.current);
    return `Incomplete data coverage in ${label(currentYm)}${span ? ` (${span})` : ""}`;
  }
  if (comparison.status === COMPARISON_STATUS.INCOMPATIBLE) {
    return `Incomparable periods: ${label(priorYm)} vs ${label(currentYm)}`;
  }
  return `Incomplete period coverage: ${label(priorYm)} vs ${label(currentYm)}`;
}
