/**
 * Shared analytical filter state for the Revenue & Margin workspace.
 * Filters are sent to the Python query API — never applied client-side to facts.
 */

export const FILTER_DIMENSION_KEYS = [
  "channel",
  "category",
  "sku",
  "region",
  "state",
  "city_tier",
  "new_repeat",
  "platform",
];

export const PRIMARY_FILTER_KEYS = ["channel", "category", "region"];

export const SECONDARY_FILTER_KEYS = ["platform", "state", "city_tier", "sku", "new_repeat"];

export const FILTER_LABELS = {
  channel: "Channel",
  category: "Category",
  sku: "SKU",
  region: "Region",
  state: "State",
  city_tier: "City tier",
  new_repeat: "New vs repeat",
  platform: "Platform",
  month_from: "From",
  month_to: "To",
};

export function createEmptyFilters() {
  return {
    month_from: null,
    month_to: null,
    channel: [],
    category: [],
    sku: [],
    region: [],
    state: [],
    city_tier: [],
    new_repeat: [],
    platform: [],
  };
}

export function createDefaultFilters(periodRange) {
  return {
    ...createEmptyFilters(),
    month_from: periodRange?.min ?? null,
    month_to: periodRange?.max ?? null,
  };
}

export function filtersToQueryFilters(filters) {
  const out = {};
  if (filters?.month_from) out.month_from = filters.month_from;
  if (filters?.month_to) out.month_to = filters.month_to;
  for (const key of FILTER_DIMENSION_KEYS) {
    const values = filters?.[key];
    if (Array.isArray(values) && values.length > 0) {
      out[key] = values.map(String);
    }
  }
  return out;
}

export function toggleFilterValue(filters, key, value) {
  const next = { ...filters, [key]: [...(filters[key] || [])] };
  const normalized = String(value);
  const index = next[key].indexOf(normalized);
  if (index >= 0) next[key].splice(index, 1);
  else next[key].push(normalized);
  return next;
}

export function removeFilterChip(filters, chip) {
  const next = { ...filters };
  if (chip.kind === "period") {
    next.month_from = chip.periodRange?.min ?? null;
    next.month_to = chip.periodRange?.max ?? null;
    return next;
  }
  if (chip.kind === "dimension") {
    next[chip.key] = (next[chip.key] || []).filter((item) => item !== chip.value);
  }
  return next;
}

export function clearFilters(periodRange) {
  return createDefaultFilters(periodRange);
}

export function hasActiveFilters(filters, periodRange) {
  if (!filters) return false;
  const defaultFrom = periodRange?.min ?? null;
  const defaultTo = periodRange?.max ?? null;
  if (filters.month_from && filters.month_from !== defaultFrom) return true;
  if (filters.month_to && filters.month_to !== defaultTo) return true;
  return FILTER_DIMENSION_KEYS.some((key) => (filters[key] || []).length > 0);
}

export function activeFilterChips(filters, periodRange) {
  const chips = [];
  const defaultFrom = periodRange?.min ?? null;
  const defaultTo = periodRange?.max ?? null;
  const periodActive = (filters.month_from && filters.month_from !== defaultFrom)
    || (filters.month_to && filters.month_to !== defaultTo);
  if (periodActive && filters.month_from && filters.month_to) {
    chips.push({
      id: "period",
      kind: "period",
      label: `Period: ${filters.month_from} – ${filters.month_to}`,
      periodRange,
    });
  }
  for (const key of FILTER_DIMENSION_KEYS) {
    for (const value of filters[key] || []) {
      chips.push({
        id: `${key}:${value}`,
        kind: "dimension",
        key,
        value,
        label: `${FILTER_LABELS[key]}: ${value}`,
      });
    }
  }
  return chips;
}

export function formatPeriodLabel(filters, periodRange) {
  const from = filters?.month_from || periodRange?.min;
  const to = filters?.month_to || periodRange?.max;
  if (!from || !to) return "Period unavailable";
  return `${from} – ${to}`;
}

export function formatScopeViewLabel(filters, periodRange) {
  const parts = [];
  for (const key of FILTER_DIMENSION_KEYS) {
    const values = (filters?.[key] || []).map(String).filter(Boolean);
    if (values.length) parts.push(values.join(", "));
  }
  const period = formatPeriodLabel(filters, periodRange);
  if (!parts.length) {
    return period && period !== "Period unavailable" ? `Company view · ${period}` : "Company view";
  }
  if (period && period !== "Period unavailable") parts.push(period);
  return parts.join(" · ");
}

export function applyDrillFilter(filters, dimensionId, value) {
  if (!value) return filters;
  const key = dimensionId === "sku" ? "sku" : dimensionId;
  if (!FILTER_DIMENSION_KEYS.includes(key)) return filters;
  return {
    ...filters,
    [key]: [String(value)],
  };
}
