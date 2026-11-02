/**
 * Live Ask WYZ client for Marketplace Intelligence.
 * Posts verified evidence to the public NVIDIA NIM proxy; falls back to guided answers.
 */

import { presentAskExplanation, REPORT_CURRENCY } from "./askPresentation.js";
import { buildAskPayload } from "./evidence.js";
import { ASK_WYZ_DISCLOSURE_LIVE, investigate } from "./investigations.js";

export const MARKETPLACE_ASK_ENDPOINT = "/api/marketplace-ask";
export const ASK_REQUEST_TIMEOUT_MS = 45000;

function mapLiveResponse(payload, guided, context) {
  const presented = presentAskExplanation({
    aiExplanation: payload?.explanation,
    guidedAnswer: guided.answer,
    currency: payload?.currency || guided.currency || REPORT_CURRENCY,
    question: guided.question,
    source: payload?.source === "ai" ? "ai" : "guided",
  });

  const followUps = Array.isArray(payload?.followUps)
    ? payload.followUps.map((item) => String(item).slice(0, 160)).filter(Boolean).slice(0, 4)
    : [];
  const limitations = [
    ...(Array.isArray(payload?.limitations)
      ? payload.limitations.map((item) => String(item).slice(0, 220)).filter(Boolean).slice(0, 6)
      : []),
    ...(presented.limitationsExtra || []),
  ].slice(0, 6);
  const chartRefs = Array.isArray(payload?.chartRefs)
    ? payload.chartRefs.map((item) => String(item).slice(0, 40)).filter(Boolean).slice(0, 4)
    : context.chartId
      ? [context.chartId]
      : [];

  const liveAccepted = presented.source === "ai" && payload?.source === "ai" && !presented.liveRejected;

  return {
    mode: liveAccepted ? "live_nvidia_nim" : "deterministic_guided",
    liveModel: liveAccepted,
    status: presented.explanation ? "answered" : "error",
    disclosure: ASK_WYZ_DISCLOSURE_LIVE,
    question: guided.question,
    context: guided.context,
    answer: presented.explanation || "Ask WYZ could not produce an answer for this question.",
    evidence: guided.evidence || [],
    limitations: limitations.length ? limitations : undefined,
    followUps,
    chartRefs,
    provider: liveAccepted ? payload?.provider || null : null,
    model: liveAccepted ? payload?.model || null : null,
    source: presented.source,
    currency: REPORT_CURRENCY,
    fallbackReason: presented.fallbackReason,
    liveRejected: Boolean(presented.liveRejected),
  };
}

/**
 * Ask with live model when available; always grounds numbers in investigate().
 */
export async function askMarketplaceWyz({
  question,
  context,
  metrics,
  reconciliation = null,
  history = [],
  fetchImpl = globalThis.fetch,
  endpoint = MARKETPLACE_ASK_ENDPOINT,
  timeoutMs = ASK_REQUEST_TIMEOUT_MS,
} = {}) {
  const guided = investigate(question, context, metrics, reconciliation);
  if (guided.status !== "answered") {
    return guided;
  }

  const wire = buildAskPayload({
    question,
    metrics,
    reconciliation,
    context: guided.context,
    guided,
    history,
  });

  if (typeof fetchImpl !== "function") {
    return {
      ...guided,
      disclosure: ASK_WYZ_DISCLOSURE_LIVE,
      source: "guided",
      currency: REPORT_CURRENCY,
    };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(wire),
      signal: controller?.signal,
    });

    if (!res.ok) {
      if (res.status === 429) {
        return {
          ...guided,
          disclosure: ASK_WYZ_DISCLOSURE_LIVE,
          source: "guided",
          liveModel: false,
          mode: "deterministic_guided",
          status: "rate_limited",
          currency: REPORT_CURRENCY,
          answer: `${guided.answer} (Live Ask WYZ is temporarily rate-limited; showing the calculated investigation instead.)`,
          followUps: guided.followUps || [],
        };
      }
      return {
        ...guided,
        disclosure: ASK_WYZ_DISCLOSURE_LIVE,
        source: "guided",
        liveModel: false,
        mode: "deterministic_guided",
        currency: REPORT_CURRENCY,
        status: "provider_error",
        followUps: guided.followUps || [],
      };
    }

    const payload = await res.json();
    const mapped = mapLiveResponse(payload, guided, guided.context);
    if (!mapped.followUps?.length && guided.followUps?.length) {
      mapped.followUps = guided.followUps;
    }
    return mapped;
  } catch {
    return {
      ...guided,
      disclosure: ASK_WYZ_DISCLOSURE_LIVE,
      source: "guided",
      liveModel: false,
      mode: "deterministic_guided",
      currency: REPORT_CURRENCY,
      status: "network_error",
      followUps: guided.followUps || [],
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
