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

  return (
    <section
      ref={sectionRef}
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
      data-testid="tracked-decisions-panel"
    >
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Tracked Decisions</h3>
      <p className="mt-1 text-[11px] text-slate-500">
        Recommendations you chose to track from WYZ AI CFO. Evidence is re-checked on the server — not client estimates.
      </p>
      {error && <p className="mt-2 text-[12px] text-amber-800">{error}</p>}
      {loading && decisions.length === 0 && (
        <p className="mt-3 text-[12px] text-slate-500">Loading tracked decisions…</p>
      )}
      {!loading && decisions.length === 0 && (
        <p className="mt-3 text-[12px] text-slate-600">
          No tracked decisions yet. After a strategic recommendation, click{" "}
          <span className="font-semibold">Track this decision</span> in the AI CFO drawer.
        </p>
      )}
      {decisions.length > 0 && (
        <ul className="mt-3 space-y-3">
          {decisions.map((decision) => {
            const subject = subjectLabel(decision.subject);
            const scopeMatches = activeScopeHash && decision.scope_hash === activeScopeHash;
            const trackedAt = decision.created_at ? String(decision.created_at).slice(0, 10) : null;
            const evidenceLabel = evidenceStatusLabel(decision.evidence_status || decision.evaluation_status);
            const reviewLabel = revisionSummaryLabel(decision.latest_revision);
            return (
              <li key={decision.decision_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-[#1a3673]">
                      {themeLabel(decision.decision_theme)}
                      {subject ? ` · ${subject}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                      {lifecycleLabel(decision.status)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[12px] text-slate-700">
                  Current recommendation:{" "}
                  <span className="font-medium capitalize">{actionLabel(decision.selected_action)}</span>
                  {decision.recommendation_strength
                    ? ` · ${String(decision.recommendation_strength).toLowerCase()}`
                    : ""}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  Evidence status: <span className="font-medium">{evidenceLabel}</span>
                </p>
                {reviewLabel && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    Last review: <span className="font-medium">{reviewLabel}</span>
                  </p>
                )}
                {decision.original_selected_action &&
                  decision.original_selected_action !== decision.selected_action && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Originally tracked:{" "}
                      <span className="capitalize">{actionLabel(decision.original_selected_action)}</span>
                      {decision.original_recommendation_strength
                        ? ` · ${String(decision.original_recommendation_strength).toLowerCase()}`
                        : ""}
                    </p>
                  )}
                {decision.original_question && (
                  <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{decision.original_question}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  Scope:{" "}
                  {scopeMatches && activeViewLabel
                    ? activeViewLabel
                    : decision.scope_hash
                      ? `hash ${String(decision.scope_hash).slice(0, 16)}…`
                      : "—"}
                  {!scopeMatches && decision.scope_hash && activeScopeHash ? " (differs from current view)" : ""}
                </p>
                {trackedAt && (
                  <p className="mt-1 text-[11px] text-slate-500">Tracked: {trackedAt}</p>
                )}
                {decision.last_evaluated_at && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Last evaluated: {String(decision.last_evaluated_at).slice(0, 10)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busyId === decision.decision_id}
                    onClick={() => handleReview(decision)}
                    className="text-[11px] font-semibold text-[#1a3673] hover:underline disabled:opacity-50"
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    disabled={busyId === decision.decision_id}
                    onClick={() => handleArchive(decision)}
                    className="text-[11px] font-semibold text-slate-500 hover:underline disabled:opacity-50"
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
