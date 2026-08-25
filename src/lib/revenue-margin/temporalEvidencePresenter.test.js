import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPeriodLabel,
  isTemporalEvidenceItem,
  methodologyExposesInternals,
  presentComparison,
  presentTemporalEvidenceList,
} from "./temporalEvidencePresenter.js";

test("period labels are full month names never truncated", () => {
  assert.equal(formatPeriodLabel("2025-12"), "Dec 2025");
  assert.equal(formatPeriodLabel("2026-03"), "Mar 2026");
  assert.equal(formatPeriodLabel("2025-12").includes("…"), false);
  assert.equal(formatPeriodLabel("2025-12").includes("2025-12 → 2"), false);
});

test("temporal rows use metric label not period", () => {
  const rows = presentTemporalEvidenceList([
    {
      evidence_id: "change:1:cm2",
      metric: "cm2",
      source: "change_evidence",
      from_period: "2025-12",
      to_period: "2026-03",
      display: {
        kind: "temporal_change",
        label: "CM2",
        formatted_range: "₹5,682 → ₹11,901",
        formatted_delta: "+₹6,219",
        delta_format_type: "currency",
      },
    },
    {
      evidence_id: "change:1:cm2_pct",
      metric: "cm2_pct",
      source: "change_evidence",
      display: {
        kind: "temporal_change",
        label: "CM2 Margin",
        formatted_range: "0.4% → 0.8%",
        formatted_delta: "+0.4 pp",
        delta_format_type: "percentage_points",
      },
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, "CM2");
  assert.equal(rows[1].label, "CM2 Margin");
  assert.equal(rows[1].formattedDelta, "+0.4 pp");
  assert.ok(rows.every((row) => !String(row.label).startsWith("2025")));
});

test("comparison period shown once from answer.comparison", () => {
  const label = presentComparison({
    comparison: { label: "Dec 2025 → Mar 2026", from_period: "2025-12", to_period: "2026-03" },
    evidence: [
      {
        metric: "cm2",
        source: "change_evidence",
        display: { kind: "temporal_change", label: "CM2", formatted_range: "₹1 → ₹2" },
      },
    ],
  });
  assert.equal(label, "Dec 2025 → Mar 2026");
});

test("delta signs and percentage points", () => {
  const rows = presentTemporalEvidenceList([
    {
      metric: "cm2_pct",
      source: "change_evidence",
      display: {
        kind: "temporal_change",
        label: "CM2 Margin",
        formatted_range: "8.0% → 5.0%",
        formatted_delta: "-3.0 pp",
        delta_format_type: "percentage_points",
      },
    },
  ]);
  assert.equal(rows[0].formattedDelta, "-3.0 pp");
  assert.ok(rows[0].formattedDelta.startsWith("-"));
});

test("methodology must not expose internals", () => {
  assert.equal(methodologyExposesInternals("Changes are calculated from verified monthly financial data within the active view."), false);
  assert.equal(methodologyExposesInternals("computed from get_trend under FinancialScope"), true);
});

test("isTemporalEvidenceItem detects change evidence", () => {
  assert.equal(isTemporalEvidenceItem({ display: { kind: "temporal_change" }, metric: "cm2" }), true);
  assert.equal(isTemporalEvidenceItem({ metric: "cm2", value: 1 }), false);
});
