import { ChevronRight, PanelRight, Sparkles } from "lucide-react";

const DATA_USED = ["March MIS", "Bank feed", "Budget FY26"];

const KEY_METRICS = [
  { label: "Burn", value: "₹14.5L", delta: "↑ 7%" },
  { label: "Revenue", value: "₹26.8L", delta: "↑ 11%" },
  { label: "Runway", value: "8.4 months", delta: "↓ from 9.1" },
];

const INSIGHTS = [
  "Burn is rising faster than revenue",
  "Collections are slower than sales growth",
  "Runway has decreased from last month",
];

const ACTIONS = ["Review collections", "Reduce marketing spend", "Recheck hiring plan"];

const ASSUMPTIONS = [
  "Revenue growth 8%",
  "Hiring +3 roles",
  "Collections cycle 52 days",
  "Marketing spend +12%",
];

function SectionTitle({ children }) {
  return (
    <h2 className="text-[13px] font-semibold tracking-tight text-[#1a3673]">{children}</h2>
  );
}

function SubLabel({ children }) {
  return <p className="text-[11px] font-medium text-slate-500">{children}</p>;
}

export default function ChatContextPanel({
  collapsed = false,
  onToggleContextCollapse = () => {},
}) {
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col">
      <div
        className={`min-h-0 flex-col items-center gap-3 py-2 ${collapsed ? "flex flex-1" : "hidden"}`}
        aria-hidden={!collapsed}
      >
        <button
          type="button"
          onClick={onToggleContextCollapse}
          title="Expand context"
          aria-expanded={false}
          aria-label="Expand context panel"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-[#1a3673]"
        >
          <ChevronRight
            className="h-4 w-4 rotate-180 transition-transform duration-300 ease-in-out"
            strokeWidth={2}
          />
        </button>
        <PanelRight className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      </div>

      <div
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl bg-white px-5 py-5 shadow-sm ${
          collapsed ? "hidden" : "flex"
        }`}
        aria-hidden={collapsed}
      >
        <div className="mb-5 flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 pb-4">
          <div className="min-w-0 pt-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">CFO context</p>
            <p className="mt-1 text-[12px] leading-snug text-slate-600">Grounding for this thread</p>
          </div>
          <button
            type="button"
            onClick={onToggleContextCollapse}
            title="Collapse context"
            aria-expanded
            aria-label="Collapse context panel"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-[#1a3673]"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-300 ease-in-out" strokeWidth={2} />
          </button>
        </div>

        <section className="shrink-0 space-y-4">
          <SectionTitle>Data & metrics</SectionTitle>
          <div>
            <SubLabel>Data used</SubLabel>
            <ul className="mt-2 space-y-2">
              {DATA_USED.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-[12px] leading-relaxed text-slate-700 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-[#fc7d25] before:content-['']"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SubLabel>Key metrics</SubLabel>
            <dl className="mt-2 space-y-2.5">
              {KEY_METRICS.map(({ label, value, delta }) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-[12px] text-slate-600">{label}</dt>
                  <dd className="text-right">
                    <span className="text-[13px] font-semibold tabular-nums text-[#1a3673]">{value}</span>
                    <span className="ml-1.5 text-[11px] font-medium text-slate-500">{delta}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className="my-5 h-px shrink-0 bg-gray-100" aria-hidden />

        <section className="shrink-0 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600/90" strokeWidth={2} aria-hidden />
            <SectionTitle>Insights</SectionTitle>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">AI-detected signals</p>
          <ul className="space-y-2">
            {INSIGHTS.map((text) => (
              <li
                key={text}
                className="rounded-lg border-l-2 border-amber-400/70 bg-amber-50/50 px-3 py-2 text-[12px] font-medium leading-snug text-slate-800"
              >
                {text}
              </li>
            ))}
          </ul>
        </section>

        <div className="my-5 h-px shrink-0 bg-gray-100" aria-hidden />

        <section className="shrink-0 space-y-3">
          <SectionTitle>Actions</SectionTitle>
          <ul className="space-y-1.5">
            {ACTIONS.map((label) => (
              <li key={label}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-transparent px-3 py-2 text-left text-[12px] font-medium text-[#1a3673] transition-colors hover:border-gray-100 hover:bg-slate-50"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="my-5 h-px shrink-0 bg-gray-100" aria-hidden />

        <section className="shrink-0 space-y-3">
          <SectionTitle>Assumptions</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {ASSUMPTIONS.map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full bg-slate-100/90 px-2.5 py-1 text-[11px] font-medium leading-snug text-slate-700 ring-1 ring-slate-200/60"
              >
                {label}
              </span>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
