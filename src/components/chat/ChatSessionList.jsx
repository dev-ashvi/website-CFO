import { Children } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, MessageSquare, Plus } from "lucide-react";
import { useChatSessions } from "../../hooks/useChatSessions.js";
import { ChatSessionListSkeleton } from "./ChatLoadingSkeleton.jsx";

function calendarDayKey(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}

function isToday(ts) {
  return calendarDayKey(ts) === calendarDayKey(Date.now());
}

function isYesterday(ts) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return calendarDayKey(ts) === calendarDayKey(y.getTime());
}

function partitionSessions(sessions) {
  if (!sessions || !sessions.length) {
    return { pinned: [], today: [], yesterday: [], earlier: [] };
  }

  const pinned = [];
  const today = [];
  const yesterday = [];
  const earlier = [];

  for (const s of sessions) {
    if (s.pinned) {
      pinned.push(s);
      continue;
    }
    const ts = s.updated_at || s.created_at;
    if (!ts) {
      earlier.push(s);
      continue;
    }
    if (isToday(ts)) today.push(s);
    else if (isYesterday(ts)) yesterday.push(s);
    else earlier.push(s);
  }

  return { pinned, today, yesterday, earlier };
}

function SessionRow({ session, index, isActive }) {
  const title = session.title || `Conversation ${index + 1}`;
  const updatedAt = session.updated_at || session.created_at;

  return (
    <li>
      <Link
        to={`/app/chat/${encodeURIComponent(session.id)}`}
        className={`group block rounded-lg px-2 py-2.5 pl-2.5 transition-colors ${
          isActive
            ? "border-l-2 border-l-[#fc7d25] bg-[rgba(252,125,37,0.06)]"
            : "border-l-2 border-l-transparent hover:bg-white/60"
        }`}
      >
        <div
          className={`truncate text-[12px] font-medium leading-snug ${
            isActive ? "text-[#1a3673]" : "text-slate-600 group-hover:text-[#1a3673]"
          }`}
        >
          {title}
        </div>
        {updatedAt && (
          <div className="mt-1 text-[9px] text-slate-400">
            {new Date(updatedAt).toLocaleString(undefined, {
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </Link>
    </li>
  );
}

function Section({ label, children, emptyHint = null }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <div className="space-y-2">
      <h3 className="px-0.5 text-[10px] font-medium text-slate-400">{label}</h3>
      {items.length > 0 ? (
        <ul className="space-y-0.5">{items}</ul>
      ) : emptyHint ? (
        <p className="px-1 py-2 text-[11px] leading-relaxed text-slate-400">{emptyHint}</p>
      ) : null}
    </div>
  );
}

function CollapsedConversationRail({ onToggle, onNew, isCreating }) {
  return (
    <div className="hidden min-h-0 w-full flex-col items-center gap-3 py-3 lg:flex">
      <button
        type="button"
        onClick={onToggle}
        title="Expand conversations"
        aria-expanded={false}
        aria-label="Expand conversations"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-[#1a3673]"
      >
        <ChevronLeft
          className="h-4 w-4 rotate-180 transition-transform duration-300 ease-in-out"
          strokeWidth={2}
        />
      </button>
      <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      <button
        type="button"
        onClick={onNew}
        disabled={isCreating}
        title="New conversation"
        aria-label="New conversation"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#fc7d25] transition-colors hover:bg-white disabled:opacity-50"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function ConversationListBody({
  sessions,
  status,
  error,
  reload,
  renderList,
  pinned,
  today,
  yesterday,
  earlier,
}) {
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden pr-0.5">
      {status === "loading" && (
        <div>
          <ChatSessionListSkeleton rows={4} />
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2 text-[11px] leading-relaxed text-red-600">
          <p>{error}</p>
          <button type="button" onClick={reload} className="font-semibold underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {status === "loaded" && (!sessions || sessions.length === 0) && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          No chats yet. <span className="font-medium text-slate-500">New</span> to start.
        </p>
      )}

      {status === "loaded" && sessions && sessions.length > 0 && (
        <>
          <Section label="Pinned" emptyHint="Pin threads here when available.">
            {renderList(pinned)}
          </Section>

          <Section label="Today" emptyHint="Nothing today.">
            {renderList(today, pinned.length)}
          </Section>

          <Section label="Yesterday" emptyHint="Nothing yesterday.">
            {renderList(yesterday, pinned.length + today.length)}
          </Section>

          {earlier.length > 0 && (
            <Section label="Earlier">
              {renderList(earlier, pinned.length + today.length + yesterday.length)}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

export default function ChatSessionList({
  collapsed = false,
  onToggleConversationCollapse = () => {},
}) {
  const { sessions, status, error, isCreating, currentSessionId, reload, createSession } = useChatSessions();

  const { pinned, today, yesterday, earlier } = partitionSessions(sessions);

  const renderList = (list, offset = 0) =>
    list.map((s, i) => {
      const isActive = s.id && currentSessionId && String(s.id) === String(currentSessionId);
      return <SessionRow key={s.id} session={s} index={offset + i} isActive={isActive} />;
    });

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {collapsed && (
        <CollapsedConversationRail
          onToggle={onToggleConversationCollapse}
          onNew={() => createSession()}
          isCreating={isCreating}
        />
      )}

      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden px-1 pt-3 lg:pt-0 ${
          collapsed ? "flex lg:hidden" : "flex"
        }`}
      >
        <div className="flex shrink-0 items-center gap-1.5 px-0.5 pb-0.5">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-500">Conversations</h2>
          <button
            type="button"
            onClick={onToggleConversationCollapse}
            title="Collapse conversations"
            aria-expanded
            aria-label="Collapse conversations"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-[#1a3673] lg:flex"
          >
            <ChevronLeft className="h-4 w-4 transition-transform duration-300 ease-in-out" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => createSession()}
            disabled={isCreating}
            className="shrink-0 rounded-full bg-[#fc7d25] px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-[#e86f16] disabled:opacity-65"
          >
            {isCreating ? "…" : "New"}
          </button>
        </div>

        <ConversationListBody
          sessions={sessions}
          status={status}
          error={error}
          reload={reload}
          renderList={renderList}
          pinned={pinned}
          today={today}
          yesterday={yesterday}
          earlier={earlier}
        />
      </div>
    </div>
  );
}
