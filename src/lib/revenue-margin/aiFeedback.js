/**
 * Minimal AI answer feedback helpers — no answer text, no financial values.
 */

export const FEEDBACK_RATINGS = Object.freeze({
  USEFUL: "USEFUL",
  NOT_USEFUL: "NOT_USEFUL",
});

export const FEEDBACK_REASONS = Object.freeze([
  "WRONG_NUMBERS",
  "WRONG_REASONING",
  "TOO_GENERIC",
  "MISSING_CONTEXT",
  "CONFUSING",
  "OTHER",
]);

export function normalizeFeedbackRequest({
  turnId,
  conversationId,
  scopeHash,
  requestId,
  rating,
  reason,
  telemetry,
}) {
  const ratingNorm = String(rating || "").toUpperCase();
  if (ratingNorm !== "USEFUL" && ratingNorm !== "NOT_USEFUL") {
    throw new Error("invalid_feedback_rating");
  }
  let reasonNorm = reason ? String(reason).toUpperCase() : null;
  if (ratingNorm === "USEFUL") reasonNorm = null;
  if (reasonNorm && !FEEDBACK_REASONS.includes(reasonNorm)) {
    throw new Error("invalid_feedback_reason");
  }
  const telem = telemetry && typeof telemetry === "object" ? telemetry : {};
  return {
    turn_id: String(turnId || "").trim(),
    conversation_id: conversationId || null,
    scope_hash: scopeHash || null,
    request_id: requestId || null,
    rating: ratingNorm,
    reason: reasonNorm,
    answer_source: telem.answer_source || null,
    decision_theme: telem.decision_theme || telem.strategic?.decision_theme || null,
    selected_action: telem.final_selected_action || telem.selected_action || null,
    provider: telem.provider || null,
    model: telem.model || null,
  };
}

export function normalizeClientError({ errorCode, surface, requestId, datasetId, message }) {
  return {
    error_code: String(errorCode || "client_error").slice(0, 80),
    surface: String(surface || "unknown").slice(0, 80),
    request_id: requestId || null,
    dataset_id: datasetId || null,
    // Short non-financial message only.
    message: message ? String(message).slice(0, 160) : null,
  };
}
