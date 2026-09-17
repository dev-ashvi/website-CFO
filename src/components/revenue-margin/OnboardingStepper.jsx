import { Check } from "lucide-react";

/**
 * Compact progress stepper for Revenue & Margin onboarding.
 * Presentation only — does not own workflow state.
 */
export default function OnboardingStepper({ steps = [] }) {
  if (!steps.length) return null;

  return (
    <nav aria-label="Dataset onboarding progress" className="w-full overflow-x-auto pb-0.5">
      <ol className="flex min-w-[320px] items-center gap-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const complete = step.state === "complete";
          const current = step.state === "current";

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-col items-center gap-1 px-0.5">
                <span
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-offset-1",
                    complete
                      ? "bg-emerald-600 text-white ring-emerald-200"
                      : current
                        ? "bg-[#fc7d25] text-white ring-[#fc7d25]/35"
                        : "bg-slate-100 text-slate-400 ring-transparent",
                  ].join(" ")}
                  aria-current={current ? "step" : undefined}
                >
                  {complete ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={[
                    "truncate text-[11px]",
                    complete
                      ? "font-semibold text-emerald-700"
                      : current
                        ? "font-semibold text-[#1a3673]"
                        : "font-medium text-slate-400",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={[
                    "mb-4 h-[3px] min-w-[10px] flex-1 rounded-full",
                    complete ? "bg-emerald-500" : current ? "bg-[#fc7d25]/35" : "bg-slate-200",
                  ].join(" ")}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
