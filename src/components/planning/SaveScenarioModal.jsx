import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";

export default function SaveScenarioModal({ open, onClose, onSave, defaultName = "" }) {
  const titleId = useId();
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-2xl border border-gray-200/90 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-[16px] font-semibold text-[#1a3673]">
            Save scenario
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-[#1a3673]"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
          Name this draft preview. It’s saved in this session only — your baseline assumptions stay unchanged.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="scenario-name" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Scenario name
            </label>
            <input
              id="scenario-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Downside Q3, Board stress case"
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-slate-800 shadow-sm outline-none focus:border-[#1a3673]/40 focus:ring-2 focus:ring-[#1a3673]/15"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 rounded-xl bg-[#1a3673] py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#142a5c] disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
