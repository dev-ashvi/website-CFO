const RECON_COPY = {
  matched: "Comparable lines matched",
  differences_found: "Confirmed differences on comparable lines",
  reviewed: "Reviewed",
  pdf_missing: "PDF not provided",
  not_run: "Not run",
  partial: "Partial",
};

export default function FilterBar({
  period,
  products,
  filters,
  onChange,
  reconciliationStatus,
  reconciliationLabel,
}) {
  return (
    <section className="rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white/90 p-4 shadow-[0_8px_24px_rgba(26,54,115,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-xs font-semibold text-slate-500">
          From
          <input
            type="date"
            value={filters.dateRange?.start || ""}
            min={period?.start || undefined}
            max={period?.end || undefined}
            onChange={(e) =>
              onChange({
                ...filters,
                dateRange: { ...filters.dateRange, start: e.target.value || null },
              })
            }
            className="mt-1 block w-full rounded-xl border border-[rgba(26,54,115,0.16)] px-3 py-2 text-sm text-[#1a3673] sm:w-auto"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          To
          <input
            type="date"
            value={filters.dateRange?.end || ""}
            min={period?.start || undefined}
            max={period?.end || undefined}
            onChange={(e) =>
              onChange({
                ...filters,
                dateRange: { ...filters.dateRange, end: e.target.value || null },
              })
            }
            className="mt-1 block w-full rounded-xl border border-[rgba(26,54,115,0.16)] px-3 py-2 text-sm text-[#1a3673] sm:w-auto"
          />
        </label>
        <label className="min-w-0 flex-1 text-xs font-semibold text-slate-500 sm:min-w-[180px]">
          Product
          <select
            value={filters.products?.[0] || ""}
            onChange={(e) =>
              onChange({
                ...filters,
                products: e.target.value ? [e.target.value] : [],
              })
            }
            className="mt-1 block w-full rounded-xl border border-[rgba(26,54,115,0.16)] px-3 py-2 text-sm text-[#1a3673]"
          >
            <option value="">All products</option>
            {(products || []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onChange({ dateRange: { start: null, end: null }, products: [], categories: [] })}
          className="rounded-full border border-[rgba(26,54,115,0.14)] px-3 py-2 text-xs font-semibold text-[#1a3673]"
        >
          Clear filters
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Period {period?.start || "—"} to {period?.end || "—"}.{" "}
        {reconciliationLabel || RECON_COPY[reconciliationStatus] || "Reconciliation pending"}.
      </p>
    </section>
  );
}
