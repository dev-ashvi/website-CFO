/**
 * @fileoverview Discriminated chat message model for `/app/chat` and related UIs.
 * Use `type` for rendering; legacy messages without `type` are resolved via `resolveMessageType`.
 */

/** @typedef {'user'|'assistant'|'system'} ChatRole */

/**
 * @typedef {Object} ChatMessageBase
 * @property {string} id
 * @property {string} [created_at] ISO timestamp
 */

/**
 * @typedef {ChatMessageBase & {
 *   type: 'text',
 *   role: 'user'|'assistant',
 *   content: string,
 * }} ChatTextMessage
 */

/**
 * @typedef {ChatMessageBase & {
 *   type: 'cfo_rich',
 *   role: 'assistant',
 *   content: string|null,
 *   cfoBlocks: object,
 * }} ChatCfoRichMessage
 */

/**
 * @typedef {ChatMessageBase & {
 *   type: 'assumption_proposal',
 *   role: 'assistant',
 *   assumptionProposal: object,
 * }} ChatAssumptionProposalMessage
 */

/**
 * @typedef {ChatMessageBase & {
 *   type: 'system',
 *   role: 'system',
 *   content: string,
 * }} ChatSystemMessage
 */

/**
 * @typedef {ChatTextMessage|ChatCfoRichMessage|ChatAssumptionProposalMessage|ChatSystemMessage} ChatMessage
 */

export const CHAT_MESSAGE_TYPE = Object.freeze({
  TEXT: "text",
  CFO_RICH: "cfo_rich",
  ASSUMPTION_PROPOSAL: "assumption_proposal",
  SYSTEM: "system",
});

/**
 * @param {Partial<ChatTextMessage> & { id: string, role: 'user'|'assistant', content: string }} fields
 * @returns {ChatTextMessage}
 */
export function createTextMessage({ id, role, content, created_at }) {
  return {
    id,
    type: CHAT_MESSAGE_TYPE.TEXT,
    role,
    content: content ?? "",
    created_at,
  };
}

/**
 * @param {Partial<ChatSystemMessage> & { id: string, content: string }} fields
 * @returns {ChatSystemMessage}
 */
export function createSystemMessage({ id, content, created_at }) {
  return {
    id,
    type: CHAT_MESSAGE_TYPE.SYSTEM,
    role: "system",
    content: content ?? "",
    created_at,
  };
}

/**
 * @param {Partial<ChatCfoRichMessage> & { id: string, cfoBlocks: object }} fields
 * @returns {ChatCfoRichMessage}
 */
export function createCfoRichMessage({ id, cfoBlocks, created_at, content = null }) {
  return {
    id,
    type: CHAT_MESSAGE_TYPE.CFO_RICH,
    role: "assistant",
    content,
    cfoBlocks,
    created_at,
  };
}

/**
 * Serializable planning proposal attachment (safe for future API persistence).
 * @param {Partial<ChatAssumptionProposalMessage> & { id: string, assumptionProposal: object }} fields
 * @returns {ChatAssumptionProposalMessage}
 */
export function createAssumptionProposalMessage({ id, assumptionProposal, created_at }) {
  return {
    id,
    type: CHAT_MESSAGE_TYPE.ASSUMPTION_PROPOSAL,
    role: "assistant",
    assumptionProposal,
    created_at,
  };
}

/**
 * Normalize API user/assistant row → typed text message.
 * @param {object|null|undefined} raw
 * @returns {ChatTextMessage|null}
 */
export function normalizeApiMessage(raw) {
  if (!raw) return null;
  return createTextMessage({
    id: raw.id,
    role: raw.role === "user" ? "user" : "assistant",
    content: raw.content ?? "",
    created_at: raw.created_at,
  });
}

/**
 * Infer `type` for older in-memory shapes (pre-migration) or partial API payloads.
 * @param {object} m
 * @returns {typeof CHAT_MESSAGE_TYPE[keyof typeof CHAT_MESSAGE_TYPE]}
 */
export function resolveMessageType(m) {
  if (m?.type && Object.values(CHAT_MESSAGE_TYPE).includes(m.type)) {
    return m.type;
  }
  if (m?.assumptionProposal) return CHAT_MESSAGE_TYPE.ASSUMPTION_PROPOSAL;
  if (m?.cfoBlocks) return CHAT_MESSAGE_TYPE.CFO_RICH;
  return CHAT_MESSAGE_TYPE.TEXT;
}
