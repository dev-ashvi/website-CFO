import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Send, Sparkles, X } from "lucide-react";
import { useDashboard } from "../dashboardBuilder/DashboardContext.jsx";
import {
  defaultDashboardChatReply,
  parseDashboardCommand,
  summarizeDashboardActions,
} from "../dashboardBuilder/parseDashboardCommand.js";
import DashboardKpiBlock from "../components/dashboardBuilder/DashboardKpiBlock.jsx";
import DashboardChartBlock from "../components/dashboardBuilder/DashboardChartBlock.jsx";
import DashboardTableBlock from "../components/dashboardBuilder/DashboardTableBlock.jsx";

function timeRangeLabel(filters) {
  const tr = filters?.timeRange || "12m";
  const m = tr.match(/^(\d+)m$/);
  if (m) return `Last ${m[1]} months`;
  return tr;
}

function BlockEditModal({ block, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...block }));
  if (!block) return null;

  const submit = (e) => {
    e.preventDefault();
    const patch = {};
    if (draft.type === "kpi") {
      patch.metricName = draft.metricName;
      patch.value = draft.value;
      patch.trend = draft.trend;
      patch.title = draft.metricName;
    } else if (draft.type === "chart") {
      patch.title = draft.title;
      patch.chartType = draft.chartType;
    } else if (draft.type === "table") {
      patch.title = draft.title;
      patch.dataset = draft.dataset;
    }
    onSave(block.id, patch);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" role="dialog">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-[#1a3673]">Edit block</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          {draft.type === "kpi" && (
            <>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Metric name</span>
                <input
                  value={draft.metricName || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, metricName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Value</span>
                <input
                  value={draft.value || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Trend</span>
                <select
                  value={draft.trend || "flat"}
                  onChange={(e) => setDraft((d) => ({ ...d, trend: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                >
                  <option value="up">Up</option>
                  <option value="down">Down</option>
                  <option value="flat">Flat</option>
                </select>
              </label>
            </>
          )}
          {draft.type === "chart" && (
            <>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Title</span>
                <input
                  value={draft.title || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Chart type</span>
                <select
                  value={draft.chartType || "line"}
                  onChange={(e) => setDraft((d) => ({ ...d, chartType: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                >
                  <option value="line">Line</option>
                  <option value="bar">Bar</option>
                </select>
              </label>
            </>
          )}
          {draft.type === "table" && (
            <>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Title</span>
                <input
                  value={draft.title || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">Dataset label</span>
                <input
                  value={draft.dataset || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, dataset: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
              </label>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12px] font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#1a3673] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#142a5c]"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DashboardBuilderPage() {
  const {
    canvasBlocks,
    filters,
    dashboards,
    activeDashboardId,
    applyChatActions,
    updateBlock,
    removeBlock,
    snapshotForChat,
  } = useDashboard();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const trLabel = useMemo(() => timeRangeLabel(filters), [filters]);

  const sendChat = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { role: "user", content: trimmed, id: `u-${Date.now()}` }]);

    window.setTimeout(() => {
      const snap = snapshotForChat();
      const { actions, reply } = parseDashboardCommand(trimmed, snap);
      if (actions.length) applyChatActions(actions);
      const text =
        reply ||
        (actions.length ? summarizeDashboardActions(actions) : null) ||
        defaultDashboardChatReply(trimmed);
      setMessages((m) => [...m, { role: "assistant", content: text, id: `a-${Date.now()}` }]);
      setSending(false);
    }, 320);
  }, [input, sending, snapshotForChat, applyChatActions]);

  const expandedBlock = expandedId ? canvasBlocks.find((b) => b.id === expandedId) : null;

  const renderBlock = (b, expanded) => {
    const common = {
      block: b,
      onEdit: setEditingBlock,
      onDelete: removeBlock,
      onExpand: (id) => setExpandedId((cur) => (cur === id ? null : id)),
      expanded,
      timeRangeLabel: trLabel,
    };
    if (b.type === "kpi") return <DashboardKpiBlock {...common} />;
    if (b.type === "chart") return <DashboardChartBlock {...common} />;
    if (b.type === "table") return <DashboardTableBlock {...common} />;
    return null;
  };

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[#f5f7fb]">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-[#1a3673] sm:text-2xl">Dashboard</h1>
              <p className="mt-1 max-w-2xl text-[13px] text-slate-500">
                AI-driven builder — describe blocks and filters; the canvas updates from workspace state.
              </p>
            </div>
            <Link
              to="/app/dashboard"
              className="text-[12px] font-semibold text-[#1a3673] underline-offset-2 hover:underline"
            >
              Classic dashboard
            </Link>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 ring-1 ring-slate-100/80">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#fc7d25]" strokeWidth={2} />
              <span className="text-[13px] font-semibold text-[#1a3673]">AI chat</span>
              <span className="rounded-full bg-[#1a3673]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#1a3673]">
                Primary
              </span>
            </div>
            <div className="mt-3 max-h-[min(32vh,260px)] min-h-[120px] space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-white/80 p-3">
              {messages.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-slate-400">
                  Ask AI to build your dashboard — e.g. “Show revenue vs expenses”, “Add runway KPI”.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[92%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === "user"
                        ? "ml-auto bg-[#1a3673] text-white"
                        : "mr-auto bg-slate-100 text-slate-800"
                    }`}
                  >
                    {m.content}
                  </div>
                ))
              )}
            </div>
            <div className="relative mt-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="e.g. Add a table, last 6 months, remove revenue chart…"
                disabled={sending}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-3 pr-12 text-[13px] outline-none focus:border-[#1a3673]/30 focus:ring-2 focus:ring-[#1a3673]/10 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={sending || !input.trim()}
                onClick={sendChat}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#1a3673] hover:bg-[#1a3673]/10 disabled:opacity-30"
                aria-label="Send"
              >
                {sending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a3673]/30 border-t-[#1a3673]" />
                ) : (
                  <Send className="h-4 w-4" strokeWidth={2} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Canvas · {dashboards.find((d) => d.id === activeDashboardId)?.name || "Dashboard"}
            </p>
            <p className="text-[11px] font-medium text-slate-500">
              Filters: <span className="font-semibold text-[#1a3673]">{trLabel}</span>
            </p>
          </div>

          {canvasBlocks.length === 0 ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-[#1a3673]/25 bg-white/60 px-6 py-16 text-center ring-1 ring-[#1a3673]/10">
              <Sparkles className="h-10 w-10 text-[#fc7d25]/80" strokeWidth={1.5} />
              <p className="mt-4 text-[16px] font-semibold text-[#1a3673]">Ask AI to build your dashboard</p>
              <p className="mt-2 max-w-md text-[13px] leading-relaxed text-slate-500">
                Use the chat above to add KPIs, charts, and tables. Everything you add appears here in a responsive grid.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-4">
              {canvasBlocks.map((b) => {
                const wide = (b.layout?.colSpan || 1) >= 2;
                return (
                  <div key={b.id} className={wide ? "col-span-12" : "col-span-12 md:col-span-6"}>
                    {renderBlock(b, false)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editingBlock ? (
        <BlockEditModal
          key={editingBlock.id}
          block={editingBlock}
          onClose={() => setEditingBlock(null)}
          onSave={(id, patch) => updateBlock(id, patch)}
        />
      ) : null}

      {expandedBlock ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-[#f5f7fb]/95 p-4 backdrop-blur-sm sm:p-8">
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setExpandedId(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
              {renderBlock(expandedBlock, true)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
