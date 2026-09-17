import { formatExplorerValue } from "../../lib/revenue-margin/format.js";

/**
 * Executive primary KPI row for Revenue & Margin Overview.
 * Values must come from existing summary/overview selectors — never hardcoded.
 */
export default function PrimaryKpiRow({ items = [], loading = false }) {
  if (loading && (!items || items.every((item) => item.value == null))) {
    return <p className="text-[12px] text-slate-500">Loading financial state…</p>;
  }

  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Primary financial state
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {items.map((item) => {
          const formatted = formatExplorerValue(item.value, item.kind);
          return (
            <div
              key={item.key}
              className="rounded-xl border border-[rgba(26,54,115,0.08)] bg-[#f8fafc] px-3 py-3 sm:px-4 sm:py-4"
              data-testid={`primary-kpi-${item.key}`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
              <p
                className={[
                  "mt-2 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
                  formatted.supported ? "text-[#1a3673]" : "text-slate-400",
                ].join(" ")}
              >
                {formatted.supported ? formatted.text : "Unavailable"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
