import { useId, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import {
  formatCount,
  formatInr,
  formatMonthLabel,
  formatPct,
  getSection,
} from "../../lib/marketplace-intelligence/index.js";

function formatSupportingMetric(m) {
  if (m.value == null) return "—";
  if (Math.abs(m.value) <= 2 && !Number.isInteger(m.value)) return formatPct(m.value);
  if (
    Number.isInteger(m.value) &&
    /orders|count|products|sku/i.test(`${m.label || ""} ${m.metricId || ""}`)
  ) {
    return formatCount(m.value);
  }
  return formatInr(m.value);
}

/**
 * Founder-facing period subtitle from filter-aware coverage.period.
 * Same calendar year → "April – September 2026"; otherwise full labels.
 */
function formatBriefPeriodSubtitle(coverage) {
  const period = coverage?.period;
  const startYm = period?.start ? String(period.start).slice(0, 7) : null;
  const endYm = period?.end ? String(period.end).slice(0, 7) : null;
  if (!startYm || !endYm) return coverage?.periodLabel || null;

  const startLabel = formatMonthLabel(startYm);
  const endLabel = formatMonthLabel(endYm);
  if (!startLabel || !endLabel) return coverage?.periodLabel || null;

  const startYear = startYm.slice(0, 4);
  const endYear = endYm.slice(0, 4);
  if (startYear === endYear) {
    const startMonth = startLabel.replace(` ${startYear}`, "");
    return `${startMonth} – ${endLabel}`;
  }
  return `${startLabel} – ${endLabel}`;
}

function ExpandableDetails({ insight }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasMetrics = Boolean(insight.metrics?.length || insight.why?.audit);
  const hasHypotheses = Boolean(insight.hypotheses?.length);
  const hasLimitations = Boolean(insight.limitations?.length);
  const hasDetails = hasMetrics || hasHypotheses || hasLimitations;

  if (!hasDetails) return null;

  return (
    <div className="mt-3 border-t border-[rgba(26,54,115,0.08)] pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#1a3673]"
        aria-expanded={open}
        aria-controls={panelId}
      >
        {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        {open ? "Hide supporting details" : "View supporting details"}
      </button>
      {open ? (
        <div id={panelId} className="mt-2 space-y-3 text-xs leading-5 text-slate-600">
          {hasMetrics ? (
            <div>
              <p className="font-semibold text-slate-500">How this was calculated</p>
              {insight.metrics?.length ? (
                <ul className="mt-1 space-y-1">
                  {insight.metrics.slice(0, 8).map((m) => (
                    <li key={`${m.metricId}-${m.label}`} className="flex justify-between gap-3">
                      <span>{m.label}</span>
                      <span className="tabular-nums text-[#1a3673]">
                        {formatSupportingMetric(m)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {insight.why?.audit ? (
                <p className="mt-2">
                  Orders effect {formatInr(insight.why.audit.orderEffect)} · Gross AOV effect{" "}
                  {formatInr(insight.why.audit.aovEffect)} · Interaction{" "}
                  {formatInr(insight.why.audit.interactionEffect)} · residual{" "}
                  {formatInr(insight.why.audit.residual)}
                </p>
              ) : null}
            </div>
          ) : null}
          {hasHypotheses || hasLimitations ? (
            <div>
              <p className="font-semibold text-slate-500">What still needs checking</p>
              {hasHypotheses ? (
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {insight.hypotheses.map((h) => (
                    <li key={h.text}>{h.text}</li>
                  ))}
                </ul>
              ) : null}
              {hasLimitations ? (
                <ul className={`list-disc space-y-1 pl-4 ${hasHypotheses ? "mt-2" : "mt-1"}`}>
                  {insight.limitations.slice(0, 6).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionRow({ insight, onInvestigate, onOpenSection }) {
  const primaryNext = insight.whatNext?.[0] || null;
  const sectionId = insight.links?.sectionIds?.[0] || primaryNext?.sectionId || "topline";
  const chartId = primaryNext?.chartId || insight.links?.chartIds?.[0] || null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() =>
          onInvestigate?.({
            insight,
            question: primaryNext?.question || insight.headline,
            sectionId,
            chartId,
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full bg-[#1a3673] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#152a5c]"
      >
        <MessageSquare size={13} aria-hidden />
        Ask WYZ
      </button>
      <button
        type="button"
        onClick={() => onOpenSection?.(sectionId, chartId)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(26,54,115,0.18)] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a3673] transition-colors hover:border-[#fc7d25]"
      >
        {getSection(sectionId).label}
        <ArrowRight size={13} aria-hidden />
      </button>
    </div>
  );
}

function PrimaryFinding({ insight, onInvestigate, onOpenSection }) {
  if (!insight) return null;
  const next = insight.whatNext?.[0];
  const impact = insight.what || insight.summary;
  return (
    <article className="rounded-2xl border border-[rgba(26,54,115,0.14)] bg-white p-4 shadow-[0_12px_36px_rgba(26,54,115,0.06)] sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#fc7c23]">Primary finding</p>
      <h3 className="mt-1 text-base font-semibold leading-6 text-[#1a3673] sm:text-lg">{insight.headline}</h3>
      {impact ? <p className="mt-2 text-sm leading-6 text-slate-700">{impact}</p> : null}
      {insight.shortWhy ? (
        <div className="mt-3 rounded-xl bg-[#f7f9fd] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Measured drivers
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{insight.shortWhy}</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            Mathematical contributions — not verified business causes.
          </p>
        </div>
      ) : null}
      {next?.question ? (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          <span className="font-semibold text-[#1a3673]">Suggested investigation: </span>
          {next.question}
        </p>
      ) : next?.action ? (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          <span className="font-semibold text-[#1a3673]">Suggested next: </span>
          {next.action}
        </p>
      ) : null}
      <ActionRow insight={insight} onInvestigate={onInvestigate} onOpenSection={onOpenSection} />
      <ExpandableDetails insight={insight} />
    </article>
  );
}

function SecondaryFinding({ insight, onInvestigate, onOpenSection }) {
  const body = insight.summary || insight.what;
  return (
    <article className="break-inside-avoid rounded-xl border border-[rgba(26,54,115,0.1)] bg-white/90 px-3.5 py-3">
      <h4 className="text-sm font-semibold leading-5 text-[#1a3673]">{insight.headline}</h4>
      {body ? <p className="mt-1.5 text-xs leading-5 text-slate-600">{body}</p> : null}
      <ActionRow insight={insight} onInvestigate={onInvestigate} onOpenSection={onOpenSection} />
      <ExpandableDetails insight={insight} />
    </article>
  );
}

/**
 * Compact Financial Intelligence Brief — local, deterministic, no NVIDIA wait.
 * Hierarchy: founder heading + period → 1 primary + up to 4 secondary.
 */
export default function IntelligenceBrief({ intelligence, onInvestigate, onOpenSection }) {
  const brief = intelligence?.brief || {
    primary: intelligence?.briefInsights?.[0] || null,
    secondary: (intelligence?.briefInsights || []).slice(1),
  };
  if (!intelligence || intelligence.status !== "ready" || !brief.primary) return null;

  const periodSubtitle = formatBriefPeriodSubtitle(intelligence.coverage || {});

  return (
    <section
      className="mt-5 overflow-hidden rounded-[28px] border border-[rgba(26,54,115,0.12)] bg-[linear-gradient(180deg,#f7f9fd_0%,#ffffff_55%)] shadow-[0_18px_50px_rgba(26,54,115,0.06)]"
      aria-labelledby="mi-intelligence-brief-title"
    >
      <div className="px-4 pt-4 pb-1.5 sm:px-6 sm:pt-5 sm:pb-2">
        <h2
          id="mi-intelligence-brief-title"
          className="text-lg font-semibold tracking-tight text-[#1a3673] sm:text-xl"
        >
          Insights ready for your review
        </h2>
        {periodSubtitle ? (
          <p className="mt-0.5 text-sm text-slate-500">{periodSubtitle}</p>
        ) : null}
      </div>

      <div className="space-y-3 px-4 pb-4 pt-2 sm:px-6 sm:pb-5 sm:pt-2.5">
        <PrimaryFinding
          insight={brief.primary}
          onInvestigate={onInvestigate}
          onOpenSection={onOpenSection}
        />
        {brief.secondary?.length ? (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Also worth reviewing
            </p>
            {/* items-start keeps card heights content-driven in the two-column grid */}
            <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:gap-2.5">
              {brief.secondary.map((insight) => (
                <SecondaryFinding
                  key={insight.id}
                  insight={insight}
                  onInvestigate={onInvestigate}
                  onOpenSection={onOpenSection}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
