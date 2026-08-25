/**
 * Pure helpers for Phase 2E tracked-decision list cards (no React).
 */

export function evidenceStatusLabel(evidenceStatus) {
  switch (String(evidenceStatus || "").toUpperCase()) {
    case "SUPPORTING":
      return "Evidence supporting";
    case "WEAKENING":
      return "Evidence weakening";
    case "REVISIT_REQUIRED":
      return "Review required";
    case "UNCHANGED":
      return "Evidence unchanged";
    case "INSUFFICIENT_NEW_EVIDENCE":
      return "Insufficient new evidence";
    case "SCOPE_NOT_COMPARABLE":
      return "Scope not comparable";
    default:
      return evidenceStatus ? String(evidenceStatus) : "Evidence not evaluated";
  }
}

export function revisionSummaryLabel(revision) {
  if (!revision || !revision.disposition) return null;
  const disposition = String(revision.disposition).toUpperCase();
  if (disposition === "MAINTAIN") return "Recommendation maintained";
  if (disposition === "STRENGTHEN") return "Recommendation strengthened";
  if (disposition === "WEAKEN") return "Recommendation weakened";
  if (disposition === "CHANGE") {
    const prev = revision.previous_action || "?";
    const next = revision.new_action || "?";
    const prevS = revision.previous_strength ? ` · ${String(revision.previous_strength).toLowerCase()}` : "";
    const nextS = revision.new_strength ? ` · ${String(revision.new_strength).toLowerCase()}` : "";
    return `Recommendation changed · ${String(prev).toLowerCase()}${prevS} → ${String(next).toLowerCase()}${nextS}`;
  }
  return `Last review: ${disposition}`;
}

export function normalizeTrackedDecisionCard(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw.recommendation && typeof raw.recommendation === "object" ? raw.recommendation : {};
  const orig =
    raw.original_recommendation && typeof raw.original_recommendation === "object"
      ? raw.original_recommendation
      : {};
  const decisionId = raw.decision_id;
  if (!decisionId) return null;
  const latestRevision = raw.latest_revision && typeof raw.latest_revision === "object" ? raw.latest_revision : null;
  return {
    decision_id: String(decisionId),
    dataset_id: raw.dataset_id || null,
    scope_hash: raw.scope_hash || null,
    decision_theme: raw.decision_theme || null,
    subject: raw.subject && typeof raw.subject === "object" ? raw.subject : null,
    original_question: raw.original_question || null,
    selected_action: raw.selected_action || rec.selected_action || null,
    recommendation_strength: raw.recommendation_strength || rec.recommendation_strength || null,
    decision_confidence: raw.decision_confidence || rec.decision_confidence || null,
    original_selected_action:
      raw.original_selected_action || orig.selected_action || raw.selected_action || rec.selected_action || null,
    original_recommendation_strength:
      raw.original_recommendation_strength ||
      orig.recommendation_strength ||
      raw.recommendation_strength ||
      rec.recommendation_strength ||
      null,
    status: raw.status || "ACTIVE",
    created_at: raw.created_at || null,
    updated_at: raw.updated_at || null,
    last_evaluated_at: raw.last_evaluated_at || null,
    evidence_status: raw.evidence_status || raw.evaluation_status || null,
    evaluation_status: raw.evaluation_status || raw.evidence_status || null,
    recommendation_reconsideration_required: Boolean(raw.recommendation_reconsideration_required),
    latest_revision: latestRevision,
    revision_count: Number(raw.revision_count || (latestRevision ? 1 : 0)),
  };
}

export function mergeTrackedDecisionLists(listed, seed) {
  const byId = new Map();
  for (const item of listed || []) {
    const card = normalizeTrackedDecisionCard(item);
    if (card && card.status !== "ARCHIVED") byId.set(card.decision_id, card);
  }
  const seedCard = normalizeTrackedDecisionCard(seed);
  if (seedCard && seedCard.status !== "ARCHIVED") {
    const existing = byId.get(seedCard.decision_id);
    if (!existing) {
      byId.set(seedCard.decision_id, seedCard);
    } else {
      const merged = { ...seedCard, ...existing };
      for (const [key, value] of Object.entries(seedCard)) {
        if (merged[key] == null && value != null) merged[key] = value;
      }
      byId.set(seedCard.decision_id, merged);
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")),
  );
}
