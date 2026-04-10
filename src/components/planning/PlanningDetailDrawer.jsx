import { X } from "lucide-react";

/**
 * Right-side detail panel for Planning demo pages (models, plans).
 */
export default function PlanningDetailDrawer({ open, title, onClose, children }) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-[1px]"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[70] flex w-[min(100%,24rem)] flex-col border-l border-slate-200/90 bg-white shadow-[0_0_40px_rgba(15,23,42,0.12)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-drawer-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
          <h2 id="planning-drawer-title" className="min-w-0 text-[15px] font-semibold leading-snug text-[#1a3673]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </aside>
    </>
  );
}
