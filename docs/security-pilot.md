# Analytics security — internal CFO pilot (P3)

## Goal

Harden the containerized analytics API for an **internal CFO pilot**:
controlled origins, shared proxy credential, workspace lock-down, upload limits,
and safe errors — without claiming public multi-tenant SaaS security.

## Risk matrix (audit → P3)

| Risk | Current (pre-P3) | Pilot severity | P3 fix | Deferred |
|------|------------------|----------------|--------|----------|
| Wildcard CORS | `Access-Control-Allow-Origin: *` | High | Exact `WYZ_ALLOWED_ORIGINS` allowlist | CDN/proxy headers in P4 |
| Anonymous API | SPA routes unauthenticated | Critical | `WYZ_PILOT_API_TOKEN` via proxy header | Full session JWT validation in BFF (P4) |
| Browser-held secret | N/A | Critical if done wrong | **Never** `VITE_*`; Vite injects `X-WYZ-Pilot-Token` | Production same-origin BFF |
| Arbitrary `workspace_id` | Client-supplied | High | Forced `WYZ_WORKSPACE_ID` | Real tenant RBAC |
| Dataset IDOR | ID-only lookup | High | Workspace membership check | Org ACL |
| Unlimited upload | No cap | High | `WYZ_MAX_UPLOAD_MB=100` → 413 | Streaming/multipart quotas |
| Dangerous file types | Any multipart | Medium | CSV/TSV/XLSX only; reject zip/exe | Content sniffing |
| Path traversal filename | Partial (`Path.name`) | Medium | Sanitize + reject odd names | Object-store keys |
| Error leakage | `detail: str(exc)` | Medium | Canonical `{error:{code,message},request_id}` | Central APM scrubbing |
| Provider raw errors | Possible | Medium | Safe 503 copy | Provider circuit breaker UI |
| Host bind `0.0.0.0` published | Compose open | High | Publish `127.0.0.1:8788` | Private Docker network + reverse proxy (P4) |
| Secrets in logs | P1 redaction | Medium | Keep redaction; no keys in health | Secret manager |
| Client-error abuse | Loose schema | Low | Allowlisted codes/surfaces | Rate limit gateway |
| Feedback metadata injection | Client provider/model accepted | Low | Ignored; rating/reason/turn only | Server-side telemetry join |
| Multi-tenant auth | None | — | Explicit single workspace | OAuth/RBAC — out of scope |

## Deployment modes (`WYZ_ENV`)

| Mode | Auth | Origins | Notes |
|------|------|---------|-------|
| `development` | Optional (enforced only if token set) | Default localhost Vite origins | `npm run analytics:worker` unchanged |
| `pilot` | **Required** `WYZ_PILOT_API_TOKEN` | **Required** allowlist | Internal CFO Compose default |
| `production` | Same as pilot | Required | Still not multi-tenant SaaS |

## Access architecture (critical)

```
Browser (no pilot secret)
  → Vite / future WYZ BFF  (injects X-WYZ-Pilot-Token from server env)
      → analytics-api :8788 (loopback / private network)
```

- Do **not** set `VITE_ANALYTICS_API_BASE_URL` to a public analytics host for pilot.
- Do **not** put `WYZ_PILOT_API_TOKEN` in any `VITE_*` variable.
- Root `.env` / `services/analytics/.env.docker` may hold the token for Vite `loadEnv` + Compose.

## Route protection matrix

| Route | Class |
|-------|--------|
| `GET /health` | Public liveness |
| `GET /ready` | Public readiness (no secrets; no provider call) |
| `OPTIONS *` | CORS preflight (origin-checked) |
| `/worker/*` | Machine token (`WYZ_ANALYTICS_WORKER_TOKEN`) |
| All `/datasets`, `/jobs`, AI, feedback, client-errors, catalogs | Pilot token required in pilot/production |

## Workspace isolation

- Active workspace = `WYZ_WORKSPACE_ID` (pilot default `internal-pilot`).
- Client `workspace_id` on create/list/query is **ignored**.
- Every `dataset_id` / `job_id` / `decision_id` path checks dataset workspace membership.

**This is not full multi-tenant isolation.**

## Provider key precedence (server-only)

1. `WYZ_AI_CFO_API_KEY`
2. `NVIDIA_API_KEY`
3. `OPENAI_API_KEY`

Logs may show `provider_key_configured=true/false` only.

## Upload limits

| Var | Default |
|-----|---------|
| `WYZ_MAX_UPLOAD_MB` | 100 |
| `WYZ_MAX_REQUEST_BODY_MB` | 120 |
| `WYZ_MAX_UPLOAD_FILES` | 12 |

Allowed: `.csv` `.tsv` `.xlsx` `.xls`. Archives rejected. Oversized → **413**.

## Headers

API sets: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, CORS allowlist.

Deferred to P4 reverse proxy: HSTS, CSP, full browser app header suite.

## Network binding

- Process in container: `0.0.0.0:8788` (Docker network).
- Host publish: `127.0.0.1:8788` by default.
- P4: stop publishing host ports; terminate TLS at reverse proxy on a private upstream.

## Threat model (pilot)

| Threat | Mitigation now | Remaining limitation |
|--------|----------------|----------------------|
| Unauthorized API access | Pilot token + loopback publish | Token theft if host compromised; no user JWT check yet |
| Cross-workspace access | Forced workspace + membership checks | Single shared pilot workspace |
| Secret leakage | Env-only; redaction; sanitized errors | Operator must not commit `.env.docker` |
| Oversized/malicious upload | Size + extension gates | Still reads into memory |
| Path traversal | Basename sanitization | Relies on blob URI layer |
| Provider abuse | Existing AI call caps; safe 503 | No global distributed rate limit |
| Log injection via client-errors | Schema allowlist | Authenticated route only |
| Decision/feedback IDOR | Dataset-scoped + workspace check | UUID still helpful but not sole control |
| Volume persistence risk | Named volume; no secrets in work_dir | Backup/access control is ops |

**Pilot is NOT public multi-tenant SaaS security.**

## Env reference (selected)

| Name | Required (pilot) | Secret? | Notes |
|------|------------------|---------|-------|
| `WYZ_ENV` | yes | no | `pilot` |
| `WYZ_WORKSPACE_ID` | yes | no | e.g. `internal-pilot` |
| `WYZ_ALLOWED_ORIGINS` | yes | no | Exact origins |
| `WYZ_PILOT_API_TOKEN` | yes | **yes** | Proxy-only |
| `WYZ_AI_CFO_API_KEY` | no | **yes** | Optional for readiness |
| `WYZ_MAX_UPLOAD_MB` | no | no | Default 100 |

See `.env.pilot.example`.

## P4 assumptions

- Reverse proxy (TLS, public hostname)
- Same-origin BFF validating website session JWT / cookies
- Analytics on private Docker network only
- Stronger secret management
- Production CORS hostnames
