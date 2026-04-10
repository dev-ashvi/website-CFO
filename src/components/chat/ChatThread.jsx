import { useEffect, useMemo, useRef, useState } from "react";
import { ChatThreadSkeleton } from "./ChatLoadingSkeleton.jsx";
import CfoAssistantTurn from "./CfoAssistantTurn.jsx";
import AssumptionProposalCard from "./AssumptionProposalCard.jsx";
import { MOCK_CFO_DISPLAY_MESSAGES } from "./mockCfoThread.js";
import {
  CHAT_MESSAGE_TYPE,
  createSystemMessage,
  resolveMessageType,
} from "./chatMessageTypes.js";
import { PROPOSAL_MODE } from "../../planning/assumptions/types.js";

function UserBubble({ content, created_at }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[min(100%,20rem)] rounded-2xl rounded-br-md bg-[#1a3673] px-3.5 py-2.5 text-[13px] leading-relaxed text-white"
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {created_at && (
          <p className="mt-2 text-[9px] font-medium text-white/50">
            {new Date(created_at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function AssistantPlainBubble({ content, created_at }) {
  return (
    <div className="flex w-full justify-start">
      <div className="w-full max-w-[min(100%,42rem)] rounded-2xl rounded-bl-md bg-white px-7 py-6 text-[15px] leading-[1.7] text-slate-800 shadow-sm">
        <p className="whitespace-pre-wrap">{content}</p>
        {created_at && (
          <p className="mt-4 text-[10px] font-medium text-slate-400">
            {new Date(created_at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ChatThread({ messages, status, setMessages }) {
  const containerRef = useRef(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  const displayMessages = useMemo(() => {
    if (status !== "loaded") return messages || [];
    if (!messages || messages.length === 0) return MOCK_CFO_DISPLAY_MESSAGES;
    return messages;
  }, [messages, status]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 80;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setAutoScrollEnabled(distanceFromBottom <= threshold);
  };

  useEffect(() => {
    if (!containerRef.current || !autoScrollEnabled) return;
    const id = window.requestAnimationFrame(() => {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [displayMessages?.length, status, autoScrollEnabled]);

  const appendFollowUp = (proposal) => {
    const isScenario = proposal?.mode === PROPOSAL_MODE.SCENARIO;
    const line = isScenario
      ? "Scenario preview saved. Your workspace baseline is unchanged."
      : "Done. Your forecasts have been updated.";
    return createSystemMessage({
      id: `local-confirm-${Date.now()}`,
      content: line,
      created_at: new Date().toISOString(),
    });
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto py-2"
    >
      {status === "loading" && <ChatThreadSkeleton bubbles={4} />}

      {status === "error" && (
        <p className="text-sm leading-relaxed text-[#b91c1c]">
          Unable to load this conversation. Please try again from the sessions list.
        </p>
      )}

      {status === "loaded" && displayMessages && (
        <div className="flex w-full flex-col gap-6">
          {displayMessages.map((m) => {
            const messageType = resolveMessageType(m);

            if (messageType === CHAT_MESSAGE_TYPE.TEXT) {
              if (m.role === "user") {
                return <UserBubble key={m.id} content={m.content} created_at={m.created_at} />;
              }
              return <AssistantPlainBubble key={m.id} content={m.content} created_at={m.created_at} />;
            }

            if (messageType === CHAT_MESSAGE_TYPE.SYSTEM) {
              return <AssistantPlainBubble key={m.id} content={m.content} created_at={m.created_at} />;
            }

            if (messageType === CHAT_MESSAGE_TYPE.CFO_RICH) {
              return (
                <div key={m.id} className="flex w-full justify-start">
                  <CfoAssistantTurn blocks={m.cfoBlocks} created_at={m.created_at} />
                </div>
              );
            }

            if (messageType === CHAT_MESSAGE_TYPE.ASSUMPTION_PROPOSAL && setMessages) {
              return (
                <div key={m.id} className="flex w-full justify-start">
                  <AssumptionProposalCard
                    proposal={m.assumptionProposal}
                    created_at={m.created_at}
                    onConfirm={() => {
                      setMessages((prev) => [...prev, appendFollowUp(m.assumptionProposal)]);
                    }}
                    onDismiss={() => {
                      setMessages((prev) => [
                        ...prev,
                        createSystemMessage({
                          id: `local-skip-${Date.now()}`,
                          content: "Okay — I didn't change anything.",
                          created_at: new Date().toISOString(),
                        }),
                      ]);
                    }}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}
