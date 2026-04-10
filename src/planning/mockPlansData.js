/** Demo-only plans for Planning > Plans. */

export const PLANS_SUMMARY = {
  activeCount: 4,
  inReviewCount: 2,
  runwayImpactLabel: "+3.5 months",
};

export const MOCK_CFO_PLANS = [
  {
    id: "plan-burn-15",
    title: "Reduce burn by 15%",
    objective: "Extend runway by reducing discretionary spend while protecting core delivery.",
    expectedImpact: "+2.5 months runway",
    actions: [
      "Freeze non-essential hiring",
      "Reduce paid marketing by 20%",
      "Renegotiate top vendor contracts",
    ],
    linkedAssumptions: ["Hiring plan", "Marketing budget"],
    linkedScenarios: ["Downside preview"],
    linkedModels: ["Burn model", "Runway projection"],
    status: "Draft",
    owner: "CFO team",
    notes:
      "Prioritize vendors representing >60% of non-payroll spend. Align with leadership on hiring freeze scope and duration.",
  },
  {
    id: "plan-hiring-mod",
    title: "Hiring moderation plan",
    objective: "Align headcount growth with cash runway and revenue confidence over the next two quarters.",
    expectedImpact: "+1.2 months runway",
    actions: [
      "Defer non-critical roles by one quarter",
      "Shift two roles to contract-to-hire",
      "Re-baseline sales capacity vs pipeline",
    ],
    linkedAssumptions: ["Hiring plan", "Revenue growth"],
    linkedScenarios: ["Base case", "Slow hiring preview"],
    linkedModels: ["Burn model", "Revenue model"],
    status: "In review",
    owner: "CFO + People",
    notes:
      "Tie moderation to milestone-based unlocks so the org sees a clear path back to full hiring pace.",
  },
  {
    id: "plan-collections",
    title: "Collections acceleration plan",
    objective: "Improve cash conversion by tightening invoicing, follow-ups, and large-debtor focus.",
    expectedImpact: "+0.8 months runway (cash timing)",
    actions: [
      "Weekly AR aging review with sales leads",
      "Stricter payment terms on new enterprise deals",
      "Dedicated follow-up for top 10 debtors",
    ],
    linkedAssumptions: ["Revenue growth (collections)"],
    linkedScenarios: ["—"],
    linkedModels: ["Cash flow model"],
    status: "In review",
    owner: "Finance ops",
    notes:
      "Cash timing improvements do not replace structural burn work — pair with burn plan for full effect.",
  },
  {
    id: "plan-fundraising",
    title: "Fundraising readiness plan",
    objective: "Prepare materials, narrative, and metrics for the next funding conversation on a defined timeline.",
    expectedImpact: "Strategic — runway buffer if closed",
    actions: [
      "Finalize investor deck and data room index",
      "Align runway story with scenario previews",
      "Schedule partner dry-runs",
    ],
    linkedAssumptions: ["Revenue growth", "Hiring plan", "FX"],
    linkedScenarios: ["Base case", "Upside preview"],
    linkedModels: ["Revenue model", "Runway projection", "Cash flow model"],
    status: "Draft",
    owner: "CFO + CEO",
    notes:
      "Use scenario previews to show how assumptions flow into runway — investors expect consistency between planning and narrative.",
  },
];
