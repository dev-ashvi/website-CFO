const PRIORITIES = [
  {
    severity: "HIGH",
    title: "Vendor payments due in 3 days",
    detail: "₹18L across 3 invoices · cash timing tight vs payroll",
    action: "Schedule payments",
  },
  {
    severity: "MEDIUM",
    title: "Burn increased 7% vs last month",
    detail: "Marketing and hiring drove most of the delta",
    action: "Ask AI CFO",
  },
  {
    severity: "MEDIUM",
    title: "Collections lagging sales growth",
    detail: "DSO up 6 days · top 5 accounts need follow-up",
    action: "Open collections view",
  },
  {
    severity: "LOW",
    title: "Investor update draft ready",
    detail: "March narrative + runway chart attached",
    action: "Review draft",
  },
];

const ACTIONS = [
  "Upload missing bank statement",
  "Approve forecast assumptions",
  "Review investor report draft",
  "Connect accounting integration",
];

const severityStyles = {
  HIGH: "bg-rose-50 text-rose-800 ring-rose-200/80",
  MEDIUM: "bg-amber-50 text-amber-900 ring-amber-200/70",
  LOW: "bg-slate-100 text-slate-700 ring-slate-200/80",
};

export default function PrioritiesAndActions() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-100/90 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-[#1a3673]">AI priorities</h3>
        <p className="mt-1 text-[12px] text-slate-500">What needs attention next</p>
        <ul className="mt-5 space-y-4">
          {PRIORITIES.map((p) => (
            <li key={p.title} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${severityStyles[p.severity]}`}
                >
                  {p.severity}
                </span>
                <span className="text-[14px] font-semibold text-slate-800">{p.title}</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{p.detail}</p>
              <button
                type="button"
                className="mt-3 text-[12px] font-semibold text-[#fc7d25] transition hover:text-[#e86f16]"
              >
                {p.action} →
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-gray-100/90 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-[#1a3673]">Action center</h3>
        <p className="mt-1 text-[12px] text-slate-500">Operational next steps</p>
        <ul className="mt-5 space-y-2">
          {ACTIONS.map((label) => (
            <li key={label}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-slate-50/50 px-4 py-3 text-left text-[13px] font-medium text-[#1a3673] transition hover:border-slate-200 hover:bg-white"
              >
                {label}
                <span className="text-slate-400">→</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
