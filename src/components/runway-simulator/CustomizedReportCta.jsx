import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

const LOCKED = [
  "Best, base and worst-case scenarios",
  "Detailed cost optimization",
  "Hiring affordability analysis",
  "Fundraising timing and planning",
  "Department-level expense modelling",
  "Working-capital analysis",
  "Customized financial assumptions",
  "Downloadable financial model",
  "Founder or investor-ready report",
  "CFO review",
];

/**
 * Deterministic conversion bridge from runway status (not AI).
 * @param {string|undefined} healthStatus
 */
export function buildConversionBridge(healthStatus) {
  switch (healthStatus) {
    case "Critical":
      return {
        title: "Your free assessment identified a critical runway risk.",
        body: "A customized model can show which cost actions, funding timing or growth changes could extend your runway.",
      };
    case "Attention required":
      return {
        title: "Your free assessment shows runway that needs closer attention.",
        body: "A customized model can clarify which levers — costs, funding timing or growth — would improve your cash position with more confidence.",
      };
    case "Stable":
      return {
        title: "Your free assessment shows a stable near-term runway.",
        body: "A customized model can stress-test that outlook across hiring, working capital and fundraising scenarios before you commit.",
      };
    case "Healthy":
      return {
        title: "Your free assessment points to a healthier runway outlook.",
        body: "A customized model can help you plan growth, hiring and fundraising with clearer operating scenarios behind the estimate.",
      };
    default:
      return {
        title: "Your free assessment is a starting point for planning.",
        body: "A customized model can turn these assumptions into a fuller plan across revenue, costs, working capital and funding.",
      };
  }
}

export function CustomizedReportCta({ priority, runwayMonths, healthStatus }) {
  const params = new URLSearchParams({
    source: "runway-simulator",
    priority: priority || "",
    runway: runwayMonths != null ? String(runwayMonths) : "",
    status: healthStatus || "",
  });

  const bridge = buildConversionBridge(healthStatus);

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="rounded-2xl border border-[rgba(26,54,115,0.12)] bg-[#f8fafc] px-5 py-5 md:rounded-[1.35rem] md:px-7 md:py-6">
        <p className="text-[15px] font-semibold leading-snug text-[#1a3673] md:text-base">{bridge.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 md:text-[15px]">{bridge.body}</p>
      </section>

      <section className="relative overflow-hidden rounded-[1.35rem] border border-[rgba(26,54,115,0.25)] bg-[#1a3673] px-6 py-8 text-white shadow-[0_20px_44px_rgba(26,54,115,0.2)] md:px-10 md:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.55) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 top-0 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(252,125,37,0.22),transparent_72%)] blur-2xl"
          aria-hidden
        />

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fc7d25]">Go deeper with WYZ</p>
          <h3 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-white md:text-[1.85rem] md:leading-snug">
            Turn this runway estimate into a complete financial plan
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#c5d0e4] md:text-base">
            WYZ can build a customized model for your revenue channels, hiring plan, working capital, fundraising
            strategy and operating scenarios.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {LOCKED.map((label) => (
              <div
                key={label}
                className="cursor-default rounded-xl border border-white/[0.15] bg-white/[0.05] px-3.5 py-3.5 transition-colors duration-200 hover:border-white/[0.2] hover:bg-white/[0.07]"
              >
                <div className="flex items-center gap-2.5">
                  <Lock size={13} className="shrink-0 text-[#fc7d25]/85" aria-hidden />
                  <span className="text-[13px] font-medium text-white/80">{label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to={`/early-access?${params.toString()}`}
              className="inline-flex items-center justify-center rounded-xl bg-[#fc7d25] px-7 py-3 text-center text-sm font-semibold text-white shadow-[0_3px_12px_rgba(252,125,37,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e86f16] hover:shadow-[0_6px_18px_rgba(252,125,37,0.34)] sm:text-base"
            >
              Get a Customized Financial Report
            </Link>
            <Link
              to="/early-access"
              className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-transparent px-7 py-3 text-center text-sm font-semibold text-white/90 transition hover:border-[#fc7d25]/50 hover:bg-white/5 sm:text-base"
            >
              Talk to WYZ
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
