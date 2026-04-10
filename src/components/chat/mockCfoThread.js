/** Rich mock thread for empty sessions — replaced when real messages load. */

import { createCfoRichMessage, createTextMessage } from "./chatMessageTypes.js";

function isoMinutesAgo(mins) {
  return new Date(Date.now() - mins * 60 * 1000).toISOString();
}

export const MOCK_CFO_DISPLAY_MESSAGES = [
  createTextMessage({
    id: "mock-cfo-u1",
    role: "user",
    content: "Why did burn increase this month?",
    created_at: isoMinutesAgo(95),
  }),
  createCfoRichMessage({
    id: "mock-cfo-a1",
    created_at: isoMinutesAgo(94),
    cfoBlocks: {
      lead:
        "I analyzed your March MIS and bank feed. Burn increased by approximately 7% compared to last month, driven mainly by hiring costs, marketing spend, and slower collections.",
      bullets: [
        "Hiring costs increased",
        "Marketing spend increased",
        "Collections slowed relative to sales",
      ],
      warning: "Burn is rising faster than revenue this month.",
      metrics: [
        { label: "Hiring", value: "+₹8L" },
        { label: "Marketing", value: "+₹5L" },
        { label: "Collections impact", value: "-₹3L" },
      ],
      actions: [
        "Review collections with sales team",
        "Slow discretionary marketing spend",
        "Re-evaluate hiring plan",
      ],
    },
  }),
  createTextMessage({
    id: "mock-cfo-u2",
    role: "user",
    content: "What should we do next?",
    created_at: isoMinutesAgo(40),
  }),
  createCfoRichMessage({
    id: "mock-cfo-a2",
    created_at: isoMinutesAgo(39),
    cfoBlocks: {
      lead:
        "Treat this as a cash-control week: tighten collections, slow discretionary spend, and re-check hiring against runway before you model downside cases for the board.",
      bullets: [
        "Collections: prioritize aged receivables with sales; set weekly cash-in targets on the top accounts affecting DSO.",
        "Discretionary spending: pause non-core marketing tests and defer vendor scope that is not revenue-tied in the next 60 days.",
        "Hiring: review open reqs against FY26 plan — defer net-new roles unless they unlock revenue within two months.",
        "Runway: run a downside model (flat revenue and revenue −10%) with current burn to surface triggers and timing for corrective action.",
      ],
      closing:
        "I can package this as a one-page exec brief with scenario tables and investor talking points when you are ready.",
    },
  }),
];
