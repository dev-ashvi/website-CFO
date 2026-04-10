## WYZ Frontend – Stage 1 Integration Design

This document defines the **Stage 1** WYZ frontend integration for the existing backend. It is intended to be stable enough that implementation work can proceed against it without re‑deciding core UX or architecture on the fly.

This document is **design only** (no implementation or code).

---

## 1. Product goal

**Goal:** Provide a minimal, production-lean frontend for WYZ that lets authenticated users:

- Sign in with their **tenant_slug + email + password**
- Access a **protected app shell** separate from the marketing site
- Create and manage **chat sessions** with the CFO agent
- View and send **messages in a chat thread** with a simple composer
- Browse an **artifacts list** and inspect **artifact detail**

This is intentionally focused, aligned with **Stage 1** capabilities of the backend:

- No admin panels
- No streaming or advanced chat orchestration
- No multi-agent selection UI (sessions always use the `cfo-agent`)

---

## 2. Route structure

The existing marketing site and router are reused. The WYZ app is added under `/app/*`.

- **Public routes**
  - `/login`
    - Login form with fields: `tenant_slug`, `email`, `password`.
    - On success, redirects into `/app` based on auth guard.

- **Protected routes** (all children of a `RequireAuth` guard)
  - `/app`
    - Redirects to `/app/chat`.
  - `/app/chat`
    - App shell (top bar + nav) with:
      - Left: chat sessions list.
      - Right: empty-state “Start a conversation” panel.
  - `/app/chat/:sessionId`
    - Same shell and left side as `/app/chat`.
    - Right: chat thread + composer for the given session.
  - `/app/artifacts`
    - App shell with:
      - Left: artifacts list.
      - Right: empty-state “Select an artifact” panel.
  - `/app/artifacts/:artifactId`
    - Same shell and list as `/app/artifacts`.
    - Right: artifact detail for `artifactId`.

All `/app/*` routes are **Stage 1** surfaces. Stage 2+ screens (admin, configuration, advanced analytics) are out of scope for now.

---

## 3. Page and layout structure

### 3.1. App shell (`/app/*`)

Common layout for all protected routes:

- **Top bar**
  - Left: brand (reusing site logo) and compact “WYZ” label.
  - Right: user menu with:
    - Tenant name (if available).
    - “Logout” action.
- **Main body (two-column)**
  - Left: narrow navigation rail / sidebar
    - Links: “Chat”, “Artifacts”.
  - Right: routed content (`Outlet`):
    - Chat workspace (sessions + thread).
    - Artifacts workspace (list + detail).

### 3.2. Login page (`/login`)

- Simple centered card:
  - `tenant_slug` input
  - `email` input
  - `password` input
  - Sign-in button
- Minimal error presentation:
  - Inline error text for invalid credentials or 4xx from backend.
- On submit:
  - Calls `POST /api/v1/auth/login`.
  - Stores token (and optionally tenant_slug) on success.
  - Redirects to last intended path (if set) or `/app/chat`.

### 3.3. Chat workspace (`/app/chat` & `/app/chat/:sessionId`)

Inside the app shell:

- **Left column – sessions list**
  - “New session” button.
  - List of sessions:
    - Session title (fallback: “Conversation n”).
    - Last activity timestamp.
  - Loading skeleton when fetching sessions.

- **Right column – main panel**
  - If route is `/app/chat` (no `sessionId`):
    - Empty-state card:
      - Title: “Start a conversation”
      - Short description.
      - Primary button that creates a new session and redirects.
  - If route is `/app/chat/:sessionId`:
    - Chat thread:
      - Vertical message list.
      - User / assistant styling; timestamps under each bubble.
      - Loading skeleton while first fetching the session.
    - Composer:
      - Textarea input for the user message.
      - Send button.
      - Sending state (disabled while sending).

### 3.4. Artifacts workspace (`/app/artifacts` & `/app/artifacts/:artifactId`)

Inside the app shell:

- **Left column – artifacts list**
  - Fetches `GET /api/v1/artifacts`.
  - Shows artifacts with:
    - Name / title.
    - Type/category (if provided).
    - Last updated.
  - Click selects an artifact + navigates to `/app/artifacts/:artifactId`.
  - Loading skeleton while initial list is loading.

- **Right column – detail panel**
  - At `/app/artifacts` (no `artifactId`):
    - Empty “Select an artifact” state.
  - At `/app/artifacts/:artifactId`:
    - Fetches `GET /api/v1/artifacts/:id`.
    - Shows:
      - Title, created/updated timestamps.
      - High-level metadata (e.g., `type`, `source`, `session_id`).
      - The relevant content view:
        - For now, minimal formatting; later can adapt per artifact type.
    - Uses backend `storage_uri` / metadata for location, **never assumes raw file paths** on the frontend.

---

## 4. State model

State should be small and focused. Only **auth** is truly global; other slices stay close to their feature.

### 4.1. Auth state (global)

Managed by an `AuthProvider` + `useAuth` hook:

- Shape:
  - `token: string | null`
  - `tenantSlug: string | null`
  - `user: { id: string; email: string; tenant?: string; [key: string]: unknown } | null`
  - `status: 'checking' | 'authenticated' | 'unauthenticated'`
  - `error: string | null`

- Persistence:
  - On login success:
    - `localStorage.setItem('wyz_token', token)`
    - `localStorage.setItem('wyz_tenant_slug', tenantSlug)`
    - Optionally persist a **serialized user object** (e.g., `localStorage.setItem('wyz_user', JSON.stringify(user))`) so the top bar and auth state can rehydrate user + tenant metadata without re-calling the backend on each load.
  - On app start:
    - Read token, tenant_slug, and (if present) the serialized user from `localStorage`:
      - If token exists → hydrate `token`, `tenantSlug`, `user` and set `status: 'authenticated'`.
      - Else → `status: 'unauthenticated'`.

### 4.2. Chat state

Chat state can be managed via hooks within the `/app/chat` tree (no global store required initially).

- Sessions list:
  - `sessions: ChatSession[] | null`
  - `status: 'idle' | 'loading' | 'loaded' | 'error'`
  - `error: string | null`

- Current session:
  - `currentSessionId: string | null` (driven by route param).
  - `session: ChatSessionDetail | null`
  - `messages: ChatMessage[] | null` (if not included in `session` response).
  - `status: 'idle' | 'loading' | 'loaded' | 'error'`
  - `sendStatus: 'idle' | 'sending' | 'error'`

- Composer:
  - `input: string`
  - `isSending: boolean` (must guard against duplicates).

### 4.3. Artifacts state

Scoped to the artifacts router subtree:

- List:
  - `artifacts: Artifact[] | null`
  - `status: 'idle' | 'loading' | 'loaded' | 'error'`
  - `error: string | null`

- Detail:
  - `selectedArtifactId: string | null` (from route).
  - `artifact: Artifact | null`
  - `status: 'idle' | 'loading' | 'loaded' | 'error'`
  - `error: string | null`

---

## 5. API client structure

All network access should go through a **centralized API client layer**.

### 5.1. HTTP client

Module: `src/api/httpClient.ts` (or similar).

- Construction:
  - `createHttpClient({ getToken, onUnauthorized })` returns:
    - `get(path: string, options?): Promise<any>`
    - `post(path: string, body?: any, options?): Promise<any>`

- Behavior:
  - Prefixes paths with `import.meta.env.VITE_API_BASE_URL`.
  - Sends `Authorization: Bearer <token>` when `getToken()` returns a token.
  - Standard JSON headers:
    - `Accept: application/json`
    - `Content-Type: application/json` for requests with bodies.

- Error handling (global):
  - For non-2xx responses:
    - Attempt to parse JSON error body.
    - Throw a normalized error:
      - `{ status: number; message: string; code?: string; details?: unknown }`
  - For `401`:
    - Invoke `onUnauthorized()` so the `AuthProvider` can clear auth and redirect.
    - Still reject the promise, so callers can optionally react.

### 5.2. Auth API

Module: `src/api/auth.ts`

- `login({ tenantSlug, email, password }): Promise<{ token: string; user?: User }>`
  - Sends:
    - `POST /api/v1/auth/login`
    - Body: `{ tenant_slug, email, password }`
  - Returns:
    - `token` from backend.
    - `user` object when supplied by backend (which is expected in the current system), including useful user and tenant metadata to drive the top bar and future permissions logic.

### 5.3. Chat API

Module: `src/api/chat.ts`

- `getChatSessions(): Promise<ChatSession[]>`
  - `GET /api/v1/chat/sessions`

- `createChatSession(args?: { title?: string }): Promise<ChatSession>`
  - `POST /api/v1/chat/sessions`
  - **Body always includes:** `agent_id: 'cfo-agent'`
    - Optionally also `title` or other allowed fields.

- `getChatSession(sessionId: string): Promise<ChatSessionDetail>`
  - `GET /api/v1/chat/sessions/:session_id`
  - **Expected response (Stage 1):** includes both high-level session metadata _and_ the **full message history** for that session, so the frontend can render the thread without making a separate messages request. If this ever changes, the frontend will be adapted, but Stage 1 assumes history is present here.

- `postMessage(sessionId: string, body: { content: string; role?: 'user' | 'system' }): Promise<ChatMessage>`
  - `POST /api/v1/chat/sessions/:session_id/messages`
  - Stage 1: simple request/response; **no streaming yet**.

### 5.4. Artifacts API

Module: `src/api/artifacts.ts`

- `getArtifacts(): Promise<Artifact[]>`
  - `GET /api/v1/artifacts`

- `getArtifact(id: string): Promise<Artifact>`
  - `GET /api/v1/artifacts/:id`
  - Frontend uses `metadata` / `storage_uri` fields to render information and links; **it does not attempt to construct raw file system paths**.

---

## 6. Auth flow

High-level sequence:

1. **App boot**
   - `AuthProvider` checks `localStorage` for `wyz_token` (and `wyz_tenant_slug`).
   - If token present → `status = 'authenticated'`.
   - Else → `status = 'unauthenticated'`.

2. **Route guarding**
   - `RequireAuth` wraps `/app/*`:
     - If `status === 'checking'` → show full-screen loading indicator.
     - If `status === 'unauthenticated'` → redirect to `/login` and store intended path.
     - If `status === 'authenticated'` → render children.

3. **Login**
   - User submits login form with `tenant_slug`, `email`, `password`.
   - `authApi.login` is called through the HTTP client.
   - On success:
     - Save token (and tenantSlug) to state + localStorage.
     - Navigate to prior intended path or `/app/chat`.
   - On failure:
     - Show inline error on login form; do **not** leak raw backend error structures.

4. **Logout / token invalidation**
   - If any API call returns `401`, HTTP client’s `onUnauthorized`:
     - Clears auth state and storage.
     - Redirects user to `/login` (or displays a “session expired” message en route).
   - User can also trigger logout from app shell.

---

## 7. Chat flow

### 7.1. Sessions list

- On entering `/app/chat` or `/app/chat/:sessionId`:
  - `ChatSessionListPane` fetches `GET /api/v1/chat/sessions`.
  - While loading:
    - Show skeleton rows (e.g., 3–5 placeholder items).
  - On success:
    - Render interactive list with active session highlighted.
  - On error:
    - Show short error text + “Retry” button.

### 7.2. Creating a session

- From:
  - “New session” button in the sessions sidebar, or
  - “Start a conversation” button in the empty-state main panel.
- Action:
  - Calls `chatApi.createChatSession({ title? })`.
  - The API client sends `agent_id: 'cfo-agent'` **every time**.
  - On success:
    - Append session to local sessions list.
    - Navigate to `/app/chat/:sessionId`.

### 7.3. Viewing a session

- Route: `/app/chat/:sessionId`.
- Behavior:
  - On mount or `sessionId` change:
    - Fetch `GET /api/v1/chat/sessions/:session_id`.
    - While loading:
      - Show skeleton bubbles in the main panel.
  - On success:
    - Render messages in `MessageThread`.
    - Auto-scroll to the bottom on first load and after new messages.
  - On error:
    - Show an inline “Unable to load conversation” message with a retry option.

### 7.4. Sending a message

- User types into `MessageComposer` and hits send (button or keyboard).
- Guard:
  - If input is empty → do nothing.
  - If `isSending` is true → **do nothing** (prevents double send).
- Flow:
  - Optimistically add the user message to the thread (optional).
  - Set `isSending = true`.
  - Call `chatApi.postMessage(sessionId, { content })`.
  - On success:
    - Merge returned message(s) into the thread.
    - Clear input.
  - On failure:
    - Re-enable input; show a small error message near the composer.
  - Always:
    - Reset `isSending = false`.

---

## 8. Artifact flow

### 8.1. List view (`/app/artifacts`)

- On mount:
  - Fetch `GET /api/v1/artifacts`.
  - Show a list with:
    - Title / descriptor.
    - Type / source.
    - Last updated.
- Loading:
  - While first request is in-flight:
    - Show skeleton rows.
- Error:
  - Inline message + “Retry” action.

### 8.2. Detail view (`/app/artifacts/:artifactId`)

- On mount or `artifactId` change:
  - Fetch `GET /api/v1/artifacts/:id`.
  - If already present in list with sufficient detail:
    - May reuse list data while fetching full detail in background.
- Loading:
  - Show skeleton for title + body.
- Success:
  - Show:
    - Title.
    - Type, created/updated times.
    - Key fields from metadata.
    - The raw `storage_uri` and any other identifying fields from metadata.
  - **Important:** Stage 1 keeps this view intentionally simple and **does not implement preview/download logic**. The UI should not attempt to interpret or fetch from `storage_uri` beyond displaying it as part of the artifact’s metadata. Rich previews and download workflows are explicitly deferred to a future stage.
- Error:
  - Show simple “Unable to load artifact” text with retry.

---

## 9. Loading and error UX

### 9.1. Loading

Use **simple skeletons** only where they help the user anticipate layout:

- Session list: stacked row placeholders.
- Chat thread: 2–3 bubble placeholders while initial data loads.
- Artifacts list: row placeholders.
- Artifact detail: title + 3–4 line placeholders.
- Global auth check (`status === 'checking'`): full-screen centered spinner/loader.

### 9.2. Error handling

Centralized and minimal:

- All API errors go through the HTTP client and are normalized.
- 401 errors:
  - Trigger centralized logout + redirect.
- Feature-level errors:
  - Display short inline messages (e.g., under lists or composer).
  - Provide simple “Retry” button where appropriate.
- Avoid intrusive modals/toasts at Stage 1.

---

## 10. Implementation order

Recommended sequence:

1. **Core infrastructure**
   - HTTP client with global error handling and `onUnauthorized`.
   - Auth API module.
   - Chat + artifacts API modules (function signatures only at first).

2. **Auth + routing**
   - `AuthProvider` & `useAuth`.
   - Token hydration from `localStorage` on boot.
   - `RequireAuth` route guard.
   - `/login` + `/app/*` route skeleton.

3. **App shell**
   - Protected shell layout for `/app/*`.
   - Top bar with logo + user/tenant indicator + logout.
   - Sidebar nav between Chat and Artifacts.

4. **Chat workspace**
   - Sessions list panel with API integration + skeletons.
   - Empty-state main panel for `/app/chat`.
   - Session loading + thread display for `/app/chat/:sessionId`.
   - Composer with duplicate-send guard and basic error UX.

5. **Artifacts workspace**
   - List with API integration + skeletons.
   - Detail view for `:artifactId` with API integration.

6. **Polish**
   - Consistent spacing, typography, and alignment with the marketing site.
   - Better empty/error states and small accessibility improvements.
   - Minor refactors if needed (without changing contracts).

---

## 11. Out-of-scope (Stage 1)

The following are explicitly **not** part of this Stage 1 frontend work:

- Admin configuration screens (tenants, roles, advanced permissions).
- Multi-agent selection UI (only `agent_id: 'cfo-agent'` is used).
- Real-time streaming responses (SSE/WebSockets).
- Offline support, optimistic cross-tab sync, or advanced caching.
- Deep analytics dashboards or aggregates beyond basic artifact metadata.
- Mobile-native app (only responsive web is considered).

These can be revisited as part of Stage 2 and beyond.

