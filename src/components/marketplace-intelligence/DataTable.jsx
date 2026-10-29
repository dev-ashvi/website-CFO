import { useMemo, useState } from "react";
import { formatInr, formatPct } from "../../lib/marketplace-intelligence/index.js";

function formatCell(value, kind) {
  if (kind === "currency") return formatInr(value);
  if (kind === "pct") return formatPct(value);
  if (value == null || value === "") return "—";
  return String(value);
}

export default function DataTable({
  columns,
  rows,
  rowKey = "id",
  onRowClick,
  empty = "No rows in the current scope.",
}) {
  const [sortKey, setSortKey] = useState(columns.find((c) => c.defaultSort)?.key || columns[0]?.key);
  const [direction, setDirection] = useState(columns.find((c) => c.defaultSort)?.defaultSort || "desc");

  const sorted = useMemo(() => {
    const copy = [...(rows || [])];
    copy.sort((a, b) => {
      const av = a?.[sortKey];
      const bv = b?.[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return direction === "asc" ? av - bv : bv - av;
      }
      return direction === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });
    return copy;
  }, [rows, sortKey, direction]);

  const toggleSort = (key) => {
    if (sortKey === key) setDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDirection("desc");
    }
  };

  if (!sorted.length) {
    return <p className="rounded-xl bg-[#f8fafc] px-3 py-4 text-sm text-slate-500">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[rgba(26,54,115,0.1)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#f8fafc] text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2.5 font-semibold ${col.kind === "currency" || col.kind === "pct" || col.align === "right" ? "text-right" : "text-left"}`}
              >
                <button type="button" className="hover:text-[#1a3673]" onClick={() => toggleSort(col.key)}>
                  {col.label}
                  {sortKey === col.key ? (direction === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={row[rowKey] ?? index}
              className={`border-t border-[rgba(26,54,115,0.06)] ${onRowClick ? "cursor-pointer hover:bg-[#fff8f3]" : ""}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2.5 text-[#1a3673] tabular-nums ${
                    col.kind === "currency" || col.kind === "pct" || col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {col.render ? col.render(row[col.key], row) : formatCell(row[col.key], col.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
