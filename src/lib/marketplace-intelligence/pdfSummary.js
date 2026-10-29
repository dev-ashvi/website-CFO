/**
 * Amazon Unified Summary PDF parsing.
 * Extraction stays in-browser via pdfjs. No file bytes leave the session.
 */
import { parseIndianNumber, roundMoney } from "./money.js";

const FIELD_PATTERNS = [
  { key: "sellerFulfilledProductSales", pattern: /^Seller fulfilled product sales$/i },
  { key: "sellerFulfilledProductSaleRefunds", pattern: /^Seller fulfilled product sale refunds$/i },
  { key: "sellerFulfilledSellingFees", pattern: /^Seller fulfilled selling fees$/i },
  { key: "otherTransactionFees", pattern: /^Other transaction fees$/i },
  { key: "costOfAdvertising", pattern: /^Cost of Advertising$/i },
  { key: "inboundServicesFees", pattern: /^FBA inventory and inbound services fees$/i },
  { key: "promotionalRebates", pattern: /^Promotional rebates$/i },
  { key: "gstCollected", pattern: /^GST Collected$/i },
  { key: "transfersToBank", pattern: /^Transfers to bank account$/i },
  { key: "netGstCollected", pattern: /^Net goods and services tax collected$/i },
  { key: "income", pattern: /^Income$/i },
  { key: "expenses", pattern: /^Expenses$/i },
  { key: "transfers", pattern: /^Transfers$/i },
];

function hasUnifiedSummaryMarkers(text) {
  const t = text || "";
  return (
    /Account activity from/i.test(t) &&
    /Seller fulfilled product sales/i.test(t) &&
    /Transfers/i.test(t) &&
    (/Net goods and services tax collected/i.test(t) || /GST Collected/i.test(t))
  );
}

function emptySummary() {
  return {
    currency: "INR",
    periodRaw: null,
    income: null,
    expenses: null,
    netGstCollected: null,
    transfers: null,
    transfersToBank: null,
    sellerFulfilledProductSales: null,
    sellerFulfilledProductSaleRefunds: null,
    sellerFulfilledSellingFees: null,
    otherTransactionFees: null,
    costOfAdvertising: null,
    inboundServicesFees: null,
    promotionalRebates: null,
    gstCollected: null,
    fields: [],
  };
}

function assign(summary, key, value, label, raw, { allowZero = true } = {}) {
  if (value == null || !Number.isFinite(value)) return;
  const next = roundMoney(value);
  if (!allowZero && next === 0 && summary[key] == null) {
    summary[key] = 0;
    summary.fields.push({ key, label, value: next, raw });
    return;
  }
  const current = summary[key];
  if (current == null || (current === 0 && next !== 0)) {
    summary[key] = next;
  }
  summary.fields.push({ key, label, value: next, raw });
}

function numbersFromTexts(texts) {
  return texts
    .map((t) => {
      const parsed = parseIndianNumber(t);
      return parsed.value == null ? null : { value: roundMoney(parsed.value), raw: String(t) };
    })
    .filter(Boolean);
}

function preferAmount(candidates, { allowZero = true } = {}) {
  if (!candidates.length) return null;
  const nonZero = candidates.filter((c) => c.value !== 0);
  if (nonZero.length) return nonZero[0];
  return allowZero ? candidates[0] : null;
}

function findNearbyNumbers(rows, anchorY, maxDy = 2.2) {
  const nearby = rows
    .filter((row) => Math.abs(row.y - anchorY) <= maxDy)
    .sort((a, b) => Math.abs(a.y - anchorY) - Math.abs(b.y - anchorY));
  const out = [];
  for (const row of nearby) out.push(...numbersFromTexts(row.texts));
  return out;
}

/**
 * Parse from pdfjs positioned rows when available; fall back to flattened text.
 */
export function parseUnifiedSummaryText(text, positionedRows = null) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return {
      ok: false,
      formatId: null,
      code: "empty_pdf_text",
      message: "No text available from the PDF.",
      summary: null,
    };
  }
  if (!hasUnifiedSummaryMarkers(cleaned)) {
    return {
      ok: false,
      formatId: null,
      code: "unsupported_pdf_format",
      message: "This PDF is not the supported Amazon Unified Summary format.",
      summary: null,
    };
  }

  const summary = emptySummary();
  const periodMatch = cleaned.match(
    /Account activity from\s+([A-Za-z]+ \d{1,2}, \d{4}).*?through\s+([A-Za-z]+ \d{1,2}, \d{4})/i,
  );
  if (periodMatch) summary.periodRaw = `${periodMatch[1]} – ${periodMatch[2]}`;

  if (Array.isArray(positionedRows) && positionedRows.length) {
    for (const field of FIELD_PATTERNS) {
      const labelRows = positionedRows.filter((row) => row.texts.some((t) => field.pattern.test(t)));
      for (const labelRow of labelRows) {
        const sameRow = numbersFromTexts(labelRow.texts);
        const nearby = findNearbyNumbers(positionedRows, labelRow.y);
        const chosen = preferAmount([...sameRow, ...nearby], { allowZero: true });
        if (!chosen) continue;
        // Skip clearly unrelated huge positives for fee/refund labels when a better nearby negative exists.
        if (
          /Fee|Advertising|Refund|inbound|transfersToBank|promotional/i.test(field.key) &&
          chosen.value > 0 &&
          nearby.some((n) => n.value < 0)
        ) {
          const neg = nearby.find((n) => n.value < 0);
          assign(summary, field.key, neg.value, labelRow.texts.find((t) => field.pattern.test(t)), neg.raw);
          continue;
        }
        assign(
          summary,
          field.key,
          chosen.value,
          labelRow.texts.find((t) => field.pattern.test(t)),
          chosen.raw,
        );
      }
    }
  }

  // Flattened-text fallback for any still-missing core totals.
  const coreFallback = [
    ["income", /Income\s*\|\s*Net sales, credits, and refunds\s*\|\s*([-\d.,]+)/i, /Income.*?([-\d,]+\.\d{2})/i],
    ["expenses", /Expenses\s*\|\s*Net fees[\s\S]*?\|\s*([-\d.,]+)/i, /Expenses.*?([-\d,]+\.\d{2})/i],
    ["netGstCollected", /Net goods and services tax collected\s*\|\s*([-\d.,]+)/i, null],
    ["transfers", /Transfers\s*\|\s*Net deposits and withdrawals\s*\|\s*([-\d.,]+)/i, null],
  ];
  for (const [key, primary, secondary] of coreFallback) {
    if (summary[key] != null) continue;
    const match = primary.exec(cleaned) || secondary?.exec(cleaned);
    if (!match) continue;
    const parsed = parseIndianNumber(match[1]);
    if (parsed.value != null) assign(summary, key, parsed.value, key, match[1]);
  }

  if ((summary.transfersToBank == null || summary.transfersToBank === 0) && summary.transfers != null) {
    summary.transfersToBank = summary.transfers;
  }

  const ok =
    summary.income != null ||
    summary.sellerFulfilledProductSales != null ||
    summary.transfers != null;

  if (!ok) {
    return {
      ok: false,
      formatId: "amazon_unified_summary_pdf_v1",
      code: "summary_values_not_found",
      message: "Unified Summary labels were found, but key totals could not be extracted.",
      summary,
    };
  }

  return {
    ok: true,
    formatId: "amazon_unified_summary_pdf_v1",
    code: "recognised",
    message: "Recognised Amazon Unified Summary PDF (V1).",
    summary,
  };
}

function rowsFromPdfItems(items) {
  const buckets = new Map();
  for (const item of items) {
    const str = item?.str;
    if (!str || !String(str).trim()) continue;
    const transform = item.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(transform[4]) || 0;
    const y = Math.round((Number(transform[5]) || 0) * 10) / 10;
    if (!buckets.has(y)) buckets.set(y, []);
    buckets.get(y).push({ x, text: String(str).trim() });
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, cells]) => ({
      y,
      texts: cells.sort((a, b) => a.x - b.x).map((c) => c.text),
    }));
}

async function configurePdfWorker(pdfjs) {
  if (!pdfjs?.GlobalWorkerOptions) return;
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;

  // Browser / Vite path first — keep Node builtins out of the client bundle.
  if (typeof window !== "undefined") {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return;
  }

  // Node tests only. Dynamic Function import avoids Vite rewriting node: specifiers.
  const dynamicImport = new Function("specifier", "return import(specifier)");
  const { pathToFileURL } = await dynamicImport("node:url");
  const { createRequire } = await dynamicImport("node:module");
  const require = createRequire(import.meta.url);
  const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
}

export async function extractPdfText(bytes) {
  if (bytes == null) {
    return { text: "", rows: [], error: { code: "empty_pdf", message: "The PDF file is empty." } };
  }
  if (typeof bytes === "string") {
    return { text: bytes, rows: [], error: null };
  }

  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    await configurePdfWorker(pdfjs);
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const textChunks = [];
    const allRows = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      allRows.push(...rowsFromPdfItems(content.items));
      textChunks.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    const text = textChunks.join("\n").replace(/\s+/g, " ").trim();
    if (!text) {
      return {
        text: "",
        rows: [],
        error: {
          code: "pdf_text_empty",
          message: "The PDF opened, but no text could be extracted. Image-only summaries are not supported in V1.",
        },
      };
    }
    return { text, rows: allRows, error: null };
  } catch (err) {
    return {
      text: "",
      rows: [],
      error: {
        code: "pdf_parse_failed",
        message: `Could not read the PDF in this browser session (${err?.message || "unknown error"}).`,
      },
    };
  }
}

export async function parseUnifiedSummaryPdf(bytes) {
  const extracted = await extractPdfText(bytes);
  if (extracted.error) {
    return {
      ok: false,
      formatId: null,
      code: extracted.error.code,
      message: extracted.error.message,
      summary: null,
      text: extracted.text,
    };
  }
  const parsed = parseUnifiedSummaryText(extracted.text, extracted.rows);
  return { ...parsed, text: extracted.text };
}
