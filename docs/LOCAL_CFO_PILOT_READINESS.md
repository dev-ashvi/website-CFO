# Local CFO Pilot Readiness (P6L → P6L.2)

**Status:** Local Docker pilot stack + Vercel cross-origin frontend path (P6L.2).  
This document describes the temporary **two-user internal CFO pilot**. It is **not** multi-tenant SaaS auth.

## Current production pilot topology (P6L.2)

```
CFO Browser
    ↓
https://financewyz.ai
(Vercel frontend)
    ↓  HTTPS + Bearer wyz-pilot.* token
https://pilot.financewyz.ai
    ↓
Cloudflare Tunnel  →  http://127.0.0.1:8080 only
    ↓
Caddy (local-pilot)  — API-only reverse proxy (no React SPA)
    ↓
BFF  — pilot login + session gate; rejects wyz-demo-*; CORS allowlist
    ↓
analytics-api  ↔  analytics-worker
    ↓
NVIDIA / OpenAI-compatible AI CFO
```

- Frontend build var (Vercel Production, public): `VITE_ANALYTICS_API_BASE_URL=https://pilot.financewyz.ai`
- Never put `NVIDIA_API_KEY`, `WYZ_AI_CFO_API_KEY`, `WYZ_PILOT_API_TOKEN`, or `WYZ_PILOT_SESSION_SECRET` in Vercel/`VITE_*`
- `WYZ_BFF_REJECT_DEMO=true` remains mandatory
- Cloudflare Access (if enabled) is an **external** gate only — app auth is still Bearer `wyz-pilot.*`

## Local / historical topology

For **API regression on this host** (no Vercel):

```
http://127.0.0.1:8080/api/...  →  Caddy → BFF / analytics
```

`pilot.financewyz.ai` and local `:8080` are **backend-only** (P6L.2). Non-API paths return 404.  
Do **not** expect the React SPA at `http://127.0.0.1:8080/` or on the tunnel hostname.

Earlier P6L docs that described “Caddy serves the SPA” are superseded by this API-only backend host.

## Host exposure

| Service | Host publish |
|---------|----------------|
| Caddy | **127.0.0.1:8080** only |
| BFF | none (Docker network) |
| analytics-api | none |
| analytics-worker | none |

Do **not** publish `:8788`. Do **not** point Cloudflare at the Vite dev server.

## Persistence

- Docker named volume: `wyz_analytics_data` → container path `/data/wyz-analytics-work`
- Survives: `docker compose down` then `up -d`
- **DANGER:** `docker compose ... down -v` **destroys** pilot data — do not use in normal operations

## Temporary pilot login

Configured only via environment (never commit real values):

- `WYZ_PILOT_USERS=email:password,email2:password2`
- `WYZ_PILOT_SESSION_SECRET` (≥16 chars)
- Successful login returns Bearer token prefix `wyz-pilot.`
- `WYZ_BFF_REJECT_DEMO=true` remains mandatory — `wyz-demo-*` / demo credentials stay rejected
- Allowed browser origins (exact list, never `*`): include `https://financewyz.ai` plus local origins for regression

This login is **TEMPORARY** for the two-user internal CFO pilot only. No registration, reset, OAuth, roles, or DB identity.

When `VITE_ANALYTICS_API_BASE_URL` is set (Vercel → pilot), frontend login **fails closed** — it must not silently fall through to demo auth.

## AI CFO (unchanged architecture)

Env (already used by the service):

- `WYZ_AI_CFO_PROVIDER=openai_compatible`
- `WYZ_AI_CFO_MODEL=openai/gpt-oss-20b`
- `WYZ_AI_CFO_STRATEGY_MODE=v2_partner`
- Key: `WYZ_AI_CFO_API_KEY` or `NVIDIA_API_KEY` (never commit; never log)

Without a key, non-AI analytics still work; live AI turns return provider unavailable. Deterministic scenario paths do not require the provider.

## Start (exact)

1. Copy env and set secrets (placeholders only in git):

```powershell
Copy-Item services\analytics\.env.local-pilot.example services\analytics\.env.local-pilot
# Edit: WYZ_PILOT_USERS, WYZ_PILOT_SESSION_SECRET, WYZ_PILOT_API_TOKEN,
#       WYZ_ALLOWED_ORIGINS (include https://financewyz.ai), NVIDIA_API_KEY or WYZ_AI_CFO_API_KEY
```

2. Start:

```powershell
.\scripts\local-cfo-pilot-up.ps1
```

This builds the SPA into `services/analytics/frontend-dist` (gitignored; mount retained for local tooling) and runs:

`docker compose -f docker-compose.yml -f docker-compose.local-pilot.yml --env-file .env.local-pilot up -d --build`

3. Verify API:

```
http://127.0.0.1:8080/api/v1/analytics/health
```

Production UI: `https://financewyz.ai` (after Vercel env + redeploy).

Optional smoke (golden CSVs in `%USERPROFILE%\Downloads`):

```powershell
python .\scripts\local-cfo-pilot-smoke.py
```

## Backup / restore

```powershell
.\scripts\backup-analytics-work.ps1
# → backups\wyz-analytics-work\wyz-analytics-work-<timestamp>.tgz

# Restore requires explicit archive + confirm (will replace volume contents):
# 1) Stop stack WITHOUT -v
# 2) Restore
.\scripts\restore-analytics-work.ps1 -Archive ".\backups\wyz-analytics-work\wyz-analytics-work-YYYYMMDD-HHMMSS.tgz" -ConfirmRestore
# 3) Start again with local-cfo-pilot-up.ps1
```

Without `-ConfirmRestore`, restore refuses to overwrite active pilot data.

## Cloudflare Tunnel (manual)

1. Install `cloudflared` on this Windows host.
2. Tunnel origin: **`http://127.0.0.1:8080`** only (not Vite, not `:8788`).
3. Public hostname: `pilot.financewyz.ai` (HTTPS at Cloudflare).
4. Optional: Cloudflare Access in front of that hostname.
5. Keep `https://financewyz.ai` in `WYZ_ALLOWED_ORIGINS`; recreate BFF after origin changes.

## Key files

- `services/analytics/docker-compose.yml` + `docker-compose.local-pilot.yml`
- `services/analytics/docker/Caddyfile.local-pilot` (API-only)
- `services/analytics/bff/` (pilot login + CORS allowlist)
- `services/analytics/.env.local-pilot.example`
- `scripts/local-cfo-pilot-up.ps1`, smoke/live validation scripts
- Frontend: `src/api/auth.js`, `devMode.js`, `revenueMargin.js` — `VITE_ANALYTICS_API_BASE_URL`
