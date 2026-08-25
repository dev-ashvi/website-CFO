# WYZ Analytics — Revenue & Margin Intelligence

Deterministic financial engine for the authenticated **Revenue & Margin Intelligence** module.

This service is a standalone Python package. It does **not** calculate anything in the React app. The authenticated SPA at `/app/revenue-margin` talks to `/api/v1/analytics`; a local worker (`npm run analytics:worker`) claims jobs and runs this package.

## Why it lives here

The current WYZ application is a Vite + React SPA:

| Area | Path | Role |
|------|------|------|
| Marketing site + authenticated workspace | `src/` | UI only |
| Runway simulator engine | `src/lib/financial-simulator/` | Deterministic **planning** math (monthly assumptions) |
| Chat / auth client | `src/api/` | Talks to `VITE_API_BASE_URL` `/api/v1/...` |
| Serverless insight route | `api/runway-insight.js` | Runway assessment only |

Revenue & Margin Intelligence needs order-line grain, joins, and allocations over ~100k+ rows. That does not belong in the browser or in the runway JS engine.

Keep this package importable on its own. Later a WYZ API job queue / Kubernetes worker can call `run_revenue_margin_engine`. The SPA should only ever display engine output.

## Local web workflow (non-production)

The authenticated WYZ app talks to `/api/v1/analytics`. In local Vite, that path is proxied to a development-only Python worker:

```bash
# terminal 1
cd services/analytics
python -m pip install -e ".[dev]"
cd ../..
npm run analytics:worker

# terminal 2
npm run dev
```

Then open `/app/revenue-margin` after login. The SPA never talks to a Downloads folder or to Python in-process. It only uses `/api/v1/analytics`.

## Durable execution contract

This is the boundary that later Kubernetes workers must implement. There is no second local-only execution path.

```
SPA → /api/v1/analytics → durable analysis job → worker claims job
    → worker fetches dataset blobs → existing ingest / transform / engine
    → versioned result blob → SPA polls job / result
```

| Concern | Contract |
|---|---|
| Uploaded files | Logical URIs (`wyz-blob://...`) in a `BlobStore`. Local dev uses `FilesystemBlobStore` under `WYZ_ANALYTICS_WORK_DIR`. |
| Work discovery | Workers call `JobStore.claim_next(worker_id)`. The claim is atomic (directory lock today). |
| Job status | Persisted JSON under `jobs/`. Internal `stage` is detailed (`QUEUED` → `CLAIMED` → `PROFILING` / `MAPPING` / `VALIDATING` / `ANALYSING` / `WRITING_RESULT` → `COMPLETED` / `FAILED` / `NEEDS_REVIEW`). SPA `status` collapses in-flight stages to `RUNNING`. |
| Engine output | Versioned result blob, not process memory. `GET /datasets/:id/result` loads that blob. |
| Lineage | Each result records workspace, dataset, dataset version, mapping version, engine version, and job id. |
| Restart | If a result blob exists, `recover()` marks the job `COMPLETED`. Abandoned claims for this `worker_id` are requeued. |

`npm run analytics:worker` starts the same claim loop a Kubernetes worker will use later. It does not start ingest/analysis in the HTTP handler thread.

## Kubernetes worker (local cluster)

See [docs/kubernetes-worker.md](docs/kubernetes-worker.md) for:

- Docker image build (`services/analytics/Dockerfile`)
- `k8s/worker-deployment.yaml` manifests
- Outbound-only remote worker mode (`python -m wyz_analytics.workers.runner`)
- Machine authentication via `WYZ_ANALYTICS_WORKER_TOKEN`
- Docker Desktop Kubernetes + `host.docker.internal` host API access

Copy `.env.example` for configuration placeholders. Never commit real worker tokens.

## Ingestion

Arbitrary client files are converted into the engine contract without teaching the engine client column names:

```
files → profiler → role classification → deterministic mapping
      → AI only for unresolved/ambiguous fields → validation
      → canonical frames → existing `run_revenue_margin_engine`
```

- Canonical schemas live in `src/wyz_analytics/schemas/`
- Mapping origins: deterministic alias, AI-proposed (pluggable `SchemaMappingModel`), user-confirmed, remembered
- The LLM never calculates financial outputs and is never the mapper of first resort
- Default tests use `FakeSchemaMappingModel`. No API keys or network.
- Optional live HTTP JSON mapper: `wyz_analytics.mapping.providers.openai_compatible` (not imported by the test suite)
- `final_confidence = min(model_confidence, validation_confidence)` — AI proposals never auto-accept; failed validation is not overridden
- User-confirmed / remembered mappings are not overwritten by later AI or deterministic guesses
- `adapters/beautyco.py` remains the golden loader until canonical ingest is trusted

## Waterfall

Gross Revenue → Net Revenue → Product COGS → Gross Margin → CM1 Costs → CM1 → Marketing Spend → CM2

Formulas and allocation rules are in `src/wyz_analytics/engine/definitions.py`.

## Layout

```
services/analytics/
  src/wyz_analytics/
    adapters/beautyco.py   # golden-reference CSV loader (still used)
    profiles/beautyco.py   # equivalent mapping-memory config
    schemas/               # canonical field catalogs
    ingest/                # load, profile, classify, pipeline
    mapping/               # proposal, confidence, SchemaMappingModel, fake/live providers
    validation/            # joins, grain, financial relationships
    transform/             # source + mapping → canonical frames
    engine/                # unchanged financial core
    recon/                 # additive / join reconciliation
    workers/               # job store, blob store, claim loop, runner, k8s worker API
  k8s/                     # local Kubernetes manifests
  docs/kubernetes-worker.md
```

## Run tests

```bash
cd services/analytics
python -m pip install -e ".[dev]"
python -m pytest
```

Golden-master tests load the four BeautyCo CSVs from, in order:

1. `WYZ_ANALYTICS_GOLDEN_DIR`
2. `tests/data/beautyco/`
3. `~/Downloads`

Synthetic allocation tests run without those files.

## Integration rules (do not break WYZ)

- Do not import this package from `src/` or `api/`.
- Do not add Python dependencies to the root `package.json`.
- Do not reuse `src/lib/financial-simulator/` for order-line CM1/CM2. That engine is a different product (runway planning) with different cost buckets.
- Future HTTP should be a new `/api/v1/analytics/...` job API, not a Vite rewrite of this service.
- Auth stays on the existing WYZ API. This worker should receive an already-authorized job payload.
