import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import {
  formatInr,
  formatMonthLabel,
  formatPct,
  getSection,
} from "../../lib/marketplace-intelligence/index.js";

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

function DriverLine({ drivers }) {
  if (!drivers?.length) return null;
  return (
    <p className="mt-2 text-sm leading-6 text-slate-700">
      {drivers
        .slice(0, 3)
        .map((d) => `${d.label} ${d.amount != null ? formatInr(d.amount) : ""}`.trim())
        .join(" · ")}
      {drivers[0]?.shareOfChange != null ? (
        <span className="text-slate-400">
          {" "}
          (shares of Δ Gross Product Sales:{" "}
          {drivers
            .slice(0, 2)
            .map((d) => (d.shareOfChange != null ? formatPct(d.shareOfChange) : null))
            .filter(Boolean)
            .join(" / ")}
          )
        </span>
      ) : null}
    </p>
  );
}

function ExpandableDetails({ insight }) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    insight.hypotheses?.length ||
    insight.limitations?.length ||
    insight.metrics?.length ||
    insight.why?.audit;

  if (!hasDetails) return null;

  return (
    <div className="mt-3 border-t border-[rgba(26,54,115,0.08)] pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#1a3673]"
        aria-expanded={open}
      >
        {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        {open ? "Hide details" : "Evidence, hypotheses & limitations"}
      </button>
      {open ? (
        <div className="mt-2 space-y-3 text-xs leading-5 text-slate-600">
          {insight.hypotheses?.length ? (
            <div>
              <p className="font-semibold text-slate-500">Unverified hypotheses</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {insight.hypotheses.map((h) => (
                  <li key={h.text}>{h.text}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {insight.metrics?.length ? (
            <div>
              <p className="font-semibold text-slate-500">Supporting metrics (INR)</p>
              <ul className="mt-1 space-y-1">
                {insight.metrics.slice(0, 8).map((m) => (
                  <li key={`${m.metricId}-${m.label}`} className="flex justify-between gap-3">
                    <span>{m.label}</span>
                    <span className="tabular-nums text-[#1a3673]">
                      {m.value == null
                        ? "—"
                        : Math.abs(m.value) <= 2 && !Number.isInteger(m.value)
                          ? formatPct(m.value)
                          : formatInr(m.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {insight.why?.audit ? (
            <div>
              <p className="font-semibold text-slate-500">Audit three-term decomposition</p>
              <p className="mt-1">
                Orders effect {formatInr(insight.why.audit.orderEffect)} · Gross AOV effect{" "}
                {formatInr(insight.why.audit.aovEffect)} · Interaction{" "}
                {formatInr(insight.why.audit.interactionEffect)} · residual{" "}
                {formatInr(insight.why.audit.residual)}
              </p>
            </div>
          ) : null}
          {insight.limitations?.length ? (
            <div>
              <p className="font-semibold text-slate-500">Limitations</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {insight.limitations.slice(0, 4).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
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
      {(insight.links?.chartIds || []).slice(0, 2).map((id) => (
        <span
          key={id}
          className="inline-flex items-center rounded-full border border-dashed border-[rgba(26,54,115,0.2)] px-2.5 py-1 text-[11px] text-slate-500"
        >
          {id}
        </span>
      ))}
    </div>
  );
}

function PrimaryFinding({ insight, onInvestigate, onOpenSection }) {
  if (!insight) return null;
  const next = insight.whatNext?.[0];
  return (
    <article className="rounded-2xl border border-[rgba(26,54,115,0.14)] bg-white p-4 shadow-[0_12px_36px_rgba(26,54,115,0.06)] sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#fc7c23]">Primary finding</p>
      <h3 className="mt-1 text-base font-semibold leading-6 text-[#1a3673] sm:text-lg">{insight.headline}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">{insight.what}</p>
      {insight.shortWhy || insight.why?.drivers?.length ? (
        <div className="mt-3 rounded-xl bg-[#f7f9fd] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Measurable why
          </p>
          {insight.shortWhy ? (
            <p className="mt-1 text-sm leading-6 text-slate-700">{insight.shortWhy}</p>
          ) : (
            <DriverLine drivers={insight.why.drivers} />
          )}
        </div>
      ) : null}
      {next ? (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          <span className="font-semibold text-[#1a3673]">Suggested next: </span>
          {next.action || next.question}
        </p>
      ) : null}
      <ActionRow insight={insight} onInvestigate={onInvestigate} onOpenSection={onOpenSection} />
      <ExpandableDetails insight={insight} />
    </article>
  );
}

function SecondaryFinding({ insight, onInvestigate, onOpenSection }) {
  return (
    <article className="rounded-xl border border-[rgba(26,54,115,0.1)] bg-white/90 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-5 text-[#1a3673]">{insight.headline}</h4>
        {insight.isRecentChange ? (
          <span className="rounded-full bg-[#fff4ec] px-2 py-0.5 text-[10px] font-semibold text-[#c55a12]">
            Recent
          </span>
        ) : insight.isStableObservation ? (
          <span className="rounded-full bg-[#eef2fb] px-2 py-0.5 text-[10px] font-semibold text-[#1a3673]">
            Structural
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{insight.summary}</p>
      {insight.shortWhy ? <p className="mt-1.5 text-xs leading-5 text-slate-500">{insight.shortWhy}</p> : null}
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
          What needs your attention
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
            <div className="grid gap-2 sm:grid-cols-2">
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
