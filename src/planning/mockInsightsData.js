/** Demo-only insights catalog for Planning > Insights. */

/** Set to `true` to preview the empty state (no insights). */
export const INSIGHTS_DEMO_EMPTY_STATE = false;

export const INSIGHTS_SUMMARY = {
  activeSignals: 6,
  risksFlagged: 3,
  opportunitiesIdentified: 2,
  suggestedActions: 4,
};

export const INSIGHTS_TRUST_NOTE =
  "These insights help surface what matters most before you adjust plans or commit changes.";

/** Workspace-level context for page header “Discuss with AI”. */
export const INSIGHTS_PAGE_AI_OVERVIEW = {
  title: "Planning insights",
  description:
    "Signals, risks, and opportunities synthesized from your assumptions, scenarios, and financial models — prioritized for decisions, not raw charts.",
  whyItMatters:
    "Use this view to align finance, leadership, and the board on what to watch and what to do next without leaving the planning workspace.",
  linkedAssumptions: ["Revenue growth", "Hiring plan", "Collections cadence", "FX (reporting)"],
  linkedScenarios: ["Baseline", "Downside", "Hiring moderation", "Revenue upside"],
  linkedModels: ["Revenue model", "Burn model", "Runway projection", "Cash flow model"],
  suggestedNextStep: "Review key signals, then open Scenarios or Plans to stress-test or operationalize.",
};

/** 1–2 hero items above Key signals — decision-first framing. */
export const TOP_PRIORITY_ITEMS = [
  {
    id: "top-runway-downside",
    title: "Runway risk emerging in downside scenario",
    narrative:
      "Under slower revenue and steady burn, runway approaches twelve months within the modeled horizon. The path is still recoverable, but the window for leadership alignment is narrowing.\n\nDecide soon whether to moderate hiring, tighten discretionary spend, or refresh the revenue narrative before the next board cycle.",
    whyItMatters:
      "Acting now preserves optionality; waiting pushes you into reactive decisions with less cash cushion.",
    category: "Runway",
    severity: "High",
    explanation:
      "Downside case combines softer conversion with a cost base that has not yet adjusted — runway compression is the dominant outcome.",
    description:
      "The downside scenario stacks revenue softness against a hiring and spend profile built for faster growth. Cash outflows remain elevated while inflows lag, which shows up as a steeper runway slope than baseline.",
    linkedAssumptions: ["Revenue growth", "Hiring plan", "Pipeline conversion"],
    linkedScenarios: ["Downside", "Baseline", "Hiring moderation"],
    linkedModels: ["Runway projection", "Cash flow model", "Burn model"],
    suggestedNextStep: "Open the downside scenario, align on triggers, and convert the chosen mitigation into a plan.",
  },
  {
    id: "top-burn-revenue",
    title: "Burn is outpacing revenue in the baseline path",
    narrative:
      "Month-over-month burn growth is exceeding recognized revenue growth. That gap widens liquidity risk even before you stress-test downside cases.\n\nFinance and operators should agree on which cost levers are reversible in the next sixty days versus which are committed.",
    whyItMatters:
      "Small gaps compound — boards read this pattern as loss of operating discipline unless you explain the bridge.",
    category: "Burn",
    severity: "High",
    explanation:
      "Hiring and program spend are landing faster than revenue recognition and collections timing can support.",
    description:
      "The burn model reflects committed payroll ramps and vendor spend while the revenue model assumes steady conversion. When both are viewed together, cash consumption leads the P&L story.",
    linkedAssumptions: ["Hiring plan", "Revenue growth"],
    linkedScenarios: ["Baseline", "Downside"],
    linkedModels: ["Burn model", "Revenue model"],
    suggestedNextStep: "Pair a hiring moderation scenario with discretionary review, then document the bridge for leadership.",
  },
];

export const RISK_OPPORTUNITY_SUBTITLE = "Where value is at risk vs where it can be unlocked";

export const RISK_OPPORTUNITY_NET_OUTLOOK =
  "Net outlook: Slightly risk-heavy due to burn trajectory — opportunities in hiring moderation and collections can rebalance if executed quickly.";

export const SCENARIO_INSIGHTS_SUBTITLE = "What changes outcomes the most";

export const SCENARIO_DECISION_STRIP = {
  biggestDriver: "Revenue growth",
  biggestRisk: "Hiring ramp",
  bestLever: "Hiring moderation",
};

export const KEY_SIGNALS = [
  {
    id: "sig-burn-revenue",
    title: "Burn is increasing faster than revenue",
    explanation: "Month-over-month burn growth is outpacing recognized revenue growth in the current baseline path.",
    category: "Burn",
    severity: "High",
    description:
      "Operating spend and hiring assumptions are pulling cash consumption ahead of revenue recognition timing.",
    whyItMatters:
      "If this pattern holds, runway compresses faster than leadership may expect from headline revenue alone.",
    linkedAssumptions: ["Hiring plan", "Revenue growth"],
    linkedScenarios: ["Baseline", "Downside"],
    linkedModels: ["Burn model", "Revenue model"],
    suggestedNextStep: "Stress downside revenue and moderate hiring in Scenarios, then convert the strongest lever to a plan.",
  },
  {
    id: "sig-runway-downside",
    title: "Runway drops below 12 months in downside scenario",
    explanation: "Under slower revenue and steady burn, runway falls under a year within the modeled horizon.",
    category: "Runway",
    severity: "High",
    description:
      "The downside case combines softer bookings conversion with unchanged cost structure.",
    whyItMatters:
      "Boards and lenders often watch sub-twelve-month runway closely; narrative and contingency planning should be ready.",
    linkedAssumptions: ["Revenue growth", "Pipeline conversion"],
    linkedScenarios: ["Downside", "Baseline"],
    linkedModels: ["Runway projection", "Cash flow model"],
    suggestedNextStep: "Open the downside scenario, then prepare a concise board storyline with mitigations.",
  },
  {
    id: "sig-revenue-hiring",
    title: "Revenue growth is highly sensitive to hiring slowdown",
    explanation: "Capacity and GTM hiring assumptions explain a large share of twelve-month revenue variance.",
    category: "Revenue",
    severity: "Medium",
    description:
      "The revenue model ties pipeline and ramp to headcount; delays in hiring move the forecast materially.",
    whyItMatters:
      "Trade-offs between growth and runway should be explicit — hiring is both a cost and a growth driver here.",
    linkedAssumptions: ["Hiring plan", "Revenue growth"],
    linkedScenarios: ["Hiring moderation", "Baseline"],
    linkedModels: ["Revenue model", "Burn model"],
    suggestedNextStep: "Compare baseline vs hiring moderation side by side before locking the next hiring wave.",
  },
  {
    id: "sig-collections",
    title: "Collections timing is improving, but uneven",
    explanation: "Weighted DSO has improved in aggregate while a subset of large contracts remains lumpy.",
    category: "Collections",
    severity: "Medium",
    description:
      "Cash inflows are trending better than last quarter, but concentration in a few accounts creates timing risk.",
    whyItMatters:
      "Near-term liquidity can swing on a handful of collections — worth monitoring alongside runway charts.",
    linkedAssumptions: ["Collections cadence", "Revenue recognition"],
    linkedScenarios: ["Baseline", "Revenue upside"],
    linkedModels: ["Cash flow model"],
    suggestedNextStep: "Pair collections discipline with a short cash bridge view for the next ninety days.",
  },
  {
    id: "sig-fx",
    title: "FX exposure is increasing for board reporting",
    explanation: "A larger share of revenue is denominated in non-reporting currency versus prior quarter.",
    category: "FX",
    severity: "Low",
    description:
      "Reporting-currency revenue becomes more sensitive to FX moves as geographic mix shifts.",
    whyItMatters:
      "Investor narrative should separate operational performance from translational FX where possible.",
    linkedAssumptions: ["FX (reporting)"],
    linkedScenarios: ["Baseline"],
    linkedModels: ["Revenue model"],
    suggestedNextStep: "Add a simple FX commentary slide to the board pack and align with FP&A on constant-currency views.",
  },
  {
    id: "sig-hiring-confidence",
    title: "Hiring cost is beginning to outpace forecast confidence",
    explanation: "Committed offers and start dates imply higher near-term payroll than the midpoint forecast assumed.",
    category: "Burn",
    severity: "Medium",
    description:
      "Signed offers and ramp schedules are ahead of the conservative hiring path embedded in the model.",
    whyItMatters:
      "Burn forecasts may understate the next two quarters unless hiring timing is reconciled with People and FP&A.",
    linkedAssumptions: ["Hiring plan"],
    linkedScenarios: ["Baseline", "Hiring moderation"],
    linkedModels: ["Burn model", "Runway projection"],
    suggestedNextStep: "Refresh hiring assumptions and re-run runway under both baseline and moderation cases.",
  },
];

export const AI_OBSERVATIONS = [
  {
    id: "obs-runway-hiring",
    headline: "Runway is stable in baseline, but highly sensitive to hiring",
    body: "Your runway is stable in baseline, but highly sensitive to hiring decisions. A slowdown in hiring improves runway by roughly three months with limited revenue trade-off in the modeled path.",
    linkedAssumptions: ["Hiring plan", "Revenue growth"],
    linkedScenarios: ["Baseline", "Hiring moderation"],
    linkedModels: ["Runway projection", "Burn model"],
    description:
      "Baseline runway looks comfortable, but hiring is the dominant lever — moderation extends cash life meaningfully.",
    whyItMatters:
      "Leadership can choose growth vs liquidity with clearer trade-offs instead of implicit spreadsheet optimism.",
    suggestedNextStep: "Socialize the hiring moderation scenario with the CEO and CFO before the next plan commit.",
  },
  {
    id: "obs-revenue-variance",
    headline: "Revenue assumptions dominate twelve-month variance",
    body: "Revenue growth assumptions drive most of the variance in your twelve-month outlook, while burn remains relatively fixed in the current model.",
    linkedAssumptions: ["Revenue growth", "Pipeline conversion"],
    linkedScenarios: ["Baseline", "Downside", "Revenue upside"],
    linkedModels: ["Revenue model"],
    description:
      "Top-line paths spread outcomes widely; cost structure is stickier in the short term.",
    whyItMatters:
      "Scenario work should prioritize revenue levers first, then layer cost actions if downside materializes.",
    suggestedNextStep: "Align GTM and finance on a single downside revenue narrative for QBR and board prep.",
  },
  {
    id: "obs-collections-cash",
    headline: "Collections beat topline for ninety-day cash",
    body: "Collections improvements are a faster lever for cash than topline growth in the next ninety days.",
    linkedAssumptions: ["Collections cadence"],
    linkedScenarios: ["Baseline"],
    linkedModels: ["Cash flow model"],
    description:
      "DSO and billing discipline move cash within the quarter; new revenue takes longer to convert to bank balance.",
    whyItMatters:
      "When liquidity is tight, collections programs often outperform heroic growth targets on a cash basis.",
    suggestedNextStep: "Stand up a weekly collections cadence for top accounts and tie it to the cash forecast.",
  },
];

export const RISK_ITEMS = [
  {
    id: "risk-burn-revenue",
    title: "Burn growth outpacing revenue",
    explanation: "Spend and hiring are scaling faster than revenue recognition in the baseline trajectory.",
    driver: "Hiring plan · Revenue growth",
    linkedScenario: "Downside",
    description:
      "Cost adds are landing in-period while revenue lags ramp, widening the cash gap versus plan.",
    whyItMatters: "Runway and covenant comfort erode unless growth accelerates or costs pause.",
    linkedAssumptions: ["Hiring plan", "Revenue growth"],
    linkedScenarios: ["Downside", "Baseline"],
    linkedModels: ["Burn model", "Revenue model"],
    suggestedNextStep: "Model a hiring freeze or delay scenario and quantify runway impact.",
  },
  {
    id: "risk-fx-narrative",
    title: "FX volatility may distort investor narrative",
    explanation: "Translational FX could mask underlying operational trends in reported revenue.",
    driver: "FX (reporting)",
    linkedScenario: "Baseline",
    description: "Mixed-currency revenue increases sensitivity to spot and average rates in reported numbers.",
    whyItMatters: "Stakeholders may misread core performance without clear constant-currency framing.",
    linkedAssumptions: ["FX (reporting)"],
    linkedScenarios: ["Baseline"],
    linkedModels: ["Revenue model"],
    suggestedNextStep: "Add constant-currency bridges to investor and board materials.",
  },
  {
    id: "risk-hiring-runway",
    title: "Hiring plan may compress runway faster than expected",
    explanation: "Offer letters and start dates imply a steeper payroll ramp than the midpoint forecast.",
    driver: "Hiring plan",
    linkedScenario: "Baseline",
    description: "People ops data shows earlier starts than the planning model assumed.",
    whyItMatters: "Cash and runway forecasts may be optimistic for the next two quarters.",
    linkedAssumptions: ["Hiring plan"],
    linkedScenarios: ["Hiring moderation", "Baseline"],
    linkedModels: ["Burn model", "Runway projection"],
    suggestedNextStep: "Reconcile headcount actuals vs plan weekly until the next forecast refresh.",
  },
];

export const OPPORTUNITY_ITEMS = [
  {
    id: "opp-hiring-moderation",
    title: "Hiring moderation extends runway materially",
    explanation: "Slowing net new hires preserves cash with a smaller impact on near-term revenue than cost cuts elsewhere.",
    driver: "Hiring plan",
    linkedScenario: "Hiring moderation",
    description:
      "Phasing offers and backfills reduces burn while preserving core GTM capacity.",
    whyItMatters: "Often the cleanest lever when you need months of runway without a morale-breaking freeze.",
    linkedAssumptions: ["Hiring plan"],
    linkedScenarios: ["Hiring moderation", "Baseline"],
    linkedModels: ["Runway projection", "Burn model"],
    suggestedNextStep: "Convert the strongest moderation path into an explicit plan for leadership review.",
  },
  {
    id: "opp-collections",
    title: "Collections improvements unlock near-term cash",
    explanation: "Tighter billing and follow-up improve in-quarter cash more than incremental bookings.",
    driver: "Collections cadence",
    linkedScenario: "Baseline",
    description: "Focus on large balances and contract milestones yields faster bank impact.",
    whyItMatters: "Bridges liquidity gaps while longer-cycle growth initiatives mature.",
    linkedAssumptions: ["Collections cadence"],
    linkedScenarios: ["Baseline"],
    linkedModels: ["Cash flow model"],
    suggestedNextStep: "Pair AR aging review with finance and customer success leads this week.",
  },
  {
    id: "opp-revenue-upside",
    title: "Revenue upside compounds over twelve months",
    explanation: "Pipeline conversion improvements flow through the model with multi-quarter lift.",
    driver: "Pipeline conversion · Revenue growth",
    linkedScenario: "Revenue upside",
    description: "Small conversion gains stack as bookings convert to recognized revenue over the year.",
    whyItMatters: "Upside case supports reinvestment while keeping downside discipline intact.",
    linkedAssumptions: ["Revenue growth", "Pipeline conversion"],
    linkedScenarios: ["Revenue upside", "Baseline"],
    linkedModels: ["Revenue model"],
    suggestedNextStep: "Sanity-check upside against capacity and hiring before committing externally.",
  },
];

export const SCENARIO_INSIGHTS = [
  {
    id: "scn-compare-main",
    comparedScenarios: "Best case vs downside",
    keyFinding: "Revenue growth drives the largest spread; hiring moderation closes half the runway gap.",
    explanation:
      "Moving from downside to a moderated hiring path recovers meaningful runway while revenue assumptions still explain most P&L variance.",
    linkedAssumptions: ["Revenue growth", "Hiring plan"],
    linkedScenarios: ["Revenue upside", "Downside", "Hiring moderation"],
    linkedModels: ["Runway projection", "Revenue model", "Burn model"],
    title: "Best case vs downside",
    description:
      "Comparing upside revenue with downside stress shows where leadership should focus scenario prep.",
    whyItMatters: "You can prioritize narrative and actions on the levers that actually move outcomes.",
    suggestedNextStep: "Open Scenarios and step through assumption changes with your CFO counterpart.",
  },
  {
    id: "scn-driver-revenue",
    comparedScenarios: "Assumption sensitivity",
    keyFinding: "Biggest driver: revenue growth",
    explanation:
      "Twelve-month outlook variance is dominated by revenue paths; FX moves the needle less in the current mix.",
    linkedAssumptions: ["Revenue growth", "FX (reporting)"],
    linkedScenarios: ["Baseline", "Downside", "Revenue upside"],
    linkedModels: ["Revenue model"],
    title: "Assumption sensitivity — revenue",
    description: "Revenue growth and pipeline conversion explain most of the scenario spread.",
    whyItMatters: "Scenario storytelling should lead with commercial assumptions, not peripheral factors.",
    suggestedNextStep: "Align sales and finance on a single documented revenue assumption set.",
  },
  {
    id: "scn-runway-swing",
    comparedScenarios: "Runway swing",
    keyFinding: "Largest runway swing: hiring moderation",
    explanation:
      "Phasing hires moves runway more than small FX or discretionary tweaks in the modeled quarter.",
    linkedAssumptions: ["Hiring plan"],
    linkedScenarios: ["Hiring moderation", "Downside"],
    linkedModels: ["Runway projection", "Burn model"],
    title: "Runway swing analysis",
    description: "Hiring timing shifts cash-out dates and aggregate burn more than other levers tested.",
    whyItMatters: "Gives People and finance a shared language for runway-preserving options.",
    suggestedNextStep: "Document moderation scenarios for the next leadership meeting.",
  },
  {
    id: "scn-burn-fx",
    comparedScenarios: "Burn sensitivity",
    keyFinding: "Lowest burn sensitivity: FX assumption",
    explanation:
      "In the current cost mix, translational FX has a smaller near-term burn effect than payroll and vendor spend.",
    linkedAssumptions: ["FX (reporting)", "Hiring plan"],
    linkedScenarios: ["Baseline"],
    linkedModels: ["Burn model", "Revenue model"],
    title: "Burn sensitivity — FX",
    description: "FX still matters for reporting narrative but is not the primary burn driver this quarter.",
    whyItMatters: "Avoid over-rotating the cost story toward FX when payroll is the real swing factor.",
    suggestedNextStep: "Keep FX as a reporting footnote; focus cost reviews on headcount and vendors.",
  },
];

export const SUGGESTED_ACTIONS = [
  {
    id: "act-reduce-burn",
    title: "Reduce discretionary burn",
    confidence: "High",
    timeHorizon: "Immediate",
    rationale: "Non-headcount spend offers quick flexibility while hiring decisions are socialized.",
    expectedImpact: "Modest runway extension within 30–60 days with limited revenue drag.",
    linkedAssumptions: ["Marketing & G&A"],
    linkedScenarios: ["Baseline", "Downside"],
    linkedModels: ["Burn model"],
    description:
      "Tighten discretionary categories and defer non-critical programs to preserve cash during scenario work.",
    whyItMatters: "Buys time for leadership to align on hiring and growth without a full freeze narrative.",
    suggestedNextStep: "List top three discretionary categories and assign owners for reduction targets.",
  },
  {
    id: "act-hiring-ramp",
    title: "Moderate hiring ramp",
    confidence: "High",
    timeHorizon: "Next 30 days",
    rationale: "Hiring is the dominant runway lever in your current model.",
    expectedImpact: "Roughly +2–3 months runway in the moderated case vs baseline (illustrative demo).",
    linkedAssumptions: ["Hiring plan"],
    linkedScenarios: ["Hiring moderation", "Baseline"],
    linkedModels: ["Runway projection", "Burn model"],
    description:
      "Phase offers and backfills to align payroll with revenue confidence.",
    whyItMatters: "Balances growth ambition with liquidity the board can understand.",
    suggestedNextStep: "Convert to a plan and review with CEO + People lead.",
  },
  {
    id: "act-collections",
    title: "Improve collections discipline",
    confidence: "Medium",
    timeHorizon: "Next 30 days",
    rationale: "Fastest path to cash in the next ninety days.",
    expectedImpact: "Improved in-quarter cash without waiting on new bookings.",
    linkedAssumptions: ["Collections cadence"],
    linkedScenarios: ["Baseline"],
    linkedModels: ["Cash flow model"],
    description:
      "Weekly cadence on top accounts, clear escalation for overdue milestones.",
    whyItMatters: "Supports liquidity while longer-cycle initiatives mature.",
    suggestedNextStep: "Stand up a finance + CS working group on top ten AR balances.",
  },
  {
    id: "act-board-narrative",
    title: "Prepare downside board narrative",
    confidence: "Medium",
    timeHorizon: "Strategic",
    rationale: "Downside scenario crosses common runway thresholds — proactive story beats surprises.",
    expectedImpact: "Clearer board confidence and faster approval if contingency measures are needed.",
    linkedAssumptions: ["Revenue growth", "Hiring plan"],
    linkedScenarios: ["Downside", "Baseline"],
    linkedModels: ["Runway projection", "Revenue model"],
    description:
      "Frame downside as monitored and managed, with mitigations tied to hiring and collections.",
    whyItMatters: "Trust rises when leadership shows scenarios before the board asks.",
    suggestedNextStep: "Draft one slide: trigger metrics, mitigations, and decision dates.",
  },
];
