import { formatMoney, formatMonths, formatPercent } from "./format.js";

export const ASK_AI_PROMPTS = [
  { id: "why-runway", label: "Why is my runway only this long?" },
  { id: "reach-12", label: "How do I reach 12 months of runway?" },
  { id: "hire-5", label: "Can I afford 5 more engineers?" },
  { id: "fundraise-slip", label: "What if fundraising slips by 4 months?" },
  { id: "double-marketing", label: "What if I double marketing?" },
];

/**
 * Deterministic conversational answers from projection outputs (no invented figures).
 * @param {string} promptId
 * @param {{ months: object[], kpis: object, inputs?: object }} sim
 * @param {string} [customQuestion]
 */
export function answerAskAiCfo(promptId, sim, customQuestion = "") {
  const k = sim?.kpis || {};
  const months = sim?.months || [];
  const runway = k.runwayMonths;
  const burn = k.avgMonthlyNetBurn;
  const cashOut = k.cashOutMonthLabel;
  const gm = k.avgGrossMargin;
  const mix = k.expenseMix || {};
  const largest = mix.largestExpenseCategoryLabel ?? mix.largestExpenseCategory ?? "operating costs";
  const varPct = Math.round(
    ((mix.variableSharePercent ?? mix.variableExpensePercent) || 0) * 100,
  );
  const fixPct = Math.round(((mix.fixedSharePercent ?? mix.fixedExpensePercent) || 0) * 100);
  const payroll = average(months.map((m) => m.payroll));
  const marketing = average(months.map((m) => m.salesAndMarketing));
  const currency = sim?.inputs?.currency;
  const money = (v) => formatMoney(v, { currency, compact: true });
  const q = String(customQuestion || "").toLowerCase();

  const id =
    promptId ||
    (q.includes("engineer") || q.includes("hire")
      ? "hire-5"
      : q.includes("fundrais") || q.includes("slip")
        ? "fundraise-slip"
        : q.includes("market")
          ? "double-marketing"
          : q.includes("12")
            ? "reach-12"
            : "why-runway");

  if (id === "reach-12") {
    const gap = runway == null ? null : Math.max(0, round1(12 - runway));
    return {
      question: "How do I reach 12 months of runway?",
      answer:
        gap == null || gap <= 0
          ? `Your projected runway is already ${formatMonths(runway)} — at or above a 12-month buffer on the current model.`
          : `You are about ${gap} months short of a 12-month buffer (now ${formatMonths(runway)}). The model points to three levers: raise funding before ${cashOut}, cut the largest expense line (${largest}), or improve gross margin from ${formatPercent(gm, 0)}. Use the What-if cards above to quantify each lever without leaving this page.`,
    };
  }

  if (id === "hire-5") {
    const extraMonthly = payroll > 0 ? payroll * 0.25 : 250_000; // rough 5 junior seats vs current payroll base — labeled as estimate from payroll scale
    const monthsAffordable =
      burn > 0 && k.twelveMonthClosingCash != null
        ? null
        : null;
    void monthsAffordable;
    return {
      question: "Can I afford 5 more engineers?",
      answer: `On the current plan, average payroll is ${money(payroll)}/month and net burn is ${money(burn)}/month with runway of ${formatMonths(runway)}. Adding a material hiring cohort increases fixed burn and usually shortens runway unless matched by revenue or funding. Run the Investor Case scenario (faster growth + raise + hiring) or Raise funding in What-if to see the trade-off on this same model.`,
    };
  }

  if (id === "fundraise-slip") {
    return {
      question: "What if fundraising slips by 4 months?",
      answer: `Expected cash-out on the base plan is ${cashOut}. If equity arrives later than planned, the including-CapEx cash path is the binding constraint — delay funding and you compress the window before ${cashOut}. Compare CapEx including vs excluding on the Closing cash chart, then use Raise funding in What-if to test an earlier or larger raise.`,
    };
  }

  if (id === "double-marketing") {
    return {
      question: "What if I double marketing?",
      answer: `Sales & marketing currently averages ${money(marketing)}/month (${varPct}% of operating mix is variable overall). Doubling marketing raises near-term cash outflows before revenue responds. Prefer the Aggressive scenario or Grow revenue What-if to see growth vs burn; treat a pure marketing double as a stress case unless CAC payback is already proven.`,
    };
  }

  // why-runway default
  const planned = k.plannedFunding;
  const before = k.runwayBeforePlannedFundingMonths;
  const fundingLine =
    planned?.hasFutureFunding && before != null
      ? ` Projected runway is ${formatMonths(k.projectedRunwayMonths ?? runway)} assuming planned financing of ${money(planned.totalAmount)} arrives; without that financing, runway is approximately ${formatMonths(before)}.`
      : "";
  return {
    question: "Why is my runway only this long?",
    answer: `Runway is ${formatMonths(runway)} because cash is drawn down by net burn of about ${money(burn)}/month, with expected cash-out at ${cashOut}. Expense mix is roughly ${varPct}% variable / ${fixPct}% fixed, led by ${largest}. Gross margin averages ${formatPercent(gm, 0)}.${fundingLine} Those are the same drivers behind the Cash Flow Intelligence cards — change an assumption there and runway updates consistently across the dashboard.`,
  };
}

function average(arr) {
  if (!arr?.length) return 0;
  return arr.reduce((a, b) => a + (Number(b) || 0), 0) / arr.length;
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}
