import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  filterMultiSelectOptions,
  shouldShowMultiSelectSearch,
  toggleMultiSelectValue,
} from "../../lib/revenue-margin/cfoMultiSelectHelpers.js";

export default function CfoMultiSelect({
  label,
  options = [],
  selected = [],
  onChange,
  searchable = true,
  placeholder = "Select…",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  const filtered = useMemo(
    () => filterMultiSelectOptions(options, query),
    [options, query],
  );
  const showSearch = shouldShowMultiSelectSearch(options, searchable);

  useEffect(() => {
    function onDocClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!options.length) return null;

  function toggle(value) {
    onChange(toggleMultiSelectValue(selected, value));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div ref={rootRef} className="relative text-[12px] text-slate-600">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {selected.length > 0 && (
          <button type="button" onClick={clearAll} className="text-[11px] text-[#1a3673] hover:underline">
            Clear
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {selected.length === 0 && (
          <span className="text-[11px] text-slate-400">{placeholder}</span>
        )}
        {selected.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-700 shadow-sm ring-1 ring-slate-200"
          >
            {value}
            <X className="h-3 w-3" />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-[rgba(26,54,115,0.16)] bg-white px-2 py-1.5 text-left"
      >
        <span className="truncate text-slate-700">
          {selected.length ? `${selected.length} selected` : `Choose ${label.toLowerCase()}`}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {showSearch && (
            <label className="mb-2 flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full bg-transparent text-[12px] outline-none"
              />
            </label>
          )}
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {filtered.map((option) => {
              const checked = selected.includes(String(option));
              return (
                <li key={option}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option)}
                      className="rounded border-slate-300"
                    />
                    <span className="truncate">{option}</span>
                  </label>
                </li>
              );
            })}
            {!filtered.length && (
              <li className="px-1 py-2 text-[11px] text-slate-400">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
