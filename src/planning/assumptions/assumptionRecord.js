/**
 * @typedef {{ type: 'dashboard' | 'report' | 'model', id: string, label: string }} OutputRef
 */

/**
 * @typedef {Object} AssumptionRecord
 * @property {string} id
 * @property {string} key
 * @property {string} label
 * @property {string} type
 * @property {number|string} value
 * @property {string} unit
 * @property {string} valueDisplay
 * @property {string} status
 * @property {string|null} source
 * @property {OutputRef[]} usedIn
 * @property {string[]} affects — business-language planning impacts (not raw output ids)
 * @property {string|null} [note] — optional description / context
 * @property {string|null} lastUpdatedAt
 * @property {string|null} lastUpdatedBy
 * @property {string|null} chatSessionId
 * @property {string|null} relatedUserMessage
 * @property {string|null} changeReason
 */

export {};
