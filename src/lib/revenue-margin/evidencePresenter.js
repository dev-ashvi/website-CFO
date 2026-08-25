/**
 * Deterministic EvidencePresenter — maps internal evidence to drawer display rows.
 */
import { displayEntityName, formatMetricValue } from "./format.js";

/**
 * @param {object} item
 * @returns {boolean}
 */
export function isPresentableEvidenceItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.display?.label && item.display?.formatted_value != null && item.display.formatted_value !== "") {
    const label = String(item.display.label).trim();
    if (!label || /^evidence$/i.test(label) || /^n\/?a$/i.test(label) || /^unknown$/i.test(label)) {
      return false;
    }
    return true;
  }
  if (item.metric != null && item.value != null) return true;
  return false;
}

/**
 * @param {object} item
 * @param {{ debug?: boolean }} [options]
 */
export function presentEvidenceItem(item, options = {}) {
  if (!isPresentableEvidenceItem(item)) {
    return null;
  }
  if (item.display?.label && item.display?.formatted_value != null) {
    return {
      label: item.display.label,
      formattedValue: item.display.formatted_value,
      context: item.display.context || null,
      evidenceId: item.evidence_id || null,
      raw: options.debug ? item : undefined,
    };
  }
  const entity = displayEntityName(item.entity || item.scope?.dimension_value);
  const formatted = formatMetricValue(item.metric, item.value);
  return {
    label: formatted.label,
    formattedValue: formatted.formatted,
    context: entity !== "This view" ? entity : null,
    evidenceId: item.evidence_id || null,
    raw: options.debug ? item : undefined,
  };
}

function evidenceIdentity(item) {
  if (item?.evidence_id) return `id:${item.evidence_id}`;
  const entity = item?.entity || item?.scope?.dimension_value || "";
  return `key:${item?.scope_hash || item?.scope?.scope_hash || ""}|${entity}|${item?.metric || ""}|${item?.value}`;
}

/**
 * @param {object[]} evidence
 * @param {{ debug?: boolean }} [options]
 */
export function presentEvidenceList(evidence, options = {}) {
  const rows = [];
  const seen = new Set();
  for (const item of Array.isArray(evidence) ? evidence : []) {
    const presented = presentEvidenceItem(item, options);
    if (!presented) continue;
    const key = evidenceIdentity(item);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(presented);
  }
  return rows;
}

/**
 * True when a string looks like an internal metric key or Filtered population label.
 */
export function containsInternalEvidenceLeak(text) {
  const s = String(text || "");
  if (/Filtered population/i.test(s)) return true;
  if (/\b(cm2_pct|cm1_pct|gm_pct|marketing_pct|gross_margin_pct)\b/.test(s)) return true;
  if (/Verified \w+_pct for/i.test(s)) return true;
  return false;
}
