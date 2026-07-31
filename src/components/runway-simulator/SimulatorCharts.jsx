import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInr, formatPercent } from "../../lib/financial-simulator/format.js";
import {
  buildCapexImpactNote,
  buildClosingCashCaption,
} from "../../lib/financial-simulator/capexCashInsight.js";

const NAVY = "#1a3673";
const ORANGE = "#fc7d25";

export function SimulatorCharts({ months, expenseMix, capexComparison }) {
  const cashData = useMemo(
    () =>
      months.map((m) => ({
        label: m.monthLabel,
        includingCapex: m.closingCash == null ? 0 : m.closingCash,
        excludingCapex: m.closingCashExcludingCapex == null ? 0 : m.closingCashExcludingCapex,
        cashOut: m.cashOut,
        cashOutExcludingCapex: m.cashOutExcludingCapex,
        monthlyCapex: m.capex || 0,
        cumulativeCapex: m.cumulativeCapex || 0,
      })),
    [months],
  );

  const firstCashOutIncluding = useMemo(() => cashData.find((d) => d.cashOut) || null, [cashData]);
  const firstCashOutExcluding = useMemo(() => {
    const pt = cashData.find((d) => d.cashOutExcludingCapex) || null;
    if (!pt) return null;
    if (firstCashOutIncluding && firstCashOutIncluding.label === pt.label) return null;
    return pt;
  }, [cashData, firstCashOutIncluding]);

  const cashCaption = useMemo(() => buildClosingCashCaption(capexComparison), [capexComparison]);
  const capexNote = useMemo(() => buildCapexImpactNote(capexComparison), [capexComparison]);

  const expenseOverTime = useMemo(
    () =>
      months.map((m) => ({
        label: m.monthLabel,
        variable: m.totalVariableExpenses,
        fixed: m.totalFixedExpenses,
      })),
    [months],
  );

  const mixPie = useMemo(() => {
    const variable = expenseMix?.averageMonthlyVariableExpenses ?? 0;
    const fixed = expenseMix?.averageMonthlyFixedExpenses ?? 0;
    return [
      { name: "Variable expenses", value: variable, color: ORANGE },
      { name: "Fixed expenses", value: fixed, color: NAVY },
    ];
  }, [expenseMix]);

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
    <div className="space-y-4">
      {expenseMix ? (
        <ChartCard title="Expense breakdown">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.1fr] md:items-center">
            <div className="space-y-3">
              <MixStat
                label="Avg monthly variable expenses"
                value={formatInr(expenseMix.averageMonthlyVariableExpenses)}
                tone="orange"
                help="Costs that change with revenue, such as COGS, direct costs, marketing, and product or technology expenses."
              />
              <MixStat
                label="Avg monthly fixed expenses"
                value={formatInr(expenseMix.averageMonthlyFixedExpenses)}
                tone="navy"
                help="Monthly costs that do not directly change with revenue, such as payroll and other recurring overheads."
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[rgba(252,125,37,0.25)] bg-[rgba(252,125,37,0.06)] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-slate-500">Variable share</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#fc7d25]">
                    {formatPercent(expenseMix.variableExpensePercent)}
                  </p>
                </div>
                <div className="rounded-xl border border-[rgba(26,54,115,0.18)] bg-[#f4f8ff] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-slate-500">Fixed share</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1a3673]">
                    {formatPercent(expenseMix.fixedExpensePercent)}
                  </p>
                </div>
              </div>
              {expenseMix.largestExpenseCategory ? (
                <p className="text-[12px] leading-relaxed text-slate-500">
                  Largest category:{" "}
                  <span className="font-semibold text-[#1a3673]">{expenseMix.largestExpenseCategory}</span>
                </p>
              ) : null}
            </div>
            <div className="mx-auto w-full max-w-[260px]">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={mixPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {mixPie.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatInr(v)} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-4">
        <ChartCard title="Closing cash position">
          <p className="sr-only">
            Line chart comparing closing cash including CapEx and excluding CapEx across the 24-month forecast.
            Including CapEx is the actual projected cash position and drives runway. Excluding CapEx is the operating
            cash position before planned capital expenditure.
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={cashData}>
              <CartesianGrid stroke="rgba(26,54,115,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={tickFmt} width={64} />
              <Tooltip content={<CashPositionTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="rgba(26,54,115,0.25)" strokeDasharray="3 3" />
              {firstCashOutIncluding && (
                <>
                  <ReferenceLine
                    x={firstCashOutIncluding.label}
                    stroke="#1a3673"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                  <ReferenceDot
                    x={firstCashOutIncluding.label}
                    y={firstCashOutIncluding.includingCapex}
                    r={5}
                    fill={ORANGE}
                    stroke="#1a3673"
                    strokeWidth={1.5}
                  />
                </>
              )}
              {firstCashOutExcluding && (
                <>
                  <ReferenceLine
                    x={firstCashOutExcluding.label}
                    stroke="rgba(26,54,115,0.45)"
                    strokeDasharray="3 5"
                    strokeWidth={1}
                  />
                  <ReferenceDot
                    x={firstCashOutExcluding.label}
                    y={firstCashOutExcluding.excludingCapex}
                    r={3.5}
                    fill="#fff"
                    stroke={NAVY}
                    strokeWidth={1.5}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="includingCapex"
                name="Including CapEx"
                stroke={ORANGE}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="excludingCapex"
                name="Excluding CapEx"
                stroke={NAVY}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{cashCaption}</p>
          {capexNote ? (
            <p className="mt-2 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-3 py-2 text-[12px] leading-relaxed text-slate-600">
              <span className="font-semibold text-[#1a3673]">CapEx impact — </span>
              {capexNote}
            </p>
          ) : null}
        </ChartCard>

        <ChartCard title="Fixed vs variable expenses over time">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={expenseOverTime}>
              <defs>
                <linearGradient id="varFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ORANGE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ORANGE} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fixFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NAVY} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={NAVY} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(26,54,115,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={tickFmt} width={64} />
              <Tooltip formatter={(v) => formatInr(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="variable"
                name="Variable"
                stackId="1"
                stroke={ORANGE}
                fill="url(#varFill)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="fixed"
                name="Fixed"
                stackId="1"
                stroke={NAVY}
                fill="url(#fixFill)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
            CapEx is excluded. Variable costs scale with revenue; fixed costs grow from monthly assumptions.
          </p>
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
    </div>
  );
}

function CashPositionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const cashOutNote = row.cashOut ? " · Cash-out including CapEx" : "";
  return (
    <div style={tooltipStyle} className="bg-white px-3 py-2.5 text-[12px] text-[#1a3673]">
      <p className="font-semibold">
        {label}
        {cashOutNote}
      </p>
      <p className="mt-1.5">Including CapEx: {formatInr(row.includingCapex)}</p>
      <p>Excluding CapEx: {formatInr(row.excludingCapex)}</p>
      <p className="mt-1 text-slate-500">Monthly CapEx: {formatInr(row.monthlyCapex)}</p>
      <p className="text-slate-500">Cumulative CapEx: {formatInr(row.cumulativeCapex)}</p>
    </div>
  );
}

function MixStat({ label, value, tone, help }) {
  const border =
    tone === "orange" ? "border-[rgba(252,125,37,0.22)]" : "border-[rgba(26,54,115,0.14)]";
  return (
    <div className={`rounded-xl border ${border} bg-[#f8fafc] px-3.5 py-3`} title={help}>
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${tone === "orange" ? "text-[#fc7d25]" : "text-[#1a3673]"}`}>
        {value}
      </p>
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
