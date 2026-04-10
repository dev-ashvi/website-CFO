/** In-memory chat API for local development when no WYZ backend is available. */

/** @type {Map<string, { id: string, title: string, created_at: string, updated_at: string, pinned: boolean, messages: object[] }>} */
const sessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function mockAssistantReply(userText) {
  const t = (userText || "").toLowerCase();
  if (/runway|cash|burn/i.test(t)) {
    return "Quick read (demo mode, no live API): runway ties to hiring pace and collections. Say if you want a 6- or 12-month view and we can structure the walk-through.";
  }
  if (/mis|forecast|budget/i.test(t)) {
    return "In demo mode I do not read your live MIS — connect the WYZ API with VITE_API_BASE_URL when ready. I can still outline how to frame MIS vs forecast narratives for your board.";
  }
  return "Message received in local demo mode (no WYZ API). Set VITE_API_BASE_URL to your backend URL when you have one, or keep developing UI against this mock. What topic should we tackle next?";
}

export function getChatSessions() {
  return Array.from(sessions.values())
    .map(({ id, title, created_at, updated_at, pinned }) => ({
      id,
      title,
      created_at,
      updated_at,
      pinned: Boolean(pinned),
    }))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export function createChatSession({ title } = {}) {
  const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ts = nowIso();
  const session = {
    id,
    title: title?.trim() || "New conversation",
    created_at: ts,
    updated_at: ts,
    pinned: false,
    messages: [],
  };
  sessions.set(id, session);
  return {
    id,
    title: session.title,
    created_at: ts,
    updated_at: ts,
    messages: [],
    agent_id: "cfo-agent",
  };
}

export function getChatSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) {
    throw { status: 404, message: "Session not found" };
  }
  return {
    id: s.id,
    title: s.title,
    created_at: s.created_at,
    updated_at: s.updated_at,
    messages: s.messages.map((m) => ({ ...m })),
    agent_id: "cfo-agent",
  };
}

export function postMessage(sessionId, { content, role = "user" }) {
  const s = sessions.get(sessionId);
  if (!s) {
    throw { status: 404, message: "Session not found" };
  }
  const ts = nowIso();
  const userMsg = {
    id: `m-${Date.now()}-u`,
    role,
    content,
    created_at: ts,
  };
  s.messages.push(userMsg);

  const replyTs = nowIso();
  const assistantMsg = {
    id: `m-${Date.now()}-a`,
    role: "assistant",
    content: mockAssistantReply(content),
    created_at: replyTs,
  };
  s.messages.push(assistantMsg);
  s.updated_at = replyTs;

  return assistantMsg;
}
