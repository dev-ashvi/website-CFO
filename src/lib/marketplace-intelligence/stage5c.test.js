/**
 * Stage 5C — founder-facing copy & brief UX polish (presentation only).
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import {
  createMarketplaceSession,
  requestSampleDataset,
  runMarketplaceEngine,
  normalizeAmazonCsvText,
  calculateMarketplace,
  buildFinancialIntelligence,
  reconcileSettlement,
  parseUnifiedSummaryPdf,
} from "./index.js";

const REAL_CSV = "C:/Users/apoor/Downloads/Transactions for time period 1_4_2026 - 30_9_2026.csv";
const REAL_PDF = "C:/Users/apoor/Downloads/2026Apr1-2026Sep30CustomUnifiedSummary.pdf";

async function loadSampleIntel() {
  const sample = requestSampleDataset(createMarketplaceSession());
  return (await runMarketplaceEngine(sample.session)).metrics.intelligence;
}

async function loadTummyIntel() {
  if (!existsSync(REAL_CSV)) return null;
  const normalized = normalizeAmazonCsvText(readFileSync(REAL_CSV, "utf8"));
  let summary = null;
  if (existsSync(REAL_PDF)) {
    const pdf = await parseUnifiedSummaryPdf(new Uint8Array(readFileSync(REAL_PDF)));
    summary = pdf.summary;
  }
  const payload = summary ? { ...normalized, summary } : normalized;
  const metrics = calculateMarketplace(payload);
  const recon = reconcileSettlement(payload, metrics);
  return buildFinancialIntelligence(metrics, recon);
}

function allInsights(intel) {
  const brief = intel?.brief || {};
  return [brief.primary, ...(brief.secondary || [])].filter(Boolean);
}

describe("stage 5C founder copy polish", () => {
  it("uses singular large-order wording on the sample dataset", async () => {
    const intel = await loadSampleIntel();
    const skew = allInsights(intel).find((row) => row.id === "order_skew_2x");
    assert.ok(skew);
    assert.match(skew.headline, /Large orders account for 31\.3% of your sales/i);
    assert.match(skew.what || skew.summary, /Just one order worth ₹1,200/i);
    assert.match(skew.what || skew.summary, /nearly a third/i);
    assert.match(skew.what || skew.summary, /typical order was ₹385/i);
    assert.match(skew.what || skew.summary, /average of ₹479/i);
    assert.doesNotMatch(skew.what || "", /order\(s\)/i);
    assert.doesNotMatch(skew.summary || "", /order\(s\)/i);
    assert.match(skew.whatNext?.[0]?.question || "", /How much do large orders influence your sales/i);
    assert.match(skew.limitations.join(" "), /twice the typical \(median\) order value/i);
  });

  it("separates advertising spend from total identified deduction rate", async () => {
    const intel = await loadSampleIntel();
    const fee = allInsights(intel).find((row) => row.id === "fee_burden_marketplace");
    assert.ok(fee);
    assert.match(fee.headline, /Advertising is your biggest identified Amazon charge/i);
    assert.match(fee.summary, /Amazon charged ₹500 for advertising/i);
    assert.match(fee.summary, /identified marketplace charges/i);
    assert.match(fee.summary, /equivalent to 25% of sales before refunds/i);
    assert.doesNotMatch(fee.summary, /led by Advertising/i);
    assert.doesNotMatch(fee.headline, /fees total ₹500/i);
  });

  it("uses human-readable incomplete-period copy without ISO date tokens in the card body", async () => {
    const intel = await loadSampleIntel();
    const mom = allInsights(intel).find(
      (row) => row.type === "revenue_movement" && row.provisional,
    );
    assert.ok(mom);
    assert.match(mom.headline, /August sales aren't fully comparable yet/i);
    assert.match(mom.summary, /available only through 29 August/i);
    assert.match(mom.summary, /Compare complete months/i);
    assert.doesNotMatch(mom.summary, /2026-08-01|2026-08-29|Incomplete coverage \(later month/i);
    assert.doesNotMatch(mom.what || "", /2026-08-01|→/);
    assert.match(mom.whatNext?.[0]?.question || "", /complete months/i);
    assert.ok(mom.limitations.some((line) => /2026-08-01|2026-08-29|Incomplete coverage|ISO/i.test(line)));
  });

  it("preserves TUMMY September sales investigation and large-order plural copy", async () => {
    const intel = await loadTummyIntel();
    if (!intel) return;

    const primary = intel.brief?.primary;
    assert.match(primary.headline, /September sales fell by 17%/i);
    assert.match(primary.what || primary.summary, /₹20,781\.97/);
    assert.match(primary.what || primary.summary, /₹17,257\.13/);
    assert.match(primary.what || primary.summary, /₹3,524\.84/);
    assert.match(primary.shortWhy, /68%/);
    assert.match(primary.shortWhy, /32%/);
    assert.match(primary.whatNext?.[0]?.question || "", /smaller-value orders in September/i);

    const aov = primary.metrics?.find((m) => m.metricId === "aov_contribution");
    const orders = primary.metrics?.find((m) => m.metricId === "order_contribution");
    assert.equal(aov?.value, -2397.08);
    assert.equal(orders?.value, -1127.76);

    const skew = allInsights(intel).find((row) => row.id === "order_skew_2x");
    assert.ok(skew);
    assert.match(skew.headline, /Large orders account for 44\.7% of your sales/i);
    assert.match(skew.summary, /20 large orders contributed ₹46,914/i);
    assert.doesNotMatch(skew.summary, /order\(s\)|larger order\(s\)/i);
  });

  it("brief component uses View supporting details and content-driven secondary grid", () => {
    const src = readFileSync(
      new URL("../../components/marketplace-intelligence/IntelligenceBrief.jsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /View supporting details/);
    assert.doesNotMatch(src, /Evidence, hypotheses & limitations/);
    assert.match(src, /How this was calculated/);
    assert.match(src, /What still needs checking/);
    assert.match(src, /items-start/);
    assert.match(src, /aria-controls/);
  });
});
