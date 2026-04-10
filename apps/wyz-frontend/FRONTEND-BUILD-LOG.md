## WYZ Frontend – Build Log & Execution Journal

This document tracks the implementation of the WYZ frontend integration, slice by slice. It is intended as a lightweight journal to keep design and implementation aligned with backend contracts and Stage 1 / Stage 2 boundaries.

This file should be updated as we implement each slice.

---

## 0. Documentation discipline

- **Before implementing a slice**, update this log with:
  - What will be built.
  - Which backend endpoints it touches.
  - Any UX or architectural decisions.
- **After completing a slice**, record:
  - What was actually built.
  - Any deviations from the plan.
  - Follow-up items or technical debt created.

This keeps the frontend codebase grounded in a documented plan rather than ad hoc changes.

---

## 1. Planned implementation phases

### Phase 1 – Core infrastructure

**Goal:** Establish the foundations shared by all protected features.

- HTTP client with:
  - Base URL from env (`VITE_API_BASE_URL`).
  - Token injection from `AuthProvider`.
  - Centralized error normalization.
  - `onUnauthorized` callback to handle `401`s.
- API modules:
  - `auth` – `POST /api/v1/auth/login` (with `tenant_slug`).
  - `chat` – chat sessions and messages.
  - `artifacts` – list and detail.

**Backend contracts used:**
- `POST /api/v1/auth/login`
- (No chat or artifact calls wired yet; only function signatures are defined.)

**Entry to log when implemented:**
- Date, author, files touched, and any deviations from the design.

**Planned for this pass (Phase 1 implementation scope):**
- Files to add:
  - `src/api/httpClient.js`
  - `src/api/auth.js`
  - `src/api/chat.js`
  - `src/api/artifacts.js`
- Files to update:
  - None (Phase 1 is additive only).
- Assumptions:
  - `VITE_API_BASE_URL` is configured in the environment.
  - `AuthProvider` will later supply `getToken` and `onUnauthorized` for the HTTP client.

---

### Phase 2 – Auth + routing

**Goal:** Make protected routes functional with token-based auth and persistence.

- Implement `AuthProvider` and `useAuth`:
  - Token + optional tenant slug stored in state.
  - **Hydration:** on app start, read from `localStorage` and set `status` to `authenticated` / `unauthenticated`.
- Implement route guard:
  - `RequireAuth` wraps `/app/*`.
  - While `status === 'checking'`, show a simple full-page loader.
  - Redirect unauthenticated users to `/login` with intended path preserved.
- Wire routes:
  - `/login` – public.
  - `/app/*` – protected.
  - `/app` redirect to `/app/chat`.

**Backend contracts used:**
- `POST /api/v1/auth/login`

**Notes to capture after implementation:**
- Exact storage keys used for token and tenant slug.
- Any redirects or edge cases discovered (e.g., expired token on first load).

**Planned for this pass (Phase 2 implementation scope):**
- Files to add:
  - `src/auth/AuthContext.jsx` (AuthProvider + useAuth).
  - `src/auth/RequireAuth.jsx` (route guard).
  - `src/pages/AppChatShell.jsx` (temporary minimal shell for `/app/chat`).
  - `src/pages/AppArtifactsShell.jsx` (temporary minimal shell for `/app/artifacts`).
- Files to update:
  - `src/App.jsx` to:
    - Wrap routes in `AuthProvider`.
    - Add `/app`, `/app/chat`, and `/app/artifacts` routes guarded by `RequireAuth`.
  - `src/pages/LoginPage.jsx` to:
    - Use the new `authApi.login` function.
    - Send `tenant_slug`, `email`, and `password`.
    - On success, store token, tenantSlug, and user in context + localStorage.
- Assumptions:
  - The existing `LoginPage` can be adapted to call the new auth API and AuthProvider.
  - Chat and artifacts shells will remain skeletal: simple placeholder text confirming routing works, with no full UI yet.

---

### Phase 3 – App shell

**Goal:** Provide a stable, minimal shell for all protected views.

- Implement `/app` layout:
  - Top bar with:
    - WYZ logo / wordmark.
    - Current tenant or user email (if available).
    - Logout button wired to `AuthProvider`.
  - Sidebar navigation for:
    - “Chat”
    - “Artifacts”
  - Content area that renders the appropriate workspace via nested routes (`Outlet`).

**Backend contracts used:**
- No new endpoints; relies on existing auth state from Phase 2.

**Journal items after implementation:**
- Final shell layout structure and any responsiveness choices.
- How logout is handled (clearing state and storage).

**Planned for this pass (Phase 3 implementation scope):**
- Extract common shell UI from:
  - `src/pages/AppChatShell.jsx`
  - `src/pages/AppArtifactsShell.jsx`
- Create a shared `AppLayout` with:
  - top bar (brand + user/tenant + logout)
  - sidebar nav (Chat / Artifacts)
  - main content using `Outlet`
- Update routing so `/app/*` uses nested routes:
  - `/app` redirect to `/app/chat`
  - `/app/chat` placeholder page
  - `/app/artifacts` placeholder page
- Keep chat/artifact content intentionally skeletal (no feature implementation yet).

**Completed (Phase 3 – App shell):**
- **Date:** 2026-03-31
- **Author:** Cursor assistant
- **Files added:**
  - `src/layouts/AppLayout.jsx`
    - Shared protected shell for all `/app/*` routes.
    - Includes:
      - top bar (WYZ title, user email, tenant slug, logout),
      - sidebar navigation (`/app/chat`, `/app/artifacts`) via `NavLink`,
      - main content area rendered by `Outlet`.
  - `src/pages/AppChatPage.jsx`
    - Placeholder content for `/app/chat`.
  - `src/pages/AppArtifactsPage.jsx`
    - Placeholder content for `/app/artifacts`.
- **Files updated:**
  - `src/App.jsx`
    - Refactored `/app` routing to nested route structure:
      - `/app` (protected) renders `AppLayout`.
      - index route redirects to `/app/chat`.
      - `/app/chat` renders `AppChatPage`.
      - `/app/artifacts` renders `AppArtifactsPage`.
- **Files removed:**
  - `src/pages/AppChatShell.jsx`
  - `src/pages/AppArtifactsShell.jsx`
  - (Their duplicated shell structure is now consolidated into `AppLayout`.)
- **Deviations from design:** None; layout extraction and nested routing match the Phase 3 plan.
- **Follow-ups / notes:**
  - `AppLayout` is now the stable host for Phase 4 (chat UI) and Phase 5 (artifacts UI).
  - Future feature pages can focus on content only, while shell and navigation remain centralized.

---

### Phase 4 – Chat UI (sessions + thread + composer)

**Goal:** Deliver a minimal yet product-focused chat experience with the CFO agent.

#### 4.1. Sessions list

- Component: `ChatSessionListPane` (or equivalent).
- Behavior:
  - On mount, fetch `GET /api/v1/chat/sessions`.
  - Display skeleton rows while loading.
  - Show list of sessions with active indicator matching the route.
  - “New session” button:
    - Calls `POST /api/v1/chat/sessions` **with** `agent_id: 'cfo-agent'`.
    - On success, navigates to `/app/chat/:sessionId`.

**Backend contracts:**
- `GET /api/v1/chat/sessions`
- `POST /api/v1/chat/sessions` (with `agent_id: 'cfo-agent'`)

#### 4.2. Thread view + empty state

- For `/app/chat` (no `sessionId`):
  - Show “Start a conversation” empty-state:
    - Button → create session (also forcing `agent_id: 'cfo-agent'`) → redirect.
- For `/app/chat/:sessionId`:
  - On mount or `sessionId` change:
    - Fetch `GET /api/v1/chat/sessions/:session_id`.
  - While loading:
    - Show skeleton bubbles.
  - On success:
    - Render `MessageThread` with messages.

**Backend contracts:**
- `GET /api/v1/chat/sessions/:session_id`

#### 4.3. Message composer

- Component: `MessageComposer`.
- Behavior:
  - Local `input` and `isSending` state.
  - **Guard:** `if (isSending) return;` to prevent double sends.
  - On submit:
    - Call `POST /api/v1/chat/sessions/:session_id/messages` with `{ content }`.
    - Append message(s) to thread and clear input on success.
    - Show small inline error on failure.

**Backend contracts:**
- `POST /api/v1/chat/sessions/:session_id/messages`

**Notes to record after implementation:**
- How message timestamps and authorship are inferred from backend types.
- Any pagination or truncation assumptions (Stage 1 likely uses full history).

**Planned for this pass (Phase 4 implementation scope):**
- Files to add:
  - `src/hooks/useChatSessions.js` – loads chat sessions list and manages create-session loading state.
  - `src/hooks/useChatSession.js` – loads a single session (with messages) and handles message sending.
  - `src/components/chat/ChatSessionList.jsx` – left-side sessions list + “New conversation” button.
  - `src/components/chat/ChatEmptyState.jsx` – right-side empty state for `/app/chat`.
  - `src/components/chat/ChatThread.jsx` – message list UI with auto-scroll.
  - `src/components/chat/ChatComposer.jsx` – textarea + send button with optimistic user messages and duplicate-send guard.
  - `src/components/chat/ChatLoadingSkeleton.jsx` – skeleton variants for list + thread.
- Files to update:
  - `src/App.jsx` – add nested route for `/app/chat/:sessionId`.
  - `src/pages/AppChatPage.jsx` – replace placeholder text with composed chat workspace using the new hooks/components.
- Behavior constraints:
  - Always create sessions with `agent_id: 'cfo-agent'` (via existing `chatApi.createChatSession`).
  - Optimistically append user message to thread **before** calling `POST /messages`.
  - Prevent duplicate sends via `sendStatus` / `isSending`.
  - Auto-scroll thread on initial load and whenever messages are appended.
  - Ignore stale `GET /chat/sessions/:id` responses when switching sessions quickly.
  - No streaming, multi-agent, pagination, or external caching layers.

**Completed (Phase 4 – Chat UI):**
- **Date:** 2026-03-31
- **Author:** Cursor assistant
- **Files added:**
  - `src/hooks/useChatSessions.js`
    - Manages chat sessions list state: `{ sessions, status, error, isCreating, currentSessionId }`.
    - Loads sessions via `GET /api/v1/chat/sessions` on first use.
    - Provides `createSession()` which calls `POST /api/v1/chat/sessions` (agent_id enforced in `chatApi`) and then navigates to `/app/chat/:id`.
    - Guards against duplicate session creation via `isCreating`.
  - `src/hooks/useChatSession.js`
    - Manages a single session: `{ session, messages, status, sendStatus, error }`.
    - Loads session + message history via `GET /api/v1/chat/sessions/:session_id`.
    - Normalizes messages to `{ id, role, content, created_at }`.
    - Tracks `latestSessionIdRef` and ignores stale responses when users switch sessions quickly.
    - Exposes `sendMessage(content)` which:
      - Guards against duplicate sends when `sendStatus === 'sending'`.
      - Optimistically appends a user message before calling `POST /api/v1/chat/sessions/:session_id/messages`.
      - Appends the normalized backend message on success and reports errors inline on failure.
  - `src/components/chat/ChatLoadingSkeleton.jsx`
    - `ChatSessionListSkeleton` and `ChatThreadSkeleton` for list/thread loading states.
  - `src/components/chat/ChatSessionList.jsx`
    - Left-hand sessions list using `useChatSessions`.
    - Renders skeleton while loading, inline errors with retry, and active-session highlighting by route param.
    - Includes a “New” button that starts a session and navigates to `/app/chat/:sessionId`.
  - `src/components/chat/ChatEmptyState.jsx`
    - Empty-state panel for `/app/chat` (no `sessionId`) with a button that starts a new session and handles its loading/error state.
  - `src/components/chat/ChatThread.jsx`
    - Renders normalized messages for a given session.
    - Auto-scrolls to the bottom on initial load and whenever `messages.length` changes.
    - Uses skeleton bubbles while loading, and inline error text when thread loading fails.
  - `src/components/chat/ChatComposer.jsx`
    - Textarea + send button with:
      - Duplicate-send guard (`sendStatus === 'sending'`).
      - Calls `onSend(trimmed)` and clears input only on success.
      - Inline hint text; no toasts or modals.
- **Files updated:**
  - `src/pages/AppChatPage.jsx`
    - Replaced placeholder with real chat workspace:
      - Left: `ChatSessionList`.
      - Right:
        - `/app/chat` → `ChatEmptyState` with shared `isCreating` + error from `useChatSessions`.
        - `/app/chat/:sessionId` → session title, inline thread error, `ChatThread`, and `ChatComposer` wired to `useChatSession`.
  - `src/App.jsx`
    - Added nested route `path="chat/:sessionId"` under `/app`, both rendering `AppChatPage` inside `AppLayout`.
- **Deviations from design:**
  - None; all Stage 1 constraints (no streaming, no multi-agent, no pagination, no global state libs) were preserved.
- **Follow-ups / notes:**
  - Future enhancements (e.g., message grouping, better timestamps, streaming) can be layered on top of the normalized message model without changing the API contracts.
  - If the backend adds pagination later, `useChatSession` can be extended to support incremental loading while keeping the current API surface.

---

### Phase 5 – Artifacts UI (list + detail)

**Goal:** Allow users to browse and inspect artifacts created by the system.

#### 5.1. List

- Component: `ArtifactList`.
- Behavior:
  - Fetch `GET /api/v1/artifacts` on mount.
  - Show skeleton rows while loading.
  - Render basic list with:
    - Name/title.
    - Type/category.
    - Last updated.
  - On click:
    - Navigate to `/app/artifacts/:artifactId`.

**Backend contracts:**
- `GET /api/v1/artifacts`

#### 5.2. Detail

- Component: `ArtifactDetailPanel`.
- Behavior:
  - For route `/app/artifacts/:artifactId`:
    - Fetch `GET /api/v1/artifacts/:id`.
  - Show skeleton for title + content while loading.
  - On success:
    - Render:
      - Title and metadata.
      - Content summary.
      - Any links/paths based on **backend `storage_uri` and metadata**, not hardcoded file paths.

**Backend contracts:**
- `GET /api/v1/artifacts/:id`

**Notes to capture:**
- How artifact types map to UI representations.
- Any assumptions about fields like `storage_uri`.

---

### Phase 6 – Polish and small UX enhancements

**Goal:** Improve perceived quality without changing core architecture.

Examples:

- Consistent skeleton patterns across chat and artifacts.
- Better empty/error states with concise copy.
- Scroll behavior for long threads and lists.
- Small accessibility improvements (focus management, ARIA labels where helpful).

No new backend contracts are introduced here.

---

## 2. Placeholders for slice updates

The following subsections should be updated as each phase is implemented.

### Phase 1 – Core infrastructure

- **Date completed:** _(TBD)_
- **Summary:** _(TBD)_
- **Files touched:** _(TBD)_
- **Deviations from design:** _(TBD)_
- **Follow-ups:** _(TBD)_

### Phase 2 – Auth + routing

- **Date completed:** _(TBD)_
- **Summary:** _(TBD)_
- **Files touched:** _(TBD)_
- **Deviations from design:** _(TBD)_
- **Follow-ups:** _(TBD)_

### Phase 3 – App shell

- **Date completed:** _(TBD)_
- **Summary:** _(TBD)_
- **Files touched:** _(TBD)_
- **Deviations from design:** _(TBD)_
- **Follow-ups:** _(TBD)_

### Phase 4 – Chat UI

- **Date completed:** _(TBD)_
- **Summary:** _(TBD)_
- **Files touched:** _(TBD)_
- **Deviations from design:** _(TBD)_
- **Follow-ups:** _(TBD)_

### Phase 5 – Artifacts UI

- **Date completed:** _(TBD)_
- **Summary:** _(TBD)_
- **Files touched:** _(TBD)_
- **Deviations from design:** _(TBD)_
- **Follow-ups:** _(TBD)_

### Phase 6 – Polish

- **Date completed:** _(TBD)_
- **Summary:** _(TBD)_
- **Files touched:** _(TBD)_
- **Deviations from design:** _(TBD)_
- **Follow-ups:** _(TBD)_

---

## 3. Alignment with backend contracts (checklist)

This section should be kept accurate as implementation proceeds.

- [ ] `POST /api/v1/auth/login` is called with **`tenant_slug`, `email`, `password`**.
- [ ] New chat sessions (`POST /api/v1/chat/sessions`) always include **`agent_id: 'cfo-agent'`**.
- [ ] `GET /api/v1/chat/sessions` is used to power the sessions list.
- [ ] `GET /api/v1/chat/sessions/:session_id` is used to fetch individual sessions.
- [ ] `POST /api/v1/chat/sessions/:session_id/messages` is used to send user messages.
- [ ] `GET /api/v1/artifacts` drives the artifacts list.
- [ ] `GET /api/v1/artifacts/:id` drives the artifact detail view.
- [ ] Artifacts UI relies on **backend metadata and `storage_uri`**, not hardcoded file paths.

These items should be ticked off as they are confirmed in code.

