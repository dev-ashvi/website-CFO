import { MessageSquare } from "lucide-react";
import { ASK_WYZ_DISCLOSURE, formatInr, formatPct, getSection } from "../../lib/marketplace-intelligence/index.js";

function formatEvidenceValue(value) {
  if (value == null) return "—";
  if (typeof value === "number" && Math.abs(value) <= 5 && String(value).includes(".")) {
    // Likely a ratio when absolute value is small; still format carefully.
  }
  if (typeof value === "number" && Math.abs(value) <= 2 && Number.isFinite(value) && !Number.isInteger(value)) {
    return formatPct(value);
  }
  if (typeof value === "number") return formatInr(value);
  return String(value);
}

export default function AskWyzPanel({ sectionId, response, onAsk }) {
  const section = getSection(sectionId);

  return (
    <aside className="rounded-[1.35rem] border border-[rgba(26,54,115,0.12)] bg-[#10244f] p-5 text-white shadow-[0_18px_40px_rgba(16,36,79,0.18)]">
      <div className="flex items-center gap-2">
        <MessageSquare size={18} aria-hidden />
        <h2 className="text-base font-semibold">Ask WYZ</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#d5e0f2]">{ASK_WYZ_DISCLOSURE}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#fcb07a]">
        Suggested for {section.label}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {section.questions.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onAsk(question)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm leading-5 text-white transition-colors hover:bg-white/10"
          >
            {question}
          </button>
        ))}
      </div>

      {response ? (
        <div className="mt-4 rounded-xl bg-white px-3 py-3 text-[#1a3673]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#c55a12]">
            {response.liveModel ? "Live model" : "Guided investigation"}
          </p>
          <p className="mt-1 text-sm font-medium">{response.question}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {response.answer || "No answer yet. This session does not have calculated metrics to cite."}
          </p>
          {response.evidence?.length ? (
            <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
              {response.evidence.map((item) => (
                <li key={`${item.metricId}-${item.label}`} className="flex justify-between gap-3">
                  <span>{item.label}</span>
                  <span className="font-semibold text-[#1a3673]">{formatEvidenceValue(item.value)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <dl className="mt-3 space-y-1 text-xs text-slate-500">
            <div className="flex justify-between gap-3">
              <dt>Section</dt>
              <dd className="font-medium text-[#1a3673]">{response.context?.sectionId}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Status</dt>
              <dd className="font-medium text-[#1a3673]">{response.status}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </aside>
  );
}
