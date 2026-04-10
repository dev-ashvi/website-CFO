# Wyz AI CFO — Chat system architecture

This document describes **the chat implementation as it exists today** in this repository. It is meant for engineers extending scenarios, models, or plans on top of the current stack.

---

## 1. Overview

The chat system is the **primary in-app workspace** for CFO-style conversations at `/app/chat` (and `/app/chat/:sessionId`). It combines:

- **Session management** — list of conversations, create/open session, load history from the backend API.
- **Messaging UI** — thread of user and assistant turns, composer, optional rich “CFO” blocks for demo/empty states.
- **Planning integration (client-side)** — after a user message is sent successfully, the app runs **local** assumption-intent detection. If a supported pattern matches, it **injects an assumption proposal** into the thread. The user can **Apply** or **Cancel**; **Apply** updates global planning state via `AssumptionsContext`.

The chat system does **not** own the full “model” of the business; it **reads** `assumptions` from context and **writes** updates through `applyProposal` (and related helpers). Dashboards and planning UIs that consume `useAssumptions()` see new values and a bumped **`recomputeVersion`** when assumptions change.

**Related (not the main `/app/chat` pipeline):**

- **Assumptions page contextual panel** (`AssumptionContextChatPanel`) reuses **`detectAssumptionIntent` / `buildAssumptionProposalPayload` / `AssumptionProposalCard` / `applyProposal`** but does **not** use `useChatSession` or the chat API for that flow.

---

## 2. High-level flow

End-to-end lifecycle for a message that triggers planning:

1. User types in **`ChatComposer`** and submits → **`useChatSession.sendMessage(content)`**.
2. Hook adds an **optimistic user message** (`id` like `local-${Date.now()}`) to local `messages`.
3. Hook calls **`postMessage(sessionId, { content, role: "user" })`** (`src/api/chat.js`).
4. On **success**:
   - The **API response message** is normalized to a typed **`text`** message (`normalizeApiMessage` in `chatMessageTypes.js`) and appended.
   - **`onUserMessageSent({ text, assumptions, sessionId })`** in **`planningFromChat.js`** runs detection + **`buildAssumptionProposalPayload`** and returns **`proposalsToAppend`** (typed **`assumption_proposal`** messages). **Proposals are not returned by the backend**; they exist only in React state until refresh (see limitations).
5. **`ChatThread`** renders by **`message.type`**: `text`, `cfo_rich`, `assumption_proposal`, `system` (with **`resolveMessageType`** fallback for legacy shapes).
6. User clicks **Apply change** → **`applyProposal(proposal)`** → baseline assumption row updates, **`recomputeVersion`** increments. User clicks **Apply scenario** → **`applyScenarioProposal(proposal)`** in **`ScenarioDraftContext`** → **local scenario draft** only; baseline unchanged (**`recomputeVersion`** does not bump for scenario-only applies).
7. **`onConfirm`** appends a typed **`system`** follow-up (baseline vs scenario wording differs).
8. Consumers of **`useAssumptions()`** react to **`recomputeVersion`** when the baseline changes. **`PlanningAssumptionsPage`** can show a **scenario preview** banner when **`useScenarioDraft().hasScenarioDraft`** is true.

On **send failure**, optimistic messages whose `id` starts with `local-` are **removed** from `messages`.

---

## 3. Key components

| Piece | Location | Role |
|--------|-----------|------|
| **`AppChatPage`** | `src/pages/AppChatPage.jsx` | Layout: session list, main thread + composer, **`ChatContextPanel`**. Wires **`useChatSessions`** (create session) and **`useChatSession(sessionId)`** (thread). Passes **`setMessages`** into **`ChatThread`** so proposal confirm/dismiss can append follow-up bubbles. |
| **`ChatThread`** | `src/components/chat/ChatThread.jsx` | Renders `messages` when `status === "loaded"` by **`type`** (`text`, `cfo_rich`, `assumption_proposal`, `system`). If thread is empty and loaded, shows **`MOCK_CFO_DISPLAY_MESSAGES`** (typed demo thread). Auto-scroll when near bottom. |
| **`ChatComposer`** | `src/components/chat/ChatComposer.jsx` | Input + send; calls **`onSend`** → `sendMessage`. |
| **`useChatSession`** | `src/hooks/useChatSession.js` | Loads session via **`getChatSession`**, owns **`messages`**, **`sendMessage`**, optimistic update. After successful **`postMessage`**, calls **`onUserMessageSent`** from **`planningFromChat.js`** to append proposal messages. |
| **`planningFromChat`** | `src/planning/planningFromChat.js` | **`onUserMessageSent`**: **`detectAssumptionIntent`** or **`resolveIntentForFocusedAssumption`** + **`buildAssumptionProposalPayload`** → **`proposalsToAppend`**, **`assistantHints`**. Used by main chat and contextual assumption panel. |
| **`chatMessageTypes`** | `src/components/chat/chatMessageTypes.js` | **`CHAT_MESSAGE_TYPE`**, factories (`createTextMessage`, …), **`normalizeApiMessage`**, **`resolveMessageType`**. |
| **`ScenarioDraftContext`** | `src/planning/ScenarioDraftContext.jsx` | **`applyScenarioProposal`**, **`clearScenarioDraft`**, **`draftByKey`**, **`draftVersion`**. Scenario-mode proposal applies land here, not on baseline rows. |
| **`useChatSessions`** | `src/hooks/useChatSessions.js` | Session list + **`createSession`** (used from empty state / list; not detailed here). |
| **`detectAssumptionIntent`** | `src/planning/assumptionIntent.js` | Regex/heuristic matcher → **`{ mode, assumptionKey, proposedValue, extraImpact? }`** or `null`. |
| **`buildAssumptionProposalPayload`** | `src/planning/assumptions/buildProposal.js` | Turns intent + current rows into a **stable proposal object** for UI + **`applyProposal`**. |
| **`AssumptionProposalCard`** | `src/components/chat/AssumptionProposalCard.jsx` | Renders proposal; **Apply** on **`APPLY`** mode calls **`applyProposal`** and clears any scenario draft for that key; **Apply** on **`SCENARIO`** mode calls **`applyScenarioProposal`**. **Cancel** calls **`onDismiss`**. Optional **`embedded`**. |
| **`AssumptionsContext`** | `src/planning/AssumptionsContext.jsx` | Global assumptions list, **`applyProposal`**, **`applyAssumptionUpdate`**, **`addAssumption`**, **`recomputeVersion`**. Wrapped around app in **`App.jsx`**. |
| **`PlanningRefreshNotice`** | `src/components/dashboard/PlanningRefreshNotice.jsx` | Shown on **Dashboard** when **`recomputeVersion`** increases (transient banner). |

**API layer**

- **`src/api/chat.js`**: `getChatSessions`, `createChatSession`, `getChatSession`, `postMessage` — HTTP to `/api/v1/chat/...`.

**Context panel (static today)**

- **`ChatContextPanel`** shows fixed copy and a static **`ASSUMPTIONS`** array; it is **not** wired to **`AssumptionsContext`**.

---

## 4. Message structure

Messages are **plain objects** with a required discriminant **`type`** (see JSDoc in `src/components/chat/chatMessageTypes.js`). **`resolveMessageType`** infers `type` for legacy objects missing it.

| `type` | Typical `role` | Fields |
|--------|----------------|--------|
| **`text`** | `user` \| `assistant` | `content`, `created_at` |
| **`cfo_rich`** | `assistant` | `cfoBlocks`, optional `content`, `created_at` |
| **`assumption_proposal`** | `assistant` | `assumptionProposal` (serializable payload from §6), `created_at` |
| **`system`** | `system` | `content`, `created_at` — rendered like a plain assistant line (no UX redesign) |

Factories: **`createTextMessage`**, **`createCfoRichMessage`**, **`createAssumptionProposalMessage`**, **`createSystemMessage`**.

**Normalization on load:** **`normalizeApiMessage`** maps API rows to **`type: text`**. **Loaded history will not include `assumption_proposal` or `cfo_rich`** unless the API adds them and the normalizer is extended.

---

## 5. Assumption detection flow

**Entry point:** `detectAssumptionIntent(text, assumptions)` in `src/planning/assumptionIntent.js`.

- Input is the **full user string** (trimmed). It uses **`assumptions.find`** by **`key`** for `revenue_growth`, `hiring`, and `fx` — so **custom rows** are ignored unless keyed the same (today initial data uses those keys).
- **`isWhatIf`**: `/\bwhat\s+if\b/i` → branches use **`mode: "scenario"`** (preview semantics in UI).
- Otherwise **apply-style** branches use **`mode: "apply"`**.

**Supported patterns (illustrative, not exhaustive):**

- **Revenue growth — scenario:** “what if” + revenue/growth language + a percent (e.g. `12%`, `to 5`, `grows 10`).
- **Revenue growth — apply:** phrase matching revenue growth + verbs like increase/set/change/update/move/to/=, plus a percent.
- **Hiring — scenario:** “what if” + hiring/headcount/roles/people + a number (with optional “people/roles” wording).
- **Hiring — apply:** hiring/headcount/roles/people + reduce/cut/lower/set/change/update/to/= + number.
- **FX — scenario:** “what if” + usd/fx/inr/₹ + numeric extraction (several regexes + fallback two-digit number).
- **FX — apply:** patterns like assume USD, set fx, or fx/exchange rate + digits.

**`extraImpact`:** revenue scenario/apply can attach **`OUTPUT_REFS.runway_dashboard`** merged into **`impact`** in the proposal via `mergeOutputRefs`.

**Return value:** `null` if nothing matches; else **`{ mode: "apply" | "scenario", assumptionKey, proposedValue, extraImpact? }`**.

---

## 6. Proposal system

**Builder:** `buildAssumptionProposalPayload({ intent, assumptions, ts, chatSessionId, relatedUserMessage })` in `src/planning/assumptions/buildProposal.js`.

- Resolves the **row** by `intent.assumptionKey`; returns **`null`** if missing.
- **`impact`**: clone of `row.usedIn`, merged with `intent.extraImpact` if present.
- **`displayFrom`**: `formatAssumptionValue(row)`
- **`displayTo`**: `formatCanonicalForType({ type, unit, key, value: intent.proposedValue })`

**Payload shape (as used by UI and `applyProposal`):**

| Field | Purpose |
|--------|---------|
| `id` | `proposal_${ts}` |
| `kind` | `PROPOSAL_KIND.ASSUMPTION_UPDATE` (`"assumption_update"`) |
| `mode` | `PROPOSAL_MODE.APPLY` or `SCENARIO` (from intent) |
| `assumptionKey` | Stable key on the row |
| `assumptionLabel` | Human label |
| `currentValue` | Raw value on row (before apply) |
| `proposedValue` | Canonical value to store |
| `displayFrom` / `displayTo` | Strings shown in the card |
| `impact` | `OutputRef[]` for “This will impact” list |
| `chatSessionId` | Current session id from `useChatSession` (or `null` in contextual panel) |
| `relatedUserMessage` | Original user text that triggered detection |

**Rendering:** `ChatThread` handles **`type === assumption_proposal`** and mounts **`AssumptionProposalCard`**.

**User actions:**

- **`PROPOSAL_MODE.APPLY`**: **Apply** → **`applyProposal(proposal)`** → **`onConfirm?.()`** (append **`system`** success message).
- **`PROPOSAL_MODE.SCENARIO`**: **Apply scenario** → **`applyScenarioProposal(proposal)`** on **`ScenarioDraftContext`** → **`onConfirm?.()`** (append **`system`** message that baseline is unchanged).
- **Cancel** → **`onDismiss?.()`** (append **`system`** “didn’t change anything”).

---

## 7. Apply flow (critical)

### Baseline (`PROPOSAL_MODE.APPLY`)

1. User clicks **Apply change** on **`AssumptionProposalCard`**.
2. **`applyProposal(proposal)`** runs (`AssumptionsContext.jsx`). **`clearScenarioKey(assumptionKey)`** runs on **`ScenarioDraftContext`** so stale preview for that key is removed.
3. Guard: if `!proposal?.assumptionKey`, return.
4. **`setAssumptions`** maps rows: matching **`a.key`** gets updated value, **`source: CHAT`**, **`relatedUserMessage`**, timestamps, etc.
5. **`bumpRecompute()`** → **`recomputeVersion`** increments.
6. **`onConfirm`** appends a typed **`system`** message (main chat: short confirmation).
7. **Dashboard** **`PlanningRefreshNotice`** reacts to **`recomputeVersion`**.

### Scenario preview (`PROPOSAL_MODE.SCENARIO`)

1. User clicks **Apply scenario** on **`AssumptionProposalCard`**.
2. **`applyScenarioProposal(proposal)`** runs — merges into **`draftByKey`** in **`ScenarioDraftContext`**; **does not** call **`applyProposal`**.
3. **`recomputeVersion`** is **not** incremented (baseline unchanged).
4. **`onConfirm`** appends a **`system`** line that the preview was saved and baseline is unchanged.
5. **Planning assumptions page** may show **“Scenario preview active”** when **`hasScenarioDraft`**.

There is **no separate “model recompute” job** in code today — the baseline refresh signal is **`recomputeVersion`** + React re-renders.

---

## 8. Cancel flow

1. User clicks **Cancel** on **`AssumptionProposalCard`**.
2. Card sets internal state to **`cancelled`** (shows “Dismissed”); **does not** call **`applyProposal`**.
3. **`onDismiss`** from **`ChatThread`** appends a local **`system`** message: *“Okay — I didn't change anything.”*
4. **Assumptions state is unchanged**; **`recomputeVersion`** does not bump.

---

## 9. Assumptions context integration

**Writes from chat (proposal apply):**

- **`AssumptionProposalCard`** uses **`applyProposal`** for **`APPLY`** mode and **`applyScenarioProposal`** for **`SCENARIO`** mode.
- Row is always marked **`source: CHAT`** after apply.
- **`relatedUserMessage`** stores the triggering user utterance (passed through the proposal from `useChatSession`).
- **`chatSessionId`** ties the change to the session when the proposal was created in main chat (contextual panel uses `null`).

**Other paths (for completeness, not “chat thread” but same context):**

- **`applyAssumptionUpdate`** — manual edits, programmatic updates; can set `source` to `MANUAL` or `CHAT`.
- **`addAssumption`** — new rows (drawer, AI add flow); may set `source` and `relatedUserMessage` for assistant-originated adds.

**Read path:**

- **`useChatSession`** depends on **`assumptions`** so **`sendMessage`** always passes the latest list into **`onUserMessageSent`** / detection.

---

## 10. Recompute + refresh mechanism

- **`recomputeVersion`** is an integer in **`AssumptionsContext`**, incremented via **`bumpRecompute()`** whenever:
  - **`applyProposal`**
  - **`applyAssumptionUpdate`**
  - **`addAssumption`**
- **`applyScenarioProposal`** does **not** bump **`recomputeVersion`** (baseline unchanged). Scenario draft changes use **`draftVersion`** on **`ScenarioDraftContext`**.
- **`recomputeVersion`** is exposed on **`AssumptionsContext`** for subscribers.

**`PlanningRefreshNotice`:**

- Compares `recomputeVersion` to a ref of the previous value.
- When it **increases**, shows a timed banner (~6.5s) on the dashboard.

**Why it exists:** give a **single, cheap signal** that “planning baseline changed” without wiring every widget to deep-diff `assumptions`. New features can subscribe to **`recomputeVersion`** and/or **`assumptions`** the same way.

---

## 11. Current limitations

- **Intent detection** is **regex/heuristic**, English-oriented, and only covers **revenue_growth, hiring, fx** in practice.
- **Proposal bubbles** are **assembled in the client** after `postMessage`; they are **not** persisted as part of the API contract in this codebase — reloading the session from the server typically **drops** `assumptionProposal` unless the backend adds it.
- **Assistant reply content** from the API is appended, but **planning proposals are independent** of model output (detection runs on user text only).
- **Scenario draft is local-only** — **`ScenarioDraftContext`** holds preview overrides; not persisted, not merged into dashboard numbers yet. **No named scenario entity** or promote-to-baseline workflow.
- **No separate model/compute layer** — no server-side replan after apply beyond UI refresh.
- **`ChatContextPanel`** assumptions are **static**; not synced with **`AssumptionsContext`**.
- **Custom assumption keys** from “add assumption” are **not** targeted by **`detectAssumptionIntent`** unless you extend the detector.

---

## 12. Extensibility notes

- **Proposals as a pattern:** `buildAssumptionProposalPayload` + `AssumptionProposalCard` + `applyProposal` form a **repeatable pipeline**: structured payload → card → single context mutator. You can add **`PROPOSAL_KIND`** values and parallel **`applyXxx`** functions, or generalize **`applyProposal`** to dispatch by `kind`.
- **Scenarios:** **`applyScenarioProposal`** stores overrides in **`draftByKey`**. Next steps: persist drafts, merge **effective** values into charts, and add **promote to baseline** / named scenarios.
- **Models / plans:** **`recomputeVersion`** can remain the **invalidation tick** while a real **model service** runs async; components would move from “instant bump” to “bump when job completes” without removing the hook pattern.
- **Plans:** New entities (e.g. plan steps) could reuse **intent detection** for “create plan from utterance” or keep detection **separate** and only reuse **message list + composer** patterns.

---

## 13. Future hook points

| Area | Suggested integration |
|------|------------------------|
| **Scenario detection / creation** | Extend **`detectAssumptionIntent`**; add **`applyScenarioProposal`** persistence or server sync; **`applyScenarioProposal`** already exists client-side. |
| **Model refresh** | After assumption writes, call an API; on completion bump **`recomputeVersion`** or a new **`modelVersion`**. |
| **Plan creation** | New hook similar to **`useChatSession`** post-send: parse user text → append **`planProposal`** message → **`onApply`** creates plan in store/API. |
| **Backend persistence** | Persist **`assumptionProposal`** (or equivalent) in **`postMessage`** response or a separate event stream so reload restores proposals. |
| **Real assistant + planning** | Optionally drive proposals from **server** tool calls while keeping **`applyProposal`** as the single client write path for assumptions. |

---

## File index (quick reference)

| Concern | File(s) |
|---------|---------|
| Chat page layout | `src/pages/AppChatPage.jsx` |
| Session + send + proposal injection | `src/hooks/useChatSession.js`, `src/planning/planningFromChat.js` |
| Message typing | `src/components/chat/chatMessageTypes.js` |
| Thread rendering | `src/components/chat/ChatThread.jsx` |
| Scenario draft (preview) | `src/planning/ScenarioDraftContext.jsx` |
| Proposal UI | `src/components/chat/AssumptionProposalCard.jsx` |
| Intent | `src/planning/assumptionIntent.js` |
| Proposal payload | `src/planning/assumptions/buildProposal.js` |
| Types / modes | `src/planning/assumptions/types.js` |
| Global planning state | `src/planning/AssumptionsContext.jsx` |
| Chat HTTP | `src/api/chat.js` |
| Dashboard refresh banner | `src/components/dashboard/PlanningRefreshNotice.jsx`, `src/pages/DashboardPage.jsx` |

---

*Document generated to match the implementation in this repository; update this file when behavior changes.*
