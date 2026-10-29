/**
 * Source normalization boundary.
 * CSV drives analytics. PDF enriches reconciliation and is optional.
 */
import { normalizeAmazonCsvText, decodeUtf8 } from "./normalize.js";
import { parseUnifiedSummaryPdf } from "./pdfSummary.js";

export async function normalizeSources(session) {
  const csv = session?.files?.transactionsCsv || null;
  const pdf = session?.files?.unifiedSummaryPdf || null;
  const issues = [];

  if (!csv?.bytes && session?.mode !== "sample") {
    return {
      layer: "ingestion",
      status: "missing_csv",
      platform: "amazon",
      transactions: [],
      summary: null,
      issues: [
        {
          code: "missing_transaction_csv",
          message: "An Amazon transaction CSV is required before metrics can be calculated.",
        },
      ],
      period: null,
      missingInputs: [],
      sessionId: session?.id || null,
    };
  }

  let csvResult;
  if (session?.mode === "sample" && session?.sampleDataset) {
    csvResult = normalizeAmazonCsvText(session.sampleDataset.csvText);
  } else {
    csvResult = normalizeAmazonCsvText(decodeUtf8(csv.bytes));
  }

  if (!csvResult.ok) {
    return {
      layer: "ingestion",
      status: "csv_rejected",
      platform: "amazon",
      transactions: [],
      summary: null,
      issues: csvResult.issues,
      period: null,
      missingInputs: csvResult.missingInputs,
      sessionId: session?.id || null,
    };
  }

  if (csv) {
    csv.parsed = true;
    csv.detection = "recognised";
    csv.formatId = csvResult.formatId;
  }

  let summary = null;
  if (pdf?.bytes) {
    const pdfResult = await parseUnifiedSummaryPdf(pdf.bytes);
    if (!pdfResult.ok) {
      issues.push({
        code: pdfResult.code,
        message: pdfResult.message,
      });
    } else {
      summary = pdfResult.summary;
      pdf.parsed = true;
      pdf.detection = "recognised";
      pdf.formatId = pdfResult.formatId;
    }
  } else if (session?.mode === "sample" && session?.sampleDataset?.summary) {
    summary = session.sampleDataset.summary;
  } else {
    issues.push({
      code: "missing_unified_summary",
      message:
        "The Unified Summary PDF is optional for analytics. Settlement reconciliation stays unreconciled until it is provided.",
    });
  }

  issues.push(...(csvResult.issues || []));

  return {
    layer: "ingestion",
    status: "ready",
    platform: "amazon",
    formatId: csvResult.formatId,
    transactions: csvResult.transactions,
    summary,
    issues,
    period: csvResult.period,
    missingInputs: csvResult.missingInputs,
    sessionId: session?.id || null,
  };
}
