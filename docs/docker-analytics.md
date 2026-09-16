# Docker Compose for WYZ analytics (internal CFO pilot)

## Goal

Run the **same** analytics package as:

- `analytics-api` — HTTP adapter (`local_http`)
- `analytics-worker` — claim/execute loop (`workers.runner`)

on a clean Linux host via Docker Compose, with durable data on a named volume.

Frontend is **not** containerized in P2. Keep using local Vite against the containerized API.

## Prerequisites

- Docker Engine + Compose v2+
- Host ports free: `8788` (or set `WYZ_ANALYTICS_PUBLISH_PORT`)

## Architecture

```
Browser / Vite (host)
  → http://127.0.0.1:8788/api/v1/analytics   (or Vite proxy)
       ↓
analytics-api container
  WYZ_ANALYTICS_EMBEDDED_WORKER=false
       ↓ shared volume
/data/wyz-analytics-work  ←── analytics-worker container (filesystem claim loop)
```

**One image, two commands.** Both use `WYZ_ANALYTICS_MODE=local` and the same work dir.

## Build & start

From the repository root:

```bash
cp services/analytics/.env.docker.example services/analytics/.env.docker
# edit placeholders if you need a live provider; fake is fine for smoke

docker compose -f services/analytics/docker-compose.yml --env-file services/analytics/.env.docker up --build
```

Or from `services/analytics`:

```bash
docker compose --env-file .env.docker up --build
```

## Stop

```bash
docker compose -f services/analytics/docker-compose.yml down
```

**Danger:** `docker compose down -v` deletes the named volume `wyz_analytics_data` (all datasets, results, decisions, feedback). Do not use casually.

## Health

```bash
curl -s http://127.0.0.1:8788/api/v1/analytics/health
curl -s http://127.0.0.1:8788/api/v1/analytics/ready
```

- `/health` — process alive
- `/ready` — work_dir exists + writable (does **not** call the GPT provider)

## Logs (P1 JSON observability)

```bash
docker compose -f services/analytics/docker-compose.yml logs -f analytics-api
docker compose -f services/analytics/docker-compose.yml logs -f analytics-worker
```

Look for events such as `http_request_completed`, `dataset_created`, `ai_cfo_turn_completed`, `ai_answer_feedback_submitted`.

## Persistent volume

Compose mounts named volume `wyz_analytics_data` → `/data/wyz-analytics-work`.

Env inside containers:

```text
WYZ_ANALYTICS_WORK_DIR=/data/wyz-analytics-work
```

Restart API, worker, or both — data should survive. Recreate containers without `-v` — data should survive.

## Environment

See `.env.docker.example`.

| Variable | Required? | Notes |
|----------|-----------|-------|
| `WYZ_ANALYTICS_WORK_DIR` | set in compose | `/data/wyz-analytics-work` |
| `WYZ_ANALYTICS_HOST` | set in compose | `0.0.0.0` for container bind |
| `WYZ_AI_CFO_PROVIDER` | optional | default `fake` for pilot smoke |
| `WYZ_AI_CFO_API_KEY` / `NVIDIA_API_KEY` | optional | only for live provider |
| `WYZ_LOG_FORMAT` | optional | `json` recommended |
| `WYZ_ANALYTICS_WORKER_TOKEN` | optional | only for remote worker HTTP API |

**Mandatory for filesystem compose:** writable work_dir (handled by volume + entrypoint).

**Not mandatory for readiness:** live NVIDIA/OpenAI key.

## Security (P3 pilot) + Oracle edge (P4)

See [docs/security-pilot.md](./security-pilot.md) and [docs/oracle-pilot-deployment.md](./oracle-pilot-deployment.md).

Local Compose defaults:

- `WYZ_ENV=pilot`
- host publish `127.0.0.1:8788` (not all interfaces)
- `WYZ_PILOT_API_TOKEN` required (inject via Vite proxy — never `VITE_*`)
- CORS allowlist via `WYZ_ALLOWED_ORIGINS`
- `security_opt: no-new-privileges:true`

Oracle pilot override (`docker-compose.pilot.yml`): **no** host `:8788`, adds **BFF + Caddy**, bind-mounts `/data/wyz-analytics-work`.

Copy `.env.pilot.example` → `/opt/wyz/.env.pilot` on the VM (`chmod 600`).

## Optional bind-mount of local work_dir

Default compose starts a **clean** named volume (does not import the ~2 GB Windows `.wyz-analytics-work`).

For debugging only:

```bash
docker compose -f docker-compose.yml -f docker-compose.bind-override.example.yml up
```

## Restart behavior

Both services use `restart: unless-stopped`.

Independent restart:

```bash
docker compose -f services/analytics/docker-compose.yml restart analytics-api
docker compose -f services/analytics/docker-compose.yml restart analytics-worker
```

Worker uses filesystem job claim/locks on the shared volume — same semantics as local embedded worker.

`DirLock` records `hostname` + `pid`. Across Compose containers (different PID namespaces), stale reclaim is **age-based** (`WYZ_ANALYTICS_LOCK_STALE_SEC`, default 20s), not PID-based — so API and worker cannot false-reclaim each other’s live locks.

## Upload size

The SPA posts multipart uploads directly to the analytics HTTP adapter. There is no Nginx in P2. Practical BeautyCo order files (~30 MB) are supported; keep Compose memory comfortable (several GB headroom recommended for analysis peaks).

## Memory (approximate guidance)

| State | Guidance |
|-------|----------|
| API idle | low hundreds of MB typical |
| Worker idle | low hundreds of MB typical |
| BeautyCo-scale analysis | can spike into multi-GB (Polars/Parquet) |

Do not set tiny `mem_limit` values in P2.

## amd64 / arm64

Image is based on `python:3.11-slim-bookworm`. `polars` and `pyarrow` publish manylinux wheels for **x86_64** and **aarch64**. Multi-arch builds are likely workable for later Oracle Ampere; validate wheels on ARM before P4. P2 does not require multi-arch publish.

## Backup note

Back up the Docker volume `wyz_analytics_data` (or the bind-mounted directory) like any other durable store. Application-level export is out of scope for P2.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Port refused | Is API healthy? `docker compose ps` / `curl …/ready` |
| Empty datasets after restart with `-v` | Volume was deleted — restore from backup |
| Permission errors on work_dir | Entrypoint should chown as root then drop to uid 10001 |
| AI errors only | Provider key optional; set `WYZ_AI_CFO_PROVIDER=fake` for offline |
| Windows `npm run analytics:worker` broken | Unrelated to Compose — still uses `scripts/run-analytics-worker.js` |

## Clean-machine acceptance sequence

```bash
cp services/analytics/.env.docker.example services/analytics/.env.docker
docker compose -f services/analytics/docker-compose.yml --env-file services/analytics/.env.docker up --build -d
python scripts/p2-docker-acceptance.py   # needs BeautyCo CSVs in ~/Downloads or WYZ_ANALYTICS_GOLDEN_DIR
docker compose -f services/analytics/docker-compose.yml restart analytics-api analytics-worker
python scripts/p2-docker-verify-persist.py
docker compose -f services/analytics/docker-compose.yml down   # keeps named volume
# DANGER: docker compose ... down -v   deletes wyz_analytics_data
```

## Local Windows development (unchanged)

```text
npm run dev
npm run analytics:worker
```

Docker is optional for day-to-day coding.
