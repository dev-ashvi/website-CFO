import { Pencil, Trash2, Maximize2 } from "lucide-react";

export default function DashboardTableBlock({ block, onEdit, onDelete, onExpand, expanded }) {
  const cols = block.columns || [];
  const rows = block.rows || [];

  return (
    <div
      className={`relative flex h-full min-h-[180px] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80 ${
        expanded ? "ring-2 ring-[#fc7d25]/40" : ""
      }`}
    >
      <div className="absolute right-2 top-2 z-10 flex gap-0.5">
        <button
          type="button"
          onClick={() => onExpand?.(block.id)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-[#1a3673]"
          aria-label="Expand"
        >
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onEdit?.(block)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-[#1a3673]"
          aria-label="Edit"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(block.id)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="border-b border-slate-100 px-4 py-3 pr-24">
        <h3 className="text-[14px] font-semibold text-[#1a3673]">{block.title}</h3>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">{block.dataset}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[200px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {cols.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, ri) => (
              <tr key={ri} className="text-slate-700">
                {cols.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {row[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
