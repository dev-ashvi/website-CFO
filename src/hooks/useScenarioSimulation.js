import { useEffect, useMemo, useState } from "react";
import { useAssumptions } from "../planning/AssumptionsContext.jsx";
import { useScenarioDraft } from "../planning/ScenarioDraftContext.jsx";
import { simulateScenario } from "../planning/scenarioEngine/simulateScenario.js";
import { generateExplanation } from "../planning/explanationEngine/generateExplanation.js";

/**
 * Merges workspace assumptions with scenario draft and runs the local MVP engine.
 * @returns {{
 *   series: null | { horizonMonths: number, baseline: object, scenario: object },
 *   summary: null | { revenueDeltaPercent: number, runwayDelta: number, burnDelta: number, cashDelta: number },
 *   breakdown: { label: string, from: string, to: string }[],
 *   originChatSnippet: string | null,
 *   outputsAffected: string[],
 *   loading: boolean,
 *   loadingMessage: string,
 *   explanation: null | object,
 * }}
 */
export function useScenarioSimulation() {
  const { assumptions } = useAssumptions();
  const { draftByKey, draftVersion, hasScenarioDraft } = useScenarioDraft();

  const simKey = useMemo(() => {
    if (!hasScenarioDraft) return "";
    return `${draftVersion}:${JSON.stringify(
      Object.keys(draftByKey)
        .sort()
        .map((k) => [k, draftByKey[k]?.proposedValue, draftByKey[k]?.displayTo]),
    )}`;
  }, [hasScenarioDraft, draftByKey, draftVersion]);

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  useEffect(() => {
    if (!simKey) {
      setLoading(false);
      setLoadingMessage("");
      return;
    }
    setLoading(true);
    setLoadingMessage("Analyzing scenario...");
    const t1 = window.setTimeout(() => setLoadingMessage("Recomputing projections..."), 160);
    const t2 = window.setTimeout(() => {
      setLoading(false);
      setLoadingMessage("");
    }, 340);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [simKey]);

  const full = useMemo(() => {
    if (!hasScenarioDraft) return null;
    return simulateScenario({ assumptions, scenarioDraft: draftByKey });
  }, [assumptions, draftByKey, hasScenarioDraft]);

  const breakdown = useMemo(() => {
    if (!hasScenarioDraft) return [];
    return Object.values(draftByKey)
      .filter((e) => e && typeof e === "object" && e.assumptionKey)
      .map((e) => {
        const row = assumptions.find((a) => a.key === e.assumptionKey);
        const from = row?.valueDisplay ?? e.displayFromSnapshot ?? "—";
        return {
          assumptionKey: e.assumptionKey,
          label: e.assumptionLabel ?? row?.label ?? e.assumptionKey,
          from: String(from),
          to: String(e.displayTo ?? "—"),
        };
      });
  }, [assumptions, draftByKey, hasScenarioDraft]);

  const series = useMemo(() => {
    if (!full) return null;
    return {
      horizonMonths: full.horizonMonths,
      baseline: full.baseline,
      scenario: full.scenario,
    };
  }, [full]);

  const originChatSnippet = useMemo(() => {
    if (!hasScenarioDraft) return null;
    const entries = Object.values(draftByKey).filter((e) => e && typeof e === "object");
    const msg = entries.map((e) => e.relatedUserMessage).find((m) => typeof m === "string" && m.trim());
    if (!msg) return null;
    const t = msg.trim();
    return t.length > 140 ? `${t.slice(0, 137)}…` : t;
  }, [draftByKey, hasScenarioDraft]);

  const outputsAffected = useMemo(() => {
    const map = new Map();
    for (const key of Object.keys(draftByKey)) {
      const row = assumptions.find((a) => a.key === key);
      if (!row?.usedIn) continue;
      for (const ref of row.usedIn) {
        map.set(ref.id, ref.label);
      }
    }
    return Array.from(map.values());
  }, [draftByKey, assumptions]);

  const explanation = useMemo(() => {
    if (!full?.summary || !full.baseline || !full.scenario) return null;
    return generateExplanation({
      summary: full.summary,
      breakdown,
      baseline: full.baseline,
      scenario: full.scenario,
    });
  }, [full, breakdown]);

  return {
    series,
    summary: full?.summary ?? null,
    breakdown,
    originChatSnippet,
    outputsAffected,
    explanation,
    loading,
    loadingMessage,
  };
}
