/**
 * V1 accepts two report slots. Extension checks are not format validation.
 * Column detection for the supplied Amazon exports belongs in ingestion.
 */

export const SOURCE_SLOTS = {
  transactionsCsv: "transactionsCsv",
  unifiedSummaryPdf: "unifiedSummaryPdf",
};

const MB = 1024 * 1024;

export const SOURCE_LIMITS = {
  transactionsCsv: 40 * MB,
  unifiedSummaryPdf: 20 * MB,
};

export const SUPPORTED_FORMATS = [
  {
    id: "amazon_transaction_csv_v1",
    platform: "amazon",
    slot: SOURCE_SLOTS.transactionsCsv,
    label: "Amazon transaction CSV",
    extensions: [".csv"],
    detection: "pending",
    note: "V1 will recognise the transaction CSV supplied for this engagement. A .csv extension is not proof of that format.",
  },
  {
    id: "amazon_unified_summary_pdf_v1",
    platform: "amazon",
    slot: SOURCE_SLOTS.unifiedSummaryPdf,
    label: "Amazon Unified Summary PDF",
    extensions: [".pdf"],
    detection: "pending",
    note: "Used for settlement reconciliation. A .pdf extension is not proof of the Unified Summary layout.",
  },
];

export function fileExtension(name) {
  const lower = String(name || "").trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot <= 0) return "";
  return lower.slice(dot);
}

/**
 * @param {{ name?: string, byteLength?: number }} file
 */
export function classifyUpload(file) {
  const ext = fileExtension(file?.name);
  const matches = SUPPORTED_FORMATS.filter((format) => format.extensions.includes(ext));
  if (matches.length !== 1) {
    return {
      accepted: false,
      code: "unsupported_report",
      message: "Upload an Amazon transaction CSV or an Amazon Unified Summary PDF. Other report formats are not supported in V1.",
    };
  }

  const format = matches[0];
  const byteLength = Number(file?.byteLength);
  const maxBytes = SOURCE_LIMITS[format.slot];
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    return {
      accepted: false,
      code: "empty_file",
      slot: format.slot,
      formatId: format.id,
      message: "The file is empty.",
    };
  }
  if (byteLength > maxBytes) {
    return {
      accepted: false,
      code: "file_too_large",
      slot: format.slot,
      formatId: format.id,
      message: `This ${format.label} is larger than ${Math.round(maxBytes / MB)} MB. It was not kept in the session.`,
    };
  }

  return {
    accepted: true,
    code: "extension_accepted",
    slot: format.slot,
    formatId: format.id,
    validation: "extension_only",
    detection: "pending",
    message: `${format.label} accepted by file type. Structure validation runs next before metrics are shown.`,
  };
}
