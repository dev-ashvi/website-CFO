import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisInr, formatInrCompact } from "../../planning/scenarioDisplayFormat.js";

const LEGEND_STYLE = {
  fontSize: 12,
  paddingTop: 10,
  fontWeight: 500,
  color: "#334155",
};

export default function DashboardScenarioCharts({ series }) {
  if (!series?.horizonMonths) return null;

  const { horizonMonths, baseline, scenario } = series;
  const chartData = [];
  for (let m = 0; m < horizonMonths; m++) {
    chartData.push({
      month: m + 1,
      baselineRevenue: baseline.revenueSeries[m],
      scenarioRevenue: scenario.revenueSeries[m],
      baselineCash: baseline.cashSeries[m],
      scenarioCash: scenario.cashSeries[m],
    });
  }

  return (
    <div id="dashboard-scenario-charts" className="scroll-mt-4 space-y-5">
      <div className="rounded-2xl border border-[#1a3673]/15 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-[#1a3673]">Revenue projection</h3>
        <p className="mt-1 text-[12px] text-slate-500">Baseline vs preview scenario · monthly (model scale)</p>
        <div className="mt-4 h-[240px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#cbd5e1" tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={formatAxisInr} width={48} tickLine={false} />
              <Tooltip
                formatter={(v) => formatInrCompact(v)}
                labelFormatter={(l) => `Month ${l}`}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={LEGEND_STYLE} />
              <Line type="monotone" dataKey="baselineRevenue" name="Baseline" stroke="#94a3b8" strokeWidth={2.25} dot={false} />
              <Line type="monotone" dataKey="scenarioRevenue" name="Preview scenario" stroke="#1a3673" strokeWidth={2.25} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-[#1a3673]/15 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-[#1a3673]">Cash / runway curve</h3>
        <p className="mt-1 text-[12px] text-slate-500">Modeled cash path — where the curve crosses zero indicates runway (simplified)</p>
        <div className="mt-4 h-[240px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#cbd5e1" tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={formatAxisInr} width={48} tickLine={false} />
              <Tooltip
                formatter={(v) => formatInrCompact(v)}
                labelFormatter={(l) => `Month ${l}`}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={LEGEND_STYLE} />
              <Line type="monotone" dataKey="baselineCash" name="Baseline" stroke="#94a3b8" strokeWidth={2.25} dot={false} />
              <Line type="monotone" dataKey="scenarioCash" name="Preview scenario" stroke="#1a3673" strokeWidth={2.25} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
