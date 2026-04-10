import { useEffect, useState, useCallback } from "react";
import { createChatSession, getChatSessions } from "../api/chat.js";
import { useNavigate, useParams } from "react-router-dom";

export function useChatSessions() {
  const [sessions, setSessions] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | loaded | error
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const params = useParams();

  const fetchSessions = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const data = await getChatSessions();
      setSessions(Array.isArray(data) ? data : []);
      setStatus("loaded");
    } catch (err) {
      setStatus("error");
      setError(err && err.message ? err.message : "Unable to load conversations.");
    }
  }, []);

  useEffect(() => {
    if (status === "idle") {
      fetchSessions();
    }
  }, [status, fetchSessions]);

  const createSession = useCallback(
    async (opts = {}) => {
      if (isCreating) return;
      setIsCreating(true);
      setError("");
      try {
        const session = await createChatSession({ title: opts.title });
        // Refetch or append; Stage 1 can simply refetch for correctness.
        await fetchSessions();
        if (session && session.id) {
          navigate(`/app/chat/${encodeURIComponent(session.id)}`, { replace: false });
        }
      } catch (err) {
        setError(err && err.message ? err.message : "Unable to start a new conversation.");
      } finally {
        setIsCreating(false);
      }
    },
    [fetchSessions, isCreating, navigate],
  );

  const currentSessionId = params.sessionId || null;

  return {
    sessions,
    status,
    error,
    isCreating,
    currentSessionId,
    reload: fetchSessions,
    createSession,
  };
}

