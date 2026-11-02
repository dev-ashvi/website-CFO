import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, MessageSquare, Sparkles } from "lucide-react";
import { formatInr, formatPct, getSection } from "../../lib/marketplace-intelligence/index.js";
import { statusLabel } from "../../lib/marketplace-intelligence/investigationLabels.js";

function StatusPill({ status }) {
  if (!status) return null;
  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9eb0d0]">
      {statusLabel(status)}
    </span>
  );
}

/**
 * Founder-facing investigation panel — readable without NVIDIA.
 * Hierarchy: found → drivers → checked → unverified → next.
 */
export default function InvestigationWorkspace({
  investigation,
  onRequestAi,
  onAskQuestion,
  onOpenSection,
  aiLoading = false,
}) {
  const [techOpen, setTechOpen] = useState(false);
  const plan = investigation?.plan;
  if (!plan || investigation?.status !== "ready") return null;

  const findingText =
    plan.selectedFinding?.findingSummary ||
    plan.selectedFinding?.shortWhy ||
    plan.selectedFinding?.summary ||
    plan.selectedFinding?.what;

  return (
    <div className="mb-4 rounded-2xl border border-white/15 bg-[#0c1c3f]/80 p-3 text-[#d5e0f2] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#fcb07a]">
            Investigation
            {plan.provisional ? " · provisional" : ""}
          </p>
          <h3 className="mt-1 text-sm font-semibold leading-5 text-white sm:text-base">
            {plan.selectedFinding?.headline || plan.question}
          </h3>
        </div>
        <button
          type="button"
          disabled={aiLoading}
          onClick={() => onRequestAi?.(plan.question)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#fc7c23] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Sparkles size={13} aria-hidden />
          {aiLoading ? "Explaining…" : "Explain with AI"}
        </button>
      </div>

      <div className="mt-3 space-y-3 text-xs leading-5 sm:text-sm sm:leading-6">
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#fcb07a]">
              What WYZ found
            </p>
            <StatusPill status="measured_result" />
          </div>
          <p className="mt-1 text-[#e8eef8]">{findingText}</p>
          {plan.provisional ? (
            <p className="mt-1 text-[11px] text-[#fcb07a]">
              Incomplete or unequal coverage — observed-record difference only. Obtain complete months or
              matching windows before treating this as a full-month sales change.
            </p>
          ) : null}
        </section>

        {plan.measuredDrivers?.length ? (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#fcb07a]">
              Quantified financial drivers
            </p>
            <ul className="mt-1 space-y-1">
              {plan.measuredDrivers.map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[#d5e0f2]">{d.label}</span>
                  <span className="font-semibold tabular-nums text-white">
                    {d.amount != null ? formatInr(d.amount) : d.detail}
                    {d.shareOfChange != null ? (
                      <span className="ml-1 font-normal text-[#9eb0d0]">
                        ({formatPct(d.shareOfChange)} of change)
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {plan.checkedItems?.length ? (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#fcb07a]">
              What WYZ already checked
            </p>
            <ul className="mt-1.5 space-y-2">
              {plan.checkedItems.map((item) => (
                <li key={item.id} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <div className="mb-1">
                    <StatusPill status={item.status} />
                  </div>
                  <p className="text-[#e8eef8]">{item.text}</p>
                  {item.suggestedQuestion ? (
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => onAskQuestion?.(item.suggestedQuestion)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#fcb07a] hover:text-white disabled:opacity-50"
                    >
                      <MessageSquare size={12} aria-hidden />
                      {item.suggestedQuestion}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(plan.unverifiedHypotheses?.length || plan.missingData?.length) ? (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#fcb07a]">
              What remains unverified
            </p>
            {plan.unverifiedHypotheses?.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[#9eb0d0]">
                {plan.unverifiedHypotheses.map((h) => (
                  <li key={h.text}>
                    <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-[#7f93b8]">
                      Suggested
                    </span>
                    {h.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {plan.missingData?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[#9eb0d0]">
                {plan.missingData.map((m) => (
                  <li key={m.id}>
                    <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-[#7f93b8]">
                      Missing evidence
                    </span>
                    {m.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {plan.nextInvestigations?.length ? (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#fcb07a]">
              Recommended next investigations
            </p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {plan.nextInvestigations.slice(0, 4).map((step) => (
                <button
                  key={step.question}
                  type="button"
                  disabled={aiLoading}
                  onClick={() => onAskQuestion?.(step.question)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-xs text-white hover:bg-white/10 disabled:opacity-50"
                >
                  {step.action || step.question}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(plan.sectionIds || []).slice(0, 2).map((sectionId) => (
                <button
                  key={sectionId}
                  type="button"
                  onClick={() => onOpenSection?.(sectionId)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white hover:border-[#fc7c23]"
                >
                  {getSection(sectionId).label}
                  <ArrowRight size={12} aria-hidden />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={() => setTechOpen((open) => !open)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9eb0d0] hover:text-white"
            aria-expanded={techOpen}
          >
            {techOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            Technical details
          </button>
          {techOpen ? (
            <div className="mt-2 space-y-2 text-[11px] text-[#9eb0d0]">
              <p>INR only · session calculations · AI may cite verified amounts but must not invent figures.</p>
              {plan.supportingEvidence?.length ? (
                <ul className="space-y-1">
                  {plan.supportingEvidence.slice(0, 8).map((f) => (
                    <li key={f.factId} className="flex flex-wrap justify-between gap-2">
                      <span>{f.label}</span>
                      <span className="font-semibold tabular-nums text-white">
                        {f.kind === "ratio"
                          ? formatPct(f.value)
                          : f.kind === "count"
                            ? f.value
                            : formatInr(f.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-[#7f93b8]">
                Full report limitations remain on the dashboard Evidence section.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
