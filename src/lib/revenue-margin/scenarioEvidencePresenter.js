/**
 * Scenario (what-if) evidence presentation for the AI CFO drawer.
 */

export function isScenarioEvidenceItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.display?.kind === "scenario_change") return true;
  if (item.source === "scenario_engine") return true;
  if (String(item.evidence_id || "").startsWith("scenario:")) return true;
  return false;
}

export function isScenarioAnswer(answer) {
  if (!answer || typeof answer !== "object") return false;
  if (answer.answer_kind === "SCENARIO" || answer.scenario_label === "WHAT-IF") return true;
  const evidence = Array.isArray(answer.evidence) ? answer.evidence : [];
  return evidence.some((item) => isScenarioEvidenceItem(item));
}

export function presentScenarioEvidenceList(evidence) {
  const rows = [];
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (!isScenarioEvidenceItem(item)) continue;
    const display = item.display || {};
    rows.push({
      evidenceId: item.evidence_id || null,
      metric: item.metric,
      label: display.label || item.metric,
      formattedRange: display.formatted_range || display.formatted_value || "",
      formattedDelta: display.formatted_delta || null,
      movementDirection: display.movement_direction || null,
      economicDirection: display.economic_direction || null,
      provenance: display.provenance_label || item.provenance || null,
    });
  }
  return rows;
}
