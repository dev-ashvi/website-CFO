import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInr } from "../../lib/financial-simulator/format.js";

export function SimulatorCharts({ months }) {
  const cashData = useMemo(
    () =>
      months.map((m) => ({
        label: m.monthLabel,
        cash: m.closingCash == null ? 0 : m.closingCash,
        cashOut: m.cashOut,
      })),
    [months],
  );

  const firstCashOut = useMemo(() => cashData.find((d) => d.cashOut) || null, [cashData]);

  const cashCaption = useMemo(() => {
    const last = months[months.length - 1];
    const shortfall = last?.closingCash != null && last.closingCash < 0 ? last.closingCash : null;
    if (firstCashOut) {
      const shortfallText =
        shortfall != null ? ` Projected funding shortfall by Month 24: ${formatInr(shortfall)}.` : "";
      return `Cash becomes negative in ${firstCashOut.label}.${shortfallText}`;
    }
    return "Cash remains non-negative across the 24-month forecast.";
  }, [months, firstCashOut]);

  const revExpData = useMemo(
    () =>
      months.map((m) => ({
        label: m.monthLabel,
        revenue: m.revenue,
        expenses:
          m.cogs +
          m.otherDirectCosts +
          m.salesAndMarketing +
          m.productAndTechnology +
          m.totalOperatingExpenses,
        monthIndex: m.monthIndex,
      })),
    [months],
  );

  const revExpCaption = useMemo(() => {
    const firstRevLead = revExpData.find((d) => d.revenue > d.expenses);
    const alwaysExp = revExpData.every((d) => d.expenses >= d.revenue);
    if (alwaysExp) return "Expenses remain above revenue throughout the forecast.";
    if (firstRevLead) return `Revenue exceeds expenses from Month ${firstRevLead.monthIndex}.`;
    return "Revenue and expenses cross during the forecast period.";
  }, [revExpData]);

  const ebitdaPoints = useMemo(() => {
    const m1 = months[0];
    const m12 = months[11];
    const m24 = months[months.length - 1];
    const values = months.map((m) => m.ebitda);
    const allNeg = values.every((v) => v < 0);
    const allPos = values.every((v) => v > 0);
    const firstPos = months.find((m) => m.ebitda > 0);
    let caption = "EBITDA crosses zero during the forecast period.";
    if (allNeg) caption = "EBITDA remains negative throughout the forecast period.";
    else if (allPos) caption = "EBITDA remains positive throughout the forecast period.";
    else if (firstPos) caption = `EBITDA turns positive in Month ${firstPos.monthIndex}.`;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(Math.abs(max - min) * 0.15, Math.abs(max) * 0.05, 1000);
    return {
      m1,
      m12,
      m24,
      caption,
      domain: [min - pad, max + pad],
      spark: months.map((m) => ({ label: m.monthLabel, ebitda: m.ebitda })),
    };
  }, [months]);

  const tickFmt = (v) => formatInr(v, { compact: true }).replace("₹", "");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-4">
      <ChartCard title="Monthly closing cash">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={cashData}>
            <defs>
              <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fc7d25" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#fc7d25" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(26,54,115,0.08)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={tickFmt} width={64} />
            <Tooltip
              formatter={(v) => formatInr(v)}
              contentStyle={tooltipStyle}
              labelFormatter={(label) => {
                const pt = cashData.find((d) => d.label === label);
                return pt?.cashOut ? `${label} · Cash-out` : label;
              }}
            />
            <ReferenceLine y={0} stroke="rgba(26,54,115,0.25)" strokeDasharray="3 3" />
            {firstCashOut && (
              <>
                <ReferenceLine x={firstCashOut.label} stroke="#1a3673" strokeDasharray="4 4" strokeWidth={1.25} />
                <ReferenceDot
                  x={firstCashOut.label}
                  y={firstCashOut.cash}
                  r={4}
                  fill="#fc7d25"
                  stroke="#1a3673"
                  strokeWidth={1.5}
                />
              </>
            )}
            <Area
              type="monotone"
              dataKey="cash"
              name="Closing cash"
              stroke="#fc7d25"
              fill="url(#cashFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{cashCaption}</p>
      </ChartCard>

      <ChartCard title="Revenue vs total expenses">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={revExpData}>
            <CartesianGrid stroke="rgba(26,54,115,0.08)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={tickFmt} width={64} />
            <Tooltip formatter={(v) => formatInr(v)} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1a3673" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#94a3b8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{revExpCaption}</p>
      </ChartCard>

      <ChartCard title="EBITDA trend" className="lg:col-span-2">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <EbitdaCheckpoint label="Month 1" value={ebitdaPoints.m1?.ebitda} />
            <EbitdaCheckpoint label="Month 12" value={ebitdaPoints.m12?.ebitda} />
            <EbitdaCheckpoint label="Month 24" value={ebitdaPoints.m24?.ebitda} />
          </div>
          <div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={ebitdaPoints.spark} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(26,54,115,0.06)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" hide />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748B" }}
                  tickFormatter={tickFmt}
                  width={56}
                  domain={ebitdaPoints.domain}
                />
                <Tooltip formatter={(v) => formatInr(v)} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke="rgba(26,54,115,0.35)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#1a3673" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{ebitdaPoints.caption}</p>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}

function EbitdaCheckpoint({ label, value }) {
  const negative = Number(value) < 0;
  return (
    <div className="rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-2.5 py-3 text-center sm:px-3">
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-[13px] font-semibold sm:text-sm ${negative ? "text-[#c55a12]" : "text-[#1a3673]"}`}>
        {formatInr(value)}
      </p>
    </div>
  );
}

function ChartCard({ title, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white p-4 shadow-[0_8px_32px_rgba(26,54,115,0.07)] md:rounded-[1.35rem] md:p-5 ${className}`}
    >
      <h3 className="mb-3 text-sm font-semibold text-[#1a3673]">{title}</h3>
      {children}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(26,54,115,0.12)",
  boxShadow: "0 8px 24px rgba(26,54,115,0.1)",
  fontSize: 12,
};
