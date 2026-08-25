/**
 * Temporal change evidence presentation for the AI CFO drawer.
 * Metric label is the row identity; comparison period is shown once.
 */

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatPeriodLabel(period) {
  const text = String(period || "").trim();
  if (!text) return "—";
  const parts = text.split("-");
  if (parts.length >= 2 && /^\d{4}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
    const month = Number(parts[1]);
    if (month >= 1 && month <= 12) return `${MONTH_ABBR[month - 1]} ${parts[0]}`;
  }
  return text;
}

export function isTemporalEvidenceItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.display?.kind === "temporal_change") return true;
  if (item.source === "change_evidence") return true;
  if (String(item.evidence_id || "").startsWith("change:")) return true;
  return item.from_period != null && item.to_period != null && item.metric != null;
}

export function presentTemporalEvidenceList(evidence) {
  const rows = [];
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (!isTemporalEvidenceItem(item)) continue;
    const display = item.display || {};
    rows.push({
      evidenceId: item.evidence_id || null,
      metric: item.metric,
      label: display.label || item.metric,
      formattedRange: display.formatted_range || display.formatted_value || "",
      formattedDelta: display.formatted_delta || null,
      movementDirection: display.movement_direction || null,
      economicDirection: display.economic_direction || null,
      deltaFormatType: display.delta_format_type || null,
    });
  }
  return rows;
}

export function presentComparison(answer) {
  if (answer?.comparison?.label) return answer.comparison.label;
  const temporal = (answer?.evidence || []).find((item) => isTemporalEvidenceItem(item));
  if (!temporal) return null;
  if (temporal.display?.comparison_label) return temporal.display.comparison_label;
  if (temporal.from_period && temporal.to_period) {
    return `${formatPeriodLabel(temporal.from_period)} → ${formatPeriodLabel(temporal.to_period)}`;
  }
  return null;
}

export function methodologyExposesInternals(text) {
  const s = String(text || "");
  return /\bget_trend\b/i.test(s) || /\bFinancialScope\b/.test(s);
}
