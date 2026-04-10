/**
 * @param {{ relatedUserMessage?: string|null, chatSessionId?: string|null }[]} entries
 */
export function draftOriginSummary(entries) {
  if (!entries.length) return "—";
  const fromChat = entries.filter((e) => e.relatedUserMessage || e.chatSessionId).length;
  if (fromChat === 0) return "Manual";
  if (fromChat === entries.length) return "Chat";
  return "Mixed (chat and manual)";
}

/**
 * @param {string} baselineDisplay
 * @param {string} previewDisplay
 */
export function previewVsBaselineNote(baselineDisplay, previewDisplay) {
  if (baselineDisplay === previewDisplay) return null;
  const parseNum = (s) => {
    const n = parseFloat(String(s).replace(/%/g, "").replace(/[₹,]/g, "").replace(/USD/gi, "").trim());
    return Number.isNaN(n) ? NaN : n;
  };
  const b = parseNum(baselineDisplay);
  const p = parseNum(previewDisplay);
  if (!Number.isNaN(b) && !Number.isNaN(p)) {
    if (p < b) return "Lower than baseline";
    if (p > b) return "Higher than baseline";
  }
  return "Different from baseline";
}
