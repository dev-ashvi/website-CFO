import { formatAssumptionValue, formatCanonicalForType } from "./format.js";
import { mergeOutputRefs } from "./outputRefs.js";
import { PROPOSAL_KIND, PROPOSAL_MODE } from "./types.js";

/**
 * @typedef {Object} AssumptionIntentMatch
 * @property {'apply'|'scenario'} mode
 * @property {string} assumptionKey
 * @property {number|string} proposedValue
 * @property {import('./outputRefs.js').OutputRef[]} [extraImpact]
 */

/**
 * Build stable proposal payload for chat UI + apply layer.
 * @param {Object} opts
 * @param {AssumptionIntentMatch} opts.intent
 * @param {import('./assumptionRecord.js').AssumptionRecord[]} opts.assumptions
 * @param {number} opts.ts
 * @param {string} [opts.chatSessionId]
 * @param {string} [opts.relatedUserMessage]
 */
export function buildAssumptionProposalPayload({
  intent,
  assumptions,
  ts,
  chatSessionId,
  relatedUserMessage,
}) {
  const row = assumptions.find((a) => a.key === intent.assumptionKey);
  if (!row) return null;

  const impact = intent.extraImpact?.length
    ? mergeOutputRefs(row.usedIn, intent.extraImpact)
    : [...row.usedIn];

  const displayFrom = formatAssumptionValue(row);
  const displayTo = formatCanonicalForType({
    type: row.type,
    unit: row.unit,
    key: row.key,
    value: intent.proposedValue,
  });

  return {
    id: `proposal_${ts}`,
    kind: PROPOSAL_KIND.ASSUMPTION_UPDATE,
    mode: intent.mode === "scenario" ? PROPOSAL_MODE.SCENARIO : PROPOSAL_MODE.APPLY,
    assumptionKey: row.key,
    assumptionLabel: row.label,
    currentValue: row.value,
    proposedValue: intent.proposedValue,
    displayFrom,
    displayTo,
    impact,
    chatSessionId: chatSessionId ?? null,
    relatedUserMessage: relatedUserMessage ?? null,
  };
}
