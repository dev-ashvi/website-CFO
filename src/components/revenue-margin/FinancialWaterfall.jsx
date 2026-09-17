import { formatExplorerValue } from "../../lib/revenue-margin/format.js";
import { waterfallRowTone } from "../../lib/revenue-margin/summary.js";

/**
 * Stepped financial waterfall — presentation only; values from existing selectors.
 */
export default function FinancialWaterfall({ steps = [] }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Financial waterfall
      </h3>
      <ol className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-gray-100">
        {steps.map((step, index) => {
          const tone = waterfallRowTone(step);
          const formatted = formatExplorerValue(step.value, "currency");
          const isResult = tone === "result";
          const isDeduction = tone === "deduction";
          return (
            <li
              key={step.key}
              className={[
                "flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]",
                isResult ? "bg-[#1a3673]/[0.04]" : "bg-white",
              ].join(" ")}
            >
              <span
                className={[
                  "min-w-0",
                  isResult ? "font-semibold text-[#1a3673]" : isDeduction ? "text-slate-500" : "font-medium text-slate-700",
                ].join(" ")}
              >
                <span className="mr-1.5 tabular-nums text-[11px] text-slate-400">
                  {index === 0 ? "" : "→"}
                </span>
                {step.label}
              </span>
              <span
                className={[
                  "shrink-0 tabular-nums",
                  isResult ? "font-semibold text-[#1a3673]" : isDeduction ? "text-slate-500" : "text-slate-700",
                ].join(" ")}
              >
                {formatted.supported ? formatted.text : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
