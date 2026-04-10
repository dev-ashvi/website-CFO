# Planning, scenarios, simulation & dashboard preview

This document describes the **client-side planning preview system** built for Wyz AI CFO: scenario drafts, deterministic financial simulation, CFO explanations, and **dashboard preview mode**. It reflects the implementation as of the work that added these features to `website-CFO` (`src/`).

---

## 1. Goals (what we built)

- **Scenario preview** — Users explore what-ifs without mutating workspace assumptions; overrides live in a **draft** keyed by assumption.
- **Deterministic simulation** — A small **monthly cash / revenue / runway model** runs in the browser (no API, same inputs → same outputs).
- **CFO-readable UI** — Summary cards, Recharts (baseline vs preview), preview-change strips, loading phases, and a **rule-based explanation** (no LLM).
- **Dashboard connection** — **Preview mode** on the dashboard re-renders hero, KPI strip, main charts, and sidebar context using the same simulation, while **baseline data and assumptions stay unchanged**.

---

## 2. Core contexts

### `AssumptionsProvider` (`src/planning/AssumptionsContext.jsx`)

- Holds the **workspace baseline** assumptions (e.g. revenue growth, hiring, FX).
- Chat / drawers can **apply** proposals and update baseline (`applyProposal`, etc.).
- **Scenario apply** does *not* go through baseline mutation for preview-only flows.

### `ScenarioDraftProvider` (`src/planning/ScenarioDraftContext.jsx`)

- **`draftByKey`** — Map of assumption key → draft entry (`proposedValue`, `displayTo`, `displayFromSnapshot`, `relatedUserMessage`, etc.).
- **`applyScenarioProposal`** — Merges a **scenario-mode** proposal into the draft (baseline rows unchanged).
- **`hasScenarioDraft`**, **`clearScenarioDraft`**, **`saveCurrentDraftAsScenario`**, **`activeDashboardScenario`**, **`applyPreviewToDashboard`**, **`recentExplorations`**, etc.

### `PlanningViewProvider` (`src/planning/PlanningViewContext.jsx`)

- Controls **dashboard rendering mode**: `baseline` vs `preview`.
- **`enterPreviewFromScenarios({ scenarioLabel })`** — Used when the user chooses to view the preview on the dashboard.
- **`exitPreview()`** — Returns to baseline presentation and clears **`activeDashboardScenario`**.
- **`compareToBaselineCharts()`** — Scrolls to **`#dashboard-scenario-charts`**.
- If **preview mode** is on but the **scenario draft is empty**, preview mode is **auto-reset** (draft is the source of truth).

**Provider order** (`src/App.jsx`): `AssumptionsProvider` → `ScenarioDraftProvider` → `PlanningViewProvider` → routes.

---

## 3. Scenario engine (simulation)

**File:** `src/planning/scenarioEngine/simulateScenario.js`

**Input:** `{ assumptions, scenarioDraft }` (assumption rows + draft overrides).

**Behavior (MVP):**

- Merges **baseline** values with **draft** per key (`revenue_growth`, `hiring`, `fx`).
- Monthly loop: revenue compounds with annual growth; **burn** = base + hiring × cost-per-employee; **cash** moves with burn vs a fixed **revenue-to-cash** rate; **runway** = first month cash ≤ 0 (or full horizon).
- FX scales starting revenue via a baseline-rate multiplier.

**Output:**

- `horizonMonths`, `baseline` / `scenario` each with `revenueSeries`, `cashSeries`, `runwayMonths`, `avgMonthlyBurn`, `finalCash`.
- `summary`: `revenueDeltaPercent`, `runwayDelta`, `burnDelta`, `cashDelta` (end-of-horizon / averages as implemented).

Constants live in **`SCENARIO_ENGINE_DEFAULTS`**.

---

## 4. Shared formatting

**File:** `src/planning/scenarioDisplayFormat.js`

- **`MONTH_12_INDEX`** — Index for “month 12” in 0-based series.
- **`formatInrCompact`**, **`formatAxisInr`** — INR display helpers for charts and copy.

---

## 5. Hook: `useScenarioSimulation`

**File:** `src/hooks/useScenarioSimulation.js`

**Reads:** `useAssumptions()`, `useScenarioDraft()`.

**Does:**

- Runs **`simulateScenario`** when `hasScenarioDraft`.
- Builds **`breakdown`** rows: `assumptionKey`, `label`, `from`, `to` (for UI + explanation).
- **`outputsAffected`** — Union of `usedIn` labels for drafted keys.
- **`originChatSnippet`** — First draft `relatedUserMessage` (trimmed), for UI.
- **`generateExplanation(...)`** — Produces **`explanation`** (see below).
- **Loading UX** — Short timed messages (`Analyzing scenario…` / `Recomputing projections…`) on draft change.

**Returns:** `series`, `summary`, `breakdown`, `originChatSnippet`, `outputsAffected`, `explanation`, `loading`, `loadingMessage`.

---

## 6. Explanation engine (deterministic CFO copy)

**File:** `src/planning/explanationEngine/generateExplanation.js`

**Input:** `{ summary, breakdown, baseline, scenario }`.

**Output:** `{ headline, keyDrivers, narrative, risks, recommendations }`.

**Rules:** Headline from runway delta + main lever (revenue vs burn); drivers from assumption keys / labels; 2–3 sentence narrative; conditional risks; **two fixed recommendations** (validate assumptions, compare downside). **No randomness, no LLM.**

**UI:** `src/components/scenario/CFOExplanationPanel.jsx` — sections: CFO insight, headline, drivers, narrative, risks (orange), recommendations (blue).

---

## 7. Scenarios page & scenario UI

**Route:** `/app/data/planning/scenarios` — `src/pages/data/PlanningScenariosPage.jsx`

**Highlights:**

- Chips / composer → **`AssumptionContextChatPanel`** (`surface="scenarios"`) for discuss flow.
- **`ScenarioImpactView`** — Summary cards (baseline → preview + deltas), preview changes strip, Recharts (revenue + cash), **`CFOExplanationPanel`** (`explanation` from hook), changed-inputs list.
- Header: save summary (**Preview changes**), **Save scenario**, **Clear preview**, **`View on dashboard`** (sets planning preview + `applyPreviewToDashboard` + navigate to `/app/dashboard`).

**Related components:**

- `src/components/planning/AssumptionContextChatPanel.jsx` — Scenarios surface: quick numeric “Estimated impact”, entry stream, Explore affordance.
- `src/components/planning/SaveScenarioModal.jsx` — Named save into session list.

---

## 8. Dashboard preview mode

**Page:** `src/pages/DashboardPage.jsx`

When **`usePlanningView().isPreviewMode`** and a draft exists (with simulation):

- **`ScenarioDashboardBanner`** — “Preview scenario active”, label, baseline unchanged, **Compare to baseline**, **Exit preview**. Legacy banner still shown if only `activeDashboardScenario` is set without planning preview.
- **`SummaryHeroCard`** — Scenario-aware hero from simulation; link back to Scenarios.
- **`KPIStrip`** — Top row: preview vs baseline (runway, cash M12, revenue M12, avg burn); below: static “baseline workspace snapshot” cards.
- **`AnalyticsRow`** — **`DashboardScenarioCharts`** (Recharts: revenue + cash, Baseline vs Preview scenario) with id **`dashboard-scenario-charts`**.
- **`DashboardInsightsSidebar`** — **CFO panel first** (when `explanation` present), then existing preview block (changed assumptions, impact bullets, outputs), then **baseline signals** / assumptions / obligations (unchanged structure).

---

## 9. Key file index

| Area | Path |
|------|------|
| Simulation | `src/planning/scenarioEngine/simulateScenario.js` |
| Explanation | `src/planning/explanationEngine/generateExplanation.js` |
| Formatting | `src/planning/scenarioDisplayFormat.js` |
| Planning view state | `src/planning/PlanningViewContext.jsx` |
| Draft state | `src/planning/ScenarioDraftContext.jsx` |
| Baseline assumptions | `src/planning/AssumptionsContext.jsx` |
| Hook | `src/hooks/useScenarioSimulation.js` |
| Scenarios page | `src/pages/data/PlanningScenariosPage.jsx` |
| Impact + charts + CFO panel | `src/components/scenario/ScenarioImpactView.jsx`, `CFOExplanationPanel.jsx` |
| Dashboard charts | `src/components/dashboard/DashboardScenarioCharts.jsx` |
| Banner | `src/components/dashboard/ScenarioDashboardBanner.jsx` |
| App shell / providers | `src/App.jsx` |

---

## 10. Dependencies

- **Recharts** (`recharts`) — Scenario impact charts and dashboard preview charts.

---

## 11. Invariants (baseline safety)

- **Baseline assumptions** in `AssumptionsContext` are **not** overwritten by scenario preview or dashboard preview mode.
- **Preview** affects **presentation** and reads **draft + simulation**; clearing draft or **Exit preview** restores normal dashboard behavior.
- Simulation is **illustrative**; copy and UI repeatedly state **directional / not statutory** where implemented.

---

## 12. Related doc

- Chat and planning proposal pipeline: **`docs/CHAT-ARCHITECTURE.md`**.
