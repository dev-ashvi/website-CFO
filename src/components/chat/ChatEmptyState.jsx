export default function ChatEmptyState({ onStart, isStarting, error }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-10">
        <div className="space-y-5">
          <p className="text-[12px] font-medium text-slate-400">CFO workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[#1a3673] sm:text-4xl sm:leading-tight">
            Your AI CFO is ready
          </h1>
          <p className="mx-auto max-w-xl text-[16px] leading-relaxed text-slate-600">
            Ask about runway, cash flow, MIS, and forecasts. Start a conversation to use the full workspace — suggested prompts
            appear above the composer once you are in a thread.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => onStart({})}
            disabled={isStarting}
            className="rounded-full bg-[#fc7d25] px-10 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e86f16] disabled:opacity-65"
          >
            {isStarting ? "Starting…" : "Start new conversation"}
          </button>
          {error && <p className="mt-6 text-xs leading-relaxed text-[#b91c1c]">{error}</p>}
        </div>
      </div>
    </div>
  );
}
