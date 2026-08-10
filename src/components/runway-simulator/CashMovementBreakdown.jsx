import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AiCfoPanel } from "./AiCfoPanel.jsx";
import {
  buildCashMovementInsight,
  buildOperatingLeverageStats,
  CHART_DEFAULT_HORIZON,
  sliceMonthsForChart,
} from "../../lib/financial-simulator/cashMovementInsight.js";
import { formatMoney, formatMonths, formatPercent, stripMoneySymbol } from "../../lib/financial-simulator/format.js";

const TINY_SHARE = 0.02;

/** Hierarchical palette: green inflow · orange variable · blue fixed · purple CapEx */
const SERIES_META = {
  revenue: { key: "revenue", label: "Revenue", color: "#16a34a", group: "revenue", stackId: "in" },
  cogs: { key: "cogs", label: "COGS", color: "#c2410c", group: "variable", stackId: "out" },
  otherDirectCosts: {
    key: "otherDirectCosts",
    label: "Other direct",
    color: "#fb923c",
    group: "variable",
    stackId: "out",
  },
  salesAndMarketing: {
    key: "salesAndMarketing",
    label: "Sales & marketing",
    color: "#1a3673",
    group: "fixed",
    stackId: "out",
  },
  payroll: { key: "payroll", label: "Payroll", color: "#2f4f9a", group: "fixed", stackId: "out" },
  productAndTechnology: {
    key: "productAndTechnology",
    label: "Product & technology",
    color: "#4c6bb5",
    group: "fixed",
    stackId: "out",
  },
  otherFixedCosts: {
    key: "otherFixedCosts",
    label: "Other fixed",
    color: "#93a4c9",
    group: "fixed",
    stackId: "out",
  },
  capex: { key: "capex", label: "CapEx", color: "#7c3aed", group: "capex", stackId: "out" },
  other: { key: "other", label: "Other", color: "#94a3b8", group: "other", stackId: "out" },
};

const LINE_OPTIONS = [
  { key: "closingCash", label: "Closing Cash" },
  { key: "netCashFlow", label: "Net Cash Flow" },
  { key: "ebitda", label: "EBITDA" },
  { key: "freeCashFlow", label: "Free Cash Flow" },
];

const GROUP_DEFS = [
  {
    id: "revenue",
    label: "Revenue",
    color: "#16a34a",
    children: ["revenue"],
  },
  {
    id: "variable",
    label: "Variable Costs",
    color: "#c2410c",
    children: ["cogs", "otherDirectCosts"],
  },
  {
    id: "fixed",
    label: "Fixed Costs",
    color: "#1a3673",
    children: ["salesAndMarketing", "payroll", "productAndTechnology", "otherFixedCosts"],
  },
  {
    id: "capex",
    label: "CapEx",
    color: "#7c3aed",
    children: ["capex"],
  },
];

/**
 * @param {{
 *   months: object[],
 *   expenseMix?: object,
 *   capexComparison?: object,
 *   kpis?: object,
 *   inputs?: object,
 *   viewMode?: { kind: string, id: string, label: string },
 *   onApplyOverlay?: (overlay: { kind: 'scenario'|'whatif'|'opportunity', id: string }) => void,
 *   onApplyScenario?: (inputs: object) => void,
 * }} props
 */
export function CashMovementBreakdown({
  months,
  expenseMix,
  capexComparison,
  kpis,
  inputs,
  currency = inputs?.currency || "INR",
  viewMode,
  onApplyOverlay,
  onApplyScenario,
}) {
  const [timeframe, setTimeframe] = useState("monthly");
  const [lineMetric, setLineMetric] = useState("closingCash");
  const [groupOn, setGroupOn] = useState({
    revenue: true,
    variable: true,
    fixed: true,
    capex: true,
    other: true,
    line: true,
  });
  const [childOn, setChildOn] = useState({
    revenue: true,
    cogs: true,
    otherDirectCosts: true,
    salesAndMarketing: true,
    payroll: true,
    productAndTechnology: true,
    otherFixedCosts: true,
    capex: true,
    other: true,
  });
  const [expanded, setExpanded] = useState({ variable: false, fixed: false });
  const [scenarioPreview, setScenarioPreview] = useState(null);

  const baseSim = useMemo(
    () => ({ months, kpis, inputs }),
    [months, kpis, inputs],
  );

  const chartMonths = useMemo(
    () => sliceMonthsForChart(months, CHART_DEFAULT_HORIZON),
    [months],
  );

  const categoryShares = useMemo(() => computeCategoryShares(chartMonths), [chartMonths]);
  const collapsedKeys = useMemo(() => {
    const tiny = new Set();
    for (const key of [
      "cogs",
      "otherDirectCosts",
      "salesAndMarketing",
      "payroll",
      "productAndTechnology",
      "otherFixedCosts",
    ]) {
      if ((categoryShares[key] || 0) > 0 && (categoryShares[key] || 0) < TINY_SHARE) {
        tiny.add(key);
      }
    }
    return tiny;
  }, [categoryShares]);

  const activeSeries = useMemo(() => {
    const keys = [];
    const pushIf = (key, groupId) => {
      if (collapsedKeys.has(key)) return;
      if (!groupOn[groupId]) return;
      if (!childOn[key]) return;
      keys.push(key);
    };
    if (groupOn.revenue && childOn.revenue) keys.push("revenue");
    pushIf("cogs", "variable");
    pushIf("otherDirectCosts", "variable");
    pushIf("salesAndMarketing", "fixed");
    pushIf("payroll", "fixed");
    pushIf("productAndTechnology", "fixed");
    pushIf("otherFixedCosts", "fixed");
    if (groupOn.capex && childOn.capex) keys.push("capex");
    if (collapsedKeys.size && groupOn.other && childOn.other) keys.push("other");
    return keys.map((k) => SERIES_META[k]);
  }, [groupOn, childOn, collapsedKeys]);

  const legendShares = useMemo(() => {
    const shares = { ...categoryShares };
    let otherShare = 0;
    for (const key of collapsedKeys) otherShare += categoryShares[key] || 0;
    shares.other = otherShare;
    return shares;
  }, [categoryShares, collapsedKeys]);

  const data = useMemo(() => {
    const base = buildChartData(chartMonths, timeframe, collapsedKeys);
    const withLine = withLineMetric(base, lineMetric);
    if (!scenarioPreview?.months?.length || lineMetric !== "closingCash") return withLine;
    return withScenarioClosingCash(withLine, scenarioPreview.months, timeframe, lineMetric);
  }, [chartMonths, timeframe, collapsedKeys, lineMetric, scenarioPreview]);

  const leverage = useMemo(() => buildOperatingLeverageStats(chartMonths), [chartMonths]);

  const insight = useMemo(
    () =>
      buildCashMovementInsight({
        months,
        kpis: kpis || { expenseMix, capexComparison },
        inputs,
      }),
    [months, kpis, expenseMix, capexComparison, inputs],
  );

  const cashOutDetail = insight.cashOutDetail;
  const cashOutLabel = useMemo(() => {
    if (!cashOutDetail) return null;
    if (timeframe === "monthly") return cashOutDetail.monthLabel;
    const hit = (months || []).find((m) => m.cashOut);
    if (!hit) return null;
    const row = data.find((d) => d.monthIndexes?.includes(hit.monthIndex));
    return row?.label || cashOutDetail.monthLabel;
  }, [cashOutDetail, months, timeframe, data]);

  const lineMeta = LINE_OPTIONS.find((o) => o.key === lineMetric) || LINE_OPTIONS[0];
  const tickFmt = (v) => stripMoneySymbol(formatMoney(v, { currency, compact: true }), currency);
  const overlayActive = viewMode && viewMode.id !== "current" && viewMode.kind !== "scenario";

  const toggleGroup = (id) => setGroupOn((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleChild = (key) => setChildOn((prev) => ({ ...prev, [key]: !prev[key] }));
  const applyOverlay = (overlay) => onApplyOverlay?.(overlay);

  const xInterval = timeframe === "monthly" ? 3 : 0;

  return (
    <section className="rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white p-4 shadow-[0_8px_32px_rgba(26,54,115,0.07)] md:rounded-[1.35rem] md:p-6">
      {scenarioPreview ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(252,125,37,0.35)] bg-[rgba(252,125,37,0.06)] px-4 py-2.5">
          <p className="text-[12px] font-semibold text-[#1a3673]">Scenario preview</p>
          <button
            type="button"
            onClick={() => setScenarioPreview(null)}
            className="rounded-lg border border-[rgba(26,54,115,0.2)] bg-white px-3 py-1 text-[11px] font-semibold text-[#1a3673] hover:border-[#1a3673]"
          >
            Clear scenario
          </button>
        </div>
      ) : null}

      {overlayActive ? (
        <div className="mb-4 rounded-xl border border-[rgba(252,125,37,0.35)] bg-[rgba(252,125,37,0.06)] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#1a3673]">
            Viewing: {viewMode.label}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-600">
            The dashboard is simulating this overlay — metrics, chart, and insights update consistently.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1a3673] md:text-base">Cash Flow Intelligence</h3>
          <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed text-slate-500 md:text-[13px]">
            Understand where cash is generated, spent, and which actions have the highest impact on runway.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">View</span>
          {["monthly", "quarterly", "yearly"].map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium capitalize transition ${
                timeframe === tf
                  ? "border-[#1a3673] bg-[#1a3673] text-white"
                  : "border-[rgba(26,54,115,0.15)] bg-white text-[#1a3673] hover:border-[rgba(26,54,115,0.3)]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Operating leverage */}
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <LeverageStat
          label="Revenue Growth"
          value={formatSignedPct(leverage.revenueChange)}
          hint={leverage.horizonLabel}
          badge={leverage.revenueBadge}
        />
        <LeverageStat
          label="Operating Outflows"
          value={formatSignedPct(leverage.outflowChange)}
          hint={leverage.horizonLabel}
          badge={leverage.outflowBadge}
        />
        <LeverageStat
          label="Operating Leverage"
          value={leverage.leverage}
          accent
          badge={leverage.leverageBadge}
        />
        <div className="col-span-2 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-3 py-2 lg:col-span-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            CFO Observation
          </p>
          <p className="mt-0.5 text-[13px] font-semibold leading-snug text-[#1a3673]">
            {leverage.observationTitle}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{leverage.observationBody}</p>
        </div>
      </div>

      {/* Group toggles */}
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          {GROUP_DEFS.map((g) => {
            const on = groupOn[g.id];
            const hasChildren = g.children.length > 1;
            const isOpen = expanded[g.id];
            return (
              <div key={g.id} className="inline-flex items-center gap-1">
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                    on
                      ? "border-[rgba(26,54,115,0.2)] bg-[#f8fafc] text-[#1a3673]"
                      : "border-[rgba(26,54,115,0.1)] bg-white text-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-[rgba(26,54,115,0.25)] text-[#1a3673] focus:ring-[#1a3673]"
                    checked={on}
                    onChange={() => toggleGroup(g.id)}
                  />
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.label}
                  {hasChildren ? (
                    <button
                      type="button"
                      className="ml-0.5 text-slate-400 hover:text-[#1a3673]"
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${g.label}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setExpanded((prev) => ({ ...prev, [g.id]: !prev[g.id] }));
                      }}
                    >
                      {isOpen ? "▴" : "▾"}
                    </button>
                  ) : null}
                </label>
              </div>
            );
          })}
          {collapsedKeys.size > 0 ? (
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                groupOn.other
                  ? "border-[rgba(26,54,115,0.2)] bg-[#f8fafc] text-[#1a3673]"
                  : "border-[rgba(26,54,115,0.1)] bg-white text-slate-400"
              }`}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-[rgba(26,54,115,0.25)] text-[#1a3673]"
                checked={groupOn.other}
                onChange={() => toggleGroup("other")}
              />
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              Other
            </label>
          ) : null}
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
              groupOn.line
                ? "border-[rgba(15,23,42,0.35)] bg-[#0f172a] text-white"
                : "border-[rgba(26,54,115,0.1)] bg-white text-slate-400"
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-400"
              checked={groupOn.line}
              onChange={() => toggleGroup("line")}
            />
            ● {lineMeta.label}
          </label>
        </div>

        {(expanded.variable || expanded.fixed) && (
          <div className="flex flex-wrap gap-2 pl-1">
            {GROUP_DEFS.filter((g) => expanded[g.id]).flatMap((g) =>
              g.children
                .filter((key) => !collapsedKeys.has(key))
                .map((key) => {
                  const meta = SERIES_META[key];
                  const pct = legendShares[key];
                  return (
                    <label
                      key={key}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-medium ${
                        childOn[key] && groupOn[g.id]
                          ? "border-[rgba(26,54,115,0.15)] text-[#1a3673]"
                          : "border-transparent text-slate-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded"
                        checked={!!childOn[key]}
                        disabled={!groupOn[g.id]}
                        onChange={() => toggleChild(key)}
                      />
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                      {meta.label}
                      {pct != null ? ` (${Math.round(pct * 100)}%)` : ""}
                    </label>
                  );
                }),
            )}
          </div>
        )}
      </div>

      {/* Line metric */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Line</span>
        {LINE_OPTIONS.map((opt) => (
          <label
            key={opt.key}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              lineMetric === opt.key
                ? "border-[#0f172a] bg-[#0f172a] text-white"
                : "border-[rgba(26,54,115,0.12)] text-[#1a3673]"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name="cash-movement-line"
              checked={lineMetric === opt.key}
              onChange={() => setLineMetric(opt.key)}
            />
            {lineMetric === opt.key ? "● " : ""}
            {opt.label}
          </label>
        ))}
        <span className="text-[10px] text-slate-400">
          Showing first {CHART_DEFAULT_HORIZON} months · full 24-month model retained.
        </span>
      </div>

      <p className="sr-only">
        Stacked bar and line chart of cash inflows and outflows. Orange bars are variable costs, blue bars are fixed
        costs, purple is CapEx, green is revenue. The line overlays the selected metric.
      </p>

      <div className="mt-4 h-[320px] w-full sm:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 28, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="rgba(26,54,115,0.08)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} interval={xInterval} />
            <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={tickFmt} width={64} />
            <Tooltip
              content={
                <MovementTooltip
                  activeSeries={activeSeries}
                  lineLabel={lineMeta.label}
                  showLine={groupOn.line}
                  currency={currency}
                />
              }
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value, entry) => {
                const key = entry?.dataKey;
                if (key === "lineValue") return `● ${lineMeta.label}`;
                const pct = legendShares[key];
                if (pct == null || key === "revenue") return value;
                return `${value} (${Math.round(pct * 100)}%)`;
              }}
            />
            <ReferenceLine y={0} stroke="rgba(26,54,115,0.3)" strokeDasharray="3 3" />
            {cashOutLabel && cashOutDetail ? (
              <ReferenceLine
                x={cashOutLabel}
                stroke="#b45309"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={<CashOutChartLabel detail={cashOutDetail} currency={currency} />}
              />
            ) : null}

            {activeSeries
              .filter((s) => s.stackId === "in")
              .map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId={s.stackId}
                  fill={s.color}
                  maxBarSize={timeframe === "yearly" ? 48 : 28}
                  isAnimationActive={false}
                />
              ))}
            {activeSeries
              .filter((s) => s.stackId === "out")
              .map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId={s.stackId}
                  fill={s.color}
                  maxBarSize={timeframe === "yearly" ? 48 : 28}
                  isAnimationActive={false}
                />
              ))}

            {groupOn.line ? (
              <Line
                key={lineMetric}
                type="monotone"
                dataKey="lineValue"
                name={lineMeta.label}
                stroke={lineMetric === "closingCash" ? "#1a3673" : "#0f172a"}
                strokeWidth={lineMetric === "closingCash" ? 3.5 : 2.5}
                dot={lineMetric === "closingCash" ? { r: 3, fill: "#1a3673", stroke: "#fff", strokeWidth: 2 } : false}
                activeDot={{ r: 6, fill: lineMetric === "closingCash" ? "#fc7d25" : "#0f172a", stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={true}
              />
            ) : null}
            {scenarioPreview && groupOn.line && lineMetric === "closingCash" ? (
              <Line
                type="monotone"
                dataKey="scenarioLineValue"
                name="Scenario Closing Cash"
                stroke="#fc7d25"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <IntelligencePanel
        insight={insight}
        viewMode={viewMode}
        onApplyOverlay={applyOverlay}
        currency={currency}
        baseSim={baseSim}
        onScenarioPreview={setScenarioPreview}
        onApplyScenario={onApplyScenario}
      />
    </section>
  );
}

function CashOutChartLabel({ viewBox, detail, currency = "INR" }) {
  const x = viewBox?.x ?? 0;
  const y = (viewBox?.y ?? 0) + 8;
  const balance = formatMoney(detail?.balance, { currency, compact: true });
  return (
    <g transform={`translate(${x + 6}, ${y})`}>
      <rect x={0} y={0} width={150} height={46} rx={6} fill="#fff7ed" stroke="#fdba74" />
      <text x={10} y={14} fill="#9a3412" fontSize={9} fontWeight={700}>
        ⚠ Cash exhausted
      </text>
      <text x={10} y={26} fill="#1a3673" fontSize={11} fontWeight={600}>
        {detail?.monthLabel || "—"}
      </text>
      <text x={10} y={38} fill="#64748B" fontSize={9}>
        Projected balance {balance}
      </text>
    </g>
  );
}

function LeverageStat({ label, value, hint, accent, badge }) {
  return (
    <div className="rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        {badge ? <StatusPill badge={badge} /> : null}
      </div>
      <p className={`mt-0.5 text-[15px] font-semibold tabular-nums leading-snug ${accent ? "text-[#fc7d25]" : "text-[#1a3673]"}`}>
        {value}
      </p>
      {hint ? <p className="text-[10px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function StatusPill({ badge }) {
  const toneCls =
    badge.tone === "good"
      ? "bg-[rgba(22,163,74,0.1)] text-[#15803d]"
      : badge.tone === "warn"
        ? "bg-[rgba(252,125,37,0.12)] text-[#c2410c]"
        : "bg-[rgba(26,54,115,0.08)] text-[#1a3673]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${toneCls}`}>
      {badge.text}
    </span>
  );
}

function IntelligencePanel({
  insight,
  viewMode,
  onApplyOverlay,
  currency = "INR",
  baseSim,
  onScenarioPreview,
  onApplyScenario,
}) {
  const tone = insight.tone || "neutral";
  const toneStyles = {
    alert: "border-[rgba(220,38,38,0.22)] bg-[rgba(254,242,242,0.6)]",
    opportunity: "border-[rgba(22,163,74,0.22)] bg-[rgba(240,253,244,0.6)]",
    driver: "border-[rgba(26,54,115,0.14)] bg-[#f8fafc]",
    neutral: "border-[rgba(26,54,115,0.1)] bg-[#f8fafc]",
  };
  const badgeStyles = {
    alert: "text-[#dc2626]",
    opportunity: "text-[#15803d]",
    driver: "text-[#fc7d25]",
    neutral: "text-[#fc7d25]",
  };
  const driverShare =
    insight.primaryDriver?.shareOfRevenue != null
      ? Math.round(insight.primaryDriver.shareOfRevenue * 100)
      : null;
  const opportunityActive =
    viewMode?.kind === "opportunity" && viewMode?.id === insight.applyId;
  const cc = insight.costContribution;
  const ei = insight.expenseInsights;

  return (
    <div className="mt-4 space-y-3">
      {/* 1. AI CFO Recommendation */}
      <div
        className={`rounded-xl border px-4 py-4 ${toneStyles[tone]} ${
          opportunityActive ? "ring-2 ring-[#1a3673]" : ""
        }`}
      >
        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${badgeStyles[tone]}`}>
          {insight.badge}
        </p>
        <p className="mt-1.5 text-[15px] font-semibold text-[#1a3673]">{insight.title}</p>
        {insight.action ? (
          <p className="mt-1 text-[13px] font-medium text-slate-700">{insight.action}</p>
        ) : null}
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{insight.body}</p>

        {insight.why ? (
          <div className="mt-3 rounded-lg border border-[rgba(26,54,115,0.1)] bg-white/80 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#fc7d25]">Why</p>
            <p className="mt-1 text-[13px] font-semibold text-[#1a3673]">{insight.why.headline}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">{insight.why.detail}</p>
          </div>
        ) : null}

        {(insight.runwayGainMonths != null || insight.difficulty || insight.primaryDriver || insight.confidence) && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {insight.confidence ? (
              <div className="rounded-lg border border-[rgba(26,54,115,0.1)] bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {insight.confidence.label}
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-[#1a3673]">{insight.confidence.level}</p>
              </div>
            ) : null}
            {insight.runwayGainMonths != null ? (
              <div className="rounded-lg border border-[rgba(26,54,115,0.1)] bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Runway gain</p>
                <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#15803d]">
                  +{insight.runwayGainMonths} months
                </p>
              </div>
            ) : null}
            {insight.difficulty ? (
              <div className="rounded-lg border border-[rgba(26,54,115,0.1)] bg-white/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Difficulty</p>
                <p className="mt-0.5 text-[13px] font-semibold text-[#1a3673]">{insight.difficulty}</p>
              </div>
            ) : null}
            {insight.primaryDriver?.name ? (
              <div className="col-span-2 rounded-lg border border-[rgba(26,54,115,0.1)] bg-white/80 px-3 py-2 sm:col-span-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Primary driver</p>
                <p className="mt-0.5 text-[13px] font-semibold text-[#1a3673]">
                  {insight.primaryDriver.name}
                  {driverShare != null ? (
                    <span className="font-medium text-slate-500"> · {driverShare}% of Month 1 revenue</span>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>
        )}

        {insight.applyId ? (
          <button
            type="button"
            onClick={() => onApplyOverlay?.({ kind: "opportunity", id: insight.applyId })}
            className={`mt-3 rounded-lg px-4 py-2 text-[12px] font-semibold transition ${
              opportunityActive
                ? "bg-[#1a3673] text-white"
                : "border border-[rgba(26,54,115,0.2)] bg-white text-[#1a3673] hover:border-[#1a3673]"
            }`}
          >
            Simulate
          </button>
        ) : null}
      </div>

      {/* 2. Cost Contribution + Expense Insights */}
      {cc?.categories?.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a3673]">
              Cost contribution
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">% of revenue — Month 1</p>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c2410c]">Variable</p>
                <div className="mt-1.5 space-y-2">
                  {cc.variableGroup.map((cat) => (
                    <ContributionBar
                      key={cat.key}
                      label={cat.label}
                      share={cat.shareOfRevenue}
                      color={SERIES_META[cat.key]?.color || "#c2410c"}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a3673]">
                  Fixed / operating
                </p>
                <div className="mt-1.5 space-y-2">
                  {cc.fixedGroup.map((cat) => (
                    <ContributionBar
                      key={cat.key}
                      label={cat.label}
                      share={cat.shareOfRevenue}
                      color={SERIES_META[cat.key]?.color || "#1a3673"}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a3673]">Expense insights</p>
            <p className="mt-0.5 text-[12px] text-slate-500">AI CFO interpretation</p>
            {ei?.summary?.operatingCostToRevenue > 0 ? (
              <div className="mt-3 rounded-xl border border-[rgba(26,54,115,0.1)] bg-[#f8fafc] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Total operating cost / revenue
                </p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums text-[#1a3673]">
                  {ei.summary.operatingCostToRevenuePercent}%
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {ei.summary.spendPerUnitOfRevenue.toFixed(2)} spent for every 1.00 of revenue
                </p>
              </div>
            ) : null}
            <ul className="mt-3 space-y-2.5">
              {(ei?.items || []).map((item) => (
                <ExpenseInsightItem key={item.id} item={item} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* 3. Benchmark */}
      {insight.benchmark ? <BenchmarkCard benchmark={insight.benchmark} /> : null}

      {/* 4. AI CFO */}
      <AiCfoPanel
        baseSim={baseSim}
        currency={currency}
        onPreview={onScenarioPreview}
        onApplyScenario={onApplyScenario}
      />

      {/* 5. Trust footer */}
      <p className="rounded-xl border border-[rgba(26,54,115,0.08)] bg-[#f8fafc] px-4 py-3 text-center text-[11px] leading-relaxed text-slate-500">
        Generated from 24-month deterministic financial model. Every metric updates consistently across revenue,
        costs, cash flow, EBITDA and runway.
      </p>
    </div>
  );
}

function ExpenseInsightItem({ item }) {
  const toneCls =
    item.tone === "good"
      ? "border-[rgba(22,163,74,0.2)] bg-[rgba(240,253,244,0.5)]"
      : item.tone === "warn"
        ? "border-[rgba(220,38,38,0.15)] bg-[rgba(254,242,242,0.4)]"
        : item.tone === "watch"
          ? "border-[rgba(252,125,37,0.2)] bg-[rgba(255,247,237,0.5)]"
          : "border-[rgba(26,54,115,0.08)] bg-[#f8fafc]";
  return (
    <li className={`rounded-lg border px-3 py-2 ${toneCls}`}>
      <p className="text-[11px] font-semibold text-[#1a3673]">{item.title}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">{item.body}</p>
    </li>
  );
}

function ContributionBar({ label, share, color }) {
  const pct = Math.round((share || 0) * 100);
  const barWidth = Math.min(Math.abs(pct), 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-[#1a3673]">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[rgba(26,54,115,0.08)]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${barWidth}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function BenchmarkCard({ benchmark }) {
  if (benchmark.available === false) {
    return (
      <div className="rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a3673]">
          Industry benchmark
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{benchmark.message}</p>
      </div>
    );
  }

  const peerFields = [
    { label: benchmark.rangeLabel, value: benchmark.rangeValue },
    { label: benchmark.medianLabel, value: benchmark.medianValue },
    { label: benchmark.topLabel, value: benchmark.topValue },
  ].filter((f) => f.label && f.value != null);

  return (
    <div className="rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a3673]">
            {benchmark.title}
          </p>
          <p className="mt-1 text-[12px] text-slate-500">{benchmark.metricLabel}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            benchmark.onTarget
              ? "bg-[rgba(22,163,74,0.1)] text-[#15803d]"
              : "bg-[rgba(252,125,37,0.12)] text-[#c2410c]"
          }`}
        >
          {benchmark.onTarget ? "✓ " : ""}
          {benchmark.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {peerFields.map((f) => (
          <div key={f.label} className="rounded-lg bg-[#f8fafc] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{f.label}</p>
            <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-slate-500">{f.value}</p>
          </div>
        ))}
        <div className="rounded-lg border border-[rgba(26,54,115,0.12)] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {benchmark.youLabel}
          </p>
          <p className="mt-0.5 text-[16px] font-semibold tabular-nums text-[#1a3673]">{benchmark.youValue}</p>
        </div>
      </div>
    </div>
  );
}

function MovementTooltip({ active, payload, label, activeSeries, lineLabel, showLine, currency = "INR" }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row?.abs) return null;

  const abs = row.abs;
  const revenue = abs.revenue || 0;
  const variable = (abs.cogs || 0) + (abs.otherDirectCosts || 0);
  const fixed =
    (abs.salesAndMarketing || 0) +
    (abs.payroll || 0) +
    (abs.productAndTechnology || 0) +
    (abs.otherFixedCosts || 0);
  const capex = abs.capex || 0;
  const other = abs.other || 0;
  const totalOutflow = variable + fixed + capex + other;
  const lineVal = row.lineValue ?? abs.lineValue;

  const fmt = (v, { signed = false } = {}) => {
    if (v == null || Number.isNaN(Number(v))) return "—";
    if (Math.abs(v) < 1) return "—";
    const base = formatMoney(v, { currency, compact: true });
    if (signed && v > 0) return `+${base}`;
    return base;
  };

  return (
    <div className="min-w-[240px] rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-3 py-2.5 text-[12px] text-[#1a3673] shadow-[0_8px_24px_rgba(26,54,115,0.12)]">
      <p className="font-semibold">{label}</p>
      <div className="mt-2 space-y-1 text-slate-600">
        <TipRow color="#16a34a" label="Revenue" value={fmt(revenue)} />
        <TipRow color="#c2410c" label="Variable Costs" value={fmt(variable)} />
        <TipRow color="#1a3673" label="Fixed Costs" value={fmt(fixed)} />
        <TipRow color="#7c3aed" label="CapEx" value={fmt(capex)} />
        {other > 0 ? <TipRow color="#94a3b8" label="Other" value={fmt(other)} /> : null}
      </div>
      <div className="my-2 border-t border-[rgba(26,54,115,0.1)]" />
      <TipRow label="Total Outflow" value={fmt(totalOutflow)} strong />
      {showLine ? (
        <div className="mt-1.5 rounded-lg bg-[#0f172a] px-2.5 py-1.5 text-white">
          <p className="flex items-center justify-between gap-6 text-[12px] font-semibold">
            <span>● {lineLabel}</span>
            <span className="tabular-nums">{fmt(lineVal, { signed: true })}</span>
          </p>
        </div>
      ) : null}
      {activeSeries?.length > 1 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] font-medium text-slate-400">Category detail</summary>
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
            {activeSeries
              .filter((s) => s.key !== "revenue")
              .map((s) => (
                <TipRow key={s.key} color={s.color} label={s.label} value={fmt(abs[s.key])} />
              ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function TipRow({ color, label, value, strong }) {
  return (
    <p className={`flex items-center justify-between gap-6 ${strong ? "font-semibold text-[#1a3673]" : ""}`}>
      <span className="inline-flex items-center gap-1.5">
        {color ? <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> : null}
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}

function computeCategoryShares(months) {
  const keys = [
    "cogs",
    "otherDirectCosts",
    "salesAndMarketing",
    "payroll",
    "productAndTechnology",
    "otherFixedCosts",
    "capex",
  ];
  const totals = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const m of months || []) {
    for (const k of keys) totals[k] += Number(m[k]) || 0;
  }
  const outflow = sum(Object.values(totals));
  const shares = {};
  for (const k of keys) shares[k] = outflow > 0 ? totals[k] / outflow : 0;
  return shares;
}

function buildChartData(months, timeframe, collapsedKeys) {
  const rows = (months || []).map((m) => {
    const abs = {
      revenue: Number(m.revenue) || 0,
      cogs: Number(m.cogs) || 0,
      otherDirectCosts: Number(m.otherDirectCosts) || 0,
      salesAndMarketing: Number(m.salesAndMarketing) || 0,
      payroll: Number(m.payroll) || 0,
      productAndTechnology: Number(m.productAndTechnology) || 0,
      otherFixedCosts: Number(m.otherFixedCosts) || 0,
      capex: Number(m.capex) || 0,
      other: 0,
      netCashFlow: Number(m.netCashFlow) || 0,
      ebitda: Number(m.ebitda) || 0,
      freeCashFlow: (Number(m.ebitda) || 0) - (Number(m.capex) || 0),
      closingCash: Number(m.closingCash) || 0,
    };
    for (const key of collapsedKeys) {
      abs.other += abs[key] || 0;
      abs[key] = 0;
    }
    return {
      label: m.monthLabel,
      monthIndex: m.monthIndex,
      monthIndexes: [m.monthIndex],
      cashOut: !!m.cashOut,
      abs,
      revenue: abs.revenue,
      cogs: -abs.cogs,
      otherDirectCosts: -abs.otherDirectCosts,
      salesAndMarketing: -abs.salesAndMarketing,
      payroll: -abs.payroll,
      productAndTechnology: -abs.productAndTechnology,
      otherFixedCosts: -abs.otherFixedCosts,
      capex: -abs.capex,
      other: -abs.other,
      netCashFlow: abs.netCashFlow,
      ebitda: abs.ebitda,
      freeCashFlow: abs.freeCashFlow,
      closingCash: abs.closingCash,
    };
  });

  if (timeframe === "monthly") {
    return rows.map((r) => ({ ...r, lineValue: r.netCashFlow }));
  }

  const size = timeframe === "quarterly" ? 3 : 12;
  const buckets = [];
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    if (!slice.length) continue;
    const abs = {
      revenue: 0,
      cogs: 0,
      otherDirectCosts: 0,
      salesAndMarketing: 0,
      payroll: 0,
      productAndTechnology: 0,
      otherFixedCosts: 0,
      capex: 0,
      other: 0,
      netCashFlow: 0,
      ebitda: 0,
      freeCashFlow: 0,
      closingCash: slice[slice.length - 1].abs.closingCash,
    };
    for (const r of slice) {
      for (const k of Object.keys(abs)) {
        if (k === "closingCash") continue;
        abs[k] += r.abs[k] || 0;
      }
    }
    const idx = Math.floor(i / size) + 1;
    const label =
      timeframe === "quarterly"
        ? `Q${idx} (${slice[0].label}–${slice[slice.length - 1].label})`
        : `Year ${idx}`;
    buckets.push({
      label,
      monthIndex: slice[0].monthIndex,
      monthIndexes: slice.map((s) => s.monthIndex),
      cashOut: slice.some((s) => s.cashOut),
      abs,
      revenue: abs.revenue,
      cogs: -abs.cogs,
      otherDirectCosts: -abs.otherDirectCosts,
      salesAndMarketing: -abs.salesAndMarketing,
      payroll: -abs.payroll,
      productAndTechnology: -abs.productAndTechnology,
      otherFixedCosts: -abs.otherFixedCosts,
      capex: -abs.capex,
      other: -abs.other,
      netCashFlow: abs.netCashFlow,
      ebitda: abs.ebitda,
      freeCashFlow: abs.freeCashFlow,
      closingCash: abs.closingCash,
      lineValue: abs.netCashFlow,
    });
  }
  return buckets;
}

/** Keep lineValue in sync with selected metric. */
function withLineMetric(data, lineMetric) {
  return (data || []).map((row) => ({
    ...row,
    lineValue: row.abs?.[lineMetric] ?? row[lineMetric] ?? 0,
  }));
}

/** Overlay scenario closing cash on chart rows (preview only — base model unchanged). */
function withScenarioClosingCash(data, scenarioMonths, timeframe, lineMetric) {
  const scenChart = buildChartData(sliceMonthsForChart(scenarioMonths, CHART_DEFAULT_HORIZON), timeframe, new Set());
  const byIndex = new Map();
  for (const row of scenChart) {
    for (const idx of row.monthIndexes || []) {
      byIndex.set(idx, row.abs?.[lineMetric] ?? row[lineMetric] ?? 0);
    }
  }
  return (data || []).map((row) => {
    const idx = row.monthIndexes?.[row.monthIndexes.length - 1] ?? row.monthIndex;
    const val = byIndex.get(idx);
    return {
      ...row,
      scenarioLineValue: val != null ? val : null,
    };
  });
}

function formatSignedPct(decimal) {
  if (decimal == null || Number.isNaN(Number(decimal))) return "—";
  const pct = Number(decimal) * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${formatPercent(Math.abs(decimal), 0)}`;
}

function sum(arr) {
  return arr.reduce((a, b) => a + (Number(b) || 0), 0);
}
