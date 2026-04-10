import { useState } from "react";
import { useAssumptions } from "../../planning/AssumptionsContext.jsx";
import { useScenarioDraft } from "../../planning/ScenarioDraftContext.jsx";
import { PROPOSAL_MODE } from "../../planning/assumptions/types.js";

export default function AssumptionProposalCard({
  proposal,
  onDismiss,
  onConfirm,
  created_at,
  embedded = false,
}) {
  const { applyProposal } = useAssumptions();
  const { applyScenarioProposal, clearScenarioKey } = useScenarioDraft();
  const [state, setState] = useState("pending");

  const isScenario = proposal.mode === PROPOSAL_MODE.SCENARIO;

  const handleApply = () => {
    if (state !== "pending") return;
    if (isScenario) {
      applyScenarioProposal(proposal);
    } else {
      applyProposal(proposal);
      clearScenarioKey(proposal.assumptionKey);
    }
    setState("applied");
    onConfirm?.();
  };

  const handleCancel = () => {
    if (state !== "pending") return;
    setState("cancelled");
    onDismiss?.();
  };

  return (
    <article
      className={`w-full rounded-2xl border border-[#1a3673]/15 bg-white text-slate-800 shadow-sm ${
        embedded ? "max-w-full px-4 py-4" : "max-w-[min(100%,42rem)] px-6 py-5"
      }`}
    >
      <p className={`font-medium text-slate-400 ${embedded ? "text-[10px]" : "text-[11px]"}`}>Wyz CFO · Planning</p>

      {isScenario ? (
        <p className={`leading-relaxed text-slate-700 ${embedded ? "mt-2 text-[12px]" : "mt-3 text-[14px]"}`}>
          Here’s a <span className="font-semibold text-[#1a3673]">preview</span> against your current baseline.{" "}
          <span className="font-medium text-slate-600">
            Apply scenario saves to your scenario draft only — workspace baseline stays unchanged.
          </span>
        </p>
      ) : (
        <p className={`leading-relaxed text-slate-700 ${embedded ? "mt-2 text-[12px]" : "mt-3 text-[14px]"}`}>
          I can update your assumption:
        </p>
      )}

      <p className={`font-semibold text-[#1a3673] ${embedded ? "mt-2 text-[13px]" : "mt-3 text-[15px]"}`}>
        {proposal.assumptionLabel}: {proposal.displayFrom} → {proposal.displayTo}
      </p>

      <div className={embedded ? "mt-3" : "mt-4"}>
        <p className={`font-medium text-slate-500 ${embedded ? "text-[11px]" : "text-[12px]"}`}>
          {isScenario ? "Preview would affect:" : "This will impact:"}
        </p>
        <ul className={`mt-2 list-none space-y-1 text-slate-700 ${embedded ? "text-[11px]" : "text-[13px]"}`}>
          {proposal.impact.map((ref) => (
            <li key={ref.id} className="flex gap-2 pl-0.5">
              <span className="text-slate-400" aria-hidden>
                •
              </span>
              <span>{ref.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {state === "pending" && (
        <div className={`flex flex-wrap gap-2 border-t border-gray-100 ${embedded ? "mt-3 pt-3" : "mt-5 pt-4"}`}>
          <button
            type="button"
            onClick={handleApply}
            className={`inline-flex min-w-[6rem] flex-1 items-center justify-center rounded-xl bg-[#fc7d25] font-semibold text-white shadow-sm transition hover:bg-[#e86f16] sm:flex-none ${
              embedded ? "px-3 py-2 text-[11px]" : "min-w-[8rem] px-4 py-2.5 text-[12px]"
            }`}
          >
            {isScenario ? "Apply scenario" : "Apply change"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className={`inline-flex min-w-[6rem] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white font-semibold text-slate-700 transition hover:bg-slate-50 sm:flex-none ${
              embedded ? "px-3 py-2 text-[11px]" : "min-w-[8rem] px-4 py-2.5 text-[12px]"
            }`}
          >
            Cancel
          </button>
        </div>
      )}

      {state === "applied" && (
        <p className="mt-4 border-t border-gray-100 pt-4 text-[11px] font-medium text-slate-400">
          {isScenario ? "Saved to scenario preview" : "Applied"}
        </p>
      )}

      {state === "cancelled" && (
        <p className="mt-4 border-t border-gray-100 pt-4 text-[11px] font-medium text-slate-400">Dismissed</p>
      )}

      {created_at && (
        <p className="mt-4 text-[10px] font-medium text-slate-400">
          {new Date(created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </article>
  );
}
