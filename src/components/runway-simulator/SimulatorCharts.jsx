import { useMemo } from "react";
import {
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
import { formatMoney, formatPercent, stripMoneySymbol } from "../../lib/financial-simulator/format.js";
import {
  buildCapexImpactNote,
  buildClosingCashCaption,
} from "../../lib/financial-simulator/capexCashInsight.js";
import {
  buildClosingCashChartSeries,
  buildRevenueVsExpensesChartSeries,
  findFirstNegativeCashMonth,
} from "../../lib/financial-simulator/chartSeries.js";
import { CashMovementBreakdown } from "./CashMovementBreakdown.jsx";

const NAVY = "#1a3673";
const ORANGE = "#fc7d25";

export function SimulatorCharts({
  months,
  expenseMix,
  capexComparison,
  kpis,
  inputs,
  currency = "INR",
  viewMode,
  onApplyOverlay,
  onApplyScenario,
}) {
  const money = (v) => formatMoney(v, { currency });
  const cashData = useMemo(() => buildClosingCashChartSeries(months), [months]);

  const firstCashOutIncluding = useMemo(() => {
    const hit = findFirstNegativeCashMonth(months, { includingCapex: true });
    if (!hit) return null;
    return cashData.find((d) => d.monthIndex === hit.monthIndex) ?? null;
  }, [months, cashData]);

  const firstCashOutExcluding = useMemo(() => {
    const hit = findFirstNegativeCashMonth(months, { includingCapex: false });
    if (!hit) return null;
    const pt = cashData.find((d) => d.monthIndex === hit.monthIndex) ?? null;
    if (!pt) return null;
    if (firstCashOutIncluding && firstCashOutIncluding.monthIndex === pt.monthIndex) return null;
    return pt;
  }, [months, cashData, firstCashOutIncluding]);

  const cashOutLabel = kpis?.cashOutMonthLabel ?? firstCashOutIncluding?.label ?? null;

  const cashCaption = useMemo(() => buildClosingCashCaption(capexComparison), [capexComparison]);
  const capexNote = useMemo(() => buildCapexImpactNote(capexComparison), [capexComparison]);

  const revExpData = useMemo(() => buildRevenueVsExpensesChartSeries(months), [months]);

  const revExpCaption = useMemo(() => {
    const firstRevLead = revExpData.find((d) => d.revenue > d.expenses);
    const alwaysExp = revExpData.every((d) => d.expenses >= d.revenue);
    if (alwaysExp) return "Expenses remain above revenue throughout the forecast.";
    if (firstRevLead) return `Revenue exceeds expenses from Month ${firstRevLead.monthIndex}.`;
    return "Revenue and expenses cross during the forecast period.";
  }, [revExpData]);

  const mixPie = useMemo(() => {
    const variable = expenseMix?.variableExpenses ?? expenseMix?.averageMonthlyVariableExpenses ?? 0;
    const fixed = expenseMix?.fixedExpenses ?? expenseMix?.averageMonthlyFixedExpenses ?? 0;
    const total = variable + fixed;
    return [
      {
        name: "Variable expenses",
        value: variable,
        share: total > 0 ? variable / total : 0,
        color: ORANGE,
      },
      {
        name: "Fixed expenses",
        value: fixed,
        share: total > 0 ? fixed / total : 0,
        color: NAVY,
      },
    ];
  }, [expenseMix]);

  const ebitdaPoints = useMemo(() => {
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
      caption,
      domain: [min - pad, max + pad],
      series: months.map((m) => ({
        label: m.monthLabel,
        ebitda: m.ebitda,
        ebitdaMargin: m.ebitdaMargin ?? 0,
      })),
    };
  }, [months]);

  const tickFmt = (v) => stripMoneySymbol(formatMoney(v, { currency, compact: true }), currency);

  return (
    <div className="space-y-4">
      {expenseMix ? (
        <ChartCard
          title="Expense breakdown"
          badge="MONTH 1 SNAPSHOT"
          subtitle="Month 1 operating expense mix (excludes COGS and other direct costs)"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.1fr] md:items-center">
            <div className="space-y-3">
              <MixStat
                label="Variable expenses"
                value={money(expenseMix.variableExpenses ?? expenseMix.averageMonthlyVariableExpenses)}
                tone="orange"
                help="Month 1 fulfilment and sales & marketing operating costs only."
              />
              <MixStat
                label="Fixed expenses"
                value={money(expenseMix.fixedExpenses ?? expenseMix.averageMonthlyFixedExpenses)}
                tone="navy"
                help="Month 1 payroll and other fixed operating costs."
              />
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="rounded-xl border border-[rgba(252,125,37,0.25)] bg-[rgba(252,125,37,0.06)] px-3 py-2.5"
                  title="Variable expenses as a percentage of Month 1 operating expenses."
                >
                  <p className="text-[11px] font-medium text-slate-500">Variable share</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#fc7d25]">
                    {formatPercent(
                      expenseMix.variableSharePercent ?? expenseMix.variableExpensePercent,
                    )}
                  </p>
                </div>
                <div
                  className="rounded-xl border border-[rgba(26,54,115,0.18)] bg-[#f4f8ff] px-3 py-2.5"
                  title="Fixed expenses as a percentage of Month 1 operating expenses."
                >
                  <p className="text-[11px] font-medium text-slate-500">Fixed share</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1a3673]">
                    {formatPercent(expenseMix.fixedSharePercent ?? expenseMix.fixedExpensePercent)}
                  </p>
                </div>
              </div>
              {(expenseMix.largestExpenseCategoryLabel ?? expenseMix.largestExpenseCategory) ? (
                <p className="text-[12px] leading-relaxed text-slate-500">
                  Largest category:{" "}
                  <span className="font-semibold text-[#1a3673]">
                    {expenseMix.largestExpenseCategoryLabel ?? expenseMix.largestExpenseCategory}
                  </span>
                  {expenseMix.largestExpenseCategoryAmount != null ? (
                    <span className="text-slate-400">
                      {" "}
                      · {money(expenseMix.largestExpenseCategoryAmount)}
                      {(expenseMix.largestExpenseCategorySharePercent ??
                        expenseMix.largestExpenseCategoryPercent) != null
                        ? ` · ${formatPercent(expenseMix.largestExpenseCategorySharePercent ?? expenseMix.largestExpenseCategoryPercent)} of Month 1 operating expenses`
                        : ""}
                    </span>
                  ) : null}
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
                  <Tooltip content={<ExpenseMixTooltip currency={currency} />} />
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
              <Tooltip content={<CashPositionTooltip currency={currency} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="rgba(26,54,115,0.25)" strokeDasharray="3 3" />
              {firstCashOutIncluding && cashOutLabel ? (
                <>
                  <ReferenceLine
                    x={firstCashOutIncluding.label}
                    stroke="#1a3673"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Projected Cash-Out ${cashOutLabel}`,
                      position: "insideTopRight",
                      fill: "#1a3673",
                      fontSize: 10,
                    }}
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
              ) : null}
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

        <ChartCard title="Revenue vs total expenses" subtitle="Excludes CapEx">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={revExpData}>
              <CartesianGrid stroke="rgba(26,54,115,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={tickFmt} width={64} />
              <Tooltip formatter={(v) => money(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1a3673" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expenses" name="Total expenses" stroke="#fc7d25" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{revExpCaption}</p>
        </ChartCard>

        <ChartCard title="EBITDA trend" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={ebitdaPoints.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(26,54,115,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} interval={3} />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748B" }}
                tickFormatter={tickFmt}
                width={64}
                domain={ebitdaPoints.domain}
              />
              <Tooltip content={<EbitdaTooltip currency={currency} />} />
              <ReferenceLine y={0} stroke="rgba(26,54,115,0.35)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#1a3673" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-center text-[12px] leading-relaxed text-slate-500">{ebitdaPoints.caption}</p>
        </ChartCard>
      </div>

      <CashMovementBreakdown
        months={months}
        expenseMix={expenseMix}
        capexComparison={capexComparison}
        kpis={kpis}
        inputs={inputs}
        currency={currency}
        viewMode={viewMode}
        onApplyOverlay={onApplyOverlay}
        onApplyScenario={onApplyScenario}
      />
    </div>
  );
}

function CashPositionTooltip({ active, payload, label, currency = "INR" }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const money = (v) => formatMoney(v, { currency });
  const isCashOut = row.includingCapex < 0;
  const cashOutNote = isCashOut ? " · Cash-out including CapEx" : "";
  return (
    <div style={tooltipStyle} className="bg-white px-3 py-2.5 text-[12px] text-[#1a3673]">
      <p className="font-semibold">
        {label}
        {cashOutNote}
      </p>
      <p className="mt-1.5">Including CapEx: {money(row.includingCapex)}</p>
      <p>Excluding CapEx: {money(row.excludingCapex)}</p>
      <p className="mt-1 text-slate-500">Monthly CapEx: {money(row.monthlyCapex)}</p>
      <p className="text-slate-500">Cumulative CapEx: {money(row.cumulativeCapex)}</p>
    </div>
  );
}

function ExpenseMixTooltip({ active, payload, currency = "INR" }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={tooltipStyle} className="bg-white px-3 py-2.5 text-[12px] text-[#1a3673]">
      <p className="font-semibold">{row.name}</p>
      <p className="mt-1">{formatMoney(row.value, { currency })}</p>
      <p className="text-slate-500">{formatPercent(row.share)}</p>
    </div>
  );
}

function EbitdaTooltip({ active, payload, label, currency = "INR" }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={tooltipStyle} className="bg-white px-3 py-2.5 text-[12px] text-[#1a3673]">
      <p className="font-semibold">{label}</p>
      <p className="mt-1.5">EBITDA: {formatMoney(row.ebitda, { currency })}</p>
      <p className="text-slate-500">EBITDA margin: {formatPercent(row.ebitdaMargin)}</p>
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

function ChartCard({ title, subtitle, badge, children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white p-4 shadow-[0_8px_32px_rgba(26,54,115,0.07)] md:rounded-[1.35rem] md:p-5 ${className}`}
    >
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[#1a3673]">{title}</h3>
          {badge ? (
            <span className="rounded-full bg-[rgba(252,125,37,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#fc7d25]">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="mt-1 text-[12px] text-slate-500">{subtitle}</p> : null}
      </div>
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
