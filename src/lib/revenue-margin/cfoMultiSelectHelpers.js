export function toggleMultiSelectValue(selected, value) {
  const normalized = String(value);
  const current = Array.isArray(selected) ? selected.map(String) : [];
  return current.includes(normalized)
    ? current.filter((item) => item !== normalized)
    : [...current, normalized];
}

export function filterMultiSelectOptions(options, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((option) => String(option).toLowerCase().includes(q));
}

export function shouldShowMultiSelectSearch(options, searchable = true) {
  return Boolean(searchable && options.length > 6);
}
