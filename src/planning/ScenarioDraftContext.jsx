import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { PROPOSAL_MODE } from "./assumptions/types.js";

const ScenarioDraftContext = createContext(null);

/**
 * @typedef {Object} ScenarioDraftEntry
 * @property {string} assumptionKey
 * @property {string} assumptionLabel
 * @property {number|string} proposedValue
 * @property {string} displayTo
 * @property {string} displayFromSnapshot
 * @property {string|null} relatedUserMessage
 * @property {string|null} chatSessionId
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} SavedScenarioRecord
 * @property {string} id
 * @property {string} name
 * @property {Record<string, ScenarioDraftEntry>} snapshot
 * @property {string} createdAt
 * @property {string[]} outputsAffected
 */

/**
 * @typedef {{ kind: 'preview', label: string } | { kind: 'saved', id: string, label: string }} ActiveDashboardScenario
 */

/**
 * @typedef {'exploring' | 'previewed' | 'applied' | 'cleared'} ExplorationStatus
 */

/**
 * @typedef {Object} RecentExplorationRecord
 * @property {string} id
 * @property {string} label
 * @property {string} detail
 * @property {string} createdAt
 * @property {ExplorationStatus} status
 * @property {string|null} assumptionKey
 * @property {string|null} [seedPrompt]
 */

const MAX_RECENT_EXPLORATIONS = 18;

function explorationId() {
  return `ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Local scenario preview: overrides by assumption key. Does not mutate baseline rows in AssumptionsContext.
 */
export function ScenarioDraftProvider({ children }) {
  const [draftByKey, setDraftByKey] = useState({});
  const [draftVersion, setDraftVersion] = useState(0);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [recentExplorations, setRecentExplorations] = useState(
    /** @type {RecentExplorationRecord[]} */ ([]),
  );
  const [activeDashboardScenario, setActiveDashboardScenario] = useState(
    /** @type {ActiveDashboardScenario | null} */ (null),
  );

  const logExploration = useCallback(
    /** @param {Omit<RecentExplorationRecord, 'id' | 'createdAt'> & { id?: string }} entry */
    (entry) => {
      const row = {
        id: entry.id ?? explorationId(),
        label: entry.label,
        detail: entry.detail,
        createdAt: new Date().toISOString(),
        status: entry.status,
        assumptionKey: entry.assumptionKey ?? null,
        seedPrompt: entry.seedPrompt ?? null,
      };
      setRecentExplorations((prev) => [row, ...prev].slice(0, MAX_RECENT_EXPLORATIONS));
    },
    [],
  );

  const applyScenarioProposal = useCallback((proposal) => {
    if (!proposal?.assumptionKey || proposal.mode !== PROPOSAL_MODE.SCENARIO) return;
    setDraftByKey((prev) => ({
      ...prev,
      [proposal.assumptionKey]: {
        assumptionKey: proposal.assumptionKey,
        assumptionLabel: proposal.assumptionLabel,
        proposedValue: proposal.proposedValue,
        displayTo: proposal.displayTo,
        displayFromSnapshot: proposal.displayFrom,
        relatedUserMessage: proposal.relatedUserMessage ?? null,
        chatSessionId: proposal.chatSessionId ?? null,
        updatedAt: new Date().toISOString(),
      },
    }));
    setDraftVersion((v) => v + 1);
    setRecentExplorations((prev) =>
      [
        {
          id: explorationId(),
          label: proposal.assumptionLabel,
          detail: `Preview → ${proposal.displayTo}`,
          createdAt: new Date().toISOString(),
          status: /** @type {const} */ ("previewed"),
          assumptionKey: proposal.assumptionKey,
          seedPrompt: null,
        },
        ...prev,
      ].slice(0, MAX_RECENT_EXPLORATIONS),
    );
  }, []);

  const clearScenarioDraft = useCallback(() => {
    let clearedCount = 0;
    setDraftByKey((prev) => {
      clearedCount = Object.keys(prev).length;
      return {};
    });
    setDraftVersion((v) => v + 1);
    if (clearedCount > 0) {
      setRecentExplorations((p) =>
        [
          {
            id: explorationId(),
            label: "Scenario preview",
            detail: `Cleared · ${clearedCount} change${clearedCount === 1 ? "" : "s"} (baseline unchanged)`,
            createdAt: new Date().toISOString(),
            status: /** @type {const} */ ("cleared"),
            assumptionKey: null,
            seedPrompt: null,
          },
          ...p,
        ].slice(0, MAX_RECENT_EXPLORATIONS),
      );
    }
    setActiveDashboardScenario((prev) => (prev?.kind === "preview" ? null : prev));
  }, []);

  const clearScenarioKey = useCallback((key) => {
    if (!key) return;
    setDraftByKey((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDraftVersion((v) => v + 1);
  }, []);

  const clearActiveDashboardScenario = useCallback(() => {
    setActiveDashboardScenario(null);
  }, []);

  const applyPreviewToDashboard = useCallback(() => {
    if (Object.keys(draftByKey).length === 0) return;
    setActiveDashboardScenario({ kind: "preview", label: "Current scenario preview" });
    setRecentExplorations((p) =>
      [
        {
          id: explorationId(),
          label: "Dashboard",
          detail: "Scenario lens on — core figures still reflect baseline until models catch up",
          createdAt: new Date().toISOString(),
          status: /** @type {const} */ ("applied"),
          assumptionKey: null,
          seedPrompt: null,
        },
        ...p,
      ].slice(0, MAX_RECENT_EXPLORATIONS),
    );
  }, [draftByKey]);

  const applySavedScenarioToDashboard = useCallback(
    (savedId) => {
      const row = savedScenarios.find((s) => s.id === savedId);
      if (!row) return;
      setActiveDashboardScenario({ kind: "saved", id: row.id, label: row.name });
      setRecentExplorations((p) =>
        [
          {
            id: explorationId(),
            label: "Dashboard",
            detail: `Viewing saved scenario “${row.name}”`,
            createdAt: new Date().toISOString(),
            status: /** @type {const} */ ("applied"),
            assumptionKey: null,
            seedPrompt: null,
          },
          ...p,
        ].slice(0, MAX_RECENT_EXPLORATIONS),
      );
    },
    [savedScenarios],
  );

  /**
   * @param {{ name: string, outputsAffected?: string[] }} opts
   * @returns {string|null} new scenario id
   */
  const saveCurrentDraftAsScenario = useCallback(
    ({ name, outputsAffected = [] }) => {
      const trimmed = name?.trim();
      if (!trimmed) return null;
      const keys = Object.keys(draftByKey);
      if (keys.length === 0) return null;
      const id = `sc-${Date.now()}`;
      const snapshot = JSON.parse(JSON.stringify(draftByKey));
      const record = {
        id,
        name: trimmed,
        snapshot,
        createdAt: new Date().toISOString(),
        outputsAffected: Array.isArray(outputsAffected) ? outputsAffected : [],
      };
      setSavedScenarios((prev) => [...prev, record]);
      setRecentExplorations((p) =>
        [
          {
            id: explorationId(),
            label: "Saved scenario",
            detail: `“${trimmed}” · snapshot for this session`,
            createdAt: new Date().toISOString(),
            status: /** @type {const} */ ("previewed"),
            assumptionKey: null,
            seedPrompt: null,
          },
          ...p,
        ].slice(0, MAX_RECENT_EXPLORATIONS),
      );
      return id;
    },
    [draftByKey],
  );

  const value = useMemo(() => {
    const keys = Object.keys(draftByKey);
    return {
      draftByKey,
      draftVersion,
      applyScenarioProposal,
      clearScenarioDraft,
      clearScenarioKey,
      hasScenarioDraft: keys.length > 0,
      scenarioKeyCount: keys.length,
      savedScenarios,
      saveCurrentDraftAsScenario,
      activeDashboardScenario,
      applyPreviewToDashboard,
      applySavedScenarioToDashboard,
      clearActiveDashboardScenario,
      recentExplorations,
      logExploration,
    };
  }, [
    draftByKey,
    draftVersion,
    applyScenarioProposal,
    clearScenarioDraft,
    clearScenarioKey,
    savedScenarios,
    saveCurrentDraftAsScenario,
    activeDashboardScenario,
    applyPreviewToDashboard,
    applySavedScenarioToDashboard,
    clearActiveDashboardScenario,
    recentExplorations,
    logExploration,
  ]);

  return <ScenarioDraftContext.Provider value={value}>{children}</ScenarioDraftContext.Provider>;
}

export function useScenarioDraft() {
  const ctx = useContext(ScenarioDraftContext);
  if (!ctx) {
    throw new Error("useScenarioDraft must be used within ScenarioDraftProvider");
  }
  return ctx;
}
