import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASK_WYZ_MODE,
  DEDUCTION_CATEGORIES,
  FEE_CATEGORIES,
  MARKETPLACE_INTELLIGENCE_PATH,
  SECTIONS,
  assertDistinctFeeRoles,
  attachSourceFile,
  buildInvestigationContext,
  classifyUpload,
  createMarketplaceSession,
  detachSourceFile,
  investigate,
  releaseSession,
  requestSampleDataset,
  runMarketplaceEngine,
  sessionSummary,
} from "./index.js";

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, "../../..");

describe("marketplace intelligence foundation", () => {
  it("keeps selling fees distinct from advertising and sales", () => {
    const roles = assertDistinctFeeRoles();
    assert.equal(roles.sellingFeeIsDeduction, true);
    assert.equal(roles.advertisingSeparateFromSelling, true);
    assert.ok(DEDUCTION_CATEGORIES.includes("selling_fee"));
    assert.ok(DEDUCTION_CATEGORIES.includes("advertising"));
    assert.ok(FEE_CATEGORIES.includes("product_sale"));
    assert.equal(DEDUCTION_CATEGORIES.includes("product_sale"), false);
  });

  it("defines the four analytical sections without embedding client names", () => {
    assert.deepEqual(
      SECTIONS.map((section) => section.id),
      ["topline", "amazon_economics", "product_performance", "profitability"],
    );
    for (const section of SECTIONS) {
      assert.ok(section.questions.length >= 2);
      assert.equal(JSON.stringify(section).includes("TUMMY"), false);
    }
  });

  it("accepts only the two V1 report slots and does not treat the extension as format proof", () => {
    const csv = classifyUpload({ name: "Transactions.csv", byteLength: 128 });
    assert.equal(csv.accepted, true);
    assert.equal(csv.slot, "transactionsCsv");
    assert.equal(csv.validation, "extension_only");
    assert.equal(csv.detection, "pending");

    const pdf = classifyUpload({ name: "unified-summary.PDF", byteLength: 128 });
    assert.equal(pdf.accepted, true);
    assert.equal(pdf.slot, "unifiedSummaryPdf");

    const other = classifyUpload({ name: "settlement.xlsx", byteLength: 128 });
    assert.equal(other.accepted, false);
    assert.equal(other.code, "unsupported_report");
  });

  it("isolates uploads in memory and omits bytes from summaries", () => {
    const left = createMarketplaceSession();
    const right = createMarketplaceSession();
    const bytes = new Uint8Array([9, 9, 9, 7]);
    const attached = attachSourceFile(left, {
      name: "orders.csv",
      bytes,
      mediaType: "text/csv",
    });
    assert.equal(attached.error, null);
    assert.equal(right.files.transactionsCsv, null);
    assert.notEqual(left.id, right.id);

    const summary = sessionSummary(attached.session);
    assert.equal(summary.persistence, "memory");
    assert.equal(Object.prototype.hasOwnProperty.call(summary.files.transactionsCsv, "bytes"), false);

    const released = releaseSession(attached.session);
    assert.equal(released.files.transactionsCsv, null);
    assert.equal(attached.session.files.transactionsCsv.bytes, null);

    const detached = detachSourceFile(
      attachSourceFile(createMarketplaceSession(), {
        name: "summary.pdf",
        bytes: new Uint8Array([1, 2]),
      }).session,
      "unifiedSummaryPdf",
    );
    assert.equal(detached.mode, "empty");
  });

  it("loads anonymized sample and calculates metrics without client names", async () => {
    const sample = requestSampleDataset(createMarketplaceSession());
    assert.equal(sample.ok, true);
    const engine = await runMarketplaceEngine(sample.session);
    assert.equal(engine.metrics.status, "calculated");
    assert.equal(JSON.stringify(engine).includes("TUMMY"), false);
    assert.equal(JSON.stringify(engine).includes("AGARWAL"), false);
  });

  it("grounds Ask WYZ in session context before metrics exist", () => {
    const session = createMarketplaceSession();
    const context = buildInvestigationContext({
      sessionId: session.id,
      sectionId: "amazon_economics",
      dateRange: { start: "2026-01-01", end: "2026-01-31" },
      product: null,
      chartId: "fee-breakdown",
      filters: { platform: "amazon" },
    });
    assert.equal(context.liveModel, false);
    assert.equal(context.mode, ASK_WYZ_MODE);

    const response = investigate("Where is Amazon taking the money?", context, null);
    assert.equal(response.liveModel, false);
    assert.equal(response.status, "awaiting_calculations");
    assert.equal(response.answer, null);
  });

  it("keeps the public route outside login and does not persist files", () => {
    assert.equal(MARKETPLACE_INTELLIGENCE_PATH, "/marketplace-intelligence");

    const app = readFileSync(join(repo, "src/App.jsx"), "utf8");
    const publicIdx = app.indexOf('path="/marketplace-intelligence"');
    const appIdx = app.indexOf('path="/app"');
    assert.ok(publicIdx > -1);
    assert.ok(publicIdx < appIdx);
    assert.equal(app.slice(appIdx).includes("MarketplaceIntelligencePage"), false);

    const implementationFiles = readdirSync(root).filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"));
    for (const name of implementationFiles) {
      const source = readFileSync(join(root, name), "utf8");
      assert.equal(/localStorage|sessionStorage|indexedDB|writeFileSync/.test(source), false, name);
    }
  });
});
