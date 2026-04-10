import { httpClient } from "./httpClient.js";
import * as chatMock from "./chatMock.js";
import { isDevDemoMode, normalizeApiBaseUrl } from "./devMode.js";

/**
 * Local mock when no API URL is configured in dev, VITE_DEV_DEMO_MODE, or VITE_USE_CHAT_MOCK=true.
 * Set VITE_USE_CHAT_MOCK=false if you use a Vite proxy to /api without VITE_API_BASE_URL.
 */
export function useChatMock() {
  if (isDevDemoMode()) return true;
  const flag = import.meta.env.VITE_USE_CHAT_MOCK;
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return Boolean(import.meta.env.DEV && !normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL));
}

export async function getChatSessions() {
  if (useChatMock()) return chatMock.getChatSessions();
  return httpClient.get("/api/v1/chat/sessions");
}

export async function createChatSession({ title } = {}) {
  if (useChatMock()) return chatMock.createChatSession({ title });

  const body = {
    agent_id: "cfo-agent",
  };

  if (title) {
    body.title = title;
  }

  return httpClient.post("/api/v1/chat/sessions", body);
}

export async function getChatSession(sessionId) {
  if (!sessionId) {
    throw new Error("sessionId is required to fetch a chat session.");
  }
  if (useChatMock()) return chatMock.getChatSession(sessionId);
  return httpClient.get(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}`);
}

export async function postMessage(sessionId, { content, role = "user" }) {
  if (!sessionId) {
    throw new Error("sessionId is required to post a message.");
  }
  if (!content || !content.trim()) {
    throw new Error("Message content is required.");
  }

  if (useChatMock()) {
    return chatMock.postMessage(sessionId, { content, role });
  }

  const body = { content, role };
  return httpClient.post(
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    body,
  );
}
