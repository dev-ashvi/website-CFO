import OnboardingStepper from "./OnboardingStepper.jsx";

/**
 * Shell for progressive onboarding: stepper + single focused panel.
 */
export default function OnboardingShell({ steps, title, subtitle, children, footer = null }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <OnboardingStepper steps={steps} />
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        {(title || subtitle) && (
          <div className="mb-4">
            {title ? <h2 className="text-base font-semibold text-[#1a3673] sm:text-lg">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p> : null}
          </div>
        )}
        {children}
        {footer ? <div className="mt-5 flex flex-wrap items-center gap-3">{footer}</div> : null}
      </section>
    </div>
  );
}
