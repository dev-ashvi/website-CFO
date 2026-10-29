/**
 * Stage 3.1 live NVIDIA validation helper.
 * Reports blocked status when credentials are missing.
 * Never prints API key values.
 *
 * Usage:
 *   node scripts/validate-marketplace-ask-live.mjs
 *   MARKETPLACE_ASK_URL=http://127.0.0.1:3000/api/marketplace-ask node scripts/validate-marketplace-ask-live.mjs
 */
import { createMarketplaceSession, requestSampleDataset, runMarketplaceEngine, buildAskPayload, investigate } from "../src/lib/marketplace-intelligence/index.js";

function keyPresent(name) {
  const value = process.env[name];
  return Boolean(value && String(value).trim());
}

function reportEnv() {
  const keys = [
    "WYZ_AI_CFO_API_KEY",
    "NVIDIA_API_KEY",
    "WYZ_NVIDIA_API_KEY",
    "WYZ_AI_CFO_MODEL",
    "WYZ_MARKETPLACE_ASK_MODEL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  return Object.fromEntries(keys.map((name) => [name, keyPresent(name) ? "present" : "missing"]));
}

async function main() {
  const env = reportEnv();
  const hasNvidia = env.WYZ_AI_CFO_API_KEY === "present" || env.NVIDIA_API_KEY === "present" || env.WYZ_NVIDIA_API_KEY === "present";
  const endpoint = process.env.MARKETPLACE_ASK_URL || "http://127.0.0.1:3000/api/marketplace-ask";

  console.log(JSON.stringify({
    stage: "3.1",
    endpoint,
    credentials: env,
    liveInferencePossible: hasNvidia,
  }, null, 2));

  if (!hasNvidia) {
    console.log(JSON.stringify({
      status: "blocked",
      reason: "NVIDIA credentials unavailable in this environment",
      note: "Do not claim successful live inference. Set WYZ_AI_CFO_API_KEY or NVIDIA_API_KEY, then run via vercel dev.",
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const sample = requestSampleDataset(createMarketplaceSession());
  const engine = await runMarketplaceEngine(sample.session);
  const question = "Where is Amazon taking the money?";
  const guided = investigate(question, { sectionId: "amazon_economics" }, engine.metrics, engine.reconciliation);
  const payload = buildAskPayload({
    question,
    metrics: engine.metrics,
    reconciliation: engine.reconciliation,
    context: guided.context,
    guided,
  });

  const started = Date.now();
  let response;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const latencyMs = Date.now() - started;
    const body = await res.json();
    response = {
      status: res.status,
      latencyMs,
      source: body.source || null,
      provider: body.provider || null,
      model: body.model || null,
      explanationPreview: String(body.explanation || "").slice(0, 240),
      hasFollowUps: Array.isArray(body.followUps) && body.followUps.length > 0,
    };
  } catch (err) {
    response = {
      status: "error",
      latencyMs: Date.now() - started,
      error: err?.name === "AbortError" ? "timeout" : "fetch_failed",
      message: String(err?.message || "request_failed").slice(0, 120),
    };
  }

  console.log(JSON.stringify({ liveResult: response }, null, 2));
  if (response.source !== "ai") process.exitCode = 1;
}

main();
