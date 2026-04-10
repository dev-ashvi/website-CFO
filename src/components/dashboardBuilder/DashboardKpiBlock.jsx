import { TrendingDown, TrendingUp, Minus, Pencil, Trash2, Maximize2 } from "lucide-react";

function TrendIcon({ trend }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-emerald-600" strokeWidth={2} aria-hidden />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-rose-600" strokeWidth={2} aria-hidden />;
  return <Minus className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />;
}

export default function DashboardKpiBlock({ block, onEdit, onDelete, onExpand, expanded }) {
  return (
    <div
      className={`relative flex h-full min-h-[140px] flex-col rounded-2xl border border-[#1a3673]/12 bg-gradient-to-b from-[#1a3673]/[0.04] to-white p-4 shadow-sm ring-1 ring-[#1a3673]/10 ${
        expanded ? "ring-2 ring-[#fc7d25]/40" : ""
      }`}
    >
      <div className="absolute right-2 top-2 flex gap-0.5">
        <button
          type="button"
          onClick={() => onExpand?.(block.id)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-[#1a3673]"
          aria-label="Expand"
        >
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onEdit?.(block)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/80 hover:text-[#1a3673]"
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
      <p className="pr-20 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{block.metricName}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[#1a3673]">{block.value}</p>
      <div className="mt-auto flex items-center gap-2 pt-3">
        <TrendIcon trend={block.trend} />
        <span className="text-[11px] font-medium text-slate-500">Trend (demo)</span>
      </div>
    </div>
  );
}
