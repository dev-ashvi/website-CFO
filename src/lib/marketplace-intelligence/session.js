/**
 * Browser-session workspace for Marketplace Intelligence.
 * File bytes live on this object only. Nothing here writes to web storage,
 * the network, or the site's static assets.
 */
import { classifyUpload, SOURCE_SLOTS } from "./formats.js";
import { emptyAnalysis } from "./schema.js";
import { buildSampleDataset } from "./sampleDataset.js";

export const SESSION_PERSISTENCE = "memory";
export const MARKETPLACE_INTELLIGENCE_PATH = "/marketplace-intelligence";

function createId() {
  if (globalThis.crypto?.randomUUID) return `mi_${globalThis.crypto.randomUUID()}`;
  return `mi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createMarketplaceSession() {
  return {
    id: createId(),
    persistence: SESSION_PERSISTENCE,
    mode: "empty",
    files: {
      transactionsCsv: null,
      unifiedSummaryPdf: null,
    },
    sampleDataset: null,
    analysis: emptyAnalysis(),
  };
}

function fileRecord(file, classification) {
  return {
    fileName: String(file.name || "").slice(0, 240),
    byteLength: file.bytes?.byteLength ?? file.byteLength,
    mediaType: String(file.mediaType || ""),
    bytes: file.bytes || null,
    formatId: classification.formatId,
    validation: classification.validation,
    detection: classification.detection,
    parsed: false,
  };
}

/**
 * @param {ReturnType<typeof createMarketplaceSession>} session
 * @param {{ name: string, byteLength?: number, mediaType?: string, bytes?: Uint8Array }} file
 */
export function attachSourceFile(session, file) {
  const classification = classifyUpload({
    name: file?.name,
    byteLength: file?.bytes?.byteLength ?? file?.byteLength,
  });
  if (!classification.accepted) {
    return { session, error: classification, classification };
  }
  if (!file?.bytes || typeof file.bytes.byteLength !== "number") {
    return {
      session,
      classification,
      error: {
        accepted: false,
        code: "missing_bytes",
        message: "The file could not be read into this session.",
      },
    };
  }

  const next = {
    ...session,
    persistence: SESSION_PERSISTENCE,
    mode: "upload",
    sampleDataset: null,
    files: {
      ...session.files,
      [classification.slot]: fileRecord(file, classification),
    },
    analysis: emptyAnalysis(),
  };
  return { session: next, error: null, classification };
}

export function detachSourceFile(session, slot) {
  if (!Object.values(SOURCE_SLOTS).includes(slot)) {
    return session;
  }
  const current = session.files[slot];
  if (current) current.bytes = null;
  const files = { ...session.files, [slot]: null };
  const mode = files.transactionsCsv || files.unifiedSummaryPdf ? "upload" : "empty";
  return { ...session, files, mode, sampleDataset: null, analysis: emptyAnalysis() };
}

export function releaseSession(session) {
  for (const slot of Object.values(SOURCE_SLOTS)) {
    const file = session?.files?.[slot];
    if (file) file.bytes = null;
  }
  return createMarketplaceSession();
}

export function fileSummary(file) {
  if (!file) return null;
  return {
    fileName: file.fileName,
    byteLength: file.byteLength,
    formatId: file.formatId,
    validation: file.validation,
    detection: file.detection,
    parsed: file.parsed === true,
  };
}

/** Safe to render or log. Omits file bytes and any calculated financial values. */
export function sessionSummary(session) {
  return {
    id: session?.id || null,
    persistence: SESSION_PERSISTENCE,
    mode: session?.mode || "empty",
    files: {
      transactionsCsv: fileSummary(session?.files?.transactionsCsv),
      unifiedSummaryPdf: fileSummary(session?.files?.unifiedSummaryPdf),
    },
    analysisStatus: session?.analysis?.status || "not_calculated",
    sampleId: session?.sampleDataset?.id || null,
  };
}

export function requestSampleDataset(session = createMarketplaceSession()) {
  const sample = buildSampleDataset();
  return {
    ok: true,
    code: "sample_loaded",
    mode: "sample",
    message: "Loaded anonymized sample data. This is not a client dataset.",
    session: {
      ...session,
      mode: "sample",
      sampleDataset: sample,
      files: { transactionsCsv: null, unifiedSummaryPdf: null },
      analysis: emptyAnalysis(),
    },
  };
}
