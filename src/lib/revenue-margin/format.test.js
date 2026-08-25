import test from "node:test";
import assert from "node:assert/strict";
import { formatInrCompact } from "../../planning/scenarioDisplayFormat.js";
import {
  formatMetricValue,
  getMetricPresentation,
  displayEntityName,
} from "./format.js";
import {
  presentEvidenceItem,
  presentEvidenceList,
  containsInternalEvidenceLeak,
} from "./evidencePresenter.js";
import {
  prioritizeSignals,
  signalCategory,
} from "./signalPresentation.js";
import { suggestedAiQuestions } from "./analyticalContext.js";

test("currency compact format matches WYZ helpers", () => {
  assert.equal(formatInrCompact(9625442.709999999), "₹96.3 L");
  assert.equal(formatInrCompact(23500000), "₹2.35 Cr");
  assert.equal(formatInrCompact(1408), "₹1,408");
});

test("negative currency uses existing compact convention", () => {
  assert.equal(formatInrCompact(-2260000), "₹-22.6 L");
});

test("ratio to percentage uses registry scale once", () => {
  const meta = getMetricPresentation("cm2_pct");
  assert.equal(meta.storage, "ratio_0_1");
  assert.equal(formatMetricValue("cm2_pct", 0.007273928420485073).formatted, "0.7%");
  assert.equal(formatMetricValue("marketing_pct", 0.4832827393546411).formatted, "48.3%");
});

test("evidence presenter hides Filtered population and raw keys", () => {
  const row = presentEvidenceItem({
    evidence_id: "summary:cm2_pct",
    metric: "cm2_pct",
    value: 0.009,
    entity: "Filtered population",
  });
  assert.ok(row);
  assert.equal(row.label, "CM2 Margin");
  assert.equal(row.formattedValue, "0.9%");
  assert.equal(row.context, null);
  assert.equal(row.evidenceId, "summary:cm2_pct");
  assert.equal(containsInternalEvidenceLeak(`${row.label} ${row.formattedValue}`), false);
  assert.equal(displayEntityName("Filtered population"), "This view");
});

test("positive signals are not categorized as pressure", () => {
  assert.equal(signalCategory({ signal_type: "TOP_CM2_CONTRIBUTOR" }), "positive");
  assert.equal(signalCategory({ signal_type: "MARKETING_PRESSURE" }), "pressure");
  const ranked = prioritizeSignals(
    [
      { signal_type: "TOP_CM2_CONTRIBUTOR", entity: "A", materiality: 0.9, label: "Top" },
      { signal_type: "MARKETING_PRESSURE", entity: "B", materiality: 0.4, label: "Pressure" },
      { signal_type: "TOP_CM1_CONTRIBUTOR", entity: "C", materiality: 0.8, label: "Top" },
      { signal_type: "CHANNEL_COST_PRESSURE", entity: "D", materiality: 0.5, label: "Pressure" },
      { signal_type: "TOP_GM_CONTRIBUTOR", entity: "E", materiality: 0.7, label: "Top" },
    ],
    { limit: 4 },
  );
  assert.equal(ranked.visible.length, 4);
  assert.equal(signalCategory(ranked.visible[0]), "pressure");
  assert.equal(ranked.rest.length, 1);
});

test("suggested questions include temporal and avoid strategy", () => {
  const company = suggestedAiQuestions({ surface: "overview", filters: {} });
  assert.ok(company.some((q) => /changed/i.test(q)));
  assert.ok(company.some((q) => /CM2|margin pressures|channel contributes/i.test(q)));
  assert.ok(!company.some((q) => /stop selling|scenario|if marketing drops/i.test(q)));

  const scoped = suggestedAiQuestions({
    surface: "margin",
    filters: { channel: ["Amazon"], category: ["Lips"] },
  });
  assert.ok(scoped.some((q) => /contribute most/i.test(q)));
  assert.ok(scoped.some((q) => /contribute least/i.test(q)));
});

test("share_of_total formats as percentage never currency", () => {
  assert.equal(formatMetricValue("share_of_total", 1.0).formatted, "100.0%");
  assert.equal(formatMetricValue("share_of_total", 0.42).formatted, "42.0%");
  assert.equal(formatMetricValue("share_of_total", 1.0).formatted.includes("₹"), false);
});

test("empty or placeholder evidence is not presentable", () => {
  assert.equal(presentEvidenceList([]).length, 0);
  assert.equal(presentEvidenceList(["Evidence", "N/A"]).length, 0);
  assert.equal(presentEvidenceList([{ label: "Evidence" }]).length, 0);
  assert.equal(
    presentEvidenceList([
      {
        evidence_id: "summary:cm2",
        metric: "cm2",
        value: 1000,
        display: { label: "CM2", formatted_value: "₹1,000" },
      },
      {
        evidence_id: "summary:cm2",
        metric: "cm2",
        value: 1000,
        display: { label: "CM2", formatted_value: "₹1,000" },
      },
    ]).length,
    1,
  );
});
