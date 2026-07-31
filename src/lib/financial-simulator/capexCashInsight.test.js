import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCapexImpactNote, buildClosingCashCaption } from "./capexCashInsight.js";

describe("closing cash CapEx captions", () => {
  it("handles no cash-out", () => {
    const text = buildClosingCashCaption({
      cashOutMonthIncludingCapex: null,
      cashOutMonthExcludingCapex: null,
      cashOutMonthLabelIncludingCapex: "Beyond 24-month horizon",
      cashOutMonthLabelExcludingCapex: "Beyond 24-month horizon",
      capexRunwayImpactMonths: 0,
      cumulativeCapex: 0,
    });
    assert.match(text, /both including and excluding/i);
  });

  it("handles only including-CapEx cash-out", () => {
    const text = buildClosingCashCaption({
      cashOutMonthIncludingCapex: 6,
      cashOutMonthExcludingCapex: null,
      cashOutMonthLabelIncludingCapex: "Dec 2026",
      cashOutMonthLabelExcludingCapex: "Beyond 24-month horizon",
      capexRunwayImpactMonths: 4,
      cumulativeCapex: 500_000,
    });
    assert.match(text, /Dec 2026/);
    assert.match(text, /cash-positive/i);
  });

  it("handles same cash-out month", () => {
    const text = buildClosingCashCaption({
      cashOutMonthIncludingCapex: 8,
      cashOutMonthExcludingCapex: 8,
      cashOutMonthLabelIncludingCapex: "Feb 2027",
      cashOutMonthLabelExcludingCapex: "Feb 2027",
      capexRunwayImpactMonths: 0,
      cumulativeCapex: 100_000,
    });
    assert.match(text, /Operating burn/i);
  });

  it("handles different cash-out months", () => {
    const text = buildClosingCashCaption({
      cashOutMonthIncludingCapex: 5,
      cashOutMonthExcludingCapex: 8,
      cashOutMonthLabelIncludingCapex: "Nov 2026",
      cashOutMonthLabelExcludingCapex: "Feb 2027",
      capexRunwayImpactMonths: 3,
      cumulativeCapex: 1_000_000,
    });
    assert.match(text, /Nov 2026/);
    assert.match(text, /Feb 2027/);
    assert.match(text, /shortens runway/i);
  });

  it("CapEx impact note for zero CapEx", () => {
    const note = buildCapexImpactNote({
      cumulativeCapex: 0,
      month24CashIncludingCapex: 100,
      month24CashExcludingCapex: 100,
    });
    assert.match(note, /No planned CapEx/i);
  });

  it("CapEx impact note for planned CapEx", () => {
    const note = buildCapexImpactNote({
      cumulativeCapex: 500_000,
      month24CashIncludingCapex: -200_000,
      month24CashExcludingCapex: 300_000,
      capexRunwayImpactMonths: 2.5,
      cashOutMonthIncludingCapex: 10,
    });
    assert.match(note, /Month 24/);
    assert.match(note, /runway/i);
  });
});
