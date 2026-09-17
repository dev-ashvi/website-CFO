import { Check } from "lucide-react";

/**
 * Compact progress stepper for Revenue & Margin onboarding.
 * Presentation only — content remains the hero.
 */
export default function OnboardingStepper({ steps = [] }) {
  if (!steps.length) return null;

  return (
    <nav aria-label="Dataset onboarding progress" className="w-full overflow-x-auto">
      <ol className="flex min-w-[300px] items-center gap-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const complete = step.state === "complete";
          const current = step.state === "current";

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-col items-center gap-0.5 px-0.5">
                <span
                  className={[
                    "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                    complete
                      ? "bg-emerald-600 text-white"
                      : current
                        ? "bg-[#fc7d25] text-white ring-2 ring-[#fc7d25]/25 ring-offset-1"
                        : "bg-slate-100 text-slate-400",
                  ].join(" ")}
                  aria-current={current ? "step" : undefined}
                >
                  {complete ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={[
                    "truncate text-[10px]",
                    complete
                      ? "font-medium text-emerald-700"
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
                    "mb-3.5 h-0.5 min-w-[8px] flex-1 rounded-full",
                    complete ? "bg-emerald-400" : current ? "bg-[#fc7d25]/30" : "bg-slate-200",
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
