/** End of month 12 (1-based month index), 0-based in series */
export const MONTH_12_INDEX = 11;

export function formatInrCompact(n) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

export function formatAxisInr(n) {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(0)}L`;
  return `${Math.round(n / 1000)}k`;
}
