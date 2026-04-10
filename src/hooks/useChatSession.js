import { useCallback, useEffect, useRef, useState } from "react";
import { getChatSession, postMessage } from "../api/chat.js";
import { useAssumptions } from "../planning/AssumptionsContext.jsx";
import { onUserMessageSent } from "../planning/planningFromChat.js";
import { createTextMessage, normalizeApiMessage } from "../components/chat/chatMessageTypes.js";

export function useChatSession(sessionId) {
  const { assumptions } = useAssumptions();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | loaded | error
  const [sendStatus, setSendStatus] = useState("idle"); // idle | sending | error
  const [error, setError] = useState("");
  const latestSessionIdRef = useRef(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setMessages([]);
      setStatus("idle");
      setError("");
      return;
    }

    let cancelled = false;
    const load = async () => {
      setStatus("loading");
      setError("");
      const currentId = sessionId;
      latestSessionIdRef.current = currentId;
      try {
        const data = await getChatSession(currentId);
        if (cancelled || latestSessionIdRef.current !== currentId) {
          return;
        }

        setSession(data || null);
        const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(
          rawMessages
            .map((m) => normalizeApiMessage(m))
            .filter(Boolean),
        );
        setStatus("loaded");
      } catch (err) {
        if (cancelled || latestSessionIdRef.current !== currentId) {
          return;
        }
        setStatus("error");
        setError(err && err.message ? err.message : "Unable to load conversation.");
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (content) => {
      if (!sessionId) return;
      const trimmed = content.trim();
      if (!trimmed || sendStatus === "sending") return;

      setSendStatus("sending");
      setError("");

      const optimistic = createTextMessage({
        id: `local-${Date.now()}`,
        role: "user",
        content: trimmed,
        created_at: new Date().toISOString(),
      });
      setMessages((prev) => [...prev, optimistic]);

      try {
        const result = await postMessage(sessionId, { content: trimmed, role: "user" });
        const normalized = normalizeApiMessage(result);
        const { proposalsToAppend } = onUserMessageSent({
          text: trimmed,
          assumptions,
          sessionId,
        });

        setMessages((prev) => {
          const next = [...prev];
          if (normalized) next.push(normalized);
          for (const p of proposalsToAppend) {
            next.push(p);
          }
          return next;
        });

        setSendStatus("idle");
        return true;
      } catch (err) {
        setMessages((prev) =>
          prev.filter((m) => !(typeof m.id === "string" && m.id.startsWith("local-"))),
        );
        setSendStatus("error");
        setError(err && err.message ? err.message : "Unable to send message.");
        return false;
      }
    },
    [assumptions, sendStatus, sessionId],
  );

  return {
    session,
    messages,
    status,
    sendStatus,
    error,
    setMessages,
    sendMessage,
  };
}
