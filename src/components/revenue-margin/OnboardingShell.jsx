import OnboardingStepper from "./OnboardingStepper.jsx";

/**
 * Shell for progressive onboarding: quiet stepper + focused panel + action row.
 */
export default function OnboardingShell({ steps, title, subtitle, children, footer = null }) {
  return (
    <div className="mx-auto w-full max-w-[880px] space-y-3">
      <OnboardingStepper steps={steps} />
      <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        {(title || subtitle) && (
          <div className="mb-3">
            {title ? <h2 className="text-lg font-semibold tracking-tight text-[#1a3673]">{title}</h2> : null}
            {subtitle ? <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">{subtitle}</p> : null}
          </div>
        )}
        {children}
        {footer ? (
          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {footer}
          </div>
        ) : null}
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
