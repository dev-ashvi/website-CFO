# Local CFO Pilot Readiness (P6L)

**Status:** Local stack implemented and smoke-tested at `http://127.0.0.1:8080`.  
**STOP:** Do not configure Cloudflare until this local gate is reviewed.

This document describes the temporary **two-user internal CFO pilot** path on Windows Docker Desktop. It is **not** multi-tenant SaaS auth.

## Architecture (actually intended)

```
Internet
   ↓
Cloudflare Access          ← external identity gate (manual later; not used by app auth)
   ↓
Cloudflare Tunnel          ← targets http://127.0.0.1:8080 only
   ↓
Caddy (local-pilot)        ← host 127.0.0.1:8080 — SPA + reverse proxy
   ↓
WYZ pilot login (BFF)      ← temporary env-driven email/password → wyz-pilot.* session
   ↓
BFF                        ← rejects wyz-demo-*; injects X-WYZ-Pilot-Token upstream
   ↓
analytics-api (+ worker)   ← Docker network only; named volume /data/wyz-analytics-work
```

Cloudflare Access headers are **never** used for internal authorization. Misconfigured Access alone must not expose the API: the BFF still requires a non-demo pilot session.

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

This login is **TEMPORARY** for the two-user internal CFO pilot only. No registration, reset, OAuth, roles, or DB identity.

## AI CFO (unchanged architecture)

Env (already used by the service):

- `WYZ_AI_CFO_PROVIDER=openai_compatible`
- `WYZ_AI_CFO_MODEL=openai/gpt-oss-20b`
- `WYZ_AI_CFO_STRATEGY_MODE=v2_partner`
- Key: `WYZ_AI_CFO_API_KEY` or `NVIDIA_API_KEY` (never commit; never log)

Without a key, non-AI analytics still work; live AI turns return provider unavailable.

## Start (exact)

1. Copy env and set secrets (placeholders only in git):

```powershell
Copy-Item services\analytics\.env.local-pilot.example services\analytics\.env.local-pilot
# Edit: WYZ_PILOT_USERS, WYZ_PILOT_SESSION_SECRET, WYZ_PILOT_API_TOKEN,
#       WYZ_ALLOWED_ORIGINS, WYZ_AI_CFO_API_KEY or NVIDIA_API_KEY
```

2. Start:

```powershell
.\scripts\local-cfo-pilot-up.ps1
```

3. Open:

```
http://127.0.0.1:8080
```

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

## Cloudflare (next — manual only)

Do **not** automate. After local review:

1. Install `cloudflared` on this Windows host.
2. Create a Tunnel whose origin is **`http://127.0.0.1:8080`** (HTTP, not Vite, not :8788).
3. Attach a public hostname; Cloudflare terminates HTTPS.
4. Put **Cloudflare Access** in front of that hostname for you + CFO (emails configured in Cloudflare dashboard — not in this repo).
5. Add the public origin (e.g. `https://pilot.example.com`) to `WYZ_ALLOWED_ORIGINS` and recreate Caddy/BFF.
6. Re-test login + one analysis through the public URL.

## Files added/changed (P6L)

**Add**

- `services/analytics/docker-compose.local-pilot.yml`
- `services/analytics/docker/Caddyfile.local-pilot`
- `services/analytics/.env.local-pilot.example`
- `scripts/local-cfo-pilot-up.ps1`
- `scripts/backup-analytics-work.ps1`
- `scripts/restore-analytics-work.ps1`
- `scripts/local-cfo-pilot-smoke.py`
- `docs/LOCAL_CFO_PILOT_READINESS.md`
- `docs/LOCAL_CFO_PILOT_TEST_REPORT.md`
- `services/analytics/tests/test_local_cfo_pilot_p6l.py`

**Minimal edit**

- `services/analytics/bff/server.js` — temporary pilot login + session verify; demo rejection kept
- `src/api/auth.js` / `src/api/devMode.js` — prefer BFF pilot login; `wyz-pilot.` prefix
- `.gitignore` — ignore `.env.local-pilot`, backups, smoke artifacts

Oracle / P4 files intentionally untouched.
