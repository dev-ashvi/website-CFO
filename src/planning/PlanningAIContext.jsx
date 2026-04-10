import { createContext, useCallback, useContext, useMemo, useState } from "react";

const PlanningAIContext = createContext(null);

/**
 * @typedef {'model' | 'plan' | 'scenario' | 'insight'} PlanningAIContextType
 */

/**
 * @param {{ type: PlanningAIContextType, data: object }} payload
 */
export function PlanningAIProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextType, setContextType] = useState(/** @type {PlanningAIContextType | null} */ (null));
  const [contextData, setContextData] = useState(/** @type {object | null} */ (null));

  const openAI = useCallback(({ type, data }) => {
    if (!type || !data) return;
    setContextType(type);
    setContextData(data);
    setIsOpen(true);
  }, []);

  const closeAI = useCallback(() => {
    setIsOpen(false);
    setContextType(null);
    setContextData(null);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      contextType,
      contextData,
      openAI,
      closeAI,
    }),
    [isOpen, contextType, contextData, openAI, closeAI],
  );

  return <PlanningAIContext.Provider value={value}>{children}</PlanningAIContext.Provider>;
}

export function usePlanningAI() {
  const ctx = useContext(PlanningAIContext);
  if (!ctx) {
    throw new Error("usePlanningAI must be used within PlanningAIProvider");
  }
  return ctx;
}
