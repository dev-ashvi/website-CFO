import OnboardingStepper from "./OnboardingStepper.jsx";

/**
 * Shell for progressive onboarding: stepper + single focused panel.
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
        {footer ? <div className="mt-4 flex flex-wrap items-center gap-3">{footer}</div> : null}
      </section>
    </div>
  );
}
