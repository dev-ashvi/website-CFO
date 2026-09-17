import OnboardingStepper from "./OnboardingStepper.jsx";

/**
 * Single cohesive onboarding surface: stepper + stage content + actions.
 */
export default function OnboardingShell({ steps, title, subtitle, children, footer = null, aside = null }) {
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <div className="border-b border-gray-100 bg-[#f8fafc]/80 px-4 py-3 sm:px-6">
          <OnboardingStepper steps={steps} />
        </div>

        <div className="p-5 sm:p-6 lg:p-7">
          {(title || subtitle) && (
            <div className="mb-4 max-w-3xl">
              {title ? <h2 className="text-[1.35rem] font-semibold tracking-tight text-[#1a3673] sm:text-xl">{title}</h2> : null}
              {subtitle ? <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{subtitle}</p> : null}
            </div>
          )}

          {aside ? <div className="mb-4">{aside}</div> : null}

          {children}

          {footer ? (
            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              {footer}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** Secondary ← Back control for presentation review navigation. */
export function OnboardingBackButton({ onClick, disabled = false, label = "← Back" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="self-start text-[13px] font-medium text-slate-500 hover:text-[#1a3673] disabled:opacity-40"
    >
      {label}
    </button>
  );
}
