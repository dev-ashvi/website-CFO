import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
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
import {
  forecastMonthOptions,
  formatInr,
  formatMonths,
  parseInrInput,
  runWhatIfScenario,
} from "../../lib/financial-simulator/index.js";

const TABS = [
  { id: "funding", label: "Raise funding" },
  { id: "cost-reduction", label: "Reduce costs" },
  { id: "revenue-growth", label: "Grow revenue" },
  { id: "payroll-delay", label: "Delay payroll growth" },
];

const FUNDING_QUICK = [
  { label: "₹25 lakh", amount: 2_500_000 },
  { label: "₹50 lakh", amount: 5_000_000 },
  { label: "₹1 crore", amount: 10_000_000 },
];

const COST_QUICK = [
  { label: "5%", rate: 0.05 },
  { label: "10%", rate: 0.1 },
  { label: "15%", rate: 0.15 },
];

const GROWTH_QUICK = [
  { label: "+1%", points: 0.01 },
  { label: "+2%", points: 0.02 },
  { label: "+5%", points: 0.05 },
];

const DELAY_QUICK = [
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "9 months", months: 9 },
];

/**
 * @param {{ baseInputs: object, baseResult: { months: object[], kpis: object } }} props
 */
export function WhatIfPanel({ baseInputs, baseResult }) {
  const [tab, setTab] = useState("funding");
  const [fundingAmount, setFundingAmount] = useState(5_000_000);
  const [fundingMonth, setFundingMonth] = useState(6);
  const [costRate, setCostRate] = useState(0.1);
  const [growthPoints, setGrowthPoints] = useState(0.02);
  const [delayMonths, setDelayMonths] = useState(6);
  const [customFunding, setCustomFunding] = useState("");

  const monthOptions = useMemo(
    () => forecastMonthOptions(baseInputs.forecastStartMonth),
    [baseInputs.forecastStartMonth],
  );

  const comparison = useMemo(() => {
    try {
      if (tab === "funding") {
        const amount =
          customFunding !== "" && customFunding != null
            ? Number(parseInrInput(customFunding) || 0)
            : Number(fundingAmount);
        if (!amount || amount <= 0) return null;
        return runWhatIfScenario(baseInputs, {
          type: "funding",
          params: { amount, monthIndex: Number(fundingMonth) || 1 },
        });
      }
      if (tab === "cost-reduction") {
        return runWhatIfScenario(baseInputs, {
          type: "cost-reduction",
          params: { reductionRate: costRate },
          label: `Reduce operating costs by ${Math.round(costRate * 100)}%`,
        });
      }
      if (tab === "revenue-growth") {
        return runWhatIfScenario(baseInputs, {
          type: "revenue-growth",
          params: { additionalPoints: growthPoints },
        });
      }
      return runWhatIfScenario(baseInputs, {
        type: "payroll-delay",
        params: { delayMonths },
      });
    } catch {
      return null;
    }
  }, [
    tab,
    baseInputs,
    fundingAmount,
    fundingMonth,
    customFunding,
    costRate,
    growthPoints,
    delayMonths,
  ]);

  const chartData = useMemo(() => {
    if (!comparison) return [];
    return comparison.baseMonths.map((m, i) => ({
      label: m.monthLabel,
      base: m.closingCash,
      scenario: comparison.scenarioMonths[i]?.closingCash,
      baseOut: m.cashOut,
      scenarioOut: comparison.scenarioMonths[i]?.cashOut,
    }));
  }, [comparison]);

  const firstBaseOut = chartData.find((d) => d.baseOut);
  const firstScenOut = chartData.find((d) => d.scenarioOut);
  const tickFmt = (v) => formatInr(v, { compact: true }).replace("₹", "");

  const params = new URLSearchParams({
    source: "runway-simulator-what-if",
    scenario: tab,
    runway: baseResult?.kpis?.runwayMonths != null ? String(baseResult.kpis.runwayMonths) : "",
  });

  return (
    <section
      className="rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white p-5 shadow-[0_8px_32px_rgba(26,54,115,0.07)] md:rounded-[1.35rem] md:p-7"
      aria-labelledby="what-if-heading"
    >
      <h3 id="what-if-heading" className="text-xl font-semibold tracking-tight text-[#1a3673]">
        What if?
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Test one change and see how it affects your runway instantly.
      </p>

      <div
        role="tablist"
        aria-label="Scenario type"
        className="mt-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition ${
                selected
                  ? "border-[#1a3673] bg-[#1a3673] text-white"
                  : "border-[rgba(26,54,115,0.14)] bg-white text-[#1a3673] hover:border-[rgba(252,125,37,0.35)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-4" role="tabpanel">
        {tab === "funding" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="text-[13px] font-medium text-[#1a3673]">Raise additional funding</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {FUNDING_QUICK.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    aria-pressed={fundingAmount === q.amount && customFunding === ""}
                    onClick={() => {
                      setFundingAmount(q.amount);
                      setCustomFunding("");
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                      fundingAmount === q.amount && customFunding === ""
                        ? "border-[#fc7d25] bg-[rgba(252,125,37,0.08)] text-[#c55a12]"
                        : "border-[rgba(26,54,115,0.14)] text-[#1a3673]"
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-[12px] text-slate-500">
                Custom amount (₹)
                <input
                  className="mt-1 w-full rounded-xl border border-[rgba(26,54,115,0.12)] px-3 py-2 text-sm text-[#1a3673] outline-none focus:border-[#1a3673] focus:ring-2 focus:ring-[rgba(26,54,115,0.12)]"
                  inputMode="decimal"
                  value={customFunding}
                  placeholder="Optional custom amount"
                  onChange={(e) => setCustomFunding(e.target.value)}
                />
              </label>
            </fieldset>
            <label className="block text-[13px] font-medium text-[#1a3673]">
              Expected month
              <select
                className="mt-1.5 w-full rounded-xl border border-[rgba(26,54,115,0.12)] px-3 py-2.5 text-sm text-[#1a3673]"
                value={fundingMonth}
                onChange={(e) => setFundingMonth(Number(e.target.value))}
              >
                {monthOptions.map((o) => (
                  <option key={o.monthIndex} value={o.monthIndex}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {tab === "cost-reduction" && (
          <fieldset>
            <legend className="text-[13px] font-medium text-[#1a3673]">Reduce operating costs</legend>
            <p className="mt-1 text-[12px] text-slate-400">
              Applies from the next forecast month. Cuts S&amp;M, product/tech, payroll and other fixed costs. Does
              not change COGS, other direct costs or CapEx.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COST_QUICK.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  aria-pressed={costRate === q.rate}
                  onClick={() => setCostRate(q.rate)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    costRate === q.rate
                      ? "border-[#fc7d25] bg-[rgba(252,125,37,0.08)] text-[#c55a12]"
                      : "border-[rgba(26,54,115,0.14)] text-[#1a3673]"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {tab === "revenue-growth" && (
          <fieldset>
            <legend className="text-[13px] font-medium text-[#1a3673]">Increase monthly revenue growth</legend>
            <p className="mt-1 text-[12px] text-slate-400">Adds percentage points to your current monthly growth rate.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {GROWTH_QUICK.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  aria-pressed={growthPoints === q.points}
                  onClick={() => setGrowthPoints(q.points)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    growthPoints === q.points
                      ? "border-[#fc7d25] bg-[rgba(252,125,37,0.08)] text-[#c55a12]"
                      : "border-[rgba(26,54,115,0.14)] text-[#1a3673]"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {tab === "payroll-delay" && (
          <fieldset>
            <legend className="text-[13px] font-medium text-[#1a3673]">Delay payroll growth</legend>
            <p className="mt-1 text-[12px] text-slate-400">
              Keeps payroll flat for the delay period, then resumes the original monthly growth.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DELAY_QUICK.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  aria-pressed={delayMonths === q.months}
                  onClick={() => setDelayMonths(q.months)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    delayMonths === q.months
                      ? "border-[#fc7d25] bg-[rgba(252,125,37,0.08)] text-[#c55a12]"
                      : "border-[rgba(26,54,115,0.14)] text-[#1a3673]"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      {comparison && (
        <div className="mt-6 space-y-5" aria-live="polite">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CompareCard title="Before" metrics={comparison.base} />
            <CompareCard title="After" metrics={comparison.scenario} emphasize />
          </div>

          <div className="rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-4 py-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#fc7d25]">Impact</p>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
              <li>
                <span className="font-semibold text-[#1a3673]">{comparison.impacts.runway}</span>
                {" — "}
                {formatDeltaRunway(comparison.delta.runwayMonths)}
              </li>
              <li>
                <span className="font-semibold text-[#1a3673]">{comparison.impacts.netBurn}</span>
                {" — "}
                {formatDeltaBurn(comparison.delta.avgNetBurn)}
              </li>
              <li>
                <span className="font-semibold text-[#1a3673]">{comparison.impacts.month24Cash}</span>
                {" — "}
                {formatDeltaCash(comparison.delta.month24ClosingCash)}
              </li>
            </ul>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-700">{comparison.insight}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#1a3673]">Closing cash comparison</p>
            <p className="sr-only">
              Line chart comparing base and scenario monthly closing cash over 24 months.
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(26,54,115,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={tickFmt} width={56} />
                <Tooltip formatter={(v) => formatInr(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="rgba(26,54,115,0.25)" strokeDasharray="3 3" />
                {firstBaseOut && (
                  <ReferenceDot x={firstBaseOut.label} y={firstBaseOut.base} r={3} fill="#94a3b8" stroke="#1a3673" />
                )}
                {firstScenOut && (
                  <ReferenceDot
                    x={firstScenOut.label}
                    y={firstScenOut.scenario}
                    r={3}
                    fill="#fc7d25"
                    stroke="#1a3673"
                  />
                )}
                <Line type="monotone" dataKey="base" name="Base" stroke="#64748B" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="scenario"
                  name="Scenario"
                  stroke="#fc7d25"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-4">
            <p className="text-sm font-semibold text-[#1a3673]">Want to combine multiple assumptions?</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              WYZ can model hiring, funding, pricing, working capital and revenue scenarios together in a customized
              financial plan.
            </p>
            <Link
              to={`/early-access?${params.toString()}`}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-[#1a3673] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#122652]"
            >
              Build My Customized Scenario Plan
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function CompareCard({ title, metrics, emphasize = false }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3.5 ${
        emphasize
          ? "border-[rgba(252,125,37,0.3)] bg-[rgba(252,125,37,0.04)]"
          : "border-[rgba(26,54,115,0.1)] bg-[#f8fafc]"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <dl className="mt-2 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Runway</dt>
          <dd className="font-semibold text-[#1a3673]">{formatMonths(metrics.runwayMonths)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Cash-out</dt>
          <dd className="font-semibold text-[#1a3673]">{metrics.cashOutMonth}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Avg net burn</dt>
          <dd className="font-semibold text-[#1a3673]">{formatInr(metrics.avgNetBurn)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">Month 24 cash</dt>
          <dd className="font-semibold text-[#1a3673]">{formatInr(metrics.month24ClosingCash)}</dd>
        </div>
      </dl>
    </div>
  );
}

function formatDeltaRunway(d) {
  if (d == null || Math.abs(d) < 0.05) return "No material change in runway";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)} months runway`;
}

function formatDeltaBurn(d) {
  if (d == null || Math.abs(d) < 1) return "No material change in average net burn";
  if (d < 0) return `${formatInr(Math.abs(d))} lower monthly net burn`;
  return `${formatInr(d)} higher monthly net burn`;
}

function formatDeltaCash(d) {
  if (d == null || Math.abs(d) < 1) return "No material change in Month 24 cash";
  if (d > 0) return `${formatInr(d)} improvement in Month 24 cash`;
  return `${formatInr(Math.abs(d))} decline in Month 24 cash`;
}
