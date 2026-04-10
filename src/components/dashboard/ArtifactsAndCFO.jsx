import { Link } from "react-router-dom";
import { MessageSquare, Calendar, Inbox } from "lucide-react";

const ARTIFACTS = [
  { title: "MIS – March 2026", time: "Updated 2h ago" },
  { title: "12-month runway model", time: "Yesterday" },
  { title: "Investor update draft", time: "Mar 28" },
  { title: "Variance analysis report", time: "Mar 25" },
];

export default function ArtifactsAndCFO() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-100/90 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-[#1a3673]">Recent artifacts</h3>
        <p className="mt-1 text-[12px] text-slate-500">Generated outputs from Wyz</p>
        <ul className="mt-5 divide-y divide-gray-100">
          {ARTIFACTS.map((a) => (
            <li key={a.title} className="flex flex-col gap-2 py-3 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-[14px] font-semibold text-slate-800">{a.title}</span>
                <span className="text-[11px] text-slate-400">{a.time}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] font-semibold">
                <button type="button" className="text-[#1a3673] hover:text-[#fc7d25]">
                  View
                </button>
                <button type="button" className="text-slate-500 hover:text-[#1a3673]">
                  Download
                </button>
                <Link to="/app/chat" className="text-[#fc7d25] hover:text-[#e86f16]">
                  Ask AI
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-gray-100/90 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-[#1a3673]">Human CFO support</h3>
        <p className="mt-1 text-[12px] text-slate-500">Your team alongside the AI workspace</p>
        <dl className="mt-5 space-y-3 text-[13px]">
          <div className="flex justify-between gap-2 border-b border-gray-50 pb-3">
            <dt className="text-slate-500">Assigned CFO</dt>
            <dd className="font-semibold text-[#1a3673]">Rajiv Mehta</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-gray-50 pb-3">
            <dt className="text-slate-500">Analyst</dt>
            <dd className="font-semibold text-[#1a3673]">Neha Sharma</dd>
          </div>
          <div className="flex items-start justify-between gap-2 border-b border-gray-50 pb-3">
            <dt className="flex items-center gap-1.5 text-slate-500">
              <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Next review
            </dt>
            <dd className="text-right font-medium text-slate-800">Tomorrow, 4:00 PM</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-slate-500">
              <Inbox className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Comments
            </dt>
            <dd className="font-semibold text-amber-700">2 unread</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[12px] font-semibold text-[#1a3673] shadow-sm transition hover:bg-slate-50"
          >
            Request review
          </button>
          <Link
            to="/app/chat"
            className="inline-flex items-center gap-2 rounded-full bg-[#1a3673] px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#152a5c]"
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
            Chat with CFO
          </Link>
        </div>
      </div>
    </div>
  );
}
