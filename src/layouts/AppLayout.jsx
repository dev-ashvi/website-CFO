import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  MessageSquare,
  Files,
  LayoutDashboard,
  LayoutList,
  Database,
  Workflow,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

function buildNavLinkClass(collapsed, { isActive }) {
  const tone = isActive
    ? "bg-white text-[#1a3673] shadow-sm"
    : "text-[rgba(26,54,115,0.7)] hover:bg-white hover:text-[#1a3673]";
  if (collapsed) {
    return `flex justify-center rounded-lg p-2.5 transition-colors duration-200 ${tone}`;
  }
  return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${tone}`;
}

function buildSubNavLinkClass({ isActive }) {
  const tone = isActive
    ? "bg-white text-[#1a3673] shadow-sm"
    : "text-[rgba(26,54,115,0.7)] hover:bg-white hover:text-[#1a3673]";
  return `flex items-center gap-2 rounded-lg py-1.5 pl-2 pr-3 text-[13px] transition-colors duration-200 ${tone}`;
}

export default function AppLayout() {
  const auth = useAuth();
  const location = useLocation();
  const isFullWorkspace =
    location.pathname.startsWith("/app/chat") ||
    location.pathname.startsWith("/app/dashboard") ||
    location.pathname.startsWith("/app/data") ||
    location.pathname.startsWith("/app/workspace");
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  return (
    <div
      className={`flex flex-col bg-[#f5f7fb] ${
        isFullWorkspace ? "h-[100dvh] overflow-hidden" : "min-h-screen"
      }`}
    >
      <header className="shrink-0 border-b border-[rgba(26,54,115,0.08)] bg-white">
        <div
          className={`flex w-full items-center justify-between px-4 py-3 text-sm md:px-5 ${
            isFullWorkspace ? "" : "mx-auto max-w-7xl"
          }`}
        >
          <div className="font-semibold text-[#1a3673]">WYZ Workspace</div>
          <div className="flex items-center gap-3 text-[12px] text-[rgba(26,54,115,0.7)]">
            {auth.user?.email && <span className="truncate">{auth.user.email}</span>}
            {auth.tenantSlug && (
              <span className="shrink-0 rounded-full bg-[rgba(26,54,115,0.06)] px-2 py-0.5">{auth.tenantSlug}</span>
            )}
            <button
              type="button"
              onClick={auth.logout}
              className="shrink-0 rounded-full border border-[rgba(26,54,115,0.16)] px-2 py-0.5 text-[11px] font-medium text-[#1a3673] hover:bg-[rgba(26,54,115,0.04)]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main
        className={
          isFullWorkspace
            ? "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden md:flex-row md:items-stretch md:gap-0"
            : "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 md:flex-row md:items-stretch"
        }
      >
        <aside
          className={`flex shrink-0 flex-col border-b border-[rgba(26,54,115,0.08)] transition-[width] duration-300 ease-in-out md:min-h-0 md:border-b-0 md:border-r md:border-[rgba(26,54,115,0.08)] md:py-3 md:pl-4 md:pr-0 md:overflow-hidden ${
            isFullWorkspace
              ? "w-full shrink-0 bg-white/70 md:h-full md:min-h-0 md:w-auto md:shrink-0 md:self-stretch md:overflow-hidden"
              : "w-full max-w-xs pb-4 md:max-w-none md:pb-0"
          } ${
            isNavCollapsed ? "md:w-16 md:px-1" : "md:w-[220px] md:pr-3"
          }`}
        >
          <nav className="flex min-h-0 flex-1 flex-col gap-1 px-4 pt-3 text-sm md:px-0 md:pt-0">
            {!isNavCollapsed && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(26,54,115,0.6)]">
                Navigation
              </p>
            )}
            <NavLink
              to="/app/workspace"
              title={isNavCollapsed ? "Planning workspace" : undefined}
              className={(props) => buildNavLinkClass(isNavCollapsed, props)}
            >
              <Workflow className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
              {!isNavCollapsed && <span>Planning workspace</span>}
            </NavLink>
            {isNavCollapsed ? (
              <>
                <NavLink
                  to="/app/dashboard/my-dashboards"
                  title="My dashboards"
                  className={(props) => buildNavLinkClass(true, props)}
                >
                  <LayoutDashboard className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
                </NavLink>
                <NavLink
                  to="/app/dashboard"
                  title="Classic dashboard"
                  className={(props) => buildNavLinkClass(true, props)}
                >
                  <LayoutList className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
                </NavLink>
              </>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-[#1a3673]">
                  <LayoutDashboard className="h-[18px] w-[18px] shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                  <span>Dashboard</span>
                </div>
                <div className="ml-1 space-y-0.5 border-l border-[rgba(26,54,115,0.14)] pl-3">
                  <NavLink to="/app/dashboard/my-dashboards" className={buildSubNavLinkClass}>
                    <span className="w-3 shrink-0 text-center text-[rgba(26,54,115,0.45)]" aria-hidden>
                      •
                    </span>
                    <span>My dashboards</span>
                  </NavLink>
                  <NavLink to="/app/dashboard" className={buildSubNavLinkClass} end>
                    <span className="w-3 shrink-0 text-center text-[rgba(26,54,115,0.45)]" aria-hidden>
                      •
                    </span>
                    <span>Classic dashboard</span>
                  </NavLink>
                </div>
              </div>
            )}
            <NavLink
              to="/app/chat"
              title={isNavCollapsed ? "Chat" : undefined}
              className={(props) => buildNavLinkClass(isNavCollapsed, props)}
            >
              <MessageSquare className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
              {!isNavCollapsed && <span>Chat</span>}
            </NavLink>
            <NavLink
              to="/app/data"
              title={isNavCollapsed ? "Data" : undefined}
              className={(props) => buildNavLinkClass(isNavCollapsed, props)}
            >
              <Database className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
              {!isNavCollapsed && <span>Data</span>}
            </NavLink>
            <NavLink
              to="/app/artifacts"
              title={isNavCollapsed ? "Artifacts" : undefined}
              className={(props) => buildNavLinkClass(isNavCollapsed, props)}
            >
              <Files className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
              {!isNavCollapsed && <span>Artifacts</span>}
            </NavLink>
          </nav>

          <div
            className={`mt-3 hidden border-t border-[rgba(26,54,115,0.08)] pt-3 md:flex md:mt-auto ${
              isNavCollapsed ? "justify-center" : "justify-end pr-1"
            }`}
          >
            <button
              type="button"
              onClick={() => setIsNavCollapsed((c) => !c)}
              title={isNavCollapsed ? "Expand navigation" : "Collapse navigation"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[rgba(26,54,115,0.65)] transition-colors hover:bg-white hover:text-[#1a3673]"
              aria-expanded={!isNavCollapsed}
              aria-label={isNavCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <ChevronLeft
                className={`h-5 w-5 transition-transform duration-300 ease-in-out ${
                  isNavCollapsed ? "rotate-180" : ""
                }`}
                strokeWidth={2}
              />
            </button>
          </div>
        </aside>

        <section
          className={
            isFullWorkspace
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f5f7fb]"
              : "min-w-0 flex-1 rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-5 py-6 shadow-sm"
          }
        >
          {isFullWorkspace ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Outlet />
            </div>
          ) : (
            <Outlet />
          )}
        </section>
      </main>
    </div>
  );
}
