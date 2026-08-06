import { useEffect, useMemo, useRef, useState } from "react";
import { CURRENCY_OPTIONS, getCurrencyOption } from "../../lib/financial-simulator/currency.js";

/**
 * Searchable currency select — stores ISO code (INR, USD, …).
 * @param {{ value: string, onChange: (code: string) => void, className?: string }} props
 */
export function CurrencySelect({ value, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = getCurrencyOption(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCY_OPTIONS;
    return CURRENCY_OPTIONS.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[rgba(26,54,115,0.12)] bg-white px-3.5 py-2.5 text-left text-sm text-[#1a3673] outline-none transition focus:border-[#1a3673] focus:ring-2 focus:ring-[rgba(26,54,115,0.12)]"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span className="font-medium tabular-nums">{selected.code}</span>
          <span className="text-slate-400"> — </span>
          <span className="text-slate-600">{selected.label.replace(`${selected.code} – `, "")}</span>
        </span>
        <span className="text-slate-400" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-xl border border-[rgba(26,54,115,0.14)] bg-white shadow-[0_12px_32px_rgba(26,54,115,0.12)]">
          <div className="border-b border-[rgba(26,54,115,0.08)] p-2">
            <input
              ref={inputRef}
              type="search"
              className="w-full rounded-lg border border-[rgba(26,54,115,0.12)] px-3 py-2 text-sm text-[#1a3673] outline-none placeholder:text-slate-400 focus:border-[#1a3673]"
              placeholder="Search currency…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  setQuery("");
                }
                if (e.key === "Enter" && filtered[0]) {
                  onChange(filtered[0].code);
                  setOpen(false);
                  setQuery("");
                }
              }}
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3.5 py-2 text-sm text-slate-400">No matches</li>
            ) : (
              filtered.map((c) => {
                const active = c.code === selected.code;
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm transition ${
                        active
                          ? "bg-[rgba(26,54,115,0.06)] font-medium text-[#1a3673]"
                          : "text-slate-700 hover:bg-[#f8fafc]"
                      }`}
                      onClick={() => {
                        onChange(c.code);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="w-10 font-semibold tabular-nums">{c.code}</span>
                      <span className="text-slate-500">{c.label.replace(`${c.code} – `, "")}</span>
                      <span className="ml-auto text-slate-400">{c.symbol.trim()}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
