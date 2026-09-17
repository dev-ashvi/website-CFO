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
  detected: "Identified",
  mapped: "Mapped",
  connected: "Connected",
};

/**
 * Compact CFO-grade strip: source roles feeding the financial model.
 * Presentation only — stage semantics control Detected vs Mapped vs Connected.
 */
export default function FinancialModelStatus({ dataset, stage = "detect", className = "" }) {
  const nodes = financialModelNodes(dataset, stage);
  if (!nodes.length) return null;

  const compact = stage === "detect";
  const modelReady = Boolean(dataset?.readiness?.ready_for_engine);
  const modelLabel =
    stage === "analyse" && modelReady
      ? "Ready"
      : stage === "validate" || stage === "analyse"
        ? modelReady
          ? "Ready"
          : "In review"
        : stage === "map"
          ? "Mapping"
          : "Assembling";

  return (
    <div
      className={[
        "rounded-xl border border-gray-100 bg-[#f8fafc]",
        compact ? "px-2.5 py-2 sm:px-3" : "px-3 py-3 sm:px-4",
        className,
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Your financial model</p>
        <p className="text-[11px] text-slate-400">
          {stage === "detect" && "Sources identified"}
          {stage === "map" && "Fields mapped to the model"}
          {stage === "validate" && "Connections verified"}
          {stage === "analyse" && (modelReady ? "Financial model ready" : "Building workspace")}
          {!["detect", "map", "validate", "analyse"].includes(stage) && "In progress"}
        </p>
      </div>

      <div className={["flex flex-col sm:flex-row sm:items-stretch", compact ? "mt-2 gap-2" : "mt-3 gap-3"].join(" ")}>
        <ul className={["grid flex-1 grid-cols-2 lg:grid-cols-4", compact ? "gap-1.5" : "gap-2"].join(" ")}>
          {nodes.map((node) => (
            <li
              key={node.role}
              className={[
                "rounded-lg border",
                compact ? "px-2 py-1.5" : "px-2.5 py-2",
                STATE_STYLES[node.state] || STATE_STYLES.pending,
              ].join(" ")}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={["h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[node.state] || STATE_DOT.pending].join(" ")}
                  aria-hidden
                />
                <p className={["truncate font-semibold", compact ? "text-[11px]" : "text-[12px]"].join(" ")}>
                  {node.title}
                </p>
              </div>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {STATE_LABEL[node.state] || "Pending"}
              </p>
            </li>
          ))}
        </ul>

        <div
          className={[
            "flex shrink-0 items-center justify-center rounded-lg border border-[#1a3673]/15 bg-white sm:flex-col sm:text-center",
            compact ? "px-2.5 py-1.5 sm:w-[112px]" : "px-3 py-2 sm:w-[132px]",
          ].join(" ")}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Financial model</p>
          <p className={["font-semibold text-[#1a3673]", compact ? "mt-0 text-[11px]" : "mt-0.5 text-[12px]"].join(" ")}>
            {modelLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
