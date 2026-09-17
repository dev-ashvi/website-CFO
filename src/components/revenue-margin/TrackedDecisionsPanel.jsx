import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listStrategicDecisions,
  reviewStrategicDecision,
  updateStrategicDecisionStatus,
} from "../../api/revenueMargin.js";
import { filtersToQueryFilters } from "../../lib/revenue-margin/filters.js";
import { buildAnalyticalContext } from "../../lib/revenue-margin/analyticalContext.js";
import { mergeTrackedDecisionLists, evidenceStatusLabel, revisionSummaryLabel } from "../../lib/revenue-margin/trackedDecisions.js";

function lifecycleLabel(status) {
  if (status === "REVISIT_REQUIRED") return "Revisit required";
  if (status === "REVIEW_DUE") return "Review due";
  if (status === "ACTIVE") return "Active";
  if (status === "ARCHIVED") return "Archived";
  return status || "—";
}

function themeLabel(theme) {
  if (!theme) return "Strategic decision";
  return String(theme).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionLabel(action) {
  if (!action) return "—";
  return String(action).replace(/_/g, " ").toLowerCase();
}

function subjectLabel(subject) {
  if (!subject || typeof subject !== "object") return null;
  const entity = subject.entity ? String(subject.entity) : "";
  const dimension = subject.dimension ? String(subject.dimension) : "";
  if (entity && dimension) return `${dimension}: ${entity}`;
  if (entity) return entity;
  if (dimension) return dimension;
  return null;
}

/**
 * Minimal tracked-decision list for Phase 2E product loop.
 * Always visible when analysis is ready (empty state when none tracked).
 */
export default function TrackedDecisionsPanel({
  datasetId,
  result,
  filters,
  surface,
  dimension,
  dynamicEnabled,
  refreshKey = 0,
  seedDecision = null,
  activeScopeHash = null,
  activeViewLabel = null,
  onReviewComplete,
}) {
  const [listed, setListed] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const sectionRef = useRef(null);
  const prevSeedId = useRef(null);

  const load = useCallback(() => {
    if (!datasetId || !dynamicEnabled) {
      setListed([]);
      return;
    }
    setLoading(true);
    listStrategicDecisions(datasetId)
      .then((data) => {
        const items = Array.isArray(data?.decisions) ? data.decisions : [];
        setListed(items.filter((d) => d.status !== "ARCHIVED"));
        setError(null);
      })
      .catch((err) => {
        setError(err?.message || "Could not load tracked decisions.");
        setListed([]);
      })
      .finally(() => setLoading(false));
  }, [datasetId, dynamicEnabled]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const decisions = useMemo(
    () => mergeTrackedDecisionLists(listed, seedDecision),
    [listed, seedDecision],
  );

  useEffect(() => {
    const seedId = seedDecision?.decision_id;
    if (!seedId || seedId === prevSeedId.current) return;
    prevSeedId.current = seedId;
    // Bring the section into view after an explicit Track success.
    sectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [seedDecision?.decision_id]);

  async function handleReview(decision) {
    setBusyId(decision.decision_id);
    try {
      const analytical = buildAnalyticalContext({
        result,
        filters: filtersToQueryFilters(filters),
        surface,
        dimension,
      });
      const response = await reviewStrategicDecision(datasetId, decision.decision_id, {
        analytical,
        observation_period: `review_${Date.now()}`,
      });
      onReviewComplete?.(response);
      load();
    } catch (err) {
      setError(err?.message || "Review failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(decision) {
    setBusyId(decision.decision_id);
    try {
      await updateStrategicDecisionStatus(datasetId, decision.decision_id, { status: "ARCHIVED" });
      load();
    } catch (err) {
      setError(err?.message || "Archive failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (!dynamicEnabled) {
    return null;
  }

  const empty = !loading && decisions.length === 0;

  return (
    <section
      ref={sectionRef}
      className={
        empty
          ? "mt-4 rounded-lg border border-dashed border-slate-200 bg-transparent px-3 py-2"
          : "mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
      }
      data-testid="tracked-decisions-panel"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Tracked Decisions
        </h3>
        {empty ? (
          <p className="text-[11px] text-slate-500">None yet — track from AI CFO when ready.</p>
        ) : (
          <p className="text-[11px] text-slate-500">
            Recommendations you chose to track. Evidence is re-checked on the server.
          </p>
        )}
      </div>
      {error && <p className="mt-2 text-[12px] text-amber-800">{error}</p>}
      {loading && decisions.length === 0 && (
        <p className="mt-2 text-[12px] text-slate-500">Loading tracked decisions…</p>
      )}
      {decisions.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {decisions.map((decision) => {
            const subject = subjectLabel(decision.subject);
            const scopeMatches = activeScopeHash && decision.scope_hash === activeScopeHash;
            const trackedAt = decision.created_at ? String(decision.created_at).slice(0, 10) : null;
            const evidenceLabel = evidenceStatusLabel(decision.evidence_status || decision.evaluation_status);
            const reviewLabel = revisionSummaryLabel(decision.latest_revision);
            return (
              <li key={decision.decision_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#1a3673]">
                      {themeLabel(decision.decision_theme)}
                      {subject ? ` · ${subject}` : ""}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-700">
                      Current recommendation:{" "}
                      <span className="font-medium capitalize">{actionLabel(decision.selected_action)}</span>
                      {decision.recommendation_strength
                        ? ` · ${String(decision.recommendation_strength).toLowerCase()}`
                        : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {lifecycleLabel(decision.status)}
                  </span>
                </div>
                {decision.original_question && (
                  <p className="mt-2 text-[11px] text-slate-500 line-clamp-2">
                    <span className="font-medium text-slate-600">Context: </span>
                    {decision.original_question}
                  </p>
                )}
                <div className="mt-2 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
                  <p>
                    Evidence status: <span className="font-medium text-slate-800">{evidenceLabel}</span>
                  </p>
                  {reviewLabel && (
                    <p>
                      Last review: <span className="font-medium text-slate-800">{reviewLabel}</span>
                    </p>
                  )}
                  <p>
                    Scope:{" "}
                    {scopeMatches && activeViewLabel
                      ? activeViewLabel
                      : decision.scope_hash
                        ? `hash ${String(decision.scope_hash).slice(0, 16)}…`
                        : "—"}
                    {!scopeMatches && decision.scope_hash && activeScopeHash ? " (differs from current view)" : ""}
                  </p>
                  {trackedAt && <p>Tracked: {trackedAt}</p>}
                </div>
                {decision.original_selected_action &&
                  decision.original_selected_action !== decision.selected_action && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Originally:{" "}
                      <span className="capitalize">{actionLabel(decision.original_selected_action)}</span>
                      {decision.original_recommendation_strength
                        ? ` · ${String(decision.original_recommendation_strength).toLowerCase()}`
                        : ""}
                    </p>
                  )}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === decision.decision_id}
                    onClick={() => handleReview(decision)}
                    className="rounded-md bg-[#1a3673] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#142a5c] disabled:opacity-50"
                  >
                    Review decision
                  </button>
                  <button
                    type="button"
                    disabled={busyId === decision.decision_id}
                    onClick={() => handleArchive(decision)}
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
