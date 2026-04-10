import { useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { SUGGESTED_PROMPTS } from "./suggestedPrompts.js";

const MODES = [
  { id: "ask", label: "Ask" },
  { id: "analyze", label: "Analyze" },
  { id: "forecast", label: "Forecast" },
];

export default function ChatComposer({ onSend, sendStatus }) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("ask");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (sendStatus === "sending") return;

    const ok = await onSend(trimmed);
    if (ok) {
      setInput("");
    }
  };

  const handleRetry = async () => {
    const trimmed = input.trim();
    if (!trimmed || sendStatus === "sending") return;
    const ok = await onSend(trimmed);
    if (ok) {
      setInput("");
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setInput(label)}
            disabled={sendStatus === "sending"}
            className="rounded-full border border-gray-100 bg-white/90 px-3 py-1.5 text-left text-[11px] font-medium text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-[#1a3673] disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <div className="flex w-full items-end gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm focus-within:border-slate-200 focus-within:shadow-sm">
          <button
            type="button"
            title="Attach"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
            aria-label="Attach file"
          >
            <Paperclip className="h-[17px] w-[17px]" strokeWidth={2} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            className="min-h-[2.5rem] w-full min-w-0 flex-1 resize-none border-0 bg-transparent py-2 text-[14px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
            placeholder="Message your CFO…"
          />
          <button
            type="submit"
            disabled={!input.trim() || sendStatus === "sending"}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fc7d25] text-white transition hover:bg-[#e86f16] disabled:opacity-45"
            aria-label="Send"
          >
            {sendStatus === "sending" ? (
              <span className="text-[10px] font-bold">…</span>
            ) : (
              <Send className="h-[16px] w-[16px]" strokeWidth={2} />
            )}
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-lg bg-slate-100/70 p-0.5" role="group" aria-label="Mode">
            {MODES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                  mode === id ? "bg-white text-[#1a3673] shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span className="hidden sm:inline">Enter send · Shift+Enter new line</span>
            {sendStatus === "error" && (
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
