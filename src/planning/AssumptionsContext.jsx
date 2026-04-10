import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createInitialAssumptions } from "./assumptions/initialState.js";
import { businessAffectsFromOutputs } from "./assumptions/businessAffects.js";
import { formatAssumptionValue, getUsedInDisplay, parseUserInputForAssumption } from "./assumptions/format.js";
import { OUTPUT_REFS } from "./assumptions/outputRefs.js";
import {
  ASSUMPTION_SOURCE,
  ASSUMPTION_STATUS,
  ASSUMPTION_TYPE,
  ASSUMPTION_UNIT,
  LAST_UPDATED_BY,
} from "./assumptions/types.js";

const AssumptionsContext = createContext(null);

export function AssumptionsProvider({ children }) {
  const [assumptions, setAssumptions] = useState(() => createInitialAssumptions());
  const [recomputeVersion, setRecomputeVersion] = useState(0);

  const getAssumptionByKey = useCallback(
    (key) => assumptions.find((a) => a.key === key) ?? null,
    [assumptions],
  );

  const bumpRecompute = useCallback(() => {
    setRecomputeVersion((v) => v + 1);
  }, []);

  /**
   * Apply a structured chat proposal (stable payload from buildAssumptionProposalPayload).
   */
  const applyProposal = useCallback(
    (proposal) => {
      if (!proposal?.assumptionKey) return;
      const now = new Date().toISOString();
      setAssumptions((prev) =>
        prev.map((a) => {
          if (a.key !== proposal.assumptionKey) return a;
          return {
            ...a,
            value: proposal.proposedValue,
            valueDisplay: proposal.displayTo,
            status: ASSUMPTION_STATUS.CONFIRMED,
            source: ASSUMPTION_SOURCE.CHAT,
            chatSessionId: proposal.chatSessionId ?? null,
            relatedUserMessage: proposal.relatedUserMessage ?? null,
            lastUpdatedAt: now,
            lastUpdatedBy: LAST_UPDATED_BY.USER,
            changeReason: proposal.changeReason ?? "Updated via chat",
          };
        }),
      );
      bumpRecompute();
    },
    [bumpRecompute],
  );

  /**
   * Manual or programmatic update using canonical value (+ optional display override).
   */
  const applyAssumptionUpdate = useCallback(
    ({
      assumptionKey,
      proposedValue,
      valueDisplay,
      source,
      chatSessionId,
      relatedUserMessage,
      changeReason,
      lastUpdatedBy,
    }) => {
      const now = new Date().toISOString();
      setAssumptions((prev) =>
        prev.map((a) => {
          if (a.key !== assumptionKey) return a;
          const display =
            valueDisplay ??
            formatAssumptionValue({
              ...a,
              value: proposedValue,
            });
          return {
            ...a,
            value: proposedValue,
            valueDisplay: display,
            status: ASSUMPTION_STATUS.CONFIRMED,
            source: source ?? ASSUMPTION_SOURCE.MANUAL,
            chatSessionId: chatSessionId ?? null,
            relatedUserMessage: relatedUserMessage ?? null,
            lastUpdatedAt: now,
            lastUpdatedBy: lastUpdatedBy ?? LAST_UPDATED_BY.USER,
            changeReason: changeReason ?? (source === ASSUMPTION_SOURCE.CHAT ? "Updated via chat" : "Updated manually"),
          };
        }),
      );
      bumpRecompute();
    },
    [bumpRecompute],
  );

  const addAssumption = useCallback(
    ({
      label,
      type = ASSUMPTION_TYPE.TEXT,
      value,
      unit = ASSUMPTION_UNIT.TEXT,
      valueDisplay,
      usedIn,
      affects,
      note,
      source = ASSUMPTION_SOURCE.MANUAL,
      relatedUserMessage = null,
      changeReason = null,
      chatSessionId = null,
    }) => {
      const now = new Date().toISOString();
      const id = `a-${Date.now()}`;
      const key = `custom_${id}`;
      const used = usedIn?.length ? usedIn : [OUTPUT_REFS.forecast_dashboard];
      const src = source ?? ASSUMPTION_SOURCE.MANUAL;
      const row = {
        id,
        key,
        label: label.trim(),
        type,
        value,
        unit,
        valueDisplay: valueDisplay ?? String(value),
        status: ASSUMPTION_STATUS.CONFIRMED,
        source: src,
        usedIn: used,
        affects: affects?.length ? affects : businessAffectsFromOutputs(used),
        note: note?.trim() ? note.trim() : null,
        lastUpdatedAt: now,
        lastUpdatedBy: LAST_UPDATED_BY.USER,
        chatSessionId: chatSessionId ?? null,
        relatedUserMessage: relatedUserMessage?.trim() ? relatedUserMessage.trim() : null,
        changeReason:
          changeReason ??
          (src === ASSUMPTION_SOURCE.CHAT ? "Added via planning assistant" : "Added manually"),
      };
      setAssumptions((prev) => [...prev, row]);
      bumpRecompute();
    },
    [bumpRecompute],
  );

  const value = useMemo(
    () => ({
      assumptions,
      recomputeVersion,
      applyProposal,
      applyAssumptionUpdate,
      addAssumption,
      getAssumptionByKey,
      formatAssumptionValue,
      getUsedInDisplay,
    }),
    [addAssumption, applyAssumptionUpdate, applyProposal, assumptions, getAssumptionByKey, recomputeVersion],
  );

  return <AssumptionsContext.Provider value={value}>{children}</AssumptionsContext.Provider>;
}

export function useAssumptions() {
  const ctx = useContext(AssumptionsContext);
  if (!ctx) {
    throw new Error("useAssumptions must be used within AssumptionsProvider");
  }
  return ctx;
}

export { parseUserInputForAssumption };
