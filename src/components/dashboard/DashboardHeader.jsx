import { Link } from "react-router-dom";
import { CalendarRange, Sparkles } from "lucide-react";

export default function DashboardHeader() {
  return (
    <div className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a3673] sm:text-[1.65rem]">Dashboard</h1>
        <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-slate-600">
          Your AI-powered finance command center
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200/90 bg-white px-3.5 py-2 text-[12px] font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <CalendarRange className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} />
          Last 30 days
        </button>
        <Link
          to="/app/chat"
          className="inline-flex items-center gap-2 rounded-xl bg-[#fc7d25] px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#e86f16]"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          Ask AI CFO
        </Link>
      </div>
    </div>
  );
}
