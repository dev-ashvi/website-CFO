/** Planning workspace guided flow — copy and step metadata (demo UI). */

export const WORKSPACE_STEPS = [
  { id: "connect", label: "Connect Data", short: "Connect" },
  { id: "assumptions", label: "Assumptions", short: "Assume" },
  { id: "models", label: "Models", short: "Models" },
  { id: "scenarios", label: "Scenarios", short: "Scenarios" },
  { id: "insights", label: "Insights", short: "Insights" },
  { id: "dashboard", label: "Dashboard", short: "Dashboard" },
  { id: "plans", label: "Plans", short: "Plans" },
];

/** Per-step AI CFO Guide panel (right sidebar). */
export const WORKSPACE_GUIDE_BY_STEP = [
  {
    meaning:
      "Planning Workspace does not ingest data itself — it reflects what you connect under Data so models start from real signals.",
    next: "Open Data → Files to upload, or Data → Connect for integrations; when metrics appear here, continue to assumptions.",
    tips: [
      "Ask the guide to suggest uploading a CSV or connecting an accounting tool — it will steer you to Data, not simulate ingestion here.",
      "Continue stays disabled until at least one detected metric is present (synced from the Data section in this demo).",
    ],
  },
  {
    meaning: "Assumptions translate your story into the model — growth, people, and FX are the usual movers.",
    next: "Set baseline values you can defend in a leadership review.",
    tips: [
      "Small changes here ripple through models, scenarios, and dashboard KPIs.",
      "Full assumption library lives under Data → Planning → Assumptions.",
    ],
  },
  {
    meaning: "Models roll assumptions into forecasts — revenue, burn, and cash are the core trio.",
    next: "Confirm models are healthy, then stress-test in scenarios.",
    tips: [
      "Healthy means inputs are wired; it does not predict the future.",
      "See the full catalog under Planning → Models.",
    ],
  },
  {
    meaning: "Scenarios answer “what if” without breaking your baseline workspace.",
    next: "Try quick levers, read the preview, apply if you want the dashboard to reflect it.",
    tips: [
      "Preview is illustrative in this guided flow — the full lab is under Planning → Scenarios.",
    ],
  },
  {
    meaning: "Insights prioritize what matters — risks and opportunities in business language.",
    next: "Convert the strongest insight to a plan when you are ready to act.",
    tips: [
      "This is the decision layer between analysis and execution.",
      "Deep dive under Planning → Insights.",
    ],
  },
  {
    meaning: "The dashboard is where leaders consume runway, cash, and scenario deltas at a glance.",
    next: "Save your workspace snapshot, then formalize actions in plans.",
    tips: [
      "KPIs and charts reflect your planning context when preview is active.",
      "Open the full dashboard anytime from the sidebar.",
    ],
  },
  {
    meaning: "Plans turn insight into owned actions — who does what, and by when.",
    next: "Finalize to mark the guided path complete; continue iterating in Planning → Plans.",
    tips: [
      "Plans link back to assumptions and scenarios for audit-friendly narratives.",
    ],
  },
];

export const WORKSPACE_DETECTED_METRICS = [
  { id: "rev", label: "Revenue" },
  { id: "exp", label: "Expenses" },
  { id: "cash", label: "Cash" },
  { id: "hc", label: "Headcount" },
];

export const WORKSPACE_MODELS_PREVIEW = [
  {
    id: "m1",
    name: "Revenue model",
    blurb: "Growth, seasonality, and pipeline → forward revenue views.",
    status: "Healthy",
  },
  {
    id: "m2",
    name: "Burn model",
    blurb: "Payroll, vendors, and discretionary spend → monthly burn.",
    status: "Healthy",
  },
  {
    id: "m3",
    name: "Cash flow model",
    blurb: "Inflows, outflows, and timing → liquidity path.",
    status: "Healthy",
  },
];

export const WORKSPACE_INSIGHTS_PREVIEW = [
  {
    id: "i1",
    title: "Burn growing faster than revenue",
    detail: "Baseline path shows spend scaling ahead of recognized revenue — worth a leadership read.",
    severity: "High",
  },
  {
    id: "i2",
    title: "Runway risk in downside",
    detail: "Stressed case dips under twelve months if hiring holds and revenue softens.",
    severity: "High",
  },
];

export const WORKSPACE_PLANS_PREVIEW = [
  { id: "p1", title: "Reduce burn by 15%", detail: "Discretionary and program timing — 30–60 day window." },
  { id: "p2", title: "Moderate hiring ramp", detail: "Phase net new roles against revenue confidence." },
  { id: "p3", title: "Improve collections discipline", detail: "Weekly cadence on top AR balances." },
];
