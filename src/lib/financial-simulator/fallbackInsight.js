import { formatInr, formatMonths } from "./format.js";

/**
 * Deterministic insight when AI is unavailable.
 * Natural phrasing from calculated metrics + light business context.
 * @param {{ businessContext: object, metrics: object, costMix?: object }} ctx
 */
export function buildFallbackInsight(ctx) {
  const m = ctx.metrics || {};
  const b = ctx.businessContext || {};
  const runway = m.runwayMonths;
  const status = m.healthStatus || "Attention required";
  const priority = b.mainPriority || "";
  const cashOut = m.cashOutMonth;

  const summary = buildSummary({ runway, status, cashOut, priority });
  const risks = buildRisks(m, ctx.costMix);
  const actions = buildActions(priority, cashOut);
  const priorityObservation = buildPriorityNote(priority, m);

  return {
    summary,
    keyRisks: risks.slice(0, 3),
    recommendedActions: actions.slice(0, 3),
    priorityObservation,
    source: "fallback",
  };
}

function buildSummary({ runway, status, cashOut, priority }) {
  const runwayLabel = formatMonths(runway);
  const hasCashOut = cashOut && cashOut !== "Beyond 24-month horizon";

  if (status === "Critical") {
    const timing = hasCashOut ? ` Cash is projected to run out around ${cashOut}.` : "";
    const raise =
      /fundrais/i.test(priority)
        ? " Fundraising preparation should begin immediately — the operating structure leaves limited time for a prolonged raise or delayed funding."
        : " Focus first on extending runway through cost timing, funding, or growth adjustments.";
    return `With ${runwayLabel} of projected runway, the outlook is critical.${timing}${raise}`;
  }

  if (status === "Attention required") {
    const timing = hasCashOut ? ` Watch the window around ${cashOut}.` : "";
    return `With ${runwayLabel} of projected runway, there is limited buffer for delays.${timing} Review burn and any planned funding so shortfalls are addressed before they tighten further.`;
  }

  if (status === "Stable") {
    return `With ${runwayLabel} of projected runway, the near-term cash position looks manageable. Use the next few quarters to pressure-test costs, hiring and funding assumptions before conditions change.`;
  }

  if (status === "Healthy") {
    return `With ${runwayLabel} of projected runway, cash looks comfortable across the forecast window. A clearer operating plan can still help you deploy that buffer intentionally across growth and hiring.`;
  }

  return `Your projection shows about ${runwayLabel} of runway. Review burn, funding timing and cost structure against the plan you want to run over the next few quarters.`;
}

function buildRisks(m, costMix) {
  const risks = [];
  const runway = m.runwayMonths;

  if (runway != null && runway < 12) {
    risks.push("Limited runway shortens the window to correct costs or close funding.");
  }
  if ((m.monthlyNetBurn || 0) > 0) {
    risks.push(`Net burn of about ${formatInr(m.monthlyNetBurn)} per month continues to draw down cash.`);
  }
  if ((costMix?.payrollPercentOfExpenses || 0) > 0.45) {
    risks.push("Payroll is a large share of operating spend, which can limit near-term flexibility.");
  }
  if (risks.length < 3) {
    risks.push("Simplified assumptions (no working capital or tax) may understate real cash needs.");
  }
  while (risks.length < 3) {
    risks.push("Revenue or cost growth differing from plan would change the cash timeline.");
  }
  return risks;
}

function buildActions(priority, cashOut) {
  const actions = [
    "Re-check the top expense lines against near-term hiring and growth plans.",
    cashOut && cashOut !== "Beyond 24-month horizon"
      ? `Align any planned funding with the projected shortfall around ${cashOut}.`
      : "Keep a clear view of funding runway even if cash-out sits beyond 24 months.",
  ];

  if (/fundrais/i.test(priority)) {
    actions.push("Build a fundraising timeline that starts well ahead of the projected cash-out month.");
  } else if (/runway|burn|cost/i.test(priority)) {
    actions.push("Identify two or three cost or timing changes that would extend runway within the next quarter.");
  } else if (/growth|revenue/i.test(priority)) {
    actions.push("Tie growth plans to cash impact so revenue gains do not outpace funding capacity.");
  } else {
    actions.push("Translate this projection into a short list of decisions for the next two quarters.");
  }

  return actions;
}

function buildPriorityNote(priority, m) {
  const margin =
    m.grossMarginPercent != null
      ? `${Number(m.grossMarginPercent).toFixed(1)}%`
      : null;

  if (/fundrais/i.test(priority)) {
    return margin
      ? `With fundraising in focus, treat runway and burn as the primary near-term controls (gross margin about ${margin}).`
      : "With fundraising in focus, treat runway and burn as the primary near-term controls.";
  }
  if (/runway|burn|cost/i.test(priority)) {
    return "Keep burn and cash timing at the centre of planning until the runway buffer is more comfortable.";
  }
  if (priority) {
    return `Keep decisions aligned with your stated priority while watching runway and burn as leading indicators.`;
  }
  return "Treat runway and burn efficiency as the primary near-term control metrics.";
}
