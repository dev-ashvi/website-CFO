import { useState } from "react";
import { useParams } from "react-router-dom";
import ChatSessionList from "../components/chat/ChatSessionList.jsx";
import ChatEmptyState from "../components/chat/ChatEmptyState.jsx";
import ChatThread from "../components/chat/ChatThread.jsx";
import ChatComposer from "../components/chat/ChatComposer.jsx";
import ChatContextPanel from "../components/chat/ChatContextPanel.jsx";
import { useChatSessions } from "../hooks/useChatSessions.js";
import { useChatSession } from "../hooks/useChatSession.js";

export default function AppChatPage() {
  const { sessionId } = useParams();
  const [isConversationCollapsed, setIsConversationCollapsed] = useState(false);
  const [isContextCollapsed, setIsContextCollapsed] = useState(false);

  const {
    isCreating,
    error: createError,
    createSession,
  } = useChatSessions();
  const {
    session,
    messages,
    status,
    sendStatus,
    error: threadError,
    sendMessage,
    setMessages,
  } = useChatSession(sessionId);

  const showEmpty = !sessionId;

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
      <div
        className={`flex min-h-0 shrink-0 flex-col overflow-hidden border-b border-gray-200/80 bg-white/80 transition-[width] duration-300 ease-in-out max-lg:max-h-[min(42vh,22rem)] lg:h-full lg:max-h-none lg:border-b-0 lg:border-r lg:py-3 lg:pl-3 lg:pr-2 ${
          isConversationCollapsed ? "w-full lg:w-14 lg:min-w-[3.5rem] lg:max-w-[3.5rem]" : "w-full lg:w-[280px] lg:min-w-[200px] lg:max-w-[280px]"
        }`}
      >
        <ChatSessionList
          collapsed={isConversationCollapsed}
          onToggleConversationCollapse={() => setIsConversationCollapsed((c) => !c)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4 md:px-5">
        {showEmpty ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <ChatEmptyState
              onStart={(opts) => createSession(opts || {})}
              isStarting={isCreating}
              error={createError}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="shrink-0 pb-3">
              <h1 className="text-base font-semibold text-[#1a3673] sm:text-lg">
                {session?.title || "Conversation"}
              </h1>
              <p className="mt-1 text-[11px] text-slate-400">March MIS · bank feed · budget</p>
              {threadError && (
                <p className="mt-2 text-[11px] font-medium text-[#b91c1c]">{threadError}</p>
              )}
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ChatThread messages={messages} status={status} setMessages={setMessages} />
              <div className="shrink-0 border-t border-gray-100/90 bg-[#f5f7fb] pt-3">
                <ChatComposer onSend={sendMessage} sendStatus={sendStatus} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`hidden min-h-0 shrink-0 flex-col overflow-hidden border-l border-gray-200/80 bg-white/70 transition-[width] duration-300 ease-in-out lg:flex lg:h-full lg:py-3 lg:pl-2 lg:pr-4 ${
          isContextCollapsed ? "w-14 min-w-[3.5rem] max-w-[3.5rem]" : "w-[320px] min-w-[240px] max-w-[320px]"
        }`}
      >
        <ChatContextPanel
          collapsed={isContextCollapsed}
          onToggleContextCollapse={() => setIsContextCollapsed((c) => !c)}
        />
      </div>
    </div>
  );
}
