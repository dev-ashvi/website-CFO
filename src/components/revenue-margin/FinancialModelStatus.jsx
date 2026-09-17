import { financialModelNodes } from "../../lib/revenue-margin/onboarding.js";

const STATE_STYLES = {
  pending: "border-slate-200 bg-white text-slate-400",
  detected: "border-[#1a3673]/20 bg-[#1a3673]/5 text-[#1a3673]",
  mapped: "border-[#1a3673]/25 bg-white text-[#1a3673]",
  connected: "border-emerald-200 bg-emerald-50/50 text-[#1a3673]",
};

const STATE_DOT = {
  pending: "bg-slate-300",
  detected: "bg-[#fc7d25]",
  mapped: "bg-[#1a3673]",
  connected: "bg-emerald-500",
};

const STATE_LABEL = {
  pending: "Pending",
  detected: "Detected",
  mapped: "Mapped",
  connected: "Connected",
};

/**
 * Compact CFO-grade strip: source roles feeding the financial model.
 * Presentation only — uses existing detected/mapping/readiness state.
 */
export default function FinancialModelStatus({ dataset, stage = "detect", className = "" }) {
  const nodes = financialModelNodes(dataset, stage);
  if (!nodes.length) return null;

  return (
    <div className={["rounded-xl border border-gray-100 bg-[#f8fafc] px-3 py-3 sm:px-4", className].join(" ")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Your financial model</p>
        <p className="text-[11px] text-slate-400">
          {stage === "detect" && "Sources identified"}
          {stage === "map" && "Fields mapped to the model"}
          {stage === "validate" && "Connections verified"}
          {stage === "analyse" && "Building workspace"}
          {!["detect", "map", "validate", "analyse"].includes(stage) && "In progress"}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <ul className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
          {nodes.map((node) => (
            <li
              key={node.role}
              className={["rounded-lg border px-2.5 py-2", STATE_STYLES[node.state] || STATE_STYLES.pending].join(" ")}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={["h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[node.state] || STATE_DOT.pending].join(" ")}
                  aria-hidden
                />
                <p className="truncate text-[12px] font-semibold">{node.title}</p>
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                {STATE_LABEL[node.state] || "Pending"}
              </p>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center justify-center rounded-lg border border-[#1a3673]/15 bg-white px-3 py-2 sm:w-[132px] sm:flex-col sm:text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Financial model</p>
          <p className="mt-0.5 text-[12px] font-semibold text-[#1a3673]">
            {stage === "validate" || stage === "analyse"
              ? dataset?.readiness?.ready_for_engine
                ? "Ready"
                : "In review"
              : stage === "map"
                ? "Mapping"
                : "Assembling"}
          </p>
        </div>
      </div>
    </div>
  );
}
