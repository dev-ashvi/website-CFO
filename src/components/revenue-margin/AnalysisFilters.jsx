import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { formatExplorerValue } from "../../lib/revenue-margin/format.js";
import { explorerSummarySections } from "../../lib/revenue-margin/summary.js";
import CfoMultiSelect from "./CfoMultiSelect.jsx";
import {
  FILTER_LABELS,
  PRIMARY_FILTER_KEYS,
  SECONDARY_FILTER_KEYS,
  activeFilterChips,
  clearFilters,
  formatPeriodLabel,
  hasActiveFilters,
  removeFilterChip,
} from "../../lib/revenue-margin/filters.js";

function dimensionSummary(key, filters) {
  const values = filters?.[key] || [];
  const label = FILTER_LABELS[key] || key;
  if (!values.length) return `All ${label}s`;
  if (values.length === 1) return String(values[0]);
  return `${values.length} ${label}s`;
}

/**
 * Compact filter bar with expandable detail. Preserves all filter semantics.
 */
export default function AnalysisFilters({
  filters,
  setFilters,
  periodRange,
  facets,
  dynamicEnabled,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const chips = activeFilterChips(filters, periodRange);
  const filtersActive = hasActiveFilters(filters, periodRange);

  function setDimensionValues(key, values) {
    setFilters({ ...filters, [key]: values });
  }

  function setPeriod(key, value) {
    setFilters({ ...filters, [key]: value || null });
  }

  if (!dynamicEnabled) {
    return (
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
        Re-run analysis to enable dynamic filtering.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-[#f8fafc]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <p className="text-[12px] font-medium tabular-nums text-[#1a3673]">
          {formatPeriodLabel(filters, periodRange)}
        </p>
        <span className="hidden h-3 w-px bg-slate-200 sm:block" aria-hidden />
        <p className="text-[12px] text-slate-600">{dimensionSummary("channel", filters)}</p>
        <span className="hidden h-3 w-px bg-slate-200 sm:block" aria-hidden />
        <p className="text-[12px] text-slate-600">{dimensionSummary("category", filters)}</p>
        {filtersActive && (
          <span className="rounded-full bg-[#1a3673]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1a3673]">
            Filtered
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilters(clearFilters(periodRange))}
            className="text-[12px] font-medium text-slate-500 hover:text-[#1a3673] hover:underline"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(26,54,115,0.16)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#1a3673]"
            aria-expanded={expanded}
          >
            Filters
            <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 px-3 py-2">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-700 shadow-sm"
            >
              {chip.label}
              <button
                type="button"
                aria-label={`Remove ${chip.label}`}
                onClick={() => setFilters(removeFilterChip(filters, chip))}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="space-y-3 border-t border-gray-100 px-3 py-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-[12px] text-slate-600">
              Period from
              <select
                value={filters.month_from || ""}
                onChange={(e) => setPeriod("month_from", e.target.value)}
                className="mt-1 block w-full rounded-lg border px-2 py-1"
              >
                {(periodRange?.months || []).map((month) => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-slate-600">
              Period to
              <select
                value={filters.month_to || ""}
                onChange={(e) => setPeriod("month_to", e.target.value)}
                className="mt-1 block w-full rounded-lg border px-2 py-1"
              >
                {(periodRange?.months || []).map((month) => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
            </label>
            {PRIMARY_FILTER_KEYS.map((key) => (
              <CfoMultiSelect
                key={key}
                label={FILTER_LABELS[key]}
                options={facets?.[key] || []}
                selected={filters[key] || []}
                onChange={(values) => setDimensionValues(key, values)}
                searchable={(facets?.[key] || []).length > 6}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowMore((value) => !value)}
            className="text-[12px] font-medium text-[#1a3673] hover:underline"
          >
            {showMore ? "Hide extra filters" : "More filters"}
          </button>

          {showMore && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SECONDARY_FILTER_KEYS.map((key) => (
                <CfoMultiSelect
                  key={key}
                  label={FILTER_LABELS[key]}
                  options={facets?.[key] || []}
                  selected={filters[key] || []}
                  onChange={(values) => setDimensionValues(key, values)}
                  searchable={(facets?.[key] || []).length > 6}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuerySummaryBar({ title, items, loading, error }) {
  if (error) {
    return (
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{error}</p>
    );
  }
  if (loading) {
    return <p className="mt-3 text-[12px] text-slate-500">Loading filtered summary…</p>;
  }
  if (!items?.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {items.map((item) => {
          const formatted = formatExplorerValue(item.value, item.kind);
          return (
            <div key={item.key} className="rounded-lg bg-[#f8fafc] px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#1a3673]">{formatted.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function QuerySummaryFromResponse({ title, summary, mode, loading, error }) {
  const items = summary ? explorerSummarySections(summary, mode) : [];
  return <QuerySummaryBar title={title} items={items} loading={loading} error={error} />;
}
