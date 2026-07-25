/** @typedef {'funding' | 'cost-reduction' | 'revenue-growth' | 'payroll-delay'} ScenarioType */

/**
 * Deep-clone simulator inputs without mutating the source.
 * @template T
 * @param {T} inputs
 * @returns {T}
 */
export function cloneInputs(inputs) {
  return structuredClone
    ? structuredClone(inputs)
    : JSON.parse(JSON.stringify(inputs));
}
