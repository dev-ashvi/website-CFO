/**
 * Single entry for client-side planning proposals triggered from chat-like UIs.
 * Keeps intent detection + payload construction in one place for main chat and contextual panels.
 */

import { detectAssumptionIntent } from "./assumptionIntent.js";
import { resolveIntentForFocusedAssumption } from "./assumptionIntentContextual.js";
import { buildAssumptionProposalPayload } from "./assumptions/buildProposal.js";
import { createAssumptionProposalMessage } from "../components/chat/chatMessageTypes.js";

/**
 * After a user message is sent (or equivalent), compute planning artifacts to merge into the thread.
 *
 * @param {Object} opts
 * @param {string} opts.text
 * @param {object[]} opts.assumptions
 * @param {string|null|undefined} opts.sessionId – chat session id, or null for embedded panels
 * @param {AssumptionRecord|null|undefined} opts.focusAssumption – when set, intent is scoped to this row
 * @param {string} [opts.proposalIdPrefix] – default `local-proposal-`
 * @returns {{
 *   proposalsToAppend: import('../components/chat/chatMessageTypes.js').ChatAssumptionProposalMessage[],
 *   assistantHints: string[],
 * }}
 */
export function onUserMessageSent({
  text,
  assumptions,
  sessionId,
  focusAssumption = null,
  proposalIdPrefix = "local-proposal-",
}) {
  const trimmed = text.trim();
  const proposalsToAppend = [];
  const assistantHints = [];

  const intent = focusAssumption
    ? resolveIntentForFocusedAssumption(trimmed, assumptions, focusAssumption)
    : detectAssumptionIntent(trimmed, assumptions);

  if (intent) {
    const ts = Date.now();
    const payload = buildAssumptionProposalPayload({
      intent,
      assumptions,
      ts,
      chatSessionId: sessionId ?? null,
      relatedUserMessage: trimmed,
    });
    if (payload) {
      proposalsToAppend.push(
        createAssumptionProposalMessage({
          id: `${proposalIdPrefix}${ts}`,
          created_at: new Date().toISOString(),
          assumptionProposal: payload,
        }),
      );
    }
  }

  return { proposalsToAppend, assistantHints };
}
