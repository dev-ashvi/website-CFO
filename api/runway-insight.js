/** Vercel serverless — keep self-contained (no src imports). */

const SYSTEM_PROMPT = `You are the financial insight layer for WYZ, an AI CFO platform.

Explain only the supplied calculated results and business context.

Do not calculate new financial figures.
Do not change or contradict supplied metrics.
Do not invent industry benchmarks.
Do not claim certainty.
Do not provide legal, tax, investment or accounting advice.
Do not recommend a specific fundraising amount unless it has been calculated and supplied.
Keep the response practical, specific and concise.
Use the business industry, startup stage, stated priority and expenseMix to personalize the explanation.
You may describe the expense mix (variable vs fixed share, largest category) but must not calculate new figures.
Return valid JSON matching the required schema with keys: summary, keyRisks (array of 3 strings), recommendedActions (array of 3 strings), priorityObservation.`;

function buildFallbackInsight(ctx) {
  const m = ctx?.metrics || {};
  const b = ctx?.businessContext || {};
  const runway = m.runwayMonths;
  const status = m.healthStatus || "Attention required";
  const priority = b.mainPriority || "extend runway";
  const industry = b.industry || "your industry";
  const stage = b.startupStage || "this stage";

  return {
    summary: `Your estimated runway is ${runway != null ? `${runway} months` : "unavailable"}. Based on the current projection, status is “${status}”${
      m.cashOutMonth && m.cashOutMonth !== "Beyond 24-month horizon"
        ? ` with cash potentially running out around ${m.cashOutMonth}`
        : " without a cash-out inside the 24-month window"
    }. As a ${stage} ${industry} business focused on “${priority}”, review the largest expense categories and whether planned funding arrives before any cash shortfall.`,
    keyRisks: [
      runway != null && runway < 12
        ? "Limited runway compresses the window for fundraising or cost correction."
        : "Plan variance versus assumptions can change cash timing.",
      m.monthlyNetBurn > 0
        ? "Ongoing net burn continues to draw down cash."
        : "Watch expense growth even when burn is currently low.",
      "Simplified assumptions (no working capital or tax) may understate real cash needs.",
    ],
    recommendedActions: [
      "Re-check the top three expense lines against near-term hiring and growth plans.",
      "Align any planned funding month with the projected cash-out window.",
      `Prioritize actions that support “${priority}” within the next two quarters.`,
    ],
    priorityObservation: `Given your goal to ${String(priority).toLowerCase()}, treat runway and burn efficiency as the primary near-term control metrics.`,
    source: "fallback",
  };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error("body_too_large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.WYZ_OPENAI_API_KEY;
  if (!apiKey) {
    json(res, 200, buildFallbackInsight(payload));
    return;
  }

  try {
    const model = process.env.WYZ_INSIGHT_MODEL || "gpt-4o-mini";
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Business context and calculated metrics:\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      }),
    });

    if (!upstream.ok) {
      console.error("[runway-insight] provider status", upstream.status);
      json(res, 200, buildFallbackInsight(payload));
      return;
    }

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      json(res, 200, buildFallbackInsight(payload));
      return;
    }

    json(res, 200, {
      summary: String(parsed.summary || ""),
      keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks.slice(0, 3).map(String) : [],
      recommendedActions: Array.isArray(parsed.recommendedActions)
        ? parsed.recommendedActions.slice(0, 3).map(String)
        : [],
      priorityObservation: String(parsed.priorityObservation || ""),
      source: "ai",
    });
  } catch (err) {
    console.error("[runway-insight] error", err?.message || err);
    json(res, 200, buildFallbackInsight(payload));
  }
}
