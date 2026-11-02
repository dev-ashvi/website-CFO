/**
 * Deterministic ranking and deduplication for Financial Insight Objects.
 *
 * Stage 5A.1 rules (documented + tested):
 * 1. Prefer financially material, recent, actionable changes over stable structural notes.
 * 2. Urgency rises with |relative change| and absolute INR move vs comparison base.
 * 3. Novelty boosts first-seen recent MoM / recon exceptions; stable concentration is down-weighted.
 * 4. Persistence boosts consecutive declines / multi-check recon issues.
 * 5. Decision relevance: refunds/recon > revenue movement > fees > skew > stable concentration.
 * 6. Evidence / calculation quality still matters, but never lets a stable share observation
 *    outrank a material recent revenue decline when both are present.
 * 7. No LLM assigns numerical importance.
 */

const WEIGHTS = Object.freeze({
  materiality: 0.28,
  urgency: 0.22,
  novelty: 0.12,
  persistence: 0.12,
  decisionRelevance: 0.16,
  evidenceQuality: 0.1,
});

const DECISION_RELEVANCE = Object.freeze({
  refunds_recon_gaps: 1,
  revenue_movement: 0.95,
  orders_vs_aov: 0.9,
  fee_burden: 0.75,
  order_value_skew: 0.7,
  product_concentration: 0.55,
});

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function evidenceScore(insight) {
  const calc = insight.confidenceFacets?.calculation || insight.confidence;
  let base = 1;
  if (calc === "high") base = 1;
  else if (calc === "medium") base = 0.7;
  else base = 0.4;
  const coverage = insight.confidenceFacets?.coverage;
  if (coverage === "incomplete") base *= 0.85;
  return base;
}

function provisionalMultiplier(insight) {
  if (!insight?.provisional && insight?.comparisonStatus !== "incompatible") return 1;
  // Do not auto-promote incomplete-period findings as the primary business concern.
  if (insight.comparisonStatus === "incompatible" || insight.comparisonStatus === "not_comparable") {
    return 0.55;
  }
  if (insight.comparisonStatus === "trailing_partial") {
    return 0.62;
  }
  if (insight.comparisonStatus === "matched_partial" || insight.provisional) {
    return 0.7;
  }
  return 1;
}

function urgencyScore(insight) {
  // Incomparable / incomplete periods must not use % change as urgency evidence.
  if (insight.provisional) {
    const stablePenalty = insight.isStableObservation ? -0.35 : 0;
    return clamp01(0.12 + stablePenalty);
  }
  const rel = Math.abs(insight.materiality?.relativeChange ?? 0);
  const mat = clamp01(insight.materiality?.score ?? 0);
  const recentBoost = insight.isRecentChange ? 0.25 : 0;
  const stablePenalty = insight.isStableObservation ? -0.35 : 0;
  return clamp01(rel * 1.4 + mat * 0.35 + recentBoost + stablePenalty);
}

function noveltyScore(insight) {
  if (insight.isStableObservation) return 0.15;
  if (insight.type === "revenue_movement" || insight.type === "orders_vs_aov") return 0.85;
  if (insight.groupKey === "recon_exceptions") return 0.8;
  if (insight.type === "product_concentration" && insight.isRecentChange) return 0.7;
  return 0.45;
}

/**
 * Compute ranking score and reasons onto an insight (returns a clean copy).
 */
export function scoreInsight(insight) {
  const materiality = clamp01(insight.materiality?.score ?? 0);
  const urgency = urgencyScore(insight);
  const novelty = noveltyScore(insight);
  const persistence = clamp01(insight._persistenceScore ?? 0);
  let decisionRelevance = DECISION_RELEVANCE[insight.type] ?? 0.5;
  if (insight.isStableObservation && insight.type === "product_concentration") {
    decisionRelevance = Math.min(decisionRelevance, 0.35);
  }
  const evidenceQuality = evidenceScore(insight);

  const provisionalFactor = provisionalMultiplier(insight);
  let score =
    (WEIGHTS.materiality * materiality +
      WEIGHTS.urgency * urgency +
      WEIGHTS.novelty * novelty +
      WEIGHTS.persistence * persistence +
      WEIGHTS.decisionRelevance * decisionRelevance +
      WEIGHTS.evidenceQuality * evidenceQuality) *
    provisionalFactor;

  // Hard preference: definitive recent material revenue moves outrank stable concentration.
  if (
    insight.type === "revenue_movement" &&
    insight.isRecentChange &&
    materiality >= 0.25 &&
    !insight.provisional
  ) {
    score += 0.08;
  }
  if (insight.isStableObservation) {
    score -= 0.06;
  }

  const reasons = [
    `materiality ${materiality.toFixed(2)}`,
    `urgency ${urgency.toFixed(2)}`,
    `novelty ${novelty.toFixed(2)}`,
    `persistence ${persistence.toFixed(2)}`,
    `decision ${decisionRelevance.toFixed(2)}`,
    `evidence ${evidenceQuality.toFixed(2)}`,
  ];
  if (provisionalFactor < 1) {
    reasons.push(`coverage_penalty ×${provisionalFactor.toFixed(2)}`);
  }

  const { _persistenceScore, ...clean } = insight;
  return {
    ...clean,
    ranking: {
      score: Math.round(Math.max(0, score) * 1000) / 1000,
      reasons,
      methodology: "stage_5a1_urgency_novelty_persistence",
    },
  };
}

/**
 * Group related findings into one coherent investigation.
 */
export function dedupeInsights(insights) {
  const scored = (insights || []).map(scoreInsight);
  const byGroup = new Map();

  for (const insight of scored) {
    const key = insight.groupKey || insight.id;
    const existing = byGroup.get(key);
    if (!existing) {
      byGroup.set(key, insight);
      continue;
    }
    const prefer =
      insight.type === "revenue_movement" && existing.type === "orders_vs_aov"
        ? insight
        : existing.type === "revenue_movement" && insight.type === "orders_vs_aov"
          ? existing
          : insight.ranking.score >= existing.ranking.score
            ? insight
            : existing;
    const other = prefer === insight ? existing : insight;
    byGroup.set(key, mergeRelated(prefer, other));
  }

  return [...byGroup.values()].sort((a, b) => {
    if (b.ranking.score !== a.ranking.score) return b.ranking.score - a.ranking.score;
    // Tie-break: recent changes before stable observations
    if (Boolean(b.isRecentChange) !== Boolean(a.isRecentChange)) {
      return Number(b.isRecentChange) - Number(a.isRecentChange);
    }
    return a.id.localeCompare(b.id);
  });
}

function mergeRelated(primary, secondary) {
  if (!secondary || primary.id === secondary.id) return primary;
  if (primary.groupKey !== secondary.groupKey) return primary;

  const whyDrivers = [...(primary.why?.drivers || [])];
  for (const driver of secondary.why?.drivers || []) {
    if (!whyDrivers.some((d) => d.id === driver.id)) whyDrivers.push(driver);
  }

  const whatNext = [...(primary.whatNext || [])];
  for (const step of secondary.whatNext || []) {
    if (!whatNext.some((s) => s.question === step.question)) whatNext.push(step);
  }

  const metrics = [...(primary.metrics || [])];
  for (const m of secondary.metrics || []) {
    if (!metrics.some((row) => row.metricId === m.metricId)) metrics.push(m);
  }

  const chartIds = [...new Set([...(primary.links?.chartIds || []), ...(secondary.links?.chartIds || [])])];
  const sectionIds = [...new Set([...(primary.links?.sectionIds || []), ...(secondary.links?.sectionIds || [])])];

  return {
    ...primary,
    shortWhy: primary.shortWhy || secondary.shortWhy,
    why: { ...primary.why, drivers: whyDrivers },
    whatNext: whatNext.slice(0, 5),
    metrics: metrics.slice(0, 12),
    isRecentChange: primary.isRecentChange || secondary.isRecentChange,
    isStableObservation: primary.isStableObservation && secondary.isStableObservation,
    links: {
      ...primary.links,
      chartIds,
      sectionIds,
      investigationHints: [
        ...new Set([
          ...(primary.links?.investigationHints || []),
          ...(secondary.links?.investigationHints || []),
        ]),
      ].slice(0, 6),
    },
    ranking: {
      score: Math.max(primary.ranking?.score || 0, secondary.ranking?.score || 0),
      reasons: [...(primary.ranking?.reasons || []), `merged:${secondary.type}`].slice(0, 8),
      methodology: primary.ranking?.methodology || "stage_5a1_urgency_novelty_persistence",
    },
  };
}

/**
 * Brief layout: 1 primary + up to 4 secondary (max 5 total).
 * Prefer a non-provisional finding as primary when available.
 */
export function selectBriefInsights(ranked, limit = 5) {
  const list = ranked || [];
  const max = Math.max(1, Math.min(limit, 5));
  const preferredPrimary =
    list.find((row) => !row.provisional) || list[0] || null;
  const rest = list.filter((row) => row && row.id !== preferredPrimary?.id).slice(0, max - 1);
  const selected = preferredPrimary ? [preferredPrimary, ...rest] : [];
  return {
    primary: selected[0] || null,
    secondary: selected.slice(1),
    all: selected,
  };
}
