# Local Kubernetes deployment for WYZ analytics worker

This document explains how to run the **same** durable analytics polling worker inside local Kubernetes while the WYZ SPA continues to talk only to `/api/v1/analytics`.

**Non-production.** This establishes the outbound worker → live/API boundary. It is not a cloud production deployment.

## Architecture

```
WYZ SPA  →  /api/v1/analytics  →  durable jobs + wyz-blob:// references
                                         ↑
Kubernetes worker (outbound HTTPS only) ─┘
  claim → fetch blobs → ingest/engine → write result → complete
```

The live website never calls your laptop directly. The worker always initiates **outbound** HTTPS. No NodePort or router port forwarding is required.

## Modes

| Mode | Command | Use |
|------|---------|-----|
| Local process | `npm run analytics:worker` | Default dev: local HTTP adapter + embedded claim loop |
| API only | `WYZ_ANALYTICS_EMBEDDED_WORKER=false python -m wyz_analytics.workers.local_http` | Host API for SPA; external/K8s worker claims remotely |
| Kubernetes worker | `python -m wyz_analytics.workers.runner` in container | Polls remote worker API |

## Configuration

Copy `services/analytics/.env.example` and set values locally (never commit secrets).

| Variable | Purpose |
|----------|---------|
| `WYZ_ANALYTICS_MODE` | `local` (filesystem stores) or `remote` (HTTPS client) |
| `WYZ_ANALYTICS_API_BASE_URL` | Base URL ending in `/api/v1/analytics` for remote workers |
| `WYZ_ANALYTICS_WORKER_ID` | Stable worker identity used when claiming jobs |
| `WYZ_ANALYTICS_WORKER_TOKEN` | Shared machine token (API + worker). **Not** an end-user SPA token |
| `WYZ_ANALYTICS_POLL_INTERVAL_SEC` | Idle polling interval |
| `WYZ_ANALYTICS_CLAIM_LEASE_SEC` | Reserved for future heartbeat/lease renewal |
| `WYZ_ANALYTICS_BLOB_BACKEND` | `filesystem` or `remote` |
| `WYZ_ANALYTICS_EMBEDDED_WORKER` | When `false`, local HTTP serves SPA/worker API only |
| `WYZ_ANALYTICS_LOG_LEVEL` | `INFO`, `DEBUG`, etc. |

## Worker API (machine auth only)

Remote workers call endpoints under `/api/v1/analytics/worker/…` with:

```
Authorization: Bearer <WYZ_ANALYTICS_WORKER_TOKEN>
```

Browser/SPA clients must **not** use these routes.

Minimum contract:

- `POST /worker/jobs/claim`
- `PUT /worker/jobs/{job_id}` — stage/progress updates
- `POST /worker/jobs/{job_id}/complete`
- `POST /worker/jobs/{job_id}/fail`
- `POST /worker/jobs/{job_id}/heartbeat` — optional V1 lease renewal hook
- `GET|PUT /worker/datasets/{dataset_id}`
- `GET|PUT /worker/blobs?uri=wyz-blob://…`

SPA-facing routes under `/datasets`, `/jobs`, etc. are unchanged.

## Local Kubernetes (Docker Desktop)

Docker Desktop Kubernetes on Windows/macOS is the recommended path because `host.docker.internal` reaches the host machine cleanly.

### 1. Start the analytics API on the host (embedded loop off)

```powershell
cd services/analytics
python -m pip install -e ".[dev]"

$env:WYZ_ANALYTICS_WORKER_TOKEN = "dev-only-change-me"
$env:WYZ_ANALYTICS_EMBEDDED_WORKER = "false"
python -m wyz_analytics.workers.local_http
```

Terminal 2 — WYZ SPA:

```powershell
npm run dev
```

### 2. Build the worker image

```powershell
cd services/analytics
docker build -t wyz-analytics-worker:local .
```

### 3. Configure the cluster secret

Edit `k8s/worker-deployment.yaml` `stringData.WYZ_ANALYTICS_WORKER_TOKEN` to match the host token, or create the secret manually:

```powershell
kubectl create namespace wyz-analytics
kubectl -n wyz-analytics create secret generic wyz-analytics-worker `
  --from-literal=WYZ_ANALYTICS_WORKER_TOKEN=dev-only-change-me
```

### 4. Deploy

```powershell
kubectl apply -f k8s/worker-deployment.yaml
kubectl -n wyz-analytics logs -f deploy/wyz-analytics-worker
```

### 5. Run a dataset from the SPA

1. Open `/app/revenue-margin`
2. Upload files and run analysis
3. Watch Kubernetes logs for `event=job_claimed` / `event=job_completed`

## Future live mode

```
Local Kubernetes worker  →  outbound HTTPS  →  live WYZ analytics API
```

Requirements for production (not implemented yet):

- Short-lived or workload-identity credentials instead of static bearer tokens
- Managed object storage backing `wyz-blob://`
- Network egress allowlisting on the worker
- Autoscaling worker pools, multi-region, GPU, Kafka/SQS, etc.

## Observability

Structured logs include safe fields only:

```
level=INFO logger=wyz_analytics.workers.runner event=job_claimed worker_id=k8s-worker-1 job_id=job_abc dataset_id=ds_xyz ...
```

Never logged: credentials, raw customer records, source file bytes.

## Graceful shutdown

Kubernetes `SIGTERM` is handled by the polling worker:

1. Finish the current job if already executing
2. Requeue abandoned claims for this `worker_id` via the recovery contract
3. Exit cleanly

## Security limitations (current)

- Static shared bearer token (acceptable for V1 local/live boundary design only)
- Local HTTP adapter is not hardened for public internet exposure
- No autoscaling, no cloud object store, no production cluster manifests

## Tests

```bash
cd services/analytics
python -m pytest
```

Remote client and auth tests run without a live Kubernetes cluster.
