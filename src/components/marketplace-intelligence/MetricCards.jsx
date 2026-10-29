import { formatCount, formatInr, formatPct } from "../../lib/marketplace-intelligence/index.js";

export function MetricCard({ label, value, kind = "currency", hint }) {
  let display = "—";
  if (kind === "currency") display = formatInr(value);
  else if (kind === "pct") display = formatPct(value);
  else if (kind === "count") display = formatCount(value);
  else if (value != null) display = String(value);

  return (
    <div className="rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(26,54,115,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-[#1a3673]">{display}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function MetricGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item) => (
        <MetricCard key={item.label} {...item} />
      ))}
    </div>
  );
}
