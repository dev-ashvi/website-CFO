import { Pencil, Trash2, Maximize2 } from "lucide-react";

function LineChart({ labels, series, height = 120 }) {
  const w = 280;
  const h = height;
  const pad = 8;
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const span = max - min || 1;
  const n = labels.length;
  const step = n > 1 ? (w - pad * 2) / (n - 1) : 0;

  const colors = ["#1a3673", "#fc7d25", "#0d9488"];

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" preserveAspectRatio="xMidYMid meet">
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => {
          const x = pad + i * step;
          const y = pad + (1 - (v - min) / span) * (h - pad * 2);
          return `${x},${y}`;
        });
        return (
          <polyline
            key={s.name}
            fill="none"
            stroke={colors[si % colors.length]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={pts.join(" ")}
          />
        );
      })}
    </svg>
  );
}

function BarChart({ labels, series, height = 120 }) {
  const w = 280;
  const h = height;
  const pad = 12;
  const primary = series[0];
  if (!primary) return null;
  const max = Math.max(...primary.values, 1);
  const barW = (w - pad * 2) / primary.values.length - 4;

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {primary.values.map((v, i) => {
        const bh = ((v / max) * (h - pad * 2)) || 2;
        const x = pad + i * (barW + 4);
        const y = h - pad - bh;
        return <rect key={i} x={x} y={y} width={barW} height={bh} rx={3} fill="#1a3673" opacity={0.85} />;
      })}
    </svg>
  );
}

export default function DashboardChartBlock({ block, onEdit, onDelete, onExpand, expanded, timeRangeLabel }) {
  const { labels, series } = block.chartData || { labels: [], series: [] };

  return (
    <div
      className={`relative flex h-full min-h-[200px] flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100/80 ${
        expanded ? "ring-2 ring-[#fc7d25]/40" : ""
      }`}
    >
      <div className="absolute right-2 top-2 flex gap-0.5">
        <button
          type="button"
          onClick={() => onExpand?.(block.id)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-[#1a3673]"
          aria-label="Expand"
        >
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onEdit?.(block)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-[#1a3673]"
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
      <div className="pr-20">
        <h3 className="text-[14px] font-semibold text-[#1a3673]">{block.title}</h3>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {block.chartType} · {block.metrics?.join(", ")} · {timeRangeLabel || block.timeRange}
        </p>
      </div>
      <div className="mt-3 min-h-[120px] flex-1">
        {block.chartType === "bar" ? (
          <BarChart labels={labels} series={series} />
        ) : (
          <LineChart labels={labels} series={series} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 border-t border-slate-100 pt-2">
        {series.map((s, i) => (
          <span key={s.name} className="flex items-center gap-1.5 text-[10px] font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-[#1a3673]" style={{ opacity: 1 - i * 0.25 }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
