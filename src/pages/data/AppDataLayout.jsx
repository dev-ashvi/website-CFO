import { NavLink, Outlet } from "react-router-dom";
import { FolderOpen, Plug, HeartPulse, ClipboardList, GitBranch, Boxes, ListTodo, Lightbulb } from "lucide-react";

function subNavClass({ isActive }) {
  return `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
    isActive
      ? "bg-[#1a3673] text-white shadow-sm"
      : "text-slate-600 hover:bg-white hover:text-[#1a3673]"
  }`;
}

export default function AppDataLayout() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-gray-200/80 bg-white/90 px-3 py-4 md:w-[216px] md:border-b-0 md:border-r md:py-5">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Data</p>
        <nav className="mt-3 flex flex-row gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0">
          <NavLink to="/app/data/files" className={subNavClass} end>
            <FolderOpen className="h-4 w-4 shrink-0" strokeWidth={2} />
            Files
          </NavLink>
          <NavLink to="/app/data/connect" className={subNavClass}>
            <Plug className="h-4 w-4 shrink-0" strokeWidth={2} />
            Connect
          </NavLink>
          <NavLink to="/app/data/health" className={subNavClass}>
            <HeartPulse className="h-4 w-4 shrink-0" strokeWidth={2} />
            Data Health
          </NavLink>

          <p className="mt-4 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 md:mt-5">
            Planning
          </p>
          <NavLink to="/app/data/planning/assumptions" className={subNavClass}>
            <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={2} />
            Assumptions
          </NavLink>
          <NavLink to="/app/data/planning/scenarios" className={subNavClass}>
            <GitBranch className="h-4 w-4 shrink-0" strokeWidth={2} />
            Scenarios
          </NavLink>
          <NavLink to="/app/data/planning/models" className={subNavClass}>
            <Boxes className="h-4 w-4 shrink-0" strokeWidth={2} />
            Models
          </NavLink>
          <NavLink to="/app/data/planning/plans" className={subNavClass}>
            <ListTodo className="h-4 w-4 shrink-0" strokeWidth={2} />
            Plans
          </NavLink>
          <NavLink to="/app/data/planning/insights" className={subNavClass}>
            <Lightbulb className="h-4 w-4 shrink-0" strokeWidth={2} />
            Insights
          </NavLink>
        </nav>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f5f7fb]">
        <Outlet />
      </div>
    </div>
  );
}
