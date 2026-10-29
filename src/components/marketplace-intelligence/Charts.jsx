import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInr, formatPct } from "../../lib/marketplace-intelligence/index.js";

const NAVY = "#1a3673";
const ORANGE = "#fc7c23";
const MUTED = "#64748b";
const COLORS = [NAVY, ORANGE, "#3b82f6", "#0f766e", "#b45309", "#64748b", "#7c3aed", "#be123c"];

function ChartShell({ title, children, onInvestigate, investigateLabel = "Ask about this chart" }) {
  return (
    <div className="rounded-2xl border border-[rgba(26,54,115,0.1)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#1a3673]">{title}</h3>
        {onInvestigate ? (
          <button
            type="button"
            onClick={onInvestigate}
            className="rounded-full border border-[rgba(26,54,115,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#1a3673] hover:border-[#fc7d25]"
          >
            {investigateLabel}
          </button>
        ) : null}
      </div>
      <div className="h-64 w-full">{children}</div>
    </div>
  );
}

export function MonthlySalesChart({ rows, onInvestigate }) {
  return (
    <ChartShell title="Monthly product sales (₹)" onInvestigate={onInvestigate}>
      <ResponsiveContainer>
        <LineChart data={rows || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: MUTED }} />
          <YAxis tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} width={48} />
          <Tooltip formatter={(value) => [formatInr(value), "Sales"]} />
          <Legend />
          <Line
            type="monotone"
            dataKey="sales"
            name="Product sales"
            stroke={NAVY}
            strokeWidth={2.5}
            dot={{ r: 3, fill: ORANGE }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function MonthlyOrdersChart({ rows, onInvestigate }) {
  return (
    <ChartShell title="Monthly orders (distinct order IDs)" onInvestigate={onInvestigate}>
      <ResponsiveContainer>
        <BarChart data={rows || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: MUTED }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} width={36} />
          <Tooltip formatter={(value) => [value, "Orders"]} />
          <Legend />
          <Bar dataKey="orders" name="Orders" fill={NAVY} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function WeeklySalesChart({ rows, onInvestigate }) {
  return (
    <ChartShell title="Weekly product sales (₹)" onInvestigate={onInvestigate}>
      <ResponsiveContainer>
        <BarChart data={rows || []} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="weekStart" tick={{ fontSize: 10, fill: MUTED }} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} width={48} />
          <Tooltip formatter={(value) => [formatInr(value), "Sales"]} />
          <Legend />
          <Bar dataKey="sales" name="Product sales" fill={ORANGE} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function ProductMixChart({ rows, onInvestigate }) {
  const data = (rows || []).slice(0, 6).map((row) => ({
    name: row.productName.length > 28 ? `${row.productName.slice(0, 28)}…` : row.productName,
    fullName: row.productName,
    value: row.sales,
    share: row.revenueShare,
  }));
  return (
    <ChartShell title="Product mix — top sellers" onInvestigate={onInvestigate}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.fullName} fill={COLORS[index % COLORS.length]} />
            ))}
            <LabelList
              dataKey="share"
              position="outside"
              formatter={(value) => formatPct(value, { digits: 0 })}
              style={{ fontSize: 10, fill: NAVY }}
            />
          </Pie>
          <Tooltip
            formatter={(value, _name, props) => [
              `${formatInr(value)} (${formatPct(props?.payload?.share)})`,
              props?.payload?.fullName || "Sales",
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function FeeBreakdownChart({ rows, onInvestigate }) {
  const data = (rows || [])
    .filter((row) => row.amount < 0)
    .slice(0, 8)
    .map((row) => ({
      name: row.label.length > 28 ? `${row.label.slice(0, 28)}…` : row.label,
      amount: Math.abs(row.amount),
    }));
  return (
    <ChartShell title="Settlement drains (absolute ₹)" onInvestigate={onInvestigate}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
          <YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 10, fill: MUTED }} />
          <Tooltip formatter={(value) => [formatInr(value), "Amount"]} />
          <Bar dataKey="amount" name="Outflow" fill={ORANGE} radius={[0, 6, 6, 0]}>
            <LabelList dataKey="amount" position="right" formatter={(v) => formatInr(v)} style={{ fontSize: 10, fill: NAVY }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function ConcentrationChart({ products, concentration }) {
  const data = (products || []).slice(0, 8).map((row, index) => ({
    name: row.productName.length > 24 ? `${row.productName.slice(0, 24)}…` : row.productName,
    sales: row.sales,
    share: row.revenueShare,
    fill: COLORS[index % COLORS.length],
  }));
  return (
    <ChartShell title={`Top-eight revenue share (${formatPct(concentration)})`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: MUTED }} />
          <Tooltip
            formatter={(value, _name, props) => [
              `${formatInr(value)} · ${formatPct(props?.payload?.share)} revenue share`,
              "Sales",
            ]}
          />
          <Bar dataKey="sales" name="Gross product sales" radius={[0, 6, 6, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
            <LabelList
              dataKey="share"
              position="right"
              formatter={(v) => formatPct(v, { digits: 0 })}
              style={{ fontSize: 10, fill: NAVY }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

export function ConcentrationNote({ value }) {
  return (
    <p className="text-sm text-slate-600">
      Top-eight revenue share: <span className="font-semibold text-[#1a3673]">{formatPct(value)}</span>
      . Calculated from this file — revenue share, not profitability.
    </p>
  );
}
