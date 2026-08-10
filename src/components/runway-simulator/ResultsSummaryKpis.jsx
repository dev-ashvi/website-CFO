import { useState } from "react";
import { Info } from "lucide-react";
import { formatMoney, formatPercent } from "../../lib/financial-simulator/format.js";

const REVENUE_HELP = "Month 1 revenue used as the starting point of the forecast.";
const GROSS_MARGIN_HELP =
  "Month 1 gross profit (Revenue − COGS) shown as value and margin %. Other direct costs are deducted after gross profit in the WYZ model.";
const CM1_HELP =
  "Month 1 contribution margin after other direct costs and sales & marketing (WYZ workbook CM1).";
const EBITDA_HELP = "Month 1 operating profit before interest, tax, depreciation and amortization.";
const NET_BURN_EXCL_HELP =
  "Current monthly operating cash burn after revenue, excluding capital expenditure and funding.";
const NET_BURN_INCL_HELP =
  "Current monthly cash burn after revenue, including planned capital expenditure for this month and excluding funding.";
const GROSS_BURN_HELP =
  "Current monthly operating cash outflow before revenue, excluding capital expenditure and funding.";

/**
 * CFO-style KPI summary below the runway hero.
 * @param {{ kpis: object, currency?: string }} props
 */
export function ResultsSummaryKpis({ kpis, currency = "INR" }) {
  const fp = kpis.financialPerformance || {};
  const burn = kpis.burnMetrics || {};
  const money = (v) => formatMoney(v, { currency });

  const netEx = burn.monthlyNetBurnExcludingCapex ?? kpis.month1NetBurnExcludingCapex ?? 0;
  const netIn = burn.monthlyNetBurnIncludingCapex ?? kpis.month1NetBurnIncludingCapex ?? 0;
  const gross = burn.monthlyGrossBurn ?? kpis.month1GrossBurn ?? 0;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a3673]">
          Financial Performance
        </h3>
        <p className="mt-1 text-[12px] text-slate-500">Month 1 values from the projection</p>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PerfCard
            label="Revenue"
            value={money(fp.revenue)}
            sub="Current monthly revenue"
            help={REVENUE_HELP}
          />
          <PerfCard
            label="Gross Margin"
            value={money(fp.grossProfit)}
            sub={formatPercent(fp.grossMarginPercent)}
            help={GROSS_MARGIN_HELP}
          />
          <PerfCard
            label="CM1"
            value={money(fp.cm1)}
            sub={formatPercent(fp.cm1MarginPercent)}
            help={CM1_HELP}
            negative={fp.cm1 < 0}
          />
          <PerfCard
            label="EBITDA"
            value={money(fp.ebitda)}
            sub={formatPercent(fp.ebitdaMarginPercent)}
            help={EBITDA_HELP}
            negative={fp.ebitda < 0}
          />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a3673]">Burn & Cash</h3>
        <p className="mt-1 text-[12px] text-slate-500">
          Current monthly burn based on your starting assumptions
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard
            label="Monthly net burn (excl. CapEx)"
            value={money(netEx)}
            help={NET_BURN_EXCL_HELP}
            negative={netEx < 0}
          />
          <MetricCard
            label="Monthly net burn (incl. CapEx)"
            value={money(netIn)}
            help={NET_BURN_INCL_HELP}
            negative={netIn < 0}
          />
          <MetricCard
            label="Monthly gross burn"
            value={money(gross)}
            help={GROSS_BURN_HELP}
          />
        </div>
      </section>
    </div>
  );
}

function PerfCard({ label, value, sub, help, negative = false }) {
  return (
    <div className="rounded-2xl border border-[rgba(26,54,115,0.14)] bg-white px-4 py-4 shadow-[0_6px_28px_rgba(26,54,115,0.07)] md:px-5 md:py-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        {help ? <HelpTip label={label} text={help} /> : null}
      </div>
      <p
        className={`mt-2 text-xl font-semibold tracking-tight tabular-nums md:text-2xl ${
          negative ? "text-[#b91c1c]" : "text-[#1a3673]"
        }`}
      >
        {value}
      </p>
      <p className={`mt-1 text-[13px] font-medium tabular-nums ${negative ? "text-[#b91c1c]/80" : "text-slate-500"}`}>
        {sub}
      </p>
    </div>
  );
}

function MetricCard({ label, value, help, negative = false }) {
  return (
    <div className="rounded-2xl border border-[rgba(26,54,115,0.12)] bg-white px-4 py-3.5 shadow-[0_4px_20px_rgba(26,54,115,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        {help ? <HelpTip label={label} text={help} /> : null}
      </div>
      <p
        className={`mt-1.5 text-lg font-semibold tracking-tight tabular-nums ${
          negative ? "text-[#b91c1c]" : "text-[#1a3673]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function HelpTip({ label, text }) {
  const [open, setOpen] = useState(false);
  const helpId = `kpi-help-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        className="rounded-full p-0.5 text-slate-400 transition hover:text-[#1a3673] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,54,115,0.25)]"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={helpId}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Info size={13} strokeWidth={2} />
      </button>
      {open ? (
        <span
          id={helpId}
          role="tooltip"
          className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[rgba(26,54,115,0.14)] bg-white px-3 py-2 text-left text-[11px] leading-relaxed text-slate-600 shadow-[0_8px_24px_rgba(26,54,115,0.12)]"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
